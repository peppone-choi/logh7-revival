from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from tools.logh7_x86_patch import X86Builder, hook_jump


PROMOTION_MAGIC: Final[bytes] = b"DRP1"
PROMOTION_RECORD_BYTES: Final[int] = 64
PROMOTION_CAPACITY: Final[int] = 2
PROMOTION_BUFFER_OFFSET: Final[int] = 656
CLIENT_GLOBAL_VA: Final[int] = 0x007CCFFC
RUNTIME_MANAGER_GLOBAL_VA: Final[int] = 0x007C25F4
CIPHER_GATE_OFFSET: Final[int] = 0x0035837E
ENQUEUE_VA: Final[int] = 0x004B8850


@dataclass(frozen=True, slots=True)
class PromotionHook:
    target: str
    virtual_address: int
    file_offset: int
    continuation_va: int
    original_hex: str
    patched_hex: str
    trampoline_va: int
    role: str

    def to_json(self) -> dict[str, str]:
        return {
            "target": self.target,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "continuationHex": f"0x{self.continuation_va:08x}",
            "originalHex": self.original_hex,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
            "role": self.role,
        }


@dataclass(frozen=True, slots=True)
class DecodedResponsePromotionPatch:
    cave: RuntimeCodeCave
    hooks: tuple[PromotionHook, ...]
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, object]:
        buffer_va = self.cave.virtual_address + PROMOTION_BUFFER_OFFSET
        return {
            "hooks": [hook.to_json() for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": PROMOTION_BUFFER_OFFSET + 8 + PROMOTION_RECORD_BYTES * PROMOTION_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + PROMOTION_BUFFER_OFFSET:08x}",
                "recordCapacity": PROMOTION_CAPACITY,
                "scratchBytes": 4,
                "totalBytes": 8 + PROMOTION_RECORD_BYTES * PROMOTION_CAPACITY,
            },
            "recordFormat": {
                "magic": PROMOTION_MAGIC.hex(),
                "recordBytes": PROMOTION_RECORD_BYTES,
                "layout": (
                    "magic,event,siteId,reserved2,continuation,savedEcx,stack0,stack4,"
                    "stack8,stack12,clientGlobal,cipherGate,runtimeManagerGlobal,"
                    "savedEax,savedEdx,appendTarget,originalEsp,reserved"
                ),
            },
        }


@dataclass(frozen=True, slots=True)
class HookSpec:
    target: str
    virtual_address: int
    continuation_va: int
    overwrite_bytes: int
    original_hex: str
    site_id: int
    append_target: int
    role: str


HOOK_SPECS: Final[tuple[HookSpec, ...]] = (
    HookSpec(
        "decodedResponsePromotionRouterEntry", 0x004AE0D0, 0x004AE0D6, 6, "8b5424048bc2", 1, 0,
        "decode router entry before internal-code branch selection",
    ),
    HookSpec(
        "decodedResponsePromotionDefaultAppend", 0x004AE0FF, 0x004AE104, 5, "e84ca70000", 2, ENQUEUE_VA,
        "default decode-router append call for internal codes except 0x0202/0x0204",
    ),
    HookSpec(
        "decodedResponsePromotionGameLoginAppend", 0x004AE127, 0x004AE12C, 5, "e824a70000", 3, ENQUEUE_VA,
        "0x0204 gated append call taken only after client+0x35837e is set",
    ),
)


