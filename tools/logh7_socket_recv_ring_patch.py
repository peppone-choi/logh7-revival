from __future__ import annotations

import json
import shutil
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from logh7_socket_boundary import build_socket_boundary_index
from logh7_socket_recv_patch import RECV_IAT
from logh7_x86_patch import X86Builder


RING_MAGIC: Final[bytes] = b"SRR1"
RING_RECORD_BYTES: Final[int] = 64
RING_RECORD_CAPACITY: Final[int] = 4
RING_OVERWRITE_BYTES: Final[int] = 6
RING_BUFFER_OFFSET: Final[int] = 480


@dataclass(frozen=True, slots=True)
class SocketRecvRingHook:
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
            "callReturnAddressHex": f"0x{self.virtual_address + 5:08x}",
            "continuationAddressHex": f"0x{self.virtual_address + RING_OVERWRITE_BYTES:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketRecvRingPatch:
    cave: RuntimeCodeCave
    hooks: tuple[SocketRecvRingHook, ...]
    hook_hex_by_va: dict[int, str]
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + RING_BUFFER_OFFSET
        return {
            "hooks": [hook.to_json(self.hook_hex_by_va[hook.virtual_address]) for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
                "requiresWritableSection": True,
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + RING_BUFFER_OFFSET:08x}",
                "recordCapacity": RING_RECORD_CAPACITY,
                "totalBytes": 4 + RING_RECORD_BYTES * RING_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": RING_MAGIC.hex(),
                "recordBytes": RING_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,callReturn,socketArg,bufferArg,lenArg,"
                    "flagsArg,returnEax,currentGlobal,stackDword0..7"
                ),
            },
        }


def apply_socket_recv_ring_patch(source: Path, destination: Path, manifest_out: Path) -> SocketRecvRingPatch:
    raw = bytearray(source.read_bytes())
    cave = find_runtime_probe_code_cave(source)
    hooks = _all_recv_hooks(source)
    trampoline = _build_ring_wrapper(cave, hooks)
    hook_hex_by_va: dict[int, str] = {}
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    for hook in hooks:
        original = bytes(raw[hook.file_offset : hook.file_offset + RING_OVERWRITE_BYTES])
        if original.hex() != hook.original_hex:
            raise ValueError(f"socket recv hook bytes drift at 0x{hook.virtual_address:08x}")
        hook_bytes = _call_rel32(hook.virtual_address, cave.virtual_address, RING_OVERWRITE_BYTES)
        hook_hex_by_va[hook.virtual_address] = hook_bytes.hex()
        patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = SocketRecvRingPatch(cave, hooks, hook_hex_by_va, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _call_rel32(source_va: int, destination_va: int, length: int) -> bytes:
    return b"\xe8" + struct.pack("<i", destination_va - (source_va + 5)) + bytes([0x90] * (length - 5))


def _build_ring_wrapper(cave: RuntimeCodeCave, hooks: tuple[SocketRecvRingHook, ...]) -> bytes:
    builder = X86Builder(cave.virtual_address)
    buffer_va = cave.virtual_address + RING_BUFFER_OFFSET
    counter_va = buffer_va
    records_va = buffer_va + 4
    for _ in range(4):
        builder.append(b"\xff\x74\x24\x10")
    builder.append(b"\xff\x15")
    builder.u32(RECV_IAT)
    _append_ring_record(builder, hooks, counter_va, records_va)
    builder.append(b"\xc2\x10\x00")
    if len(builder.data) > RING_BUFFER_OFFSET:
        raise ValueError("socket recv ring wrapper overlaps its ring buffer")
    while len(builder.data) < RING_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(4 + RING_RECORD_BYTES * RING_RECORD_CAPACITY))
    if len(builder.data) > cave.length_bytes:
        raise ValueError("socket recv ring wrapper exceeds code cave capacity")
    return bytes(builder.data)


def _append_ring_record(
    builder: X86Builder, hooks: tuple[SocketRecvRingHook, ...], counter_va: int, records_va: int
) -> None:
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(RING_RECORD_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(RING_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05\x00")
    _write_stack_dword_dynamic(builder, 0, 8)
    _append_site_id_detection(builder, hooks)
    for source, dest in ((4, 12), (8, 16), (12, 20), (16, 24)):
        _write_stack_dword_dynamic(builder, source, dest)
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x1c")
    builder.append(b"\xa1\xf4\x25\x7c\x00\x89\x47\x20")
    for index in range(8):
        _write_stack_dword_dynamic(builder, index * 4, 32 + index * 4)
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _append_site_id_detection(builder: X86Builder, hooks: tuple[SocketRecvRingHook, ...]) -> None:
    builder.append(b"\x8b\x47\x08")
    for hook in hooks:
        builder.append(b"\x3d")
        builder.u32(hook.virtual_address + 5)
        skip = builder.jne_rel8_placeholder()
        builder.append(b"\xc6\x47\x05")
        builder.u8(hook.site_id)
        builder.patch_rel8(skip, builder.current_va)


def _write_stack_dword_dynamic(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x0c\x8b\x80")
    builder.u32(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def _all_recv_hooks(source: Path) -> tuple[SocketRecvRingHook, ...]:
    index = build_socket_boundary_index(source)
    hooks: list[SocketRecvRingHook] = []
    for site_id, site in enumerate(index["directCallsites"]["recv"], 1):  # type: ignore[index]
        hooks.append(
            SocketRecvRingHook(
                virtual_address=int(site["virtualAddress"]),
                file_offset=int(site["fileOffset"]),
                original_hex=str(site["originalHex"])[: RING_OVERWRITE_BYTES * 2],
                role=str(site["role"]),
                site_id=site_id,
            )
        )
    return tuple(hooks)
