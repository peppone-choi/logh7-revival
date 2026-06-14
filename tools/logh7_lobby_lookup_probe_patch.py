"""Runtime probe: capture the transport handler-map lookup result for inbound frames.

Hooks the pump's lookup-result test at 0x00612348 (right after `call 0x612510`, the
per-connection receive-handler lookup `(*(*(conn+0x10))+8)(key)`). EAX holds the lookup
result: 0 = MISS (the frame is dropped/closed at 0x612378), non-zero = HIT (handler ptr,
dispatched at 0x61234e). The lookup key is dword[ESI+8] (the frame's outer transport type);
the pending inner code is dword[ESI+0x2c].

Decisive question (handoff G167/G168, workflow wmbudvx8e): conn2 inbound frames never reach
the lobby app dispatcher (0x4bd7d4 ring counter=0) although decipher_message ACCEPTS them.
The synthesis says the drop is this lookup MISS because the lobby Processor (which wires
conn+0x10's handler map) is lazily factory-instantiated (ctor 0x4ad580, only referenced from
RTTI factory 0x74fdb0) and does not exist until the client enters the lobby scene. This probe
proves it live: it will show, for our inner-0x2001 reply on conn2, EAX=0 (miss) plus the
outer key the client tried to route — revealing whether the lobby processor exists at all and
which outer transport type the server must instead drive (the 0x202/0x204/0x205 lobby
transport handshake) before sending app code 0x2001.

Displaces 6 bytes (mov edi,eax; test edi,edi; je 0x612378) and replays them as a conditional
branch in the trampoline: miss -> 0x612378, hit -> 0x61234e.

Saved-frame layout after `pushfd; pushad`: EAX@[esp+0x1c], ESI@[esp+0x04].
Ring record (32-byte stride): [magic 4][callIndex 4][lookupResult 4][key(esi+8) 4][innerCode(esi+0x2c) 4][esi 4][pad 8].

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

HOOK_VA: Final[int] = 0x00612348
HOOK_LENGTH: Final[int] = 6  # displaces mov edi,eax (2) + test edi,edi (2) + je 0x612378 (2)
ORIGINAL_HEX: Final[str] = "8bf885ff742a"
MISS_TARGET_VA: Final[int] = 0x00612378  # je target (lookup miss -> close)
HIT_TARGET_VA: Final[int] = 0x0061234E  # fall-through (lookup hit -> dispatch)

BUFFER_OFFSET: Final[int] = 176  # trampoline lives below this; ring starts here (cave is 811B)
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7LK"  # LOGH7 looKup probe


@dataclass(frozen=True, slots=True)
class LobbyLookupProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "missTargetHex": f"0x{MISS_TARGET_VA:08x}",
            "hitTargetHex": f"0x{HIT_TARGET_VA:08x}",
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


def apply_lobby_lookup_probe_patch(source: Path, out: Path, manifest_out: Path) -> LobbyLookupProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"pump lookup entry bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("lobby lookup probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = LobbyLookupProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    # Replay the displaced conditional: mov edi,eax; test edi,edi; je MISS; jmp HIT.
    builder.append(b"\x8b\xf8\x85\xff")  # mov edi, eax ; test edi, edi
    je_va = builder.current_va
    builder.append(b"\x0f\x84")  # je near (0f 84 rel32)
    builder.u32((MISS_TARGET_VA - (je_va + 6)) & 0xFFFFFFFF)
    builder.jmp_rel32(HIT_TARGET_VA)  # jmp 0x61234e
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("lobby lookup trampoline overlaps its ring buffer")
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
    # lookup result (saved EAX) = [esp+0x1c] -> [edi+8]
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x08")
    # esi (saved) = [esp+0x04] -> ecx, and -> [edi+0x14]
    builder.append(b"\x8b\x4c\x24\x04\x89\x4f\x14")
    # key = [esi+8] -> [edi+0x0c]
    builder.append(b"\x8b\x41\x08\x89\x47\x0c")
    # pending inner code = [esi+0x2c] -> [edi+0x10]
    builder.append(b"\x8b\x41\x2c\x89\x47\x10")
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


def decode_lobby_lookup_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("lobby lookup ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, lookup_result, key, inner_code, esi = struct.unpack_from("<IIIII", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "lookupResultHex": f"0x{lookup_result:08x}",
                    "hit": lookup_result != 0,
                    "keyHex": f"0x{key:08x}",
                    "keyLow16Hex": f"0x{key & 0xffff:04x}",
                    "innerCodeHex": f"0x{inner_code & 0xffff:04x}",
                    "innerCodeRaw": f"0x{inner_code:08x}",
                    "esiHex": f"0x{esi:08x}",
                }
            )
        offset += RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII transport handler-lookup ring probe.")
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
        patch_result = apply_lobby_lookup_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_lobby_lookup_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
