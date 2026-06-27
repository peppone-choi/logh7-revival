from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_runtime_manager_dispatcher_patch import (
    RuntimeManagerDispatcherPatch,
    _append_dispatcher_file_write,
    _write_manager_byte,
    _write_saved_stack_dword,
)
from logh7_runtime_patch_targets import (
    RuntimePatchTarget,
    extract_runtime_patch_targets,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from logh7_x86_patch import X86Builder, hook_jump


NODE_TARGETS: Final[tuple[tuple[str, int, int, int, int], ...]] = (
    ("runtimeManagerFlagThreeDispatcher", 1, 5, 0x24, 0x28),
    ("runtimeManagerFlagZeroDispatcher", 2, 7, 0x34, 0x38),
)
NODE_LOG_PATH: Final[bytes] = b"logh7_runtime_manager_dispatcher_node.bin\x00"
NODE_LOG_MAGIC: Final[bytes] = b"RMN1"
NODE_RECORD_BYTES: Final[int] = 52
NODE_CODE_BYTES: Final[int] = 288
NODE_TRAMPOLINE_BLOCK_BYTES: Final[int] = 400


@dataclass(frozen=True, slots=True)
class RuntimeManagerDispatcherNodePatch(RuntimeManagerDispatcherPatch):
    list_head_offset_by_name: dict[str, int]
    list_count_offset_by_name: dict[str, int]

    def to_json(self) -> dict[str, object]:
        base = RuntimeManagerDispatcherPatch.to_json(self)
        base["logPath"] = NODE_LOG_PATH.rstrip(b"\x00").decode("ascii")
        base["recordFormat"] = {
            "magic": NODE_LOG_MAGIC.hex(),
            "recordBytes": NODE_RECORD_BYTES,
            "layout": (
                "magic,event,reserved3,managerArg,returnAddress,currentGlobal,"
                "listCount,listHead,firstContext,firstCallback,gateA8,gateA9,gateAA,member40"
            ),
        }
        hooks: list[dict[str, object]] = []
        for hook in self.hooks:
            item = {
                "target": hook.name,
                "virtualAddressHex": f"0x{hook.virtual_address:08x}",
                "fileOffsetHex": f"0x{hook.file_offset:08x}",
                "originalHex": self.original_hex_by_name[hook.name],
                "patchedHex": self.hook_hex_by_name[hook.name],
                "returnAddressHex": (
                    f"0x{hook.virtual_address + self.overwrite_bytes_by_name[hook.name]:08x}"
                ),
                "listHeadOffsetHex": f"0x{self.list_head_offset_by_name[hook.name]:08x}",
                "listCountOffsetHex": f"0x{self.list_count_offset_by_name[hook.name]:08x}",
            }
            hooks.append(item)
        base["hooks"] = hooks
        return base


def _write_manager_dword(builder: X86Builder, manager_offset: int, record_va: int, record_offset: int) -> None:
    builder.append(b"\x8b\x86")
    builder.u32(manager_offset)
    builder.append(b"\xa3")
    builder.u32(record_va + record_offset)


def _build_node_trampoline(
    *,
    base_va: int,
    hook: RuntimePatchTarget,
    imports: dict[str, str],
    original: bytes,
    event_id: int,
    list_head_offset: int,
    list_count_offset: int,
) -> bytes:
    builder = X86Builder(base_va)
    record_va = base_va + NODE_CODE_BYTES
    written_va = record_va + NODE_RECORD_BYTES
    path_va = written_va + 4
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\xbf")
    builder.u32(record_va)
    builder.append(b"\xb9")
    builder.u32(NODE_RECORD_BYTES)
    builder.append(b"\x31\xc0\xf3\xaa")
    builder.append(b"\xc7\x05")
    builder.u32(record_va)
    builder.append(NODE_LOG_MAGIC)
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
    _write_manager_dword(builder, list_count_offset, record_va, 20)
    _write_manager_dword(builder, list_head_offset, record_va, 24)
    builder.append(b"\xa1")
    builder.u32(record_va + 24)
    builder.append(b"\x85\xc0")
    skip_head = builder.je_rel8_placeholder()
    builder.append(b"\x8b\x00")
    builder.append(b"\x3b\x05")
    builder.u32(record_va + 24)
    skip_node = builder.je_rel8_placeholder()
    builder.append(b"\x8b\x48\x0c\x89\x0d")
    builder.u32(record_va + 28)
    builder.append(b"\x8b\x48\x10\x89\x0d")
    builder.u32(record_va + 32)
    builder.patch_rel8(skip_node, builder.current_va)
    builder.patch_rel8(skip_head, builder.current_va)
    _write_manager_byte(builder, 0xA8, record_va, 36)
    _write_manager_byte(builder, 0xA9, record_va, 40)
    _write_manager_byte(builder, 0xAA, record_va, 44)
    _write_manager_dword(builder, 0x40, record_va, 48)
    builder.patch_rel8(skip_manager, builder.current_va)
    _append_dispatcher_file_write(builder, imports, record_va, written_va, path_va)
    builder.append(b"\x61\x9d")
    builder.append(original)
    builder.jmp_rel32(hook.virtual_address + len(original))
    if len(builder.data) > NODE_CODE_BYTES:
        raise ValueError(f"{hook.name} node trampoline code overlaps its record buffer")
    while len(builder.data) < NODE_CODE_BYTES:
        builder.u8(0x90)
    builder.append_record_data(NODE_LOG_PATH, record_va, written_va, NODE_RECORD_BYTES)
    if len(builder.data) > NODE_TRAMPOLINE_BLOCK_BYTES:
        raise ValueError(f"{hook.name} node trampoline exceeds reserved block")
    return bytes(builder.data)


def apply_runtime_manager_dispatcher_node_patch(
    source: Path, destination: Path, manifest_out: Path
) -> RuntimeManagerDispatcherNodePatch:
    targets = {target.name: target for target in extract_runtime_patch_targets(source)}
    hooks = tuple(targets[name] for name, _event, _overwrite, _head, _count in NODE_TARGETS)
    cave = find_runtime_probe_code_cave(source)
    imports = extract_runtime_probe_imports(source)
    raw = bytearray(source.read_bytes())
    hook_hex_by_name: dict[str, str] = {}
    original_hex_by_name: dict[str, str] = {}
    overwrite_bytes_by_name: dict[str, int] = {}
    list_head_offset_by_name: dict[str, int] = {}
    list_count_offset_by_name: dict[str, int] = {}
    trampoline = bytearray()
    for hook, (_name, event_id, overwrite_bytes, list_head_offset, list_count_offset) in zip(
        hooks, NODE_TARGETS, strict=True
    ):
        original = bytes(raw[hook.file_offset : hook.file_offset + overwrite_bytes])
        if original.hex() != hook.original_hex[: overwrite_bytes * 2]:
            raise ValueError(f"{hook.name} node hook bytes do not match guarded signature")
        base_va = cave.virtual_address + len(trampoline)
        blob = _build_node_trampoline(
            base_va=base_va,
            hook=hook,
            imports=imports,
            original=original,
            event_id=event_id,
            list_head_offset=list_head_offset,
            list_count_offset=list_count_offset,
        )
        hook_hex_by_name[hook.name] = hook_jump(hook.virtual_address, base_va, overwrite_bytes).hex()
        original_hex_by_name[hook.name] = original.hex()
        overwrite_bytes_by_name[hook.name] = overwrite_bytes
        list_head_offset_by_name[hook.name] = list_head_offset
        list_count_offset_by_name[hook.name] = list_count_offset
        trampoline.extend(blob)
        while len(trampoline) % 16:
            trampoline.append(0x90)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("runtime manager dispatcher node trampolines exceed code cave capacity")

    from logh7_runtime_manager_dispatcher_patch import apply_runtime_manager_dispatcher_patch

    patch = apply_runtime_manager_dispatcher_patch(source, destination, manifest_out)
    patched = bytearray(destination.read_bytes())
    for hook in hooks:
        hook_bytes = bytes.fromhex(hook_hex_by_name[hook.name])
        patched[hook.file_offset : hook.file_offset + len(hook_bytes)] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    node_patch = RuntimeManagerDispatcherNodePatch(
        source=patch.source,
        destination=patch.destination,
        hooks=hooks,
        cave=cave,
        hook_hex_by_name=hook_hex_by_name,
        original_hex_by_name=original_hex_by_name,
        overwrite_bytes_by_name=overwrite_bytes_by_name,
        list_head_offset_by_name=list_head_offset_by_name,
        list_count_offset_by_name=list_count_offset_by_name,
        section_characteristics_before=patch.section_characteristics_before,
        section_characteristics_after=patch.section_characteristics_after,
    )
    manifest_out.write_text(json.dumps(node_patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return node_patch
