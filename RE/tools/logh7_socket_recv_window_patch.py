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
from logh7_socket_recv_patch import RECV_IAT
from logh7_x86_patch import X86Builder, call_iat, hook_jump, push_u32


WINDOW_LOG_PATH: Final[bytes] = b"logh7_socket_recv_window.bin\x00"
WINDOW_LOG_MAGIC: Final[bytes] = b"SRS1"
WINDOW_RECORD_BYTES: Final[int] = 128
WINDOW_CODE_BYTES: Final[int] = 512
WINDOW_OVERWRITE_BYTES: Final[int] = 6
PHASE3_RECV_VA: Final[int] = 0x00645992
PHASE3_SITE_ID: Final[int] = 2


@dataclass(frozen=True, slots=True)
class SocketRecvWindowPatch:
    source: Path
    destination: Path
    cave: RuntimeCodeCave
    hook_file_offset: int
    original_hex: str
    hook_hex: str
    section_characteristics_before: int
    section_characteristics_after: int

    def to_json(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "logPath": WINDOW_LOG_PATH.rstrip(b"\x00").decode("ascii"),
            "hook": {
                "virtualAddressHex": f"0x{PHASE3_RECV_VA:08x}",
                "fileOffsetHex": f"0x{self.hook_file_offset:08x}",
                "siteId": PHASE3_SITE_ID,
                "originalHex": self.original_hex,
                "patchedHex": self.hook_hex,
                "returnAddressHex": f"0x{PHASE3_RECV_VA + WINDOW_OVERWRITE_BYTES:08x}",
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
                "magic": WINDOW_LOG_MAGIC.hex(),
                "recordBytes": WINDOW_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,returnEax,savedEax,savedEcx,"
                    "savedEdx,savedEbx,savedEspFlagsSlot,savedEbp,savedEsi,savedEdi,currentGlobal,"
                    "stackDword0..15"
                ),
            },
        }


def _append_with_u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _write_saved_register_dword(builder: X86Builder, pushad_offset: int, destination_va: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(pushad_offset)
    _append_with_u32(builder, b"\xa3", destination_va)


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
    builder.u8(WINDOW_RECORD_BYTES)
    push_u32(builder, record_va)
    builder.append(b"\x53")
    call_iat(builder, imports["WriteFile"])
    builder.append(b"\x53")
    call_iat(builder, imports["CloseHandle"])
    builder.patch_rel8(skip_file, builder.current_va)


def _call_recv(builder: X86Builder) -> None:
    _append_with_u32(builder, b"\xff\x15", RECV_IAT)


def _append_pre_call_record(builder: X86Builder, record_va: int) -> None:
    builder.append(b"\x9c\x60\xfc")
    _append_with_u32(builder, b"\xbf", record_va)
    _append_with_u32(builder, b"\xb9", WINDOW_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    _append_with_u32(builder, b"\xc7\x05", record_va)
    builder.append(WINDOW_LOG_MAGIC)
    _append_with_u32(builder, b"\xc6\x05", record_va + 4)
    builder.u8(1)
    _append_with_u32(builder, b"\xc6\x05", record_va + 5)
    builder.u8(PHASE3_SITE_ID)
    _append_with_u32(builder, b"\xc7\x05", record_va + 8)
    builder.u32(PHASE3_RECV_VA + WINDOW_OVERWRITE_BYTES)
    for index in range(16):
        _write_saved_stack_dword(builder, 4 + index * 4, record_va + 60 + index * 4)
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
    _write_saved_register_dword(builder, 28, record_va + 12)
    _write_saved_register_dword(builder, 28, record_va + 16)
    _write_saved_register_dword(builder, 24, record_va + 20)
    _write_saved_register_dword(builder, 20, record_va + 24)
    _write_saved_register_dword(builder, 16, record_va + 28)
    _write_saved_register_dword(builder, 12, record_va + 32)
    _write_saved_register_dword(builder, 8, record_va + 36)
    _write_saved_register_dword(builder, 4, record_va + 40)
    _write_saved_register_dword(builder, 0, record_va + 44)
    _append_with_u32(builder, b"\xa1\xf4\x25\x7c\x00\xa3", record_va + 48)
    _append_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")


def _build_window_trampoline(cave: RuntimeCodeCave, imports: dict[str, str]) -> bytes:
    builder = X86Builder(cave.virtual_address)
    record_va = cave.virtual_address + WINDOW_CODE_BYTES
    written_va = record_va + WINDOW_RECORD_BYTES
    path_va = written_va + 4
    _append_pre_call_record(builder, record_va)
    _call_recv(builder)
    _append_post_call_record(builder, imports, record_va=record_va, written_va=written_va, path_va=path_va)
    builder.jmp_rel32(PHASE3_RECV_VA + WINDOW_OVERWRITE_BYTES)
    if len(builder.data) > WINDOW_CODE_BYTES:
        raise ValueError("socket recv window trampoline code overlaps its record buffer")
    while len(builder.data) < WINDOW_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(WINDOW_LOG_PATH, record_va, written_va, WINDOW_RECORD_BYTES)
    if len(builder.data) > cave.length_bytes:
        raise ValueError("socket recv window trampoline exceeds code cave capacity")
    return bytes(builder.data)


def apply_socket_recv_window_patch(source: Path, destination: Path, manifest_out: Path) -> SocketRecvWindowPatch:
    raw = bytearray(source.read_bytes())
    site = _phase3_recv_site(source)
    original = bytes(raw[site["fileOffset"] : site["fileOffset"] + WINDOW_OVERWRITE_BYTES])
    expected = str(site["originalHex"])[: WINDOW_OVERWRITE_BYTES * 2]
    if original.hex() != expected:
        raise ValueError("phase3 recv hook bytes drift")
    imports = extract_runtime_probe_imports(source)
    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_window_trampoline(cave, imports)
    hook_bytes = hook_jump(PHASE3_RECV_VA, cave.virtual_address, WINDOW_OVERWRITE_BYTES)

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before_characteristics, after_characteristics = enable_section_write_for_virtual_address(
        patched, cave.virtual_address
    )
    patched[int(site["fileOffset"]) : int(site["fileOffset"]) + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = SocketRecvWindowPatch(
        source=source,
        destination=destination,
        cave=cave,
        hook_file_offset=int(site["fileOffset"]),
        original_hex=original.hex(),
        hook_hex=hook_bytes.hex(),
        section_characteristics_before=before_characteristics,
        section_characteristics_after=after_characteristics,
    )
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _phase3_recv_site(source: Path) -> dict[str, object]:
    index = build_socket_boundary_index(source)
    for site in index["directCallsites"]["recv"]:  # type: ignore[index]
        if site["virtualAddress"] == PHASE3_RECV_VA:
            return site
    raise ValueError("phase3 recv callsite missing from socket boundary index")
