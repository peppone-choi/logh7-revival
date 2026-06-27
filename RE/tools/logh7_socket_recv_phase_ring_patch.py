from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from logh7_socket_boundary import build_socket_boundary_index
from logh7_socket_recv_patch import PHASE_RECV_SITES, RECV_IAT
from logh7_x86_patch import X86Builder, hook_jump


PHASE_RING_MAGIC: Final[bytes] = b"SRP1"
PHASE_RING_RECORD_BYTES: Final[int] = 64
PHASE_RING_CAPACITY: Final[int] = 4
PHASE_RING_OVERWRITE_BYTES: Final[int] = 6
PHASE_RING_BLOCK_BYTES: Final[int] = 272
PHASE_RING_BUFFER_OFFSET: Final[int] = 544
PHASE3_RING_BUFFER_OFFSET: Final[int] = 288
PHASE3_RECV_VA: Final[int] = 0x00645992


@dataclass(frozen=True, slots=True)
class PhaseRingHook:
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
            "returnAddressHex": f"0x{self.virtual_address + PHASE_RING_OVERWRITE_BYTES:08x}",
        }


@dataclass(frozen=True, slots=True)
class SocketRecvPhaseRingPatch:
    cave: RuntimeCodeCave
    hooks: tuple[PhaseRingHook, ...]
    hook_hex_by_va: dict[int, str]
    before_characteristics: int
    after_characteristics: int
    buffer_offset: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + self.buffer_offset
        return {
            "hooks": [hook.to_json(self.hook_hex_by_va[hook.virtual_address]) for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": self.buffer_offset + 8 + PHASE_RING_RECORD_BYTES * PHASE_RING_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + self.buffer_offset:08x}",
                "recordCapacity": PHASE_RING_CAPACITY,
                "scratchBytes": 4,
                "totalBytes": 8 + PHASE_RING_RECORD_BYTES * PHASE_RING_CAPACITY,
            },
            "recordFormat": {
                "magic": PHASE_RING_MAGIC.hex(),
                "recordBytes": PHASE_RING_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,preSocket,preBuffer,preLen,"
                    "preFlags,returnEax,currentGlobal,preStackDword0..6"
                ),
            },
        }


def apply_socket_recv_phase_ring_patch(
    source: Path, destination: Path, manifest_out: Path
) -> SocketRecvPhaseRingPatch:
    return _apply_socket_recv_phase_ring_patch(
        source, destination, manifest_out, hooks=_phase_hooks(source), buffer_offset=PHASE_RING_BUFFER_OFFSET
    )


def apply_socket_recv_phase3_ring_patch(
    source: Path, destination: Path, manifest_out: Path
) -> SocketRecvPhaseRingPatch:
    return _apply_socket_recv_phase_ring_patch(
        source, destination, manifest_out, hooks=_phase3_hook(source), buffer_offset=PHASE3_RING_BUFFER_OFFSET
    )


