from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_manager_callback_patch import (
    FILE_ATTRIBUTE_NORMAL,
    FILE_END,
    FILE_SHARE_READ,
    GENERIC_WRITE,
    OPEN_ALWAYS,
    _write_saved_stack_dword,
)
from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    RuntimePatchTarget,
    enable_section_write_for_virtual_address,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, call_iat, hook_jump, push_u32


DISPATCHER_TARGETS: Final[tuple[tuple[str, int, int], ...]] = (
    ("runtimeManagerFlagThreeDispatcher", 1, 5),
    ("runtimeManagerFlagZeroDispatcher", 2, 7),
)
DISPATCHER_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_dispatcher.bin\x00"
DISPATCHER_LOG_MAGIC: Final[bytes] = b"RMD1"
DISPATCHER_RECORD_BYTES: Final[int] = 52
DISPATCHER_CODE_BYTES: Final[int] = 288
DISPATCHER_TRAMPOLINE_BLOCK_BYTES: Final[int] = 384


@dataclass(frozen=True, slots=True)
class RuntimeManagerDispatcherPatch:
    source: Path
    destination: Path
    hooks: tuple[RuntimePatchTarget, ...]
    cave: RuntimeCodeCave
    hook_hex_by_name: dict[str, str]
    original_hex_by_name: dict[str, str]
    overwrite_bytes_by_name: dict[str, int]
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": DISPATCHER_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hooks": [
                {
                    "target": hook.name,
                    "virtualAddressHex": f"0x{hook.virtual_address:08x}",
                    "fileOffsetHex": f"0x{hook.file_offset:08x}",
                    "originalHex": self.original_hex_by_name[hook.name],
                    "patchedHex": self.hook_hex_by_name[hook.name],
                    "returnAddressHex": (
                        f"0x{hook.virtual_address + self.overwrite_bytes_by_name[hook.name]:08x}"
                    ),
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
                "magic": DISPATCHER_LOG_MAGIC.hex(),
                "recordBytes": DISPATCHER_RECORD_BYTES,
                "layout": (
                    "magic,event,reserved3,managerArg,returnAddress,currentGlobal,"
                    "gateA8,gateA9,gateAA,list24Count,list24Head,list34Count,list34Head,member40"
                ),
            },
        }


def _append_dispatcher_file_write(
    builder: X86Builder, imports: dict[str, str], record_va: int, written_va: int, path_va: int
) -> None:
    builder.append(b"\x6a\x00")
    push_u32(builder, FILE_ATTRIBUTE_NORMAL)
    builder.append(b"\x6a")
    builder.u8(OPEN_ALWAYS)
    builder.append(b"\x6a\x00\x6a")
    builder.u8(FILE_SHARE_READ)
    push_u32(builder, GENERIC_WRITE)
    push_u32(builder, path_va)
    call_iat(builder, imports["CreateFileA"])
    builder.append(b"\x8b\xd8\x83\xf8\xff")
    skip_file = builder.je_rel8_placeholder()
    builder.append(b"\x6a")
    builder.u8(FILE_END)
    builder.append(b"\x6a\x00\x6a\x00\x53")
    call_iat(builder, imports["SetFilePointer"])
    builder.append(b"\x6a\x00")
    push_u32(builder, written_va)
    builder.append(b"\x6a")
    builder.u8(DISPATCHER_RECORD_BYTES)
    push_u32(builder, record_va)
    builder.append(b"\x53")
    call_iat(builder, imports["WriteFile"])
    builder.append(b"\x53")
    call_iat(builder, imports["CloseHandle"])
    builder.patch_rel8(skip_file, builder.current_va)


def _write_manager_dword(builder: X86Builder, manager_offset: int, record_va: int, record_offset: int) -> None:
    builder.append(b"\x8b\x86")
    builder.u32(manager_offset)
    builder.append(b"\xa3")
    builder.u32(record_va + record_offset)


def _write_manager_byte(builder: X86Builder, manager_offset: int, record_va: int, record_offset: int) -> None:
    builder.append(b"\x0f\xb6\x86")
    builder.u32(manager_offset)
    builder.append(b"\xa3")
    builder.u32(record_va + record_offset)


