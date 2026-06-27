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


ENTRY_MAGIC: Final[bytes] = b"TDE1"
ENTRY_RECORD_BYTES: Final[int] = 64
ENTRY_CAPACITY: Final[int] = 8
ENTRY_HOOK_VA: Final[int] = 0x004B78BB
ENTRY_CONTINUATION_VA: Final[int] = 0x004B78C5
ENTRY_OVERWRITE_BYTES: Final[int] = 10
ENTRY_ORIGINAL_HEX: Final[str] = "8b450c5325ffff000056"
ENTRY_BUFFER_OFFSET: Final[int] = 280
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4
CIPHER_GATE_OFFSET: Final[int] = 0x0035837E


@dataclass(frozen=True, slots=True)
class TransportDispatchEntryPatch:
    cave: RuntimeCodeCave
    file_offset: int
    patched_hex: str
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + ENTRY_BUFFER_OFFSET
        return {
            "hook": {
                "virtualAddressHex": f"0x{ENTRY_HOOK_VA:08x}",
                "fileOffsetHex": f"0x{self.file_offset:08x}",
                "continuationHex": f"0x{ENTRY_CONTINUATION_VA:08x}",
                "originalHex": ENTRY_ORIGINAL_HEX,
                "patchedHex": self.patched_hex,
                "role": "transport dispatcher entry after SEH setup before jump-table dispatch",
            },
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": ENTRY_BUFFER_OFFSET + 8 + ENTRY_RECORD_BYTES * ENTRY_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + ENTRY_BUFFER_OFFSET:08x}",
                "recordCapacity": ENTRY_CAPACITY,
                "scratchBytes": 4,
                "totalBytes": 8 + ENTRY_RECORD_BYTES * ENTRY_CAPACITY,
            },
            "recordFormat": {
                "magic": ENTRY_MAGIC.hex(),
                "recordBytes": ENTRY_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,clientPointer,transportCode,"
                    "payloadOrContextPointer,arg10,runtimeManagerGlobal,cipherGate,returnAddress"
                ),
            },
        }


def apply_transport_dispatch_entry_patch(
    source: Path, destination: Path, manifest_out: Path
) -> TransportDispatchEntryPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    file_offset = _virtual_address_to_offset(image, ENTRY_HOOK_VA)
    original = raw[file_offset : file_offset + ENTRY_OVERWRITE_BYTES]
    if original.hex() != ENTRY_ORIGINAL_HEX:
        raise ValueError(f"transport dispatch entry hook bytes drift at 0x{ENTRY_HOOK_VA:08x}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + ENTRY_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("transport dispatch entry patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook = hook_jump(ENTRY_HOOK_VA, cave.virtual_address, ENTRY_OVERWRITE_BYTES)
    patched[file_offset : file_offset + ENTRY_OVERWRITE_BYTES] = hook
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = TransportDispatchEntryPatch(cave, file_offset, hook.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ENTRY_ORIGINAL_HEX))
    builder.jmp_rel32(ENTRY_CONTINUATION_VA)
    if len(builder.data) > ENTRY_BUFFER_OFFSET:
        raise ValueError("transport dispatch entry trampoline code exceeds reserved buffer offset")
    while len(builder.data) < ENTRY_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + ENTRY_RECORD_BYTES * ENTRY_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(ENTRY_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(ENTRY_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05\x01")
    _u32(builder, b"\xc7\x47\x08", ENTRY_CONTINUATION_VA)
    _write_saved_dword(builder, 0x18, 12)
    _write_ebp_dword(builder, 0x0C, 16)
    _write_ebp_dword(builder, 0x08, 20)
    _write_ebp_dword(builder, 0x10, 24)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x1c")
    builder.append(b"\x8b\x44\x24\x18")
    builder.append(b"\x0f\xb6\x80")
    builder.u32(CIPHER_GATE_OFFSET)
    builder.append(b"\x89\x47\x20")
    builder.append(b"\x8b\x45\x04\x89\x47\x24")
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_ebp_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x45")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII transport dispatcher entry probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_transport_dispatch_entry_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
