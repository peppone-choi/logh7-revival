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

MESSAGE_INPUT_MAGIC: Final[bytes] = b"MIP1"
MESSAGE_INPUT_RECORD_BYTES: Final[int] = 64
MESSAGE_INPUT_RECORD_CAPACITY: Final[int] = 8
MESSAGE_INPUT_BUFFER_OFFSET: Final[int] = 200
MESSAGE_INPUT_HOOK_VA: Final[int] = 0x00612357
MESSAGE_INPUT_CONTINUATION_VA: Final[int] = 0x0061235D
MESSAGE_INPUT_ORIGINAL_HEX: Final[str] = "ff52088b4e04"
MESSAGE_INPUT_HOOK_LENGTH: Final[int] = 6


@dataclass(frozen=True, slots=True)
class MessageInputProbePatch:
    cave: RuntimeCodeCave
    patched_hex: str
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + MESSAGE_INPUT_BUFFER_OFFSET
        return {
            "hooks": [
                {
                    "target": "postKeyMessageInputCall",
                    "virtualAddressHex": f"0x{MESSAGE_INPUT_HOOK_VA:08x}",
                    "continuationHex": f"0x{MESSAGE_INPUT_CONTINUATION_VA:08x}",
                    "originalHex": MESSAGE_INPUT_ORIGINAL_HEX,
                    "patchedHex": self.patched_hex,
                    "trampolineHex": f"0x{self.cave.virtual_address:08x}",
                }
            ],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "bytesUsed": MESSAGE_INPUT_BUFFER_OFFSET + 8 + MESSAGE_INPUT_RECORD_BYTES * MESSAGE_INPUT_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "recordCapacity": MESSAGE_INPUT_RECORD_CAPACITY,
                "totalBytes": 8 + MESSAGE_INPUT_RECORD_BYTES * MESSAGE_INPUT_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": MESSAGE_INPUT_MAGIC.hex(),
                "recordBytes": MESSAGE_INPUT_RECORD_BYTES,
                "layout": "magic,callIndex,messageThis,vtable,inputMethod,inputArg,inputDwords4,manager,innerCode",
            },
        }


def apply_message_input_probe_patch(source: Path, destination: Path, manifest_out: Path) -> MessageInputProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, MESSAGE_INPUT_HOOK_VA)
    original = raw[hook_offset : hook_offset + MESSAGE_INPUT_HOOK_LENGTH]
    if original.hex() != MESSAGE_INPUT_ORIGINAL_HEX:
        raise ValueError(f"message input call bytes drift at 0x{MESSAGE_INPUT_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + MESSAGE_INPUT_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("message input probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(MESSAGE_INPUT_HOOK_VA, cave.virtual_address, MESSAGE_INPUT_HOOK_LENGTH)
    patched[hook_offset : hook_offset + MESSAGE_INPUT_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = MessageInputProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\xff\x52\x08")
    builder.append(b"\x8b\x4e\x04")
    builder.jmp_rel32(MESSAGE_INPUT_CONTINUATION_VA)
    if len(builder.data) > MESSAGE_INPUT_BUFFER_OFFSET:
        raise ValueError("message input trampoline overlaps its ring buffer")
    while len(builder.data) < MESSAGE_INPUT_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + MESSAGE_INPUT_RECORD_BYTES * MESSAGE_INPUT_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(MESSAGE_INPUT_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(MESSAGE_INPUT_MAGIC, "little"))
    builder.append(b"\x8b\x44\x24\x18\x89\x47\x08")
    builder.append(b"\x8b\x44\x24\x14\x89\x47\x0c")
    builder.append(b"\x8b\x40\x08\x89\x47\x10")
    builder.append(b"\x8b\x44\x24\x0c\x8b\x40\x04\x89\x47\x14")
    builder.append(b"\x89\xc1")
    builder.append(b"\x8b\x01\x89\x47\x18")
    builder.append(b"\x8b\x41\x04\x89\x47\x1c")
    builder.append(b"\x8b\x41\x08\x89\x47\x20")
    builder.append(b"\x8b\x41\x0c\x89\x47\x24")
    builder.append(b"\x8b\x4c\x24\x04\x89\x4f\x28")
    builder.append(b"\x31\xc0\x66\x8b\x41\x08\x89\x47\x2c")
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_message_input_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("message input ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + MESSAGE_INPUT_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + MESSAGE_INPUT_RECORD_BYTES]
        if chunk[:4] != MESSAGE_INPUT_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            values = struct.unpack_from("<IIIIIIIIIII", chunk, 4)
            records.append(_record_to_json(index, values))
        offset += MESSAGE_INPUT_RECORD_BYTES
        index += 1
    methods = sorted({item["inputMethodHex"] for item in records if not item.get("empty")})
    return {"path": str(path), "counter": counter, "inputMethods": methods, "records": records}


def _record_to_json(index: int, values: tuple[int, ...]) -> dict[str, object]:
    call_index, message_this, vtable, method, input_arg, d0, d1, d2, d3, manager, inner_code = values
    return {
        "index": index,
        "callIndex": call_index,
        "messageThisHex": f"0x{message_this:08x}",
        "vtableHex": f"0x{vtable:08x}",
        "inputMethodHex": f"0x{method:08x}",
        "inputArgHex": f"0x{input_arg:08x}",
        "inputPreviewHex": struct.pack("<IIII", d0, d1, d2, d3).hex(),
        "managerHex": f"0x{manager:08x}",
        "innerCodeHex": f"0x{inner_code & 0xffff:04x}",
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
    parser = argparse.ArgumentParser(description="Patch LOGH VII post-key message input ring probe.")
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
        apply_message_input_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        return 0
    try:
        decoded = decode_message_input_ring(args.ring)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is None:
        print(text, end="")
    else:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
