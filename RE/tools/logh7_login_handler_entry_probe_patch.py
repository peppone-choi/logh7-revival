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

LOGIN_HANDLER_MAGIC: Final[bytes] = b"LHE1"
LOGIN_HANDLER_RECORD_BYTES: Final[int] = 96
LOGIN_HANDLER_RECORD_CAPACITY: Final[int] = 4
LOGIN_HANDLER_BUFFER_OFFSET: Final[int] = 320
LOGIN_HANDLER_HOOK_VA: Final[int] = 0x004AC726
LOGIN_HANDLER_CONTINUATION_VA: Final[int] = 0x004AC72F
LOGIN_HANDLER_ORIGINAL_HEX: Final[str] = "8b44244025ffff0000"
LOGIN_HANDLER_HOOK_LENGTH: Final[int] = 9


@dataclass(frozen=True, slots=True)
class LoginHandlerEntryProbePatch:
    cave: RuntimeCodeCave
    patched_hex: str
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + LOGIN_HANDLER_BUFFER_OFFSET
        return {
            "hooks": [
                {
                    "target": "loginProcessorHandleMessageEntry",
                    "virtualAddressHex": f"0x{LOGIN_HANDLER_HOOK_VA:08x}",
                    "continuationHex": f"0x{LOGIN_HANDLER_CONTINUATION_VA:08x}",
                    "originalHex": LOGIN_HANDLER_ORIGINAL_HEX,
                    "patchedHex": self.patched_hex,
                    "trampolineHex": f"0x{self.cave.virtual_address:08x}",
                }
            ],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "bytesUsed": LOGIN_HANDLER_BUFFER_OFFSET
                + 8
                + LOGIN_HANDLER_RECORD_BYTES * LOGIN_HANDLER_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "recordCapacity": LOGIN_HANDLER_RECORD_CAPACITY,
                "totalBytes": 8 + LOGIN_HANDLER_RECORD_BYTES * LOGIN_HANDLER_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": LOGIN_HANDLER_MAGIC.hex(),
                "recordBytes": LOGIN_HANDLER_RECORD_BYTES,
                "layout": "magic,callIndex,handlerThis,stack3c,param2,param3,param4,param5Ptr,param5+0/+4/+8/+c/+10/+14",
            },
        }


def apply_login_handler_entry_probe_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
) -> LoginHandlerEntryProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, LOGIN_HANDLER_HOOK_VA)
    original = raw[hook_offset : hook_offset + LOGIN_HANDLER_HOOK_LENGTH]
    if original.hex() != LOGIN_HANDLER_ORIGINAL_HEX:
        raise ValueError(
            f"login handler bytes drift at 0x{LOGIN_HANDLER_HOOK_VA:08x}: {original.hex()}",
        )

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + LOGIN_HANDLER_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("login handler entry probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(LOGIN_HANDLER_HOOK_VA, cave.virtual_address, LOGIN_HANDLER_HOOK_LENGTH)
    patched[hook_offset : hook_offset + LOGIN_HANDLER_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = LoginHandlerEntryProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(LOGIN_HANDLER_ORIGINAL_HEX))
    builder.jmp_rel32(LOGIN_HANDLER_CONTINUATION_VA)
    if len(builder.data) > LOGIN_HANDLER_BUFFER_OFFSET:
        raise ValueError("login handler entry trampoline overlaps its ring buffer")
    while len(builder.data) < LOGIN_HANDLER_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + LOGIN_HANDLER_RECORD_BYTES * LOGIN_HANDLER_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(LOGIN_HANDLER_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x05\x8b\xd0\xc1\xe2\x06\x03\xca\x03\xf9")
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(LOGIN_HANDLER_MAGIC, "little"))
    _copy_stack_dword(builder, 0x00, 0x08)
    _copy_stack_dword(builder, 0x60, 0x0C)
    _copy_stack_dword(builder, 0x64, 0x10)
    _copy_stack_dword(builder, 0x68, 0x14)
    _copy_stack_dword(builder, 0x6C, 0x18)
    _copy_stack_dword(builder, 0x70, 0x1C)
    builder.append(b"\x8b\x4c\x24\x70")
    for source_offset, record_offset in ((0, 0x20), (4, 0x24), (8, 0x28), (12, 0x2C), (16, 0x30), (20, 0x34)):
        _copy_ecx_dword(builder, source_offset, record_offset)
    _zero_record_range(builder, 0x38, 8)
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _copy_stack_dword(builder: X86Builder, stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(stack_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _copy_ecx_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x41")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _zero_record_range(builder: X86Builder, start_offset: int, dword_count: int) -> None:
    builder.append(b"\x31\xd2")
    for index in range(dword_count):
        builder.append(b"\x89\x57")
        builder.u8(start_offset + index * 4)


def decode_login_handler_entry_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("login handler entry ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + LOGIN_HANDLER_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + LOGIN_HANDLER_RECORD_BYTES]
        if chunk[:4] != LOGIN_HANDLER_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            records.append(_record_to_json(index, struct.unpack_from("<IIIIIIIIIIIIIIIIIIIII", chunk, 4)))
        offset += LOGIN_HANDLER_RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def _record_to_json(index: int, values: tuple[int, ...]) -> dict[str, object]:
    call_index, handler_this, stack3c, param2, param3, param4, param5, *tail = values
    param5_dwords = tail[:6]
    target4 = tail[6:10]
    targetc = tail[10:14]
    return {
        "index": index,
        "callIndex": call_index,
        "handlerThisHex": f"0x{handler_this:08x}",
        "stack3cHex": f"0x{stack3c:08x}",
        "param2Hex": f"0x{param2 & 0xffff:04x}",
        "param3Hex": f"0x{param3:08x}",
        "param4Hex": f"0x{param4:08x}",
        "param5PtrHex": f"0x{param5:08x}",
        "param5DwordsHex": [f"0x{item:08x}" for item in param5_dwords],
        "param5Plus4TargetHex": _dwords_to_hex(target4),
        "param5PlusCTargetHex": _dwords_to_hex(targetc),
    }


def _dwords_to_hex(values: list[int]) -> str:
    return b"".join(struct.pack("<I", item) for item in values).hex()


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")
    return len(builder.data) - 1


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII login-processor handler-entry ring probe.")
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
        apply_login_handler_entry_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        return 0
    try:
        decoded = decode_login_handler_entry_ring(args.ring)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is None:
        print(text, end="")
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
