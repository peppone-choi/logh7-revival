from __future__ import annotations

import argparse
import json
import shutil
import struct
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


JsonValue = str | int | list["JsonValue"] | dict[str, "JsonValue"]

# Handler-map factory 0x00612030 (stdcall, 12 args, ret 0x30). Its guard chain
# (args 5/7/8/9/10) and the descriptor/count it forwards to ctor 0x006127d0 decide
# whether connection+0x14 gets a populated std::map or stays a NULL/empty handler map
# (the post-login close root cause, see docs/g096-postlogin-close-analysis.md).
# This probe records the 12 incoming arguments of every factory call so a real-client
# QA run reveals which guard fails (or what descriptor/count reaches the ctor).
FACTORY_PROBE_MAGIC: Final[bytes] = b"FPB1"
FACTORY_RECORD_BYTES: Final[int] = 64
FACTORY_RECORD_CAPACITY: Final[int] = 4
FACTORY_BUFFER_OFFSET: Final[int] = 480
FACTORY_HOOK_VA: Final[int] = 0x00612030
FACTORY_CONTINUATION_VA: Final[int] = 0x00612035  # after replayed mov edx,[esp+0x14]; push ebx
FACTORY_ORIGINAL_HEX: Final[str] = "8b54241453"   # mov edx,[esp+0x14]; push ebx
FACTORY_HOOK_LENGTH: Final[int] = 5
FACTORY_ARG_COUNT: Final[int] = 12


@dataclass(frozen=True, slots=True)
class FactoryProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "handlerMapFactoryEntry",
            "virtualAddressHex": f"0x{FACTORY_HOOK_VA:08x}",
            "continuationHex": f"0x{FACTORY_CONTINUATION_VA:08x}",
            "originalHex": FACTORY_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class FactoryProbePatch:
    cave: RuntimeCodeCave
    hook: FactoryProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + FACTORY_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": FACTORY_BUFFER_OFFSET + 8 + FACTORY_RECORD_BYTES * FACTORY_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + FACTORY_BUFFER_OFFSET:08x}",
                "recordCapacity": FACTORY_RECORD_CAPACITY,
                "totalBytes": 8 + FACTORY_RECORD_BYTES * FACTORY_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": FACTORY_PROBE_MAGIC.hex(),
                "recordBytes": FACTORY_RECORD_BYTES,
                "layout": "magic,callIndex,arg1,arg2,arg3,arg4,arg5,arg6,arg7,arg8,arg9,arg10,arg11,arg12",
            },
            "argSemantics": {
                "arg5": "first guard (factory edx=[esp+0x14]); 0 -> bail, map never built",
                "arg7": "guard (eax)",
                "arg8": "guard (esi)",
                "arg9": "guard word (bp)",
                "arg10": "guard word (bx)",
                "note": "args forwarded to ctor 0x006127d0 supply the descriptor/count; count<=0 or descriptor==0 -> empty map",
            },
        }


def apply_factory_probe_patch(source: Path, destination: Path, manifest_out: Path) -> FactoryProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, FACTORY_HOOK_VA)
    original = raw[hook_offset : hook_offset + FACTORY_HOOK_LENGTH]
    if original.hex() != FACTORY_ORIGINAL_HEX:
        raise ValueError(f"handler-map factory bytes drift at 0x{FACTORY_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + FACTORY_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("handler-map factory probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(FACTORY_HOOK_VA, cave.virtual_address, FACTORY_HOOK_LENGTH)
    patched[hook_offset : hook_offset + FACTORY_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = FactoryProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = FactoryProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x8b\x54\x24\x14")  # replay mov edx, [esp+0x14]
    builder.append(b"\x53")              # replay push ebx
    builder.jmp_rel32(FACTORY_CONTINUATION_VA)
    if len(builder.data) > FACTORY_BUFFER_OFFSET:
        raise ValueError("handler-map factory trampoline overlaps its ring buffer")
    while len(builder.data) < FACTORY_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + FACTORY_RECORD_BYTES * FACTORY_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld  (esp -= 0x24)
    _u32(builder, b"\xa1", counter_va)  # mov eax, [counter]
    builder.append(b"\x83\xf8")
    builder.u8(FACTORY_RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")  # popad; popfd  (overflow path)
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")  # mov ecx,eax; shl ecx,6; add edi,ecx
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax  (callIndex)
    _u32(builder, b"\xff\x05", counter_va)  # inc dword [counter]
    _u32(builder, b"\xc7\x07", int.from_bytes(FACTORY_PROBE_MAGIC, "little"))  # mov [edi], magic
    # Capture the 12 incoming stdcall args. At entry [esp+4*k]; after pushfd+pushad
    # esp is entry-0x24, so arg_k is at [esp + 0x24 + 4*k]; store at record [edi + 8 + 4*(k-1)].
    for index in range(FACTORY_ARG_COUNT):
        source_offset = 0x24 + 4 * (index + 1)
        record_offset = 8 + 4 * index
        builder.append(b"\x8b\x44\x24")  # mov eax, [esp+source_offset]
        builder.u8(source_offset)
        builder.append(b"\x89\x47")      # mov [edi+record_offset], eax
        builder.u8(record_offset)
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII handler-map factory entry argument ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_factory_probe_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
