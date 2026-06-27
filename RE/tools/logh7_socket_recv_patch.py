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
    enable_section_write_for_virtual_address,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_socket_boundary import build_socket_boundary_index
from logh7_x86_patch import X86Builder, call_iat, hook_jump, push_u32


RECV_LOG_PATH: Final[bytes] = b"logh7_socket_recv_boundary.bin\x00"
RECV_LOG_MAGIC: Final[bytes] = b"SRB1"
RECV_RECORD_BYTES: Final[int] = 64
RECV_CODE_BYTES: Final[int] = 300
RECV_BLOCK_BYTES: Final[int] = 400
RECV_OVERWRITE_BYTES: Final[int] = 6
RECV_IAT: Final[int] = 0x0066B6B0
PHASE_RECV_SITES: Final[tuple[tuple[int, int], ...]] = ((0x006454D1, 1), (0x00645992, 2))


@dataclass(frozen=True, slots=True)
class SocketRecvHook:
    virtual_address: int
    file_offset: int
    original_hex: str
    role: str
    site_id: int

    def to_json(self, patched_hex: str) -> dict[str, object]:
        return {
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "siteId": self.site_id,
            "role": self.role,
            "originalHex": self.original_hex,
            "patchedHex": patched_hex,
            "returnAddressHex": f"0x{self.virtual_address + RECV_OVERWRITE_BYTES:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketRecvPatch:
    source: Path
    destination: Path
    cave: RuntimeCodeCave
    hooks: tuple[SocketRecvHook, ...]
    hook_hex_by_va: dict[int, str]
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": RECV_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hooks": [hook.to_json(self.hook_hex_by_va[hook.virtual_address]) for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "sectionCharacteristicsBeforeHex": f"0x{self.section_characteristics_before:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.section_characteristics_after:08x}",
                "requiresWritableSection": True,
            },
            "recordFormat": {
                "magic": RECV_LOG_MAGIC.hex(),
                "recordBytes": RECV_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,stackDword0,stackDword1,stackDword2,stackDword3,"
                    "continuation,returnEax,savedEcx,savedEdx,savedEdi,currentGlobal,first16Bytes"
                ),
            },
        }


