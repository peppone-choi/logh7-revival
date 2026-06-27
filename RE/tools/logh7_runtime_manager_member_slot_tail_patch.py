from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_manager_callback_patch import _write_saved_stack_dword
from logh7_runtime_manager_dispatcher_patch import _append_dispatcher_file_write
from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    RuntimePatchTarget,
    enable_section_write_for_virtual_address,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, hook_jump


TAIL_TARGET: Final[str] = "stateTriggerMemberSlotSuccessTail"
TAIL_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_member_slot_tail.bin\x00"
TAIL_LOG_MAGIC: Final[bytes] = b"RME3"
TAIL_RECORD_BYTES: Final[int] = 52
TAIL_CODE_BYTES: Final[int] = 288
TAIL_OVERWRITE_BYTES: Final[int] = 7


@dataclass(frozen=True, slots=True)
class RuntimeManagerMemberSlotTailPatch:
    source: Path
    destination: Path
    hook: RuntimePatchTarget
    cave: RuntimeCodeCave
    hook_hex: str
    original_hex: str
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": TAIL_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hook": {
                "target": self.hook.name,
                "virtualAddressHex": f"0x{self.hook.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.hook.file_offset:08x}",
                "originalHex": self.original_hex,
                "patchedHex": self.hook_hex,
                "returnAddressHex": f"0x{self.hook.virtual_address + TAIL_OVERWRITE_BYTES:08x}",
            },
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "sectionCharacteristicsBeforeHex": f"0x{self.section_characteristics_before:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.section_characteristics_after:08x}",
                "requiresWritableSection": True,
            },
            "recordFormat": {
                "magic": TAIL_LOG_MAGIC.hex(),
                "recordBytes": TAIL_RECORD_BYTES,
                "layout": (
                    "magic,event,reserved3,savedEsi,savedEbp,currentGlobal,stackD4,"
                    "stackC4,eax,edx,ebx,continuation,savedEcx,al"
                ),
            },
        }


def _write_saved_register_dword(builder: X86Builder, pushad_offset: int, destination_va: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(pushad_offset)
    builder.append(b"\xa3")
    builder.u32(destination_va)


def _write_saved_al_dword(builder: X86Builder, pushad_offset: int, destination_va: int) -> None:
    builder.append(b"\x0f\xb6\x44\x24")
    builder.u8(pushad_offset)
    builder.append(b"\xa3")
    builder.u32(destination_va)


def _append_tail_record(
    builder: X86Builder,
    imports: dict[str, str],
    *,
    record_va: int,
    written_va: int,
    path_va: int,
    continuation_va: int,
) -> None:
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(TAIL_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(TAIL_LOG_MAGIC)
    builder.append(b"\xc6\x05")
    builder.u32(record_va + 4)
    builder.u8(1)
    _write_saved_register_dword(builder, 4, record_va + 8)
    _write_saved_register_dword(builder, 8, record_va + 12)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 16)
    _write_saved_stack_dword(builder, 0xD8, record_va + 20)
    _write_saved_stack_dword(builder, 0xC8, record_va + 24)
    _write_saved_register_dword(builder, 28, record_va + 28)
    _write_saved_register_dword(builder, 20, record_va + 32)
    _write_saved_register_dword(builder, 16, record_va + 36)
    builder.append(b"\xc7\x05")
    builder.u32(record_va + 40)
    builder.u32(continuation_va)
    _write_saved_register_dword(builder, 24, record_va + 44)
    _write_saved_al_dword(builder, 28, record_va + 48)
    _append_dispatcher_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")


def _build_tail_trampoline(
    *,
    cave: RuntimeCodeCave,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
) -> bytes:
    builder = X86Builder(cave.virtual_address)
    record_va = cave.virtual_address + TAIL_CODE_BYTES
    written_va = record_va + TAIL_RECORD_BYTES
    path_va = written_va + 4
    continuation_va = hook.virtual_address + TAIL_OVERWRITE_BYTES
    _append_tail_record(
        builder,
        imports,
        record_va=record_va,
        written_va=written_va,
        path_va=path_va,
        continuation_va=continuation_va,
    )
    builder.append(original)
    builder.jmp_rel32(continuation_va)
    if len(builder.data) > TAIL_CODE_BYTES:
        raise ValueError("member slot tail trampoline code overlaps its record buffer")
    while len(builder.data) < TAIL_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(TAIL_LOG_PATH, record_va, written_va, TAIL_RECORD_BYTES)
    if len(builder.data) > cave.length_bytes:
        raise ValueError("member slot tail trampoline exceeds code cave capacity")
    return bytes(builder.data)


def apply_runtime_manager_member_slot_tail_patch(
    source: Path, destination: Path, manifest_out: Path
) -> RuntimeManagerMemberSlotTailPatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hook = targets[TAIL_TARGET]
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    original = bytes(raw[hook.file_offset : hook.file_offset + TAIL_OVERWRITE_BYTES])
    if original.hex() != hook.original_hex[: TAIL_OVERWRITE_BYTES * 2]:
        raise ValueError(f"{hook.name} hook bytes do not match guarded signature")
    trampoline = _build_tail_trampoline(cave=cave, hook=hook, imports=imports, original=original)
    hook_bytes = hook_jump(hook.virtual_address, cave.virtual_address, TAIL_OVERWRITE_BYTES)

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = RuntimeManagerMemberSlotTailPatch(
        source=source,
        destination=destination,
        hook=hook,
        cave=cave,
        hook_hex=hook_bytes.hex(),
        original_hex=original.hex(),
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch
