from __future__ import annotations

import argparse
import json
import shutil
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

JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"] | None

HOOK_VA: Final[int] = 0x005737D0
CONTINUATION_VA: Final[int] = 0x005737D7
HOOK_LENGTH: Final[int] = 7
ORIGINAL_HEX: Final[str] = "6aff68086a6600"

BUFFER_OFFSET: Final[int] = 192
RECORD_BYTES: Final[int] = 64
RECORD_CAPACITY: Final[int] = 8
MAGIC: Final[bytes] = b"SWP1"

GLOBAL_MOVE_MODE: Final[int] = 0x009D2A7C
GLOBAL_MOVE_STATE: Final[int] = 0x009D2A74


@dataclass(frozen=True, slots=True)
class SendWarpProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: int
    section_after: int

    def to_json(self) -> dict[str, JsonValue]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {
                "virtualAddressHex": f"0x{HOOK_VA:08x}",
                "continuationHex": f"0x{CONTINUATION_VA:08x}",
                "lengthBytes": HOOK_LENGTH,
                "originalHex": ORIGINAL_HEX,
                "patchedHex": self.hook_bytes_hex,
            },
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": BUFFER_OFFSET + 8 + RECORD_BYTES * RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.section_before:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.section_after:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{ring_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + BUFFER_OFFSET:08x}",
                "recordCapacity": RECORD_CAPACITY,
                "recordBytes": RECORD_BYTES,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
                "mode": "wrap",
            },
            "recordFormat": {
                "magic": MAGIC.hex(),
                "layout": (
                    "magic,callIndex,thisPtr,param2Ptr,savedEax,returnAddress,"
                    "globalMoveMode,globalMoveState"
                ),
                "param2Ptr": "stack argument captured at entry before the SEH prologue",
            },
        }


def apply_send_warp_probe_patch(source: Path, destination: Path, manifest_out: Path) -> SendWarpProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"SendWarpCommand entry bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("SendWarpCommand probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = SendWarpProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("SendWarpCommand trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")

    builder.append(b"\xa1")
    builder.u32(counter_va)
    builder.append(b"\xbf")
    builder.u32(records_va)
    builder.append(b"\x8b\xc8\x83\xe1\x07\xc1\xe1\x06\x03\xf9")
    builder.append(b"\xff\x05")
    builder.u32(counter_va)

    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))
    builder.append(b"\x89\x47\x04")

    builder.append(b"\x8b\x44\x24\x18\x89\x47\x08")
    builder.append(b"\x8b\x44\x24\x0c\x8b\x40\x08\x89\x47\x0c")
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x10")
    builder.append(b"\x8b\x44\x24\x0c\x8b\x40\x04\x89\x47\x14")
    builder.append(b"\xa1")
    builder.u32(GLOBAL_MOVE_MODE)
    builder.append(b"\x89\x47\x18")
    builder.append(b"\xa1")
    builder.u32(GLOBAL_MOVE_STATE)
    builder.append(b"\x89\x47\x1c")
    builder.append(b"\x61\x9d")


def decode_send_warp_probe_ring(path: Path) -> dict[str, JsonValue]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("SendWarpCommand probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, JsonValue]] = []
    offset = 8
    for index in range(RECORD_CAPACITY):
        chunk = data[offset : offset + RECORD_BYTES]
        if len(chunk) < RECORD_BYTES:
            break
        if chunk[:4] == MAGIC:
            records.append(_decode_record(index, chunk))
        else:
            records.append({"index": index, "empty": True})
        offset += RECORD_BYTES
    populated = [record for record in records if "callIndex" in record]
    empty = [record for record in records if "callIndex" not in record]
    return {"path": str(path), "counter": counter, "records": sorted(populated, key=_call_index) + empty}


def _decode_record(index: int, chunk: bytes) -> dict[str, JsonValue]:
    (
        call_index,
        this_ptr,
        param2_ptr,
        saved_eax,
        return_address,
        global_move_mode,
        global_move_state,
    ) = struct.unpack_from("<IIIIIII", chunk, 4)
    return {
        "index": index,
        "callIndex": call_index,
        "thisPtrHex": f"0x{this_ptr:08x}",
        "param2PtrHex": f"0x{param2_ptr:08x}",
        "savedEaxHex": f"0x{saved_eax:08x}",
        "returnAddressHex": f"0x{return_address:08x}",
        "globalMoveMode": global_move_mode,
        "globalMoveState": global_move_state,
    }


def _call_index(record: dict[str, JsonValue]) -> int:
    return int(record.get("callIndex", -1) or -1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII SendWarpCommand ring probe.")
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
        result = apply_send_warp_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
        return 0

    decoded = decode_send_warp_probe_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
