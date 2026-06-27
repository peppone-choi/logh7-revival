from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_manager_callback_patch import _append_file_write, _write_saved_stack_dword
from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    RuntimePatchTarget,
    enable_section_write_for_virtual_address,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, hook_jump


STATE_TARGETS: Final[tuple[tuple[str, int], ...]] = (
    ("runtimeManagerStateEventCallback", 1),
    ("runtimeManagerStateFollowupCallback", 2),
)
STATE_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_state.bin\x00"
STATE_LOG_MAGIC: Final[bytes] = b"RMS1"
STATE_RECORD_BYTES: Final[int] = 36
STATE_OVERWRITE_BYTES: Final[int] = 6
STATE_CODE_BYTES: Final[int] = 256
STATE_TRAMPOLINE_BLOCK_BYTES: Final[int] = 384


@dataclass(frozen=True, slots=True)
class RuntimeManagerStatePatch:
    source: Path
    destination: Path
    hooks: tuple[RuntimePatchTarget, ...]
    cave: RuntimeCodeCave
    hook_hex_by_name: dict[str, str]
    original_hex_by_name: dict[str, str]
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": STATE_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hooks": [
                {
                    "target": hook.name,
                    "virtualAddressHex": f"0x{hook.virtual_address:08x}",
                    "fileOffsetHex": f"0x{hook.file_offset:08x}",
                    "originalHex": self.original_hex_by_name[hook.name],
                    "patchedHex": self.hook_hex_by_name[hook.name],
                    "returnAddressHex": f"0x{hook.virtual_address + STATE_OVERWRITE_BYTES:08x}",
                }
                for hook in self.hooks
            ],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "sectionCharacteristicsBeforeHex": f"0x{self.section_characteristics_before:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.section_characteristics_after:08x}",
                "requiresWritableSection": True,
            },
            "recordFormat": {
                "magic": STATE_LOG_MAGIC.hex(),
                "recordBytes": STATE_RECORD_BYTES,
                "layout": "magic,event,reserved3,contextArg,flagArg,returnAddress,currentGlobal,stateBefore30,selfDeleteGate,member40",
            },
        }


def _build_state_trampoline(
    *,
    base_va: int,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
    event_id: int,
) -> bytes:
    builder = X86Builder(base_va)
    record_va = base_va + STATE_CODE_BYTES
    written_va = record_va + STATE_RECORD_BYTES
    path_va = written_va + 4
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(STATE_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(STATE_LOG_MAGIC)
    builder.append(b"\xc6\x05")
    builder.u32(record_va + 4)
    builder.u8(event_id)
    _write_saved_stack_dword(builder, 8, record_va + 8)
    _write_saved_stack_dword(builder, 12, record_va + 12)
    _write_saved_stack_dword(builder, 4, record_va + 16)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 20)
    builder.append(b"\xa1")
    builder.u32(record_va + 8)
    builder.append(b"\x85\xc0")
    skip_context = builder.je_rel8_placeholder()
    builder.append(b"\x0f\xb6\x40\x30\xa3")
    builder.u32(record_va + 24)
    builder.append(b"\xa1")
    builder.u32(record_va + 8)
    builder.append(b"\x0f\xb6\x40\x32\xa3")
    builder.u32(record_va + 28)
    builder.append(b"\xa1")
    builder.u32(record_va + 8)
    builder.append(b"\x8b\x40\x40\xa3")
    builder.u32(record_va + 32)
    builder.patch_rel8(skip_context, builder.current_va)
    _append_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")
    builder.append(original)
    builder.jmp_rel32(hook.virtual_address + len(original))
    if len(builder.data) > STATE_CODE_BYTES:
        raise ValueError(f"{hook.name} trampoline code overlaps its record buffer")
    while len(builder.data) < STATE_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(STATE_LOG_PATH, record_va, written_va, STATE_RECORD_BYTES)
    if len(builder.data) > STATE_TRAMPOLINE_BLOCK_BYTES:
        raise ValueError(f"{hook.name} trampoline exceeds reserved block")
    return bytes(builder.data)


def apply_runtime_manager_state_patch(source: Path, destination: Path, manifest_out: Path) -> RuntimeManagerStatePatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hooks = tuple(targets[name] for name, _event_id in STATE_TARGETS)
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    hook_hex_by_name: dict[str, str] = {}
    original_hex_by_name: dict[str, str] = {}
    trampoline = bytearray()
    for hook, (_target_name, event_id) in zip(hooks, STATE_TARGETS, strict=True):
        original = bytes(raw[hook.file_offset : hook.file_offset + STATE_OVERWRITE_BYTES])
        if original.hex() != hook.original_hex[: STATE_OVERWRITE_BYTES * 2]:
            raise ValueError(f"{hook.name} hook bytes do not match guarded signature")
        base_va = cave.virtual_address + len(trampoline)
        blob = _build_state_trampoline(base_va=base_va, hook=hook, imports=imports, original=original, event_id=event_id)
        hook_hex_by_name[hook.name] = hook_jump(hook.virtual_address, base_va, STATE_OVERWRITE_BYTES).hex()
        original_hex_by_name[hook.name] = original.hex()
        trampoline.extend(blob)
        while len(trampoline) % 16:
            trampoline.append(0x90)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("runtime manager state trampolines exceed code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    for hook in hooks:
        hook_bytes = bytes.fromhex(hook_hex_by_name[hook.name])
        patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = RuntimeManagerStatePatch(
        source=source,
        destination=destination,
        hooks=hooks,
        cave=cave,
        hook_hex_by_name=hook_hex_by_name,
        original_hex_by_name=original_hex_by_name,
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch
