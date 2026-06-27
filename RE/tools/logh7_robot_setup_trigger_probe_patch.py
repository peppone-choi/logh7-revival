from __future__ import annotations

import argparse
import json
import shutil
import struct
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

ROBOT_TRIGGER_MAGIC: Final[bytes] = b"RST1"
RECORD_BYTES: Final[int] = 64
RECORD_CAPACITY: Final[int] = 8
BUFFER_OFFSET: Final[int] = 288
SESSION_MAP_GLOBAL_VA: Final[int] = 0x007C2478
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4
CLIENT_GLOBAL_VA: Final[int] = 0x007CCFFC
SETUP_CALL_TARGET_VA: Final[int] = 0x004AD710

HOOKS: Final[tuple[dict[str, int | str], ...]] = (
    {
        "name": "robotApiEntry",
        "event": 1,
        "virtualAddress": 0x0051BD70,
        "continuation": 0x0051BD76,
        "originalHex": "8b0dfccf7c00",
        "overwriteBytes": 6,
    },
    {
        "name": "robotBootstrap",
        "event": 2,
        "virtualAddress": 0x004B6480,
        "continuation": 0x004B6485,
        "originalHex": "b908ee7600",
        "overwriteBytes": 5,
    },
    {
        "name": "sessionBootstrapSetupCall",
        "event": 3,
        "virtualAddress": 0x004AD3E6,
        "continuation": 0x004AD3EB,
        "originalHex": "e825030000",
        "overwriteBytes": 5,
    },
)


def _hex(value: int) -> str:
    return f"0x{value:08x}"


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _call_rel32(builder: X86Builder, destination: int) -> None:
    source = builder.current_va
    builder.u8(0xE8)
    builder.u32(destination - (source + 5))


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")
    return len(builder.data) - 1


