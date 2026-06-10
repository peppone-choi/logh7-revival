from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    RuntimePatchTarget,
    enable_section_write_for_virtual_address,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, call_iat, push_u32


DESTRUCTOR_TARGET: Final[str] = "runtimeManagerDestructorEntry"
DESTRUCTOR_BODY_VA: Final[int] = 0x004ADAC0
DESTRUCTOR_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_destructor.bin\x00"
DESTRUCTOR_LOG_MAGIC: Final[bytes] = b"DTE1"
DESTRUCTOR_RECORD_BYTES: Final[int] = 32
DESTRUCTOR_OVERWRITE_BYTES: Final[int] = 8
FILE_ATTRIBUTE_NORMAL: Final[int] = 0x80
FILE_END: Final[int] = 2
FILE_SHARE_READ: Final[int] = 1
GENERIC_WRITE: Final[int] = 0x40000000
OPEN_ALWAYS: Final[int] = 4


@dataclass(frozen=True, slots=True)
class RuntimeManagerDestructorPatch:
    source: Path
    destination: Path
    hook: RuntimePatchTarget
    cave: RuntimeCodeCave
    trampoline_length: int
    hook_hex: str
    original_hex: str
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, str | int | dict[str, str | int | bool]]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": DESTRUCTOR_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hook": {
                "target": self.hook.name,
                "virtualAddressHex": f"0x{self.hook.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.hook.file_offset:08x}",
                "originalHex": self.original_hex,
                "patchedHex": self.hook_hex,
                "returnAddressHex": f"0x{self.hook.virtual_address + DESTRUCTOR_OVERWRITE_BYTES:08x}",
                "replayedCallTargetHex": f"0x{DESTRUCTOR_BODY_VA:08x}",
            },
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "lengthBytes": self.trampoline_length,
                "capacityBytes": self.cave.length_bytes,
                "sectionCharacteristicsBeforeHex": f"0x{self.section_characteristics_before:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.section_characteristics_after:08x}",
                "requiresWritableSection": True,
            },
            "recordFormat": {
                "magic": DESTRUCTOR_LOG_MAGIC.hex(),
                "recordBytes": DESTRUCTOR_RECORD_BYTES,
                "layout": "magic,event,reserved3,managerThis,returnAddress,deleteFlag,currentGlobal,vtablePointer",
            },
        }


def _hook_jump(source_va: int, destination_va: int) -> bytes:
    relative = destination_va - (source_va + 5)
    return b"\xe9" + relative.to_bytes(4, "little", signed=True) + b"\x90" * (DESTRUCTOR_OVERWRITE_BYTES - 5)


def _call_rel32(builder: X86Builder, destination_va: int) -> None:
    source_va = builder.current_va
    builder.u8(0xE8)
    builder.u32(destination_va - (source_va + 5))


def _append_file_write(builder: X86Builder, imports: dict[str, str], record_va: int, written_va: int, path_va: int) -> None:
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
    builder.u8(DESTRUCTOR_RECORD_BYTES)
    push_u32(builder, record_va)
    builder.append(b"\x53")
    call_iat(builder, imports["WriteFile"])
    builder.append(b"\x53")
    call_iat(builder, imports["CloseHandle"])
    builder.patch_rel8(skip_file, builder.current_va)


def _build_destructor_trampoline(
    cave: RuntimeCodeCave,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
) -> bytes:
    builder = X86Builder(cave.virtual_address)
    record_va = cave.virtual_address + 512
    written_va = record_va + DESTRUCTOR_RECORD_BYTES
    path_va = written_va + 4

    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(DESTRUCTOR_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(DESTRUCTOR_LOG_MAGIC)
    builder.append(b"\xc6\x05")
    builder.u32(record_va + 4)
    builder.u8(1)
    builder.append(b"\x8b\x44\x24\x18\xa3")
    builder.u32(record_va + 8)
    builder.append(b"\x8b\x44\x24\x24\xa3")
    builder.u32(record_va + 12)
    builder.append(b"\x8b\x44\x24\x28\xa3")
    builder.u32(record_va + 16)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 20)
    builder.append(b"\x8b\x44\x24\x18\x8b\x00\xa3")
    builder.u32(record_va + 24)
    _append_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")
    builder.append(original[:3])
    _call_rel32(builder, DESTRUCTOR_BODY_VA)
    builder.jmp_rel32(hook.virtual_address + len(original))
    if len(builder.data) > 512:
        raise ValueError("runtime manager destructor trampoline code overlaps its record buffer")
    while len(builder.data) < 512:
        builder.u8(0x90)
    builder.append_record_data(DESTRUCTOR_LOG_PATH, record_va, written_va, DESTRUCTOR_RECORD_BYTES)
    if len(builder.data) > cave.length_bytes:
        raise ValueError("runtime manager destructor trampoline exceeds code cave capacity")
    return bytes(builder.data)


def apply_runtime_manager_destructor_patch(
    source: Path, destination: Path, manifest_out: Path
) -> RuntimeManagerDestructorPatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hook = targets[DESTRUCTOR_TARGET]
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    original = bytes(raw[hook.file_offset : hook.file_offset + DESTRUCTOR_OVERWRITE_BYTES])
    if original.hex() != hook.original_hex[: DESTRUCTOR_OVERWRITE_BYTES * 2]:
        raise ValueError("runtimeManagerDestructorEntry hook bytes do not match guarded signature")
    trampoline = _build_destructor_trampoline(cave, hook, imports, original)
    hook_bytes = _hook_jump(hook.virtual_address, cave.virtual_address)

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = RuntimeManagerDestructorPatch(
        source=source,
        destination=destination,
        hook=hook,
        cave=cave,
        trampoline_length=len(trampoline),
        hook_hex=hook_bytes.hex(),
        original_hex=original.hex(),
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch
