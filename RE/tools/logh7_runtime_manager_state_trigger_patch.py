from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_manager_callback_patch import _write_saved_stack_dword
from logh7_runtime_manager_dispatcher_patch import _append_dispatcher_file_write
from logh7_runtime_manager_dispatcher_node_patch import _write_manager_byte, _write_manager_dword
from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    RuntimePatchTarget,
    enable_section_write_for_virtual_address,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, hook_jump


TRIGGER_TARGET: Final[str] = "runtimeManagerStateTriggerCallback"
TRIGGER_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_state_trigger.bin\x00"
TRIGGER_LOG_MAGIC: Final[bytes] = b"RMT1"
TRIGGER_RECORD_BYTES: Final[int] = 52
TRIGGER_CODE_BYTES: Final[int] = 288
TRIGGER_OVERWRITE_BYTES: Final[int] = 6


@dataclass(frozen=True, slots=True)
class RuntimeManagerStateTriggerPatch:
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
            "logPath": TRIGGER_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hook": {
                "target": self.hook.name,
                "virtualAddressHex": f"0x{self.hook.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.hook.file_offset:08x}",
                "originalHex": self.original_hex,
                "patchedHex": self.hook_hex,
                "returnAddressHex": f"0x{self.hook.virtual_address + TRIGGER_OVERWRITE_BYTES:08x}",
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
                "magic": TRIGGER_LOG_MAGIC.hex(),
                "recordBytes": TRIGGER_RECORD_BYTES,
                "layout": (
                    "magic,event,reserved3,contextArg,flagArg,returnAddress,currentGlobal,"
                    "gateA8,gateA9,gateAA,member40,member44,member44Vtable,slot14Target"
                ),
            },
        }


def _build_trigger_trampoline(
    *,
    cave: RuntimeCodeCave,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
) -> bytes:
    builder = X86Builder(cave.virtual_address)
    record_va = cave.virtual_address + TRIGGER_CODE_BYTES
    written_va = record_va + TRIGGER_RECORD_BYTES
    path_va = written_va + 4
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(TRIGGER_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(TRIGGER_LOG_MAGIC)
    builder.append(b"\xc6\x05")
    builder.u32(record_va + 4)
    builder.u8(1)
    _write_saved_stack_dword(builder, 8, record_va + 8)
    _write_saved_stack_dword(builder, 12, record_va + 12)
    _write_saved_stack_dword(builder, 4, record_va + 16)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 20)
    builder.append(b"\x8b\x35")
    builder.u32(record_va + 8)
    builder.append(b"\x85\xf6")
    skip_context = builder.je_rel8_placeholder()
    _write_manager_byte(builder, 0xA8, record_va, 24)
    _write_manager_byte(builder, 0xA9, record_va, 28)
    _write_manager_byte(builder, 0xAA, record_va, 32)
    _write_manager_dword(builder, 0x40, record_va, 36)
    _write_manager_dword(builder, 0x44, record_va, 40)
    builder.append(b"\x8b\x86")
    builder.u32(0x44)
    builder.append(b"\x85\xc0")
    skip_member = builder.je_rel8_placeholder()
    builder.append(b"\x8b\x00\xa3")
    builder.u32(record_va + 44)
    builder.append(b"\xa1")
    builder.u32(record_va + 44)
    builder.append(b"\x8b\x40\x14\xa3")
    builder.u32(record_va + 48)
    builder.patch_rel8(skip_member, builder.current_va)
    builder.patch_rel8(skip_context, builder.current_va)
    _append_dispatcher_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")
    builder.append(original)
    builder.jmp_rel32(hook.virtual_address + len(original))
    if len(builder.data) > TRIGGER_CODE_BYTES:
        raise ValueError("state trigger trampoline code overlaps its record buffer")
    while len(builder.data) < TRIGGER_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(TRIGGER_LOG_PATH, record_va, written_va, TRIGGER_RECORD_BYTES)
    if len(builder.data) > cave.length_bytes:
        raise ValueError("state trigger trampoline exceeds code cave capacity")
    return bytes(builder.data)


def apply_runtime_manager_state_trigger_patch(
    source: Path, destination: Path, manifest_out: Path
) -> RuntimeManagerStateTriggerPatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hook = targets[TRIGGER_TARGET]
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    original = bytes(raw[hook.file_offset : hook.file_offset + TRIGGER_OVERWRITE_BYTES])
    if original.hex() != hook.original_hex[: TRIGGER_OVERWRITE_BYTES * 2]:
        raise ValueError(f"{hook.name} hook bytes do not match guarded signature")
    trampoline = _build_trigger_trampoline(cave=cave, hook=hook, imports=imports, original=original)
    hook_bytes = hook_jump(hook.virtual_address, cave.virtual_address, TRIGGER_OVERWRITE_BYTES)

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = RuntimeManagerStateTriggerPatch(
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
