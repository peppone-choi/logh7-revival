from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
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


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

# After the 0x30 envelope parser extracts the inner payload, the router dispatches the inner
# message at 0x00613202: call dword ptr [ebp+4] (ebp = inner-handler sub-object vtable), with the
# inner payload pointer at [esp+0] and length at [esp+4]. This probe records the resolved handler
# (*(ebp+4)), the payload pointer/length, and the first 8 payload bytes for each inner dispatch,
# so the inner GIN7 message format / login-OK handler can be RE'd.
INNER_PROBE_MAGIC: Final[bytes] = b"IHP1"
INNER_RECORD_BYTES: Final[int] = 64
INNER_RECORD_CAPACITY: Final[int] = 8
INNER_BUFFER_OFFSET: Final[int] = 200
INNER_HOOK_VA: Final[int] = 0x00613202
INNER_CONTINUATION_VA: Final[int] = 0x00613207  # after call+test
INNER_ORIGINAL_HEX: Final[str] = "ff550484c0"  # call dword ptr [ebp+4]; test al,al
INNER_HOOK_LENGTH: Final[int] = 5


@dataclass(frozen=True, slots=True)
class InnerProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "innerMessageDispatch",
            "virtualAddressHex": f"0x{INNER_HOOK_VA:08x}",
            "continuationHex": f"0x{INNER_CONTINUATION_VA:08x}",
            "originalHex": INNER_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class InnerProbePatch:
    cave: RuntimeCodeCave
    hook: InnerProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + INNER_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "bytesUsed": INNER_BUFFER_OFFSET + 8 + INNER_RECORD_BYTES * INNER_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "recordCapacity": INNER_RECORD_CAPACITY,
                "totalBytes": 8 + INNER_RECORD_BYTES * INNER_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": INNER_PROBE_MAGIC.hex(),
                "recordBytes": INNER_RECORD_BYTES,
                "layout": "magic,callIndex,handler,payloadPtr,len,payload0_3,payload4_7",
            },
        }


def apply_inner_handler_probe_patch(source: Path, destination: Path, manifest_out: Path) -> InnerProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, INNER_HOOK_VA)
    original = raw[hook_offset : hook_offset + INNER_HOOK_LENGTH]
    if original.hex() != INNER_ORIGINAL_HEX:
        raise ValueError(f"inner dispatch bytes drift at 0x{INNER_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + INNER_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("inner handler probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(INNER_HOOK_VA, cave.virtual_address, INNER_HOOK_LENGTH)
    patched[hook_offset : hook_offset + INNER_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = InnerProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = InnerProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\xff\x55\x04")  # replay call dword ptr [ebp+4]
    builder.append(b"\x84\xc0")      # replay test al,al
    builder.jmp_rel32(INNER_CONTINUATION_VA)
    if len(builder.data) > INNER_BUFFER_OFFSET:
        raise ValueError("inner handler trampoline overlaps its ring buffer")
    while len(builder.data) < INNER_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + INNER_RECORD_BYTES * INNER_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    # pushfd; pushad; cld  -> esp-=0x24. EBP@[esp+8]; entry [esp+0]=payloadPtr@[esp+0x24], [esp+4]=len@[esp+0x28]
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(INNER_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    builder.append(b"\x89\x47\x04")  # callIndex
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(INNER_PROBE_MAGIC, "little"))
    # handler = *(EBP+4); EBP saved at [esp+8]
    builder.append(b"\x8b\x4c\x24\x08\x8b\x41\x04\x89\x47\x08")  # mov ecx,[esp+8]; mov eax,[ecx+4]; mov [edi+8],eax
    # payloadPtr = [esp+0x24]
    builder.append(b"\x8b\x44\x24\x24\x89\x47\x0c")  # mov eax,[esp+0x24]; mov [edi+0xc],eax
    builder.append(b"\x89\xc1")                       # mov ecx,eax  (payloadPtr)
    # len = [esp+0x28]
    builder.append(b"\x8b\x44\x24\x28\x89\x47\x10")  # mov eax,[esp+0x28]; mov [edi+0x10],eax
    # payload[0:4], [4:8] (deref payloadPtr=ecx)
    builder.append(b"\x8b\x01\x89\x47\x14")          # mov eax,[ecx]; mov [edi+0x14],eax
    builder.append(b"\x8b\x41\x04\x89\x47\x18")      # mov eax,[ecx+4]; mov [edi+0x18],eax
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_inner_handler_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + INNER_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + INNER_RECORD_BYTES]
        if chunk[:4] != INNER_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            ci, handler, pptr, length, p03, p47 = struct.unpack_from("<IIIIII", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": ci,
                    "handlerHex": f"0x{handler:08x}",
                    "payloadPtrHex": f"0x{pptr:08x}",
                    "len": length if length <= 0x7FFFFFFF else length - 0x100000000,
                    "payload0_7Hex": struct.pack("<II", p03, p47).hex(),
                }
            )
        offset += INNER_RECORD_BYTES
        index += 1
    handlers = sorted({r["handlerHex"] for r in records if not r.get("empty")})
    return {"path": str(path), "counter": counter, "innerHandlers": handlers, "records": records}


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
    parser = argparse.ArgumentParser(description="Patch LOGH VII inner-message dispatch ring probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    args = parser.parse_args()
    if args.command == "patch":
        apply_inner_handler_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        return 0
    print(json.dumps(decode_inner_handler_ring(args.ring), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
