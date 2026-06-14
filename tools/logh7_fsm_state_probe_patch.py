"""Runtime probe: trace the lobby WSEQ02 FSM state sequence (circular, last 32 states).

Hooks the FSM dispatcher 0x51a3a2 (`mov ecx,[ebp+4]`, ebp = the scene `this`, [ebp+4] = current
state). Records [ebp+4] every tick into a CIRCULAR ring (slot = counter & 31, always overwrite) so
the LAST 32 states before conn2 closes are captured — revealing the teardown path the FSM actually
takes (handoff G181: NOPing state7's failure je 0x51a834 did NOT stop conn2 closing, so the close
trigger is elsewhere — a later state, a non-state7 watchdog, or the FSM stops being ticked).

States of interest (handoff): 4=conn2 connect, 5=connect poll, 6=send 0x2000, 7=wait flag,
8=success timer, 0x6c=watchdog, 0x3d/0x3e/0x3f=teardown chain.

Displaces 7 bytes (mov ecx,[ebp+4]; mov [esp+0x10],ecx) and replays them before 0x51a3a9.
Saved-frame layout after `pushfd; pushad`: EBP@[esp+0x08].
Ring record (16-byte stride, capacity 32 circular): [magic 4][tick 4][state 4][pad 4].

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

HOOK_VA: Final[int] = 0x0051A3A2
CONTINUATION_VA: Final[int] = 0x0051A3A9
HOOK_LENGTH: Final[int] = 7  # mov ecx,[ebp+4] (3) + mov [esp+0x10],ecx (4)
ORIGINAL_HEX: Final[str] = "8b4d04894c2410"

BUFFER_OFFSET: Final[int] = 200
RECORD_BYTES: Final[int] = 16
RECORD_CAPACITY: Final[int] = 32  # power of two for circular masking
MAGIC: Final[bytes] = b"L7FS"  # LOGH7 Fsm State


@dataclass(frozen=True, slots=True)
class FsmStateProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "ringBuffer": {
                "virtualAddressHex": f"0x{ring_va:08x}",
                "counterBytes": 8,
                "recordBytes": RECORD_BYTES,
                "recordCapacity": RECORD_CAPACITY,
                "circular": True,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_fsm_state_probe_patch(source: Path, out: Path, manifest_out: Path) -> FsmStateProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"FSM dispatcher bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("FSM state probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = FsmStateProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))  # replay mov ecx,[ebp+4]; mov [esp+0x10],ecx
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("FSM state trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    builder.append(b"\xa1")
    builder.u32(counter_va)  # mov eax, [counter_va] (tick counter)
    # circular slot = (counter & 31) * 16
    builder.append(b"\xbf")
    builder.u32(records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\x83\xe1\x1f\xc1\xe1\x04\x03\xf9")  # mov ecx,eax; and ecx,0x1f; shl ecx,4; add edi,ecx
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (tick = counter)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # state = [ [esp+0x08](saved ebp) + 4 ] -> [edi+8]
    builder.append(b"\x8b\x4c\x24\x08\x8b\x41\x04\x89\x47\x08")
    builder.append(b"\x61\x9d")  # popad; popfd


def decode_fsm_state_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("FSM state ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    slots: list[dict[str, object] | None] = [None] * RECORD_CAPACITY
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            tick, state = struct.unpack_from("<II", chunk, 4)
            slots[index] = {"tick": tick, "state": state, "stateHex": f"0x{state:x}"}
        offset += RECORD_BYTES
        index += 1
    # Reorder circular ring into chronological order by tick.
    present = [s for s in slots if s is not None]
    present.sort(key=lambda s: s["tick"])
    return {"path": str(path), "counter": counter, "chronological": present}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII lobby FSM state-trace ring probe.")
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
        patch_result = apply_fsm_state_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_fsm_state_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