def _apply_socket_recv_phase_ring_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
    *,
    hooks: tuple[PhaseRingHook, ...],
    buffer_offset: int,
) -> SocketRecvPhaseRingPatch:
    raw = bytearray(source.read_bytes())
    cave = find_runtime_probe_code_cave(source)
    trampoline = bytearray()
    hook_hex_by_va: dict[int, str] = {}
    for hook in hooks:
        base_va = cave.virtual_address + len(trampoline)
        trampoline.extend(_build_site_trampoline(base_va, hook, cave.virtual_address + buffer_offset))
        hook_hex_by_va[hook.virtual_address] = hook_jump(
            hook.virtual_address, base_va, PHASE_RING_OVERWRITE_BYTES
        ).hex()
        while len(trampoline) % 16:
            trampoline.append(0x90)
    while len(trampoline) < buffer_offset:
        trampoline.append(0x90)
    trampoline.extend(bytes(8 + PHASE_RING_RECORD_BYTES * PHASE_RING_CAPACITY))
    if len(trampoline) > cave.length_bytes:
        raise ValueError("socket recv phase ring patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    for hook in hooks:
        original = bytes(raw[hook.file_offset : hook.file_offset + PHASE_RING_OVERWRITE_BYTES])
        if original.hex() != hook.original_hex:
            raise ValueError(f"phase recv hook bytes drift at 0x{hook.virtual_address:08x}")
        patched[hook.file_offset : hook.file_offset + PHASE_RING_OVERWRITE_BYTES] = bytes.fromhex(
            hook_hex_by_va[hook.virtual_address]
        )
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = SocketRecvPhaseRingPatch(cave, hooks, hook_hex_by_va, before, after, buffer_offset)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_site_trampoline(base_va: int, hook: PhaseRingHook, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_pre_record(builder, hook, buffer_va)
    builder.append(b"\xff\x15")
    builder.u32(RECV_IAT)
    _append_post_record(builder, buffer_va)
    builder.jmp_rel32(hook.virtual_address + PHASE_RING_OVERWRITE_BYTES)
    if len(builder.data) > PHASE_RING_BLOCK_BYTES:
        raise ValueError("socket recv phase ring site block too large")
    while len(builder.data) < PHASE_RING_BLOCK_BYTES:
        builder.u8(0x90)
    return bytes(builder.data)


def _append_pre_record(builder: X86Builder, hook: PhaseRingHook, buffer_va: int) -> None:
    counter_va = buffer_va
    scratch_va = buffer_va + 4
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(PHASE_RING_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\x89\x3d", scratch_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(PHASE_RING_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05")
    builder.u8(hook.site_id)
    _u32(builder, b"\xc7\x47\x08", hook.virtual_address + PHASE_RING_OVERWRITE_BYTES)
    for source, target in ((4, 12), (8, 16), (12, 20), (16, 24)):
        _write_stack_dword_dynamic(builder, source, target)
    for index in range(7):
        _write_stack_dword_dynamic(builder, 4 + index * 4, 36 + index * 4)
    skip_scratch_clear = _jmp_rel8(builder)
    builder.patch_rel8(skip_log, builder.current_va)
    _u32(builder, b"\xc7\x05", scratch_va)
    builder.u32(0)
    builder.patch_rel8(skip_scratch_clear, builder.current_va)
    builder.append(b"\x61\x9d")


def _append_post_record(builder: X86Builder, buffer_va: int) -> None:
    scratch_va = buffer_va + 4
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\x8b\x3d", scratch_va)
    builder.append(b"\x85\xff")
    skip_log = builder.je_rel8_placeholder()
    builder.append(b"\xc6\x47\x04\x02")
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x1c")
    builder.append(b"\xa1\xf4\x25\x7c\x00\x89\x47\x20")
    _u32(builder, b"\xc7\x05", scratch_va)
    builder.u32(0)
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _write_stack_dword_dynamic(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x0c\x8b\x80")
    builder.u32(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def _jmp_rel8(builder: X86Builder) -> int:
    builder.append(b"\xeb\x00")
    return len(builder.data) - 1


def _phase_hooks(source: Path) -> tuple[PhaseRingHook, ...]:
    index = build_socket_boundary_index(source)
    by_va = {int(site["virtualAddress"]): site for site in index["directCallsites"]["recv"]}  # type: ignore[index]
    hooks: list[PhaseRingHook] = []
    for virtual_address, site_id in PHASE_RECV_SITES:
        site = by_va[virtual_address]
        hooks.append(
            PhaseRingHook(
                virtual_address=virtual_address,
                file_offset=int(site["fileOffset"]),
                original_hex=str(site["originalHex"])[: PHASE_RING_OVERWRITE_BYTES * 2],
                role=str(site["role"]),
                site_id=site_id,
            )
        )
    return tuple(hooks)


def _phase3_hook(source: Path) -> tuple[PhaseRingHook, ...]:
    for hook in _phase_hooks(source):
        if hook.virtual_address == PHASE3_RECV_VA:
            return (hook,)
    raise ValueError("phase3 recv hook missing from phase ring hook list")