def _append_file_write(
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
    builder.u8(RECV_RECORD_BYTES)
    push_u32(builder, record_va)
    builder.append(b"\x53")
    call_iat(builder, imports["WriteFile"])
    builder.append(b"\x53")
    call_iat(builder, imports["CloseHandle"])
    builder.patch_rel8(skip_file, builder.current_va)


def _write_saved_register_dword(builder: X86Builder, pushad_offset: int, destination_va: int) -> None:
    _append_with_u8(builder, b"\x8b\x44\x24", pushad_offset)
    _append_with_u32(builder, b"\xa3", destination_va)


def _append_with_u8(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u8(value)


def _append_with_u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _call_recv(builder: X86Builder) -> None:
    _append_with_u32(builder, b"\xff\x15", RECV_IAT)


def _append_pre_call_record(builder: X86Builder, record_va: int, continuation_va: int, site_id: int) -> None:
    builder.append(b"\x9c\x60\xfc")
    _append_with_u32(builder, b"\xbf", record_va)
    _append_with_u32(builder, b"\xb9", RECV_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    _append_with_u32(builder, b"\xc7\x05", record_va)
    builder.append(RECV_LOG_MAGIC)
    _append_with_u32(builder, b"\xc6\x05", record_va + 4)
    builder.u8(1)
    _append_with_u32(builder, b"\xc6\x05", record_va + 5)
    builder.u8(site_id)
    _write_saved_stack_dword(builder, 4, record_va + 8)
    _write_saved_stack_dword(builder, 8, record_va + 12)
    _write_saved_stack_dword(builder, 12, record_va + 16)
    _write_saved_stack_dword(builder, 16, record_va + 20)
    _append_with_u32(builder, b"\xc7\x05", record_va + 24)
    builder.u32(continuation_va)
    builder.append(b"\x61\x9d")


def _append_post_call_record(
    builder: X86Builder,
    imports: dict[str, str],
    *,
    record_va: int,
    written_va: int,
    path_va: int,
) -> None:
    builder.append(b"\x9c\x60\xfc")
    _write_saved_register_dword(builder, 28, record_va + 28)
    _write_saved_register_dword(builder, 24, record_va + 32)
    _write_saved_register_dword(builder, 20, record_va + 36)
    _write_saved_register_dword(builder, 0, record_va + 40)
    builder.append(b"\xa1\xf4\x25\x7c\x00\xa3")
    builder.u32(record_va + 44)
    _append_buffer_copy(builder, record_va)
    _append_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")


def _append_buffer_copy(builder: X86Builder, record_va: int) -> None:
    _append_with_u32(builder, b"\x8b\x0d", record_va + 28)
    builder.append(b"\x85\xc9")
    skip_nonpositive = _jle_rel8_placeholder(builder)
    builder.append(b"\x83\xf9\x10")
    keep_return_length = builder.jbe_rel8_placeholder()
    builder.append(b"\xb9\x10\x00\x00\x00")
    builder.patch_rel8(keep_return_length, builder.current_va)
    _append_with_u32(builder, b"\x8b\x35", record_va + 12)
    builder.append(b"\x85\xf6")
    skip_null_buffer = builder.je_rel8_placeholder()
    _append_with_u32(builder, b"\xbf", record_va + 48)
    builder.append(b"\xf3\xa4")
    builder.patch_rel8(skip_null_buffer, builder.current_va)
    builder.patch_rel8(skip_nonpositive, builder.current_va)


def _jle_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x7e\x00")
    return len(builder.data) - 1


def _build_recv_trampoline(base_va: int, hook: SocketRecvHook, imports: dict[str, str]) -> bytes:
    builder = X86Builder(base_va)
    record_va = base_va + RECV_CODE_BYTES
    written_va = record_va + RECV_RECORD_BYTES
    path_va = written_va + 4
    continuation_va = hook.virtual_address + RECV_OVERWRITE_BYTES
    _append_pre_call_record(builder, record_va, continuation_va, hook.site_id)
    _call_recv(builder)
    _append_post_call_record(builder, imports, record_va=record_va, written_va=written_va, path_va=path_va)
    builder.jmp_rel32(continuation_va)
    if len(builder.data) > RECV_CODE_BYTES:
        raise ValueError("socket recv trampoline code overlaps its record buffer")
    while len(builder.data) < RECV_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(RECV_LOG_PATH, record_va, written_va, RECV_RECORD_BYTES)
    if len(builder.data) > RECV_BLOCK_BYTES:
        raise ValueError("socket recv trampoline exceeds reserved block")
    return bytes(builder.data)


def apply_socket_recv_patch(source: Path, destination: Path, manifest_out: Path) -> SocketRecvPatch:
    raw = bytearray(source.read_bytes())
    imports = extract_runtime_probe_imports(source)
    cave = find_runtime_probe_code_cave(source)
    hooks = _phase_recv_hooks(source)
    hook_hex_by_va: dict[int, str] = {}
    trampoline = bytearray()
    for hook in hooks:
        original = bytes(raw[hook.file_offset : hook.file_offset + RECV_OVERWRITE_BYTES])
        if original.hex() != hook.original_hex:
            raise ValueError(f"socket recv hook bytes drift at 0x{hook.virtual_address:08x}")
        base_va = cave.virtual_address + len(trampoline)
        blob = _build_recv_trampoline(base_va, hook, imports)
        hook_hex_by_va[hook.virtual_address] = hook_jump(hook.virtual_address, base_va, RECV_OVERWRITE_BYTES).hex()
        trampoline.extend(blob)
        while len(trampoline) % 16:
            trampoline.append(0x90)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("socket recv trampolines exceed code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    for hook in hooks:
        hook_bytes = hook_jump(hook.virtual_address, cave.virtual_address + _hook_block_offset(hooks, hook), RECV_OVERWRITE_BYTES)
        patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = SocketRecvPatch(
        source=source,
        destination=destination,
        cave=cave,
        hooks=hooks,
        hook_hex_by_va=hook_hex_by_va,
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _hook_block_offset(hooks: tuple[SocketRecvHook, ...], hook: SocketRecvHook) -> int:
    return hooks.index(hook) * RECV_BLOCK_BYTES


def _phase_recv_hooks(source: Path) -> tuple[SocketRecvHook, ...]:
    index = build_socket_boundary_index(source)
    by_va = {int(site["virtualAddress"]): site for site in index["directCallsites"]["recv"]}  # type: ignore[index]
    hooks: list[SocketRecvHook] = []
    for virtual_address, site_id in PHASE_RECV_SITES:
        site = by_va[virtual_address]
        hooks.append(
            SocketRecvHook(
                virtual_address=virtual_address,
                file_offset=int(site["fileOffset"]),
                original_hex=str(site["originalHex"])[: RECV_OVERWRITE_BYTES * 2],
                role=str(site["role"]),
                site_id=site_id,
            )
        )
    return tuple(hooks)