def _write_saved(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _append_logger(builder: X86Builder, buffer_va: int) -> int:
    logger_va = builder.current_va
    counter_va = buffer_va
    records_va = buffer_va + 8
    _u32(builder, b"\x8b\x35", counter_va)
    builder.append(b"\x83\xfe")
    builder.u8(RECORD_CAPACITY)
    log_branch = _jb_rel8_placeholder(builder)
    builder.u8(0xC3)
    builder.patch_rel8(log_branch, builder.current_va)
    _u32(builder, b"\xff\x05", counter_va)
    builder.append(b"\xc1\xe6\x06")
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x03\xfe")
    _u32(builder, b"\xc7\x07", int.from_bytes(ROBOT_TRIGGER_MAGIC, "little"))
    builder.append(b"\x88\x47\x04\x88\x47\x05\xc6\x47\x06\x00\xc6\x47\x07\x00")
    builder.append(b"\x89\x57\x08\x89\x4f\x0c\x89\x5f\x10")
    for stack_offset, record_offset in (
        (0x20, 0x14),
        (0x1C, 0x18),
        (0x18, 0x1C),
        (0x14, 0x20),
        (0x10, 0x24),
        (0x0C, 0x28),
        (0x08, 0x2C),
        (0x04, 0x30),
    ):
        _write_saved(builder, stack_offset, record_offset)
    for address, record_offset in (
        (SESSION_MAP_GLOBAL_VA, 0x34),
        (RUNTIME_MANAGER_GLOBAL_VA, 0x38),
        (CLIENT_GLOBAL_VA, 0x3C),
    ):
        _u32(builder, b"\xa1", address)
        builder.append(b"\x89\x47")
        builder.u8(record_offset)
    builder.u8(0xC3)
    return logger_va


def _append_log_call(builder: X86Builder, logger_va: int, event: int, hook_va: int, continuation: int, target: int) -> None:
    builder.append(b"\x9c\x60")
    _u32(builder, b"\xb8", event)
    _u32(builder, b"\xba", hook_va)
    _u32(builder, b"\xb9", continuation)
    _u32(builder, b"\xbb", target)
    _call_rel32(builder, logger_va)
    builder.append(b"\x61\x9d")


def _append_api_hook(builder: X86Builder, logger_va: int) -> int:
    entry_va = builder.current_va
    _append_log_call(builder, logger_va, 1, 0x0051BD70, 0x0051BD76, 0)
    _u32(builder, b"\x8b\x0d", CLIENT_GLOBAL_VA)
    builder.jmp_rel32(0x0051BD76)
    return entry_va


def _append_robot_bootstrap_hook(builder: X86Builder, logger_va: int) -> int:
    entry_va = builder.current_va
    _append_log_call(builder, logger_va, 2, 0x004B6480, 0x004B6485, 0)
    _u32(builder, b"\xb9", 0x0076EE08)
    builder.jmp_rel32(0x004B6485)
    return entry_va


def _append_setup_call_hook(builder: X86Builder, logger_va: int) -> int:
    entry_va = builder.current_va
    _append_log_call(builder, logger_va, 3, 0x004AD3E6, 0x004AD3EB, SETUP_CALL_TARGET_VA)
    _call_rel32(builder, SETUP_CALL_TARGET_VA)
    _append_log_call(builder, logger_va, 4, 0x004AD3E6, 0x004AD3EB, SETUP_CALL_TARGET_VA)
    builder.jmp_rel32(0x004AD3EB)
    return entry_va


def _build_trampoline(base_va: int, buffer_va: int) -> tuple[bytes, dict[str, int]]:
    builder = X86Builder(base_va)
    logger_va = _append_logger(builder, buffer_va)
    hook_entries = {
        "robotApiEntry": _append_api_hook(builder, logger_va),
        "robotBootstrap": _append_robot_bootstrap_hook(builder, logger_va),
        "sessionBootstrapSetupCall": _append_setup_call_hook(builder, logger_va),
    }
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("robot setup trigger trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data), hook_entries


def _hook_manifest(hook: dict[str, int | str], entry_va: int, patched_hex: str) -> dict[str, JsonValue]:
    return {
        "target": str(hook["name"]),
        "event": int(hook["event"]),
        "virtualAddressHex": _hex(int(hook["virtualAddress"])),
        "continuationHex": _hex(int(hook["continuation"])),
        "originalHex": str(hook["originalHex"]),
        "patchedHex": patched_hex,
        "trampolineHex": _hex(entry_va),
    }


def apply_robot_setup_trigger_probe_patch(source: Path, destination: Path, manifest_out: Path) -> dict[str, JsonValue]:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    cave = find_runtime_probe_code_cave(source)
    trampoline, hook_entries = _build_trampoline(cave.virtual_address, cave.virtual_address + BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("robot setup trigger patch exceeds code cave capacity")

    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hooks_json: list[dict[str, JsonValue]] = []
    for hook in HOOKS:
        hook_va = int(hook["virtualAddress"])
        length = int(hook["overwriteBytes"])
        hook_offset = _virtual_address_to_offset(image, hook_va)
        original = raw[hook_offset : hook_offset + length].hex()
        if original != hook["originalHex"]:
            raise ValueError(f"{hook['name']} bytes drift at {_hex(hook_va)}")
        entry_va = hook_entries[str(hook["name"])]
        hook_bytes = hook_jump(hook_va, entry_va, length)
        patched[hook_offset : hook_offset + length] = hook_bytes
        hooks_json.append(_hook_manifest(hook, entry_va, hook_bytes.hex()))
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(patched)

    ring_bytes = 8 + RECORD_BYTES * RECORD_CAPACITY
    manifest: dict[str, JsonValue] = {
        "hooks": hooks_json,
        "trampoline": {
            "virtualAddressHex": _hex(cave.virtual_address),
            "fileOffsetHex": _hex(cave.file_offset),
            "capacityBytes": cave.length_bytes,
            "bytesUsed": len(trampoline),
            "sectionCharacteristicsBeforeHex": _hex(before),
            "sectionCharacteristicsAfterHex": _hex(after),
        },
        "ringBuffer": {"virtualAddressHex": _hex(cave.virtual_address + BUFFER_OFFSET), "fileOffsetHex": _hex(cave.file_offset + BUFFER_OFFSET), "recordCapacity": RECORD_CAPACITY, "totalBytes": ring_bytes},
        "recordFormat": {
            "magic": ROBOT_TRIGGER_MAGIC.hex(),
            "recordBytes": RECORD_BYTES,
            "layout": "magic,event,siteId,reserved,hookVa,continuationVa,targetVa,savedEax,savedEcx,savedEdx,savedEbx,savedEsp,savedEbp,savedEsi,savedEdi,sessionMapGlobal,runtimeManagerGlobal,clientGlobal",
        },
    }
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest

def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII robot setup trigger ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_robot_setup_trigger_probe_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
