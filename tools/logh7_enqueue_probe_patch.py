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

# Decoded-message enqueue 0x004b8850 (__thiscall enqueue(ecx=client, [esp+4]=internalCode,
# [esp+8]=bodyPtr)) is the point where a successfully decoded server message is appended to
# the dispatch queue at client+0x3552b8 (-> dispatcher 0x004ba316 -> login handlers). Probing
# every call shows exactly which internal codes the client ACCEPTS from the server's responses:
# seeing 0x0200/0x0205/0x0f01 proves the responses decode and are accepted; an empty ring proves
# they are rejected before internal dispatch.
ENQUEUE_PROBE_MAGIC: Final[bytes] = b"EQB1"
ENQUEUE_RECORD_BYTES: Final[int] = 64
ENQUEUE_RECORD_CAPACITY: Final[int] = 8
ENQUEUE_BUFFER_OFFSET: Final[int] = 200
ENQUEUE_HOOK_VA: Final[int] = 0x004B8850
ENQUEUE_CONTINUATION_VA: Final[int] = 0x004B8858
ENQUEUE_ORIGINAL_HEX: Final[str] = "515355568b742418"  # push ecx;push ebx;push ebp;push esi;mov esi,[esp+0x18]
ENQUEUE_HOOK_LENGTH: Final[int] = 8


@dataclass(frozen=True, slots=True)
class EnqueueProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "decodedMessageEnqueue",
            "virtualAddressHex": f"0x{ENQUEUE_HOOK_VA:08x}",
            "continuationHex": f"0x{ENQUEUE_CONTINUATION_VA:08x}",
            "originalHex": ENQUEUE_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class EnqueueProbePatch:
    cave: RuntimeCodeCave
    hook: EnqueueProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + ENQUEUE_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": ENQUEUE_BUFFER_OFFSET + 8 + ENQUEUE_RECORD_BYTES * ENQUEUE_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + ENQUEUE_BUFFER_OFFSET:08x}",
                "recordCapacity": ENQUEUE_RECORD_CAPACITY,
                "totalBytes": 8 + ENQUEUE_RECORD_BYTES * ENQUEUE_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": ENQUEUE_PROBE_MAGIC.hex(),
                "recordBytes": ENQUEUE_RECORD_BYTES,
                "layout": "magic,callIndex,internalCode,bodyPtr,client",
            },
        }


def apply_enqueue_probe_patch(source: Path, destination: Path, manifest_out: Path) -> EnqueueProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, ENQUEUE_HOOK_VA)
    original = raw[hook_offset : hook_offset + ENQUEUE_HOOK_LENGTH]
    if original.hex() != ENQUEUE_ORIGINAL_HEX:
        raise ValueError(f"decoded-message enqueue bytes drift at 0x{ENQUEUE_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + ENQUEUE_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("decoded-message enqueue probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(ENQUEUE_HOOK_VA, cave.virtual_address, ENQUEUE_HOOK_LENGTH)
    patched[hook_offset : hook_offset + ENQUEUE_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = EnqueueProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = EnqueueProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x51\x53\x55\x56\x8b\x74\x24\x18")  # replay push ecx;push ebx;push ebp;push esi;mov esi,[esp+0x18]
    builder.jmp_rel32(ENQUEUE_CONTINUATION_VA)
    if len(builder.data) > ENQUEUE_BUFFER_OFFSET:
        raise ValueError("decoded-message enqueue trampoline overlaps its ring buffer")
    while len(builder.data) < ENQUEUE_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + ENQUEUE_RECORD_BYTES * ENQUEUE_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld  (esp -= 0x24)
    _u32(builder, b"\xa1", counter_va)  # mov eax, [counter]
    builder.append(b"\x83\xf8")
    builder.u8(ENQUEUE_RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")  # popad; popfd  (overflow path)
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")  # mov ecx,eax; shl ecx,6; add edi,ecx
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex)
    _u32(builder, b"\xff\x05", counter_va)  # inc dword [counter]
    _u32(builder, b"\xc7\x07", int.from_bytes(ENQUEUE_PROBE_MAGIC, "little"))  # mov [edi], magic
    # internalCode = entry [esp+4] -> [esp+0x28]; bodyPtr = entry [esp+8] -> [esp+0x2c]; client = ecx saved at [esp+0x18]
    builder.append(b"\x8b\x44\x24\x28\x89\x47\x08")  # mov eax,[esp+0x28]; mov [edi+8],eax
    builder.append(b"\x8b\x44\x24\x2c\x89\x47\x0c")  # mov eax,[esp+0x2c]; mov [edi+0xc],eax
    builder.append(b"\x8b\x44\x24\x18\x89\x47\x10")  # mov eax,[esp+0x18]; mov [edi+0x10],eax
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_enqueue_probe_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("enqueue probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + ENQUEUE_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + ENQUEUE_RECORD_BYTES]
        if chunk[:4] != ENQUEUE_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, code, body, client = struct.unpack_from("<IIII", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "internalCodeHex": f"0x{code & 0xFFFF:04x}",
                    "rawCodeHex": f"0x{code:08x}",
                    "bodyPtrHex": f"0x{body:08x}",
                    "clientHex": f"0x{client:08x}",
                }
            )
        offset += ENQUEUE_RECORD_BYTES
        index += 1
    accepted = [r["internalCodeHex"] for r in records if not r.get("empty")]
    return {
        "path": str(path),
        "bytes": len(data),
        "counter": counter,
        "acceptedInternalCodes": accepted,
        "responsesAccepted": len(accepted) > 0,
        "records": records,
    }


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
    parser = argparse.ArgumentParser(description="Patch LOGH VII decoded-message enqueue ring probe.")
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
        apply_enqueue_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        print(f"wrote {args.manifest_out}")
        return 0
    try:
        decoded = decode_enqueue_probe_ring(args.ring)
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
