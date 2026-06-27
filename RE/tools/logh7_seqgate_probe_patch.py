"""Runtime probe: capture decipher_message's sequence-gate verdict per inbound frame.

Hooks the sequence gate at 0x00645eda (`cmp eax,[ecx+0x20]; ja 0x645efd`) inside
decipher_message (0x645db0). At hook entry EAX = the received frame id, ECX = the cipher
object, [ECX+0x20] = the last-accepted inbound baseline. Accept requires id > baseline
(strict `ja`); otherwise reject @0x645edf ("bad sequence number") and the frame is dropped
before it can be routed.

Decisive question (handoff G169): the pump handler-lookup (0x612348) fired only ONCE the whole
session (key=4 = the LOGIN channel, a HIT) — conn2 (lobby, channel 3) did ZERO lookups. So
conn2's inner-0x2001 reply is dropped BEFORE the router/pump, i.e. inside decipher_message.
The prime suspect is this sequence gate: if conn2's baseline >= our reply id (3), the frame is
rejected. This probe records, per inbound frame, (receivedId, baseline, cipherObj) so we can
see exactly whether conn2's 0x2001 (id=3) passes the gate and what conn2's real baseline is —
which tells us if the fix is simply a higher monotonic S->C id (server-fixable).

Displaces 5 bytes (cmp eax,[ecx+0x20]; ja 0x645efd) and replays them as a conditional branch:
accept -> 0x645efd, reject -> 0x645edf.

Saved-frame layout after `pushfd; pushad`: EAX@[esp+0x1c], ECX@[esp+0x18].
Ring record (32-byte stride): [magic 4][callIndex 4][receivedId 4][baseline 4][cipherObj 4][pad 12].

Subcommands: patch <exe> --out <patched> --manifest-out <json>; decode <ring.bin> --out <json>.
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from tools.logh7_x86_patch import X86Builder, hook_jump

HOOK_VA: Final[int] = 0x00645EDA
HOOK_LENGTH: Final[int] = 5  # displaces cmp eax,[ecx+0x20] (3) + ja 0x645efd (2)
ORIGINAL_HEX: Final[str] = "3b4120771e"
ACCEPT_TARGET_VA: Final[int] = 0x00645EFD  # ja target (id > baseline)
REJECT_TARGET_VA: Final[int] = 0x00645EDF  # fall-through (bad sequence number)

BUFFER_OFFSET: Final[int] = 176  # trampoline lives below this; ring starts here (cave is 811B)
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7SQ"  # LOGH7 SeQuence-gate probe


@dataclass(frozen=True, slots=True)
class SeqGateProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "acceptTargetHex": f"0x{ACCEPT_TARGET_VA:08x}",
            "rejectTargetHex": f"0x{REJECT_TARGET_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "ringBuffer": {
                "virtualAddressHex": f"0x{ring_va:08x}",
                "counterBytes": 8,
                "recordBytes": RECORD_BYTES,
                "recordCapacity": RECORD_CAPACITY,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_seqgate_probe_patch(source: Path, out: Path, manifest_out: Path) -> SeqGateProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"sequence-gate entry bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("sequence-gate probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = SeqGateProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    # Replay the displaced conditional: cmp eax,[ecx+0x20]; ja ACCEPT; jmp REJECT.
    builder.append(b"\x3b\x41\x20")  # cmp eax, [ecx+0x20]
    ja_va = builder.current_va
    builder.append(b"\x0f\x87")  # ja near (0f 87 rel32)
    builder.u32((ACCEPT_TARGET_VA - (ja_va + 6)) & 0xFFFFFFFF)
    builder.jmp_rel32(REJECT_TARGET_VA)  # jmp 0x645edf
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("sequence-gate trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    builder.append(b"\xa1")
    builder.u32(counter_va)  # mov eax, [counter_va]
    builder.append(b"\x83\xf8")
    builder.u8(RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)  # jb log_entry
    builder.append(b"\x61\x9d")  # popad; popfd
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    builder.append(b"\xbf")
    builder.u32(records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; shl ecx,5; add edi,ecx (records + eax*32)
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex = old counter)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # received id (saved EAX) = [esp+0x1c] -> [edi+8]
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x08")
    # cipher object (saved ECX) = [esp+0x18] -> ecx, and -> [edi+0x10]
    builder.append(b"\x8b\x4c\x24\x18\x89\x4f\x10")
    # baseline = [ecx+0x20] -> [edi+0x0c]
    builder.append(b"\x8b\x41\x20\x89\x47\x0c")
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")  # jb rel8 (placeholder)
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after = builder.base_va + opcode_offset + 5
    rel = destination - source_after
    struct.pack_into("<i", builder.data, opcode_offset + 1, rel)


def decode_seqgate_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("sequence-gate ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, received_id, baseline, cipher = struct.unpack_from("<IIII", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "receivedId": received_id,
                    "baseline": baseline,
                    "accepted": received_id > baseline,
                    "cipherObjHex": f"0x{cipher:08x}",
                }
            )
        offset += RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII decipher sequence-gate ring probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    decode.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.command == "patch":
        patch_result = apply_seqgate_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_seqgate_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
