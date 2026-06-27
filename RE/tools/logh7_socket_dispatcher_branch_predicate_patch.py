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


JsonValue = str | int | list["JsonValue"] | dict[str, "JsonValue"]

PREDICATE_MAGIC: Final[bytes] = b"SPB1"
PREDICATE_RECORD_BYTES: Final[int] = 64
PREDICATE_RECORD_CAPACITY: Final[int] = 4
PREDICATE_BUFFER_OFFSET: Final[int] = 480
PREDICATE_HOOK_VA: Final[int] = 0x00613142
PREDICATE_FALSE_CONTINUATION_VA: Final[int] = 0x00613147
PREDICATE_TRUE_TARGET_VA: Final[int] = 0x00613150
PREDICATE_ORIGINAL_HEX: Final[str] = "3938740a5f"
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4
CLIENT_GLOBAL_VA: Final[int] = 0x007CCFFC


@dataclass(frozen=True, slots=True)
class SocketDispatcherBranchPredicateHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "socketDispatcherBranchPredicate",
            "virtualAddressHex": f"0x{PREDICATE_HOOK_VA:08x}",
            "falseContinuationHex": f"0x{PREDICATE_FALSE_CONTINUATION_VA:08x}",
            "trueTargetHex": f"0x{PREDICATE_TRUE_TARGET_VA:08x}",
            "originalHex": PREDICATE_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketDispatcherBranchPredicatePatch:
    cave: RuntimeCodeCave
    hook: SocketDispatcherBranchPredicateHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + PREDICATE_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": PREDICATE_BUFFER_OFFSET
                + 8
                + PREDICATE_RECORD_BYTES * PREDICATE_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + PREDICATE_BUFFER_OFFSET:08x}",
                "recordCapacity": PREDICATE_RECORD_CAPACITY,
                "totalBytes": 8 + PREDICATE_RECORD_BYTES * PREDICATE_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": PREDICATE_MAGIC.hex(),
                "recordBytes": PREDICATE_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,branchTaken,reserved,falseContinuation,trueTarget,"
                    "savedEax,eaxDeref,savedEdi,connectionThis,socketHandle,state78,error7c,"
                    "member80,member84,runtimeManagerGlobal,clientGlobal,savedEsi"
                ),
            },
        }


def apply_socket_dispatcher_branch_predicate_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
) -> SocketDispatcherBranchPredicatePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, PREDICATE_HOOK_VA)
    original = raw[hook_offset : hook_offset + 5]
    if original.hex() != PREDICATE_ORIGINAL_HEX:
        raise ValueError(f"socket dispatcher predicate bytes drift at 0x{PREDICATE_HOOK_VA:08x}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + PREDICATE_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("socket dispatcher branch predicate patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(PREDICATE_HOOK_VA, cave.virtual_address, 5)
    patched[hook_offset : hook_offset + 5] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = SocketDispatcherBranchPredicateHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = SocketDispatcherBranchPredicatePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x39\x38")
    true_branch = builder.je_rel8_placeholder()
    builder.u8(0x5F)
    builder.jmp_rel32(PREDICATE_FALSE_CONTINUATION_VA)
    builder.patch_rel8(true_branch, builder.current_va)
    builder.jmp_rel32(PREDICATE_TRUE_TARGET_VA)
    if len(builder.data) > PREDICATE_BUFFER_OFFSET:
        raise ValueError("socket dispatcher predicate trampoline overlaps its ring buffer")
    while len(builder.data) < PREDICATE_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + PREDICATE_RECORD_BYTES * PREDICATE_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(PREDICATE_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(PREDICATE_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05\x01\xc6\x47\x06\x00\xc6\x47\x07\x00")
    _u32(builder, b"\xc7\x47\x08", PREDICATE_FALSE_CONTINUATION_VA)
    _u32(builder, b"\xc7\x47\x0c", PREDICATE_TRUE_TARGET_VA)
    _write_saved_dword(builder, 0x1C, 16)
    _write_saved_eax_deref(builder, 20)
    _write_saved_dword(builder, 0x00, 24)
    _write_saved_dword(builder, 0x08, 28)
    for source_offset, record_offset in ((0x08, 32), (0x78, 36), (0x7C, 40), (0x80, 44), (0x84, 48)):
        _write_ebp_dword(builder, source_offset, record_offset)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x34")
    _u32(builder, b"\xa1", CLIENT_GLOBAL_VA)
    builder.append(b"\x89\x47\x38")
    _write_saved_dword(builder, 0x04, 60)
    _write_branch_taken_byte(builder)
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_saved_eax_deref(builder: X86Builder, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x1c\x8b\x00\x89\x47")
    builder.u8(record_offset)


def _write_ebp_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x08\x8b\x80")
    builder.u32(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_branch_taken_byte(builder: X86Builder) -> None:
    builder.append(b"\x8b\x44\x24\x1c\x8b\x00\x3b\x04\x24\x0f\x94\xc0\x88\x47\x06")


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII socket dispatcher branch predicate ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_socket_dispatcher_branch_predicate_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
