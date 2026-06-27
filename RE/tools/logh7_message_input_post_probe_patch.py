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

POST_INPUT_MAGIC: Final[bytes] = b"MPO1"
POST_INPUT_RECORD_BYTES: Final[int] = 64
POST_INPUT_RECORD_CAPACITY: Final[int] = 8
POST_INPUT_BUFFER_OFFSET: Final[int] = 200
POST_INPUT_HOOK_VA: Final[int] = 0x0061235A
POST_INPUT_CONTINUATION_VA: Final[int] = 0x00612363
POST_INPUT_ORIGINAL_HEX: Final[str] = "8b4e0451e84d280000"
POST_INPUT_HOOK_LENGTH: Final[int] = 9
POST_INPUT_REPLAY_CALL_TARGET: Final[int] = 0x00614BB0


@dataclass(frozen=True, slots=True)
class MessageInputPostProbePatch:
    cave: RuntimeCodeCave
    patched_hex: str
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + POST_INPUT_BUFFER_OFFSET
        return {
            "hooks": [
                {
                    "target": "postKeyMessageInputAfterInput",
                    "virtualAddressHex": f"0x{POST_INPUT_HOOK_VA:08x}",
                    "continuationHex": f"0x{POST_INPUT_CONTINUATION_VA:08x}",
                    "originalHex": POST_INPUT_ORIGINAL_HEX,
                    "patchedHex": self.patched_hex,
                    "trampolineHex": f"0x{self.cave.virtual_address:08x}",
                }
            ],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "bytesUsed": POST_INPUT_BUFFER_OFFSET + 8 + POST_INPUT_RECORD_BYTES * POST_INPUT_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "recordCapacity": POST_INPUT_RECORD_CAPACITY,
                "totalBytes": 8 + POST_INPUT_RECORD_BYTES * POST_INPUT_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": POST_INPUT_MAGIC.hex(),
                "recordBytes": POST_INPUT_RECORD_BYTES,
                "layout": (
                    "magic,callIndex,messageThis,vtable,messageCode,payloadBytes,payloadCapacity,"
                    "payloadPointer,field50,field52,sub0,sub4,sub8,sub12,manager,handlerObject"
                ),
            },
        }


def apply_message_input_post_probe_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
) -> MessageInputPostProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, POST_INPUT_HOOK_VA)
    original = raw[hook_offset : hook_offset + POST_INPUT_HOOK_LENGTH]
    if original.hex() != POST_INPUT_ORIGINAL_HEX:
        raise ValueError(f"message input post bytes drift at 0x{POST_INPUT_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + POST_INPUT_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("message input post probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(POST_INPUT_HOOK_VA, cave.virtual_address, POST_INPUT_HOOK_LENGTH)
    patched[hook_offset : hook_offset + POST_INPUT_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = MessageInputPostProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x8b\x4e\x04")
    builder.append(b"\x51")
    _call_rel32(builder, POST_INPUT_REPLAY_CALL_TARGET)
    builder.jmp_rel32(POST_INPUT_CONTINUATION_VA)
    if len(builder.data) > POST_INPUT_BUFFER_OFFSET:
        raise ValueError("message input post trampoline overlaps its ring buffer")
    while len(builder.data) < POST_INPUT_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + POST_INPUT_RECORD_BYTES * POST_INPUT_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(POST_INPUT_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(POST_INPUT_MAGIC, "little"))
    builder.append(b"\x8b\x04\x24\x89\x47\x08")
    builder.append(b"\x8b\x08\x89\x4f\x0c")
    builder.append(b"\x31\xc9\x66\x8b\x48\x06\x89\x4f\x10")
    builder.append(b"\x8b\x48\x08\x89\x4f\x14")
    builder.append(b"\x8b\x48\x0c\x89\x4f\x18")
    builder.append(b"\x8b\x48\x14\x89\x4f\x1c")
    builder.append(b"\x31\xc9\x66\x8b\x88\x50\x00\x00\x00\x89\x4f\x20")
    builder.append(b"\x31\xc9\x66\x8b\x88\x52\x00\x00\x00\x89\x4f\x24")
    builder.append(b"\x8b\x88\x54\x00\x00\x00\x89\x4f\x28")
    builder.append(b"\x8b\x88\x58\x00\x00\x00\x89\x4f\x2c")
    builder.append(b"\x8b\x88\x5c\x00\x00\x00\x89\x4f\x30")
    builder.append(b"\x8b\x88\x60\x00\x00\x00\x89\x4f\x34")
    builder.append(b"\x8b\x44\x24\x04\x89\x47\x38")
    builder.append(b"\x8b\x48\x0c\x89\x4f\x3c")
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_message_input_post_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("message input post ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + POST_INPUT_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + POST_INPUT_RECORD_BYTES]
        if chunk[:4] != POST_INPUT_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            records.append(_record_to_json(index, struct.unpack_from("<IIIIIIIIIIIIIII", chunk, 4)))
        offset += POST_INPUT_RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def _record_to_json(index: int, values: tuple[int, ...]) -> dict[str, object]:
    (
        call_index,
        message_this,
        vtable,
        message_code,
        payload_bytes,
        payload_capacity,
        payload_pointer,
        field50,
        field52,
        sub0,
        sub4,
        sub8,
        sub12,
        manager,
        handler_object,
    ) = values
    return {
        "index": index,
        "callIndex": call_index,
        "messageThisHex": f"0x{message_this:08x}",
        "vtableHex": f"0x{vtable:08x}",
        "messageCodeHex": f"0x{message_code & 0xffff:04x}",
        "payloadBytes": payload_bytes,
        "payloadCapacity": payload_capacity,
        "payloadPointerHex": f"0x{payload_pointer:08x}",
        "field50Hex": f"0x{field50 & 0xffff:04x}",
        "field52Hex": f"0x{field52 & 0xffff:04x}",
        "subobjectDwordsHex": [f"0x{item:08x}" for item in (sub0, sub4, sub8, sub12)],
        "managerHex": f"0x{manager:08x}",
        "handlerObjectHex": f"0x{handler_object:08x}",
    }


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


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII post-key message input post-call ring probe.")
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
        apply_message_input_post_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        return 0
    try:
        decoded = decode_message_input_post_ring(args.ring)
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