def apply_decoded_response_promotion_patch(
    source: Path, destination: Path, manifest_out: Path
) -> DecodedResponsePromotionPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    file_offsets: dict[str, int] = {}
    for spec in HOOK_SPECS:
        file_offset = _virtual_address_to_offset(image, spec.virtual_address)
        original = raw[file_offset : file_offset + spec.overwrite_bytes]
        if original.hex() != spec.original_hex:
            raise ValueError(f"{spec.target} hook bytes drift at 0x{spec.virtual_address:08x}")
        file_offsets[spec.target] = file_offset

    cave = find_runtime_probe_code_cave(source)
    trampoline, trampoline_starts = _build_trampoline(cave.virtual_address, cave.virtual_address + PROMOTION_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("decoded response promotion patch exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hooks: list[PromotionHook] = []
    for spec in HOOK_SPECS:
        trampoline_va = trampoline_starts[spec.target]
        hook = hook_jump(spec.virtual_address, trampoline_va, spec.overwrite_bytes)
        file_offset = file_offsets[spec.target]
        patched[file_offset : file_offset + spec.overwrite_bytes] = hook
        hooks.append(
            PromotionHook(
                target=spec.target,
                virtual_address=spec.virtual_address,
                file_offset=file_offset,
                continuation_va=spec.continuation_va,
                original_hex=spec.original_hex,
                patched_hex=hook.hex(),
                trampoline_va=trampoline_va,
                role=spec.role,
            )
        )
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = DecodedResponsePromotionPatch(cave, tuple(hooks), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> tuple[bytes, dict[str, int]]:
    builder = X86Builder(base_va)
    starts: dict[str, int] = {}
    for spec in HOOK_SPECS:
        starts[spec.target] = builder.current_va
        _append_record(builder, buffer_va, site_id=spec.site_id, continuation=spec.continuation_va, append_target=spec.append_target)
        match spec.target:
            case "decodedResponsePromotionRouterEntry":
                builder.append(bytes.fromhex(spec.original_hex))
            case "decodedResponsePromotionDefaultAppend" | "decodedResponsePromotionGameLoginAppend":
                _call_rel32(builder, ENQUEUE_VA)
            case unreachable:
                raise AssertionError(unreachable)
        builder.jmp_rel32(spec.continuation_va)
    if len(builder.data) > PROMOTION_BUFFER_OFFSET:
        raise ValueError("decoded response promotion trampoline code exceeds reserved buffer offset")
    while len(builder.data) < PROMOTION_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + PROMOTION_RECORD_BYTES * PROMOTION_CAPACITY))
    return bytes(builder.data), starts


def _append_record(builder: X86Builder, buffer_va: int, *, site_id: int, continuation: int, append_target: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(PROMOTION_CAPACITY)
    skip_log = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(PROMOTION_MAGIC, "little"))
    builder.append(b"\xc6\x47\x04\x01\xc6\x47\x05")
    builder.u8(site_id)
    builder.append(b"\x66\xc7\x47\x06\x00\x00")
    _u32(builder, b"\xc7\x47\x08", continuation)
    _write_saved_dword(builder, 0x18, 12)
    _write_original_stack_dword(builder, 0, 16)
    _write_original_stack_dword(builder, 4, 20)
    _write_original_stack_dword(builder, 8, 24)
    _write_original_stack_dword(builder, 12, 28)
    _u32(builder, b"\xa1", CLIENT_GLOBAL_VA)
    builder.append(b"\x89\x47\x20\xc7\x47\x24\x00\x00\x00\x00\x85\xc0")
    skip_gate = builder.je_rel8_placeholder()
    builder.append(b"\x0f\xb6\x80")
    builder.u32(CIPHER_GATE_OFFSET)
    builder.append(b"\x89\x47\x24")
    builder.patch_rel8(skip_gate, builder.current_va)
    _u32(builder, b"\xa1", RUNTIME_MANAGER_GLOBAL_VA)
    builder.append(b"\x89\x47\x28")
    _write_saved_dword(builder, 0x1C, 44)
    _write_saved_dword(builder, 0x14, 48)
    _u32(builder, b"\xc7\x47\x34", append_target)
    builder.append(b"\x8b\x44\x24\x0c\x83\xc0\x04\x89\x47\x38")
    _u32(builder, b"\xc7\x47\x3c", 0)
    builder.patch_rel8(skip_log, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_original_stack_dword(builder: X86Builder, stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x0c\x83\xc0\x04\x8b\x80")
    builder.u32(stack_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def _call_rel32(builder: X86Builder, destination: int) -> None:
    source = builder.current_va
    builder.u8(0xE8)
    builder.u32(destination - (source + 5))


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII decoded-response promotion ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_decoded_response_promotion_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
