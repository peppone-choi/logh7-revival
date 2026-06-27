from __future__ import annotations

import argparse
import json
import shutil
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


SINK_MAGIC: Final[bytes] = b"SPK1"
SINK_RECORD_BYTES: Final[int] = 64
SINK_CAPACITY: Final[int] = 4
SINK_HOOK_VA: Final[int] = 0x00645A4B
SINK_CONTINUATION_VA: Final[int] = 0x00645A56
SINK_OVERWRITE_BYTES: Final[int] = 11
SINK_ORIGINAL_HEX: Final[str] = "528b542438525556ff500c"
SINK_BUFFER_OFFSET: Final[int] = 280
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4


@dataclass(frozen=True, slots=True)
class Phase3SinkPatch:
    cave: RuntimeCodeCave
    file_offset: int
    patched_hex: str
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + SINK_BUFFER_OFFSET
        return {
            "hook": {
                "virtualAddressHex": f"0x{SINK_HOOK_VA:08x}",
                "fileOffsetHex": f"0x{self.file_offset:08x}",
                "continuationHex": f"0x{SINK_CONTINUATION_VA:08x}",
                "originalHex": SINK_ORIGINAL_HEX,
                "patchedHex": self.patched_hex,
                "role": "phase3 decoded transport sink call arguments before vtable slot +0x0c",
            },
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": SINK_BUFFER_OFFSET + 8 + SINK_RECORD_BYTES * SINK_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + SINK_BUFFER_OFFSET:08x}",
                "recordCapacity": SINK_CAPACITY,
                "scratchBytes": 4,
                "totalBytes": 8 + SINK_RECORD_BYTES * SINK_CAPACITY,
            },
            "recordFormat": {
                "magic": SINK_MAGIC.hex(),
                "recordBytes": SINK_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,thisEcx,vtable,sinkTarget,"
                    "outputBuffer,lengthEbp,argFromEdx,argFromStack34,stack38,currentGlobal,"
                    "returnEax,postGlobal"
                ),
            },
        }


def apply_phase3_sink_patch(source: Path, destination: Path, manifest_out: Path) -> Phase3SinkPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    file_offset = _virtual_address_to_offset(image, SINK_HOOK_VA)
    original = raw[file_offset : file_offset + SINK_OVERWRITE_BYTES]
    if original.hex() != SINK_ORIGINAL_HEX:
        raise ValueError(f"phase3 sink hook bytes drift at 0x{SINK_HOOK_VA:08x}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + SINK_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("phase3 sink patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook = hook_jump(SINK_HOOK_VA, cave.virtual_address, SINK_OVERWRITE_BYTES)
    patched[file_offset : file_offset + SINK_OVERWRITE_BYTES] = hook
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = Phase3SinkPatch(cave, file_offset, hook.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_pre_record(builder, buffer_va)
    builder.append(bytes.fromhex(SINK_ORIGINAL_HEX))
    _append_post_record(builder, buffer_va)
    builder.jmp_rel32(SINK_CONTINUATION_VA)
    if len(builder.data) > SINK_BUFFER_OFFSET:
        raise ValueError("phase3 sink trampoline code exceeds reserved buffer offset")
    while len(builder.data) < SINK_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + SINK_RECORD_BYTES * SINK_CAPACITY))
    return bytes(builder.data)


def _append_pre_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    scratch_va = buffer_va + 4
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(SINK_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\x89\x3d", scratch_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(SINK_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05\x01")
    _u32(builder, b"\xc7\x47\x08", SINK_CONTINUATION_VA)
    _write_saved_dword(builder, 0x18, 12)
    _write_saved_dword(builder, 0x1C, 16)
    builder.append(b"\x8b\x44\x24\x1c\x8b\x40\x0c\x89\x47\x14")
    _write_saved_dword(builder, 0x04, 24)
    _write_saved_dword(builder, 0x08, 28)
    _write_saved_dword(builder, 0x14, 32)
    _write_saved_dword(builder, 0x58, 36)
    _write_saved_dword(builder, 0x5C, 40)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x2c")
    skip_scratch_clear = _jmp_rel8(builder)
    builder.patch_rel8(skip_log, builder.current_va)
    _u32(builder, b"\xc7\x05", scratch_va)
    builder.u32(0)
    builder.patch_rel8(skip_scratch_clear, builder.current_va)
    builder.append(b"\x61\x9d")


def _append_post_record(builder: X86Builder, buffer_va: int) -> None:
    scratch_va = buffer_va + 4
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\x8b\x3d", scratch_va)
    builder.append(b"\x85\xff")
    skip_log = builder.je_rel8_placeholder()
    builder.append(b"\xc6\x47\x04\x02")
    _write_saved_dword(builder, 0x1C, 48)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x34")
    _u32(builder, b"\xc7\x05", scratch_va)
    builder.u32(0)
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def _jmp_rel8(builder: X86Builder) -> int:
    builder.append(b"\xeb\x00")
    return len(builder.data) - 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII phase3 parser sink ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_phase3_sink_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
