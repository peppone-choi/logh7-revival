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

# Handler-map ctor 0x006127d0 (only caller is the factory 0x00612096) takes its NULL
# branch 0x00612af7 -> [manager+0x14]=0 (empty handler map, the post-login close root
# cause) when descriptor [esp+0x44]==0 (je 0x00612903) or count [esp+0x48]<=0
# (jbe 0x0061290f). This probe hooks 0x006128f5 (right before that check) and records
# descriptor + count + manager-this for every ctor call so a real-client QA run shows
# which constructed handler map is empty and why.
CTOR_PROBE_MAGIC: Final[bytes] = b"CPB1"
CTOR_RECORD_BYTES: Final[int] = 64
CTOR_RECORD_CAPACITY: Final[int] = 4
CTOR_BUFFER_OFFSET: Final[int] = 480
CTOR_HOOK_VA: Final[int] = 0x006128F5
CTOR_CONTINUATION_VA: Final[int] = 0x006128FB  # after replayed mov eax,[esp+0x44]; cmp eax,ebp
CTOR_ORIGINAL_HEX: Final[str] = "8b4424443bc5"  # mov eax,[esp+0x44]; cmp eax,ebp
CTOR_HOOK_LENGTH: Final[int] = 6


@dataclass(frozen=True, slots=True)
class CtorProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "handlerMapCtorDescriptorCount",
            "virtualAddressHex": f"0x{CTOR_HOOK_VA:08x}",
            "continuationHex": f"0x{CTOR_CONTINUATION_VA:08x}",
            "originalHex": CTOR_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class CtorProbePatch:
    cave: RuntimeCodeCave
    hook: CtorProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + CTOR_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": CTOR_BUFFER_OFFSET + 8 + CTOR_RECORD_BYTES * CTOR_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + CTOR_BUFFER_OFFSET:08x}",
                "recordCapacity": CTOR_RECORD_CAPACITY,
                "totalBytes": 8 + CTOR_RECORD_BYTES * CTOR_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": CTOR_PROBE_MAGIC.hex(),
                "recordBytes": CTOR_RECORD_BYTES,
                "layout": "magic,callIndex,descriptorPtr,count,managerThis",
            },
            "verdictRule": "descriptorPtr==0 or count<=0 -> ctor builds an EMPTY handler map (post-login close)",
        }


def apply_ctor_probe_patch(source: Path, destination: Path, manifest_out: Path) -> CtorProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, CTOR_HOOK_VA)
    original = raw[hook_offset : hook_offset + CTOR_HOOK_LENGTH]
    if original.hex() != CTOR_ORIGINAL_HEX:
        raise ValueError(f"handler-map ctor bytes drift at 0x{CTOR_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + CTOR_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("handler-map ctor probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(CTOR_HOOK_VA, cave.virtual_address, CTOR_HOOK_LENGTH)
    patched[hook_offset : hook_offset + CTOR_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = CtorProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = CtorProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x8b\x44\x24\x44")  # replay mov eax, [esp+0x44]
    builder.append(b"\x3b\xc5")          # replay cmp eax, ebp
    builder.jmp_rel32(CTOR_CONTINUATION_VA)
    if len(builder.data) > CTOR_BUFFER_OFFSET:
        raise ValueError("handler-map ctor trampoline overlaps its ring buffer")
    while len(builder.data) < CTOR_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + CTOR_RECORD_BYTES * CTOR_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld  (esp -= 0x24)
    _u32(builder, b"\xa1", counter_va)  # mov eax, [counter]
    builder.append(b"\x83\xf8")
    builder.u8(CTOR_RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")  # popad; popfd  (overflow path)
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")  # mov ecx,eax; shl ecx,6; add edi,ecx
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax  (callIndex)
    _u32(builder, b"\xff\x05", counter_va)  # inc dword [counter]
    _u32(builder, b"\xc7\x07", int.from_bytes(CTOR_PROBE_MAGIC, "little"))  # mov [edi], magic
    # descriptor = [esp+0x44] -> after pushfd+pushad esp-0x24 -> [esp+0x68]
    builder.append(b"\x8b\x44\x24\x68\x89\x47\x08")  # mov eax,[esp+0x68]; mov [edi+8],eax
    # count = [esp+0x48] -> [esp+0x6c]
    builder.append(b"\x8b\x44\x24\x6c\x89\x47\x0c")  # mov eax,[esp+0x6c]; mov [edi+0xc],eax
    # managerThis = ebx, saved by pushad at [esp+0x10]
    builder.append(b"\x8b\x44\x24\x10\x89\x47\x10")  # mov eax,[esp+0x10]; mov [edi+0x10],eax
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_ctor_probe_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("ctor probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + CTOR_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + CTOR_RECORD_BYTES]
        if chunk[:4] != CTOR_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, descriptor, count, manager = struct.unpack_from("<IIII", chunk, 4)
            empty_map = descriptor == 0 or (count & 0xFFFFFFFF) == 0 or count > 0x7FFFFFFF
            records.append(
                {
                    "index": index,
                    "magic": "CPB1",
                    "callIndex": call_index,
                    "descriptorPtrHex": f"0x{descriptor:08x}",
                    "count": count if count <= 0x7FFFFFFF else count - 0x100000000,
                    "managerThisHex": f"0x{manager:08x}",
                    "buildsEmptyMap": empty_map,
                    "verdict": (
                        "EMPTY handler map (descriptor==0 or count<=0) -> this manager closes on first frame"
                        if empty_map
                        else "non-empty handler map built"
                    ),
                }
            )
        offset += CTOR_RECORD_BYTES
        index += 1
    return {"path": str(path), "bytes": len(data), "counter": counter, "records": records}


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
    parser = argparse.ArgumentParser(description="Patch LOGH VII handler-map ctor descriptor/count ring probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    decode.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.command == "patch":
        apply_ctor_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        print(f"wrote {args.manifest_out}")
        return 0
    try:
        decoded = decode_ctor_probe_ring(args.ring)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is not None:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