def _build_dispatcher_trampoline(
    *,
    base_va: int,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
    event_id: int,
) -> bytes:
    builder = X86Builder(base_va)
    record_va = base_va + DISPATCHER_CODE_BYTES
    written_va = record_va + DISPATCHER_RECORD_BYTES
    path_va = written_va + 4
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(DISPATCHER_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(DISPATCHER_LOG_MAGIC)
    builder.append(b"\xc6\x05")
    builder.u32(record_va + 4)
    builder.u8(event_id)
    _write_saved_stack_dword(builder, 8, record_va + 8)
    _write_saved_stack_dword(builder, 4, record_va + 12)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 16)
    builder.append(b"\x8b\x35")
    builder.u32(record_va + 8)
    builder.append(b"\x85\xf6")
    skip_manager = builder.je_rel8_placeholder()
    _write_manager_byte(builder, 0xA8, record_va, 20)
    _write_manager_byte(builder, 0xA9, record_va, 24)
    _write_manager_byte(builder, 0xAA, record_va, 28)
    _write_manager_dword(builder, 0x28, record_va, 32)
    _write_manager_dword(builder, 0x24, record_va, 36)
    _write_manager_dword(builder, 0x38, record_va, 40)
    _write_manager_dword(builder, 0x34, record_va, 44)
    _write_manager_dword(builder, 0x40, record_va, 48)
    builder.patch_rel8(skip_manager, builder.current_va)
    _append_dispatcher_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")
    builder.append(original)
    builder.jmp_rel32(hook.virtual_address + len(original))
    if len(builder.data) > DISPATCHER_CODE_BYTES:
        raise ValueError(f"{hook.name} trampoline code overlaps its record buffer")
    while len(builder.data) < DISPATCHER_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(DISPATCHER_LOG_PATH, record_va, written_va, DISPATCHER_RECORD_BYTES)
    if len(builder.data) > DISPATCHER_TRAMPOLINE_BLOCK_BYTES:
        raise ValueError(f"{hook.name} trampoline exceeds reserved block")
    return bytes(builder.data)


def apply_runtime_manager_dispatcher_patch(
    source: Path, destination: Path, manifest_out: Path
) -> RuntimeManagerDispatcherPatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hooks = tuple(targets[name] for name, _event_id, _overwrite_bytes in DISPATCHER_TARGETS)
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    hook_hex_by_name: dict[str, str] = {}
    original_hex_by_name: dict[str, str] = {}
    overwrite_bytes_by_name: dict[str, int] = {}
    trampoline = bytearray()
    for hook, (_target_name, event_id, overwrite_bytes) in zip(hooks, DISPATCHER_TARGETS, strict=True):
        original = bytes(raw[hook.file_offset : hook.file_offset + overwrite_bytes])
        if original.hex() != hook.original_hex[: overwrite_bytes * 2]:
            raise ValueError(f"{hook.name} hook bytes do not match guarded signature")
        base_va = cave.virtual_address + len(trampoline)
        blob = _build_dispatcher_trampoline(
            base_va=base_va, hook=hook, imports=imports, original=original, event_id=event_id
        )
        hook_hex_by_name[hook.name] = hook_jump(hook.virtual_address, base_va, overwrite_bytes).hex()
        original_hex_by_name[hook.name] = original.hex()
        overwrite_bytes_by_name[hook.name] = overwrite_bytes
        trampoline.extend(blob)
        while len(trampoline) % 16:
            trampoline.append(0x90)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("runtime manager dispatcher trampolines exceed code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    for hook in hooks:
        hook_bytes = bytes.fromhex(hook_hex_by_name[hook.name])
        patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = RuntimeManagerDispatcherPatch(
        source=source,
        destination=destination,
        hooks=hooks,
        cave=cave,
        hook_hex_by_name=hook_hex_by_name,
        original_hex_by_name=original_hex_by_name,
        overwrite_bytes_by_name=overwrite_bytes_by_name,
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch
