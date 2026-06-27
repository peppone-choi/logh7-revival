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


CLEANUP_MAGIC: Final[bytes] = b"SCU1"
CLEANUP_RECORD_BYTES: Final[int] = 64
CLEANUP_RECORD_CAPACITY: Final[int] = 4
CLEANUP_BUFFER_OFFSET: Final[int] = 480
CLEANUP_HOOK_VA: Final[int] = 0x006151D0
CLEANUP_CONTINUATION_VA: Final[int] = 0x006151D6
CLEANUP_ORIGINAL_HEX: Final[str] = "568bf15733ff"
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4
CLIENT_GLOBAL_VA: Final[int] = 0x007CCFFC


@dataclass(frozen=True, slots=True)
class SocketCleanupRingHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, str]:
        return {
            "target": "socketCleanupEntry",
            "virtualAddressHex": f"0x{CLEANUP_HOOK_VA:08x}",
            "continuationHex": f"0x{CLEANUP_CONTINUATION_VA:08x}",
            "originalHex": CLEANUP_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketCleanupRingPatch:
    cave: RuntimeCodeCave
    hook: SocketCleanupRingHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + CLEANUP_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": CLEANUP_BUFFER_OFFSET + 8 + CLEANUP_RECORD_BYTES * CLEANUP_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + CLEANUP_BUFFER_OFFSET:08x}",
                "recordCapacity": CLEANUP_RECORD_CAPACITY,
                "totalBytes": 8 + CLEANUP_RECORD_BYTES * CLEANUP_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": CLEANUP_MAGIC.hex(),
                "recordBytes": CLEANUP_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,connectionThis,callerReturn,"
                    "socketHandle,state78,error7c,member80,member84,runtimeManagerGlobal,clientGlobal,savedEax"
                ),
            },
        }


def apply_socket_cleanup_ring_patch(source: Path, destination: Path, manifest_out: Path) -> SocketCleanupRingPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, CLEANUP_HOOK_VA)
    original = raw[hook_offset : hook_offset + 6]
    if original.hex() != CLEANUP_ORIGINAL_HEX:
        raise ValueError(f"socket cleanup hook bytes drift at 0x{CLEANUP_HOOK_VA:08x}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + CLEANUP_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("socket cleanup ring patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(CLEANUP_HOOK_VA, cave.virtual_address, 6)
    patched[hook_offset : hook_offset + 6] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = SocketCleanupRingHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = SocketCleanupRingPatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(CLEANUP_ORIGINAL_HEX))
    builder.jmp_rel32(CLEANUP_CONTINUATION_VA)
    if len(builder.data) > CLEANUP_BUFFER_OFFSET:
        raise ValueError("socket cleanup trampoline overlaps its ring buffer")
    while len(builder.data) < CLEANUP_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + CLEANUP_RECORD_BYTES * CLEANUP_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(CLEANUP_RECORD_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(CLEANUP_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05\x01\x66\xc7\x47\x06\x00\x00")
    _u32(builder, b"\xc7\x47\x08", CLEANUP_CONTINUATION_VA)
    _write_saved_dword(builder, 0x18, 12)
    _write_original_stack_dword(builder, 0, 16)
    for source_offset, record_offset in ((0x08, 20), (0x78, 24), (0x7C, 28), (0x80, 32), (0x84, 36)):
        _write_ecx_dword(builder, source_offset, record_offset)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x28")
    _u32(builder, b"\xa1", CLIENT_GLOBAL_VA)
    builder.append(b"\x89\x47\x2c")
    _write_saved_dword(builder, 0x1C, 48)
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_original_stack_dword(builder: X86Builder, stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x0c\x83\xc0\x04\x8b\x80")
    builder.u32(stack_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_ecx_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x18\x8b\x80")
    builder.u32(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII socket cleanup entry ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_socket_cleanup_ring_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
