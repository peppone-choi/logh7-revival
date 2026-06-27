"""Patch/decode a LOGH VII UI hit-test ring probe.

The lobby state `0x2a` calls `FUN_005015f0(2, object, scratch, 1)` for
group-1 UI objects 2, 3, and 4 before it can send `0x2009`. This probe hooks
`FUN_005015f0` entry and records only mode-2 calls, including the tested object
pointer and the key per-object hit/status bytes.
"""
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

JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

HOOK_VA: Final[int] = 0x005015F0
CONTINUATION_VA: Final[int] = 0x005015F8
HOOK_LENGTH: Final[int] = 8
ORIGINAL_HEX: Final[str] = "83ec20538b5c242c"

BUFFER_OFFSET: Final[int] = 280
RECORD_BYTES: Final[int] = 64
RECORD_CAPACITY: Final[int] = 8
MAGIC: Final[bytes] = b"UIH2"

GLOBAL_MOUSE_D0: Final[int] = 0x022142D0
GLOBAL_MOUSE_B8: Final[int] = 0x022142B8


@dataclass(frozen=True, slots=True)
class UiHitProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: int
    section_after: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + BUFFER_OFFSET
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
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + BUFFER_OFFSET:08x}",
                "recordCapacity": RECORD_CAPACITY,
                "recordBytes": RECORD_BYTES,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
                "mode": "wrap",
            },
            "recordFormat": {
                "magic": MAGIC.hex(),
                "layout": "magic,callIndex,mode,objectPtr,param5,objectFlagsA,objectFlagsB,mouseD0,mouseB8,rect,idB04,offset0c,offset10",
                "objectFlagsA": "byte+0x08 | byte+0x14<<8 | byte+0x15<<16 | byte+0x18<<24",
                "objectFlagsB": "byte+0xb00 | byte+0xb02<<8 | byte+0xb10<<16",
            },
        }


def apply_ui_hit_probe_patch(source: Path, destination: Path, manifest_out: Path) -> UiHitProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"UI hit probe bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("UI hit probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = UiHitProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_log_mode2_entry(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("UI hit trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_log_mode2_entry(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\x8b\x5c\x24\x0c")
    builder.append(b"\x8b\x43\x08\x83\xf8\x02")
    mode_ok = builder.je_rel8_placeholder()
    skip_mode = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(mode_ok, builder.current_va)
    builder.append(b"\x8b\x53\x0c\x85\xd2")
    object_ok = builder.jne_rel8_placeholder()
    skip_null = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(object_ok, builder.current_va)

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
    builder.append(b"\x8b\x43\x08\x89\x47\x08")
    builder.append(b"\x8b\x43\x0c\x89\x47\x0c")
    builder.append(b"\x8b\x43\x14\x89\x47\x10")
    _append_object_flags_a(builder)
    builder.append(b"\x89\x47\x14")
    _append_object_flags_b(builder)
    builder.append(b"\x89\x47\x18")
    builder.append(b"\xa1")
    builder.u32(GLOBAL_MOUSE_D0)
    builder.append(b"\x89\x47\x1c")
    builder.append(b"\xa1")
    builder.u32(GLOBAL_MOUSE_B8)
    builder.append(b"\x89\x47\x20")
    _append_object_dword(builder, 0x20, 0x24)
    _append_object_dword(builder, 0x24, 0x28)
    _append_object_dword(builder, 0x2C, 0x2C)
    _append_object_dword(builder, 0x30, 0x30)
    _append_object_word(builder, 0xB04, 0x34)
    _append_object_dword(builder, 0x0C, 0x38)
    _append_object_dword(builder, 0x10, 0x3C)

    _patch_rel32(builder, skip_mode, builder.current_va)
    _patch_rel32(builder, skip_null, builder.current_va)
    builder.append(b"\x61\x9d")


def _append_object_flags_a(builder: X86Builder) -> None:
    builder.append(b"\x33\xc0\x8a\x42\x08")
    builder.append(b"\x33\xc9\x8a\x4a\x14\xc1\xe1\x08\x0b\xc1")
    builder.append(b"\x33\xc9\x8a\x4a\x15\xc1\xe1\x10\x0b\xc1")
    builder.append(b"\x33\xc9\x8a\x4a\x18\xc1\xe1\x18\x0b\xc1")


def _append_object_flags_b(builder: X86Builder) -> None:
    builder.append(b"\x33\xc0\x8a\x82\x00\x0b\x00\x00")
    builder.append(b"\x33\xc9\x8a\x8a\x02\x0b\x00\x00\xc1\xe1\x08\x0b\xc1")
    builder.append(b"\x33\xc9\x8a\x8a\x10\x0b\x00\x00\xc1\xe1\x10\x0b\xc1")


def _append_object_dword(builder: X86Builder, object_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x82")
    builder.u32(object_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _append_object_word(builder: X86Builder, object_offset: int, record_offset: int) -> None:
    builder.append(b"\x0f\xb7\x82")
    builder.u32(object_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    builder.u8(0xE9)
    placeholder_offset = len(builder.data)
    builder.u32(0)
    return placeholder_offset


def _patch_rel32(builder: X86Builder, placeholder_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + placeholder_offset + 4
    relative = destination - source_after_instruction
    builder.data[placeholder_offset : placeholder_offset + 4] = struct.pack("<i", relative)


def decode_ui_hit_probe_ring(path: Path) -> dict[str, JsonValue]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("UI hit probe ring is too small")
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
        mode,
        object_ptr,
        param5,
        flags_a,
        flags_b,
        mouse_d0,
        mouse_b8,
        rect_x,
        rect_y,
        rect_w,
        rect_h,
        object_id,
        object_offset_x,
        object_offset_y,
    ) = struct.unpack_from("<IIIIIIIIIIIIIII", chunk, 4)
    return {
        "index": index,
        "callIndex": call_index,
        "mode": mode,
        "objectPtrHex": f"0x{object_ptr:08x}",
        "param5": param5,
        "objectActive8": flags_a & 0xFF,
        "objectVisible14": (flags_a >> 8) & 0xFF,
        "objectEnabled15": (flags_a >> 16) & 0xFF,
        "objectInput18": (flags_a >> 24) & 0xFF,
        "objectFlagB00": flags_b & 0xFF,
        "objectFlagB02": (flags_b >> 8) & 0xFF,
        "objectFlagB10": (flags_b >> 16) & 0xFF,
        "objectFlagB14": (flags_b >> 24) & 0xFF,
        "mouseD0Hex": f"0x{mouse_d0:08x}",
        "mouseB8Hex": f"0x{mouse_b8:08x}",
        "rect": {"x": _s32(rect_x), "y": _s32(rect_y), "w": _s32(rect_w), "h": _s32(rect_h)},
        "objectIdB04Hex": f"0x{object_id & 0xFFFF:04x}",
        "objectOffset0c": _s32(object_offset_x),
        "objectOffset10": _s32(object_offset_y),
    }


def _s32(value: int) -> int:
    return value - 0x100000000 if value & 0x80000000 else value


def _call_index(record: dict[str, JsonValue]) -> int:
    value = record["callIndex"]
    if not isinstance(value, int):
        raise TypeError("callIndex is not an int")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode LOGH VII UI hit-test ring probe.")
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
        result = apply_ui_hit_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_ui_hit_probe_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is not None:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
