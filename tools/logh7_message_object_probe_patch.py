from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from tools.logh7_x86_patch import X86Builder, hook_jump


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

MESSAGE_OBJECT_MAGIC: Final[bytes] = b"MOB1"
MESSAGE_OBJECT_RECORD_BYTES: Final[int] = 32
MESSAGE_OBJECT_RECORD_CAPACITY: Final[int] = 6
MESSAGE_OBJECT_WRAP_RECORD_CAPACITY: Final[int] = 4
MESSAGE_OBJECT_BUFFER_OFFSET: Final[int] = 560
DEFAULT_APP_CODE: Final[int] = 0x2001

LOOKUP_HOOK_VA: Final[int] = 0x0040467B
LOOKUP_CONTINUATION_VA: Final[int] = 0x00404685
LOOKUP_ORIGINAL_HEX: Final[str] = "8b11508d7e0c57ff5214"
LOOKUP_HOOK_LENGTH: Final[int] = 10

INPUT_HOOK_VA: Final[int] = 0x004046B5
INPUT_CONTINUATION_VA: Final[int] = 0x004046BA
INPUT_ORIGINAL_HEX: Final[str] = "ff108b4604"
INPUT_HOOK_LENGTH: Final[int] = 5

HANDLER_HOOK_VA: Final[int] = 0x004046C7
HANDLER_CONTINUATION_VA: Final[int] = 0x0040465D
HANDLER_ORIGINAL_HEX: Final[str] = "ff5708eb91"
HANDLER_HOOK_LENGTH: Final[int] = 5

SITE_LOOKUP_RESULT: Final[int] = 1
SITE_INPUT_BEFORE: Final[int] = 2
SITE_INPUT_AFTER: Final[int] = 3
SITE_HANDLER_BEFORE: Final[int] = 4
SITE_HANDLER_AFTER: Final[int] = 5
SITE_NAMES: Final[dict[int, str]] = {
    SITE_LOOKUP_RESULT: "lookupResult",
    SITE_INPUT_BEFORE: "inputBefore",
    SITE_INPUT_AFTER: "inputAfter",
    SITE_HANDLER_BEFORE: "handlerBefore",
    SITE_HANDLER_AFTER: "handlerAfter",
}


@dataclass(frozen=True, slots=True)
class MessageObjectHook:
    target: str
    virtual_address: int
    continuation_address: int
    original_hex: str
    patched_hex: str
    trampoline_address: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": self.target,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "continuationHex": f"0x{self.continuation_address:08x}",
            "originalHex": self.original_hex,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_address:08x}",
        }


@dataclass(frozen=True, slots=True)
class MessageObjectProbePatch:
    cave: RuntimeCodeCave
    hooks: tuple[MessageObjectHook, ...]
    before_characteristics: int
    after_characteristics: int
    app_code: int
    wrap_mode: bool

    def to_json(self) -> dict[str, JsonValue]:
        buffer_offset = _buffer_offset(self.wrap_mode)
        buffer_va = self.cave.virtual_address + buffer_offset
        record_capacity = _record_capacity(self.wrap_mode)
        return {
            "hooks": [hook.to_json() for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": buffer_offset + 8 + MESSAGE_OBJECT_RECORD_BYTES * record_capacity,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + buffer_offset:08x}",
                "recordCapacity": record_capacity,
                "totalBytes": 8 + MESSAGE_OBJECT_RECORD_BYTES * record_capacity,
                "mode": "wrap" if self.wrap_mode else "stop-at-capacity",
            },
            "recordFormat": {
                "magic": MESSAGE_OBJECT_MAGIC.hex(),
                "appCodeHex": f"0x{self.app_code & 0xffff:04x}",
                "recordBytes": MESSAGE_OBJECT_RECORD_BYTES,
                "layout": "magic,callIndex,siteId,value0,value1,value2,value3,value4",
            },
        }


def apply_message_object_probe_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
    *,
    app_code: int = DEFAULT_APP_CODE,
    wrap_mode: bool = False,
) -> MessageObjectProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    _assert_original(raw, image, LOOKUP_HOOK_VA, LOOKUP_HOOK_LENGTH, LOOKUP_ORIGINAL_HEX)
    _assert_original(raw, image, INPUT_HOOK_VA, INPUT_HOOK_LENGTH, INPUT_ORIGINAL_HEX)
    _assert_original(raw, image, HANDLER_HOOK_VA, HANDLER_HOOK_LENGTH, HANDLER_ORIGINAL_HEX)

    cave = find_runtime_probe_code_cave(source)
    buffer_offset = _buffer_offset(wrap_mode)
    trampoline, trampoline_vas = _build_trampoline(
        cave.virtual_address,
        cave.virtual_address + buffer_offset,
        app_code & 0xffff,
        wrap_mode,
        buffer_offset,
        _record_capacity(wrap_mode),
    )
    if len(trampoline) > cave.length_bytes:
        raise ValueError("message object probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hooks = (
        _patch_hook(patched, image, "lookupAppCodeResult", LOOKUP_HOOK_VA, LOOKUP_HOOK_LENGTH, LOOKUP_ORIGINAL_HEX, LOOKUP_CONTINUATION_VA, trampoline_vas["lookup"]),
        _patch_hook(patched, image, "messageAppCodeInput", INPUT_HOOK_VA, INPUT_HOOK_LENGTH, INPUT_ORIGINAL_HEX, INPUT_CONTINUATION_VA, trampoline_vas["input"]),
        _patch_hook(patched, image, "messageAppCodeHandler", HANDLER_HOOK_VA, HANDLER_HOOK_LENGTH, HANDLER_ORIGINAL_HEX, HANDLER_CONTINUATION_VA, trampoline_vas["handler"]),
    )
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = MessageObjectProbePatch(cave, hooks, before, after, app_code & 0xffff, wrap_mode)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _assert_original(raw: bytearray, image: PeImage, va: int, length: int, expected_hex: str) -> None:
    offset = _virtual_address_to_offset(image, va)
    original = raw[offset : offset + length]
    if original.hex() != expected_hex:
        raise ValueError(f"message object probe bytes drift at 0x{va:08x}: {original.hex()}")


def _patch_hook(patched: bytearray, image: PeImage, target: str, va: int, length: int, original_hex: str, continuation: int, trampoline_va: int) -> MessageObjectHook:
    hook_offset = _virtual_address_to_offset(image, va)
    hook_bytes = hook_jump(va, trampoline_va, length)
    patched[hook_offset : hook_offset + length] = hook_bytes
    return MessageObjectHook(target, va, continuation, original_hex, hook_bytes.hex(), trampoline_va)


def _buffer_offset(wrap_mode: bool) -> int:
    return MESSAGE_OBJECT_BUFFER_OFFSET


def _record_capacity(wrap_mode: bool) -> int:
    return MESSAGE_OBJECT_WRAP_RECORD_CAPACITY if wrap_mode else MESSAGE_OBJECT_RECORD_CAPACITY


def _build_trampoline(
    base_va: int,
    buffer_va: int,
    app_code: int,
    wrap_mode: bool,
    buffer_offset: int | None = None,
    record_capacity: int | None = None,
) -> tuple[bytes, dict[str, int]]:
    resolved_buffer_offset = buffer_offset if buffer_offset is not None else _buffer_offset(wrap_mode)
    resolved_record_capacity = record_capacity if record_capacity is not None else _record_capacity(wrap_mode)
    builder = X86Builder(base_va)
    vas: dict[str, int] = {}
    vas["lookup"] = builder.current_va
    _append_lookup_trampoline(builder, buffer_va, app_code, wrap_mode, resolved_record_capacity)
    vas["input"] = builder.current_va
    _append_input_trampoline(builder, buffer_va, app_code, wrap_mode, resolved_record_capacity)
    vas["handler"] = builder.current_va
    _append_handler_trampoline(builder, buffer_va, app_code, wrap_mode, resolved_record_capacity)
    if len(builder.data) > resolved_buffer_offset:
        raise ValueError("message object trampoline overlaps its ring buffer")
    while len(builder.data) < resolved_buffer_offset:
        builder.u8(0x90)
    builder.append(bytes(8 + MESSAGE_OBJECT_RECORD_BYTES * resolved_record_capacity))
    return bytes(builder.data), vas


def _append_lookup_trampoline(
    builder: X86Builder, buffer_va: int, app_code: int, wrap_mode: bool, record_capacity: int
) -> None:
    builder.append(bytes.fromhex(LOOKUP_ORIGINAL_HEX))
    skips = _append_log_header(builder, buffer_va, SITE_LOOKUP_RESULT, app_code, wrap_mode, record_capacity)
    _write_saved_dword(builder, 0x1C, 12)
    _write_saved_dword(builder, 0x00, 16)
    _write_dword_from_saved_pointer(builder, 0x00, 0, 20)
    _write_dword_from_register_pointer(builder, b"\x8b\x46\x04", 0, 24)
    _write_stream_len_code(builder, 28)
    _append_log_footer(builder, skips)
    builder.jmp_rel32(LOOKUP_CONTINUATION_VA)


def _append_input_trampoline(
    builder: X86Builder, buffer_va: int, app_code: int, wrap_mode: bool, record_capacity: int
) -> None:
    skips = _append_log_header(builder, buffer_va, SITE_INPUT_BEFORE, app_code, wrap_mode, record_capacity)
    _write_saved_dword(builder, 0x18, 12)
    _write_saved_dword(builder, 0x1C, 16)
    _write_dword_from_saved_pointer(builder, 0x1C, 0, 20)
    _write_ebp_dword(builder, 0x10, 24)
    _write_stream_len_code(builder, 28)
    _append_log_footer(builder, skips)
    builder.append(b"\xff\x10")
    skips = _append_log_header(builder, buffer_va, SITE_INPUT_AFTER, app_code, wrap_mode, record_capacity)
    _write_saved_dword(builder, 0x1C, 12)
    _write_slot_message(builder, 16)
    _write_slot_vtable(builder, 20)
    _write_ebp_dword(builder, 0x10, 24)
    _write_stream_len_code(builder, 28)
    _append_log_footer(builder, skips)
    builder.append(b"\x8b\x46\x04")
    builder.jmp_rel32(INPUT_CONTINUATION_VA)


def _append_handler_trampoline(
    builder: X86Builder, buffer_va: int, app_code: int, wrap_mode: bool, record_capacity: int
) -> None:
    skips = _append_log_header(builder, buffer_va, SITE_HANDLER_BEFORE, app_code, wrap_mode, record_capacity)
    _write_saved_dword(builder, 0x18, 12)
    _write_saved_dword(builder, 0x00, 16)
    _write_dword_from_saved_pointer(builder, 0x00, 8, 20)
    _write_original_stack_dword(builder, 4, 24)
    _write_original_stack_dword(builder, 8, 28)
    _append_log_footer(builder, skips)
    builder.append(b"\xff\x57\x08")
    skips = _append_log_header(builder, buffer_va, SITE_HANDLER_AFTER, app_code, wrap_mode, record_capacity)
    _write_saved_dword(builder, 0x1C, 12)
    _write_slot_message(builder, 16)
    _write_slot_vtable(builder, 20)
    _write_ebp_dword(builder, 0x10, 24)
    _write_stream_len_code(builder, 28)
    _append_log_footer(builder, skips)
    builder.jmp_rel32(HANDLER_CONTINUATION_VA)


def _append_log_header(
    builder: X86Builder, buffer_va: int, site_id: int, app_code: int, wrap_mode: bool, record_capacity: int
) -> list[int]:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    builder.append(b"\x8b\x45\x0c")
    builder.append(b"\x66\x81\x38")
    builder.append(struct.pack("<H", app_code & 0xffff))
    skips = [_jne_rel8(builder)]
    _u32(builder, b"\xa1", counter_va)
    if wrap_mode:
        _u32(builder, b"\xbf", records_va)
        builder.append(b"\x8b\xc8")
        builder.append(b"\x83\xe1")
        builder.u8(record_capacity - 1)
        builder.append(b"\x6b\xc9")
        builder.u8(MESSAGE_OBJECT_RECORD_BYTES)
        builder.append(b"\x03\xf9")
        _u32(builder, b"\xff\x05", counter_va)
        _u32(builder, b"\xc7\x07", int.from_bytes(MESSAGE_OBJECT_MAGIC, "little"))
        builder.append(b"\x89\x47\x04")
        _u32(builder, b"\xc7\x47\x08", site_id)
        return skips
    builder.append(b"\x83\xf8")
    builder.u8(record_capacity)
    skips.append(_jae_rel8(builder))
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x05\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(MESSAGE_OBJECT_MAGIC, "little"))
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xc7\x47\x08", site_id)
    return skips


def _append_log_footer(builder: X86Builder, skips: list[int]) -> None:
    for skip in skips:
        builder.patch_rel8(skip, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_dword_from_saved_pointer(builder: X86Builder, source_offset: int, pointer_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    _append_pointer_read(builder, pointer_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_dword_from_register_pointer(builder: X86Builder, load_register: bytes, pointer_offset: int, record_offset: int) -> None:
    builder.append(load_register)
    _append_pointer_read(builder, pointer_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_ebp_dword(builder: X86Builder, ebp_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x45")
    builder.u8(ebp_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_original_stack_dword(builder: X86Builder, original_stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(0x24 + original_stack_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_slot_message(builder: X86Builder, record_offset: int) -> None:
    builder.append(b"\x8b\x46\x0c\x89\x47")
    builder.u8(record_offset)


def _write_slot_vtable(builder: X86Builder, record_offset: int) -> None:
    builder.append(b"\x8b\x46\x0c\x8b\x00\x89\x47")
    builder.u8(record_offset)


def _write_stream_len_code(builder: X86Builder, record_offset: int) -> None:
    builder.append(b"\x8b\x45\x10\x8b\x40\x08\xc1\xe0\x10\x8b\x55\x0c\x66\x8b\x02\x89\x47")
    builder.u8(record_offset)


def _append_pointer_read(builder: X86Builder, pointer_offset: int) -> None:
    if pointer_offset == 0:
        builder.append(b"\x8b\x00")
        return
    builder.append(b"\x8b\x80")
    builder.u32(pointer_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jne_rel8(builder: X86Builder) -> int:
    builder.append(b"\x75\x00")
    return len(builder.data) - 1


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def decode_message_object_probe_ring(path: Path) -> dict[str, JsonValue]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("message object probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, JsonValue]] = []
    offset = 8
    index = 0
    while offset + MESSAGE_OBJECT_RECORD_BYTES <= len(data) and index < MESSAGE_OBJECT_RECORD_CAPACITY:
        chunk = data[offset : offset + MESSAGE_OBJECT_RECORD_BYTES]
        if chunk[:4] == MESSAGE_OBJECT_MAGIC:
            call_index, site_id, v0, v1, v2, v3, v4 = struct.unpack_from("<IIIIIII", chunk, 4)
            records.append(_record_to_json(index, call_index, site_id, (v0, v1, v2, v3, v4)))
        else:
            records.append({"index": index, "empty": True})
        offset += MESSAGE_OBJECT_RECORD_BYTES
        index += 1
    records = _records_chronological(records)
    sites_seen = _sites_seen(records)
    return {
        "path": str(path),
        "counter": counter,
        "sitesSeen": sites_seen,
        "verdict": _verdict(sites_seen, records),
        "records": records,
    }


def _record_to_json(index: int, call_index: int, site_id: int, values: tuple[int, int, int, int, int]) -> dict[str, JsonValue]:
    site_name = SITE_NAMES.get(site_id, f"unknown-{site_id}")
    match site_id:
        case 1:
            return _lookup_record(index, call_index, site_name, values)
        case 2:
            return _input_before_record(index, call_index, site_name, values)
        case 3:
            return _input_after_record(index, call_index, site_name, values)
        case 4:
            return _handler_before_record(index, call_index, site_name, values)
        case 5:
            return _handler_after_record(index, call_index, site_name, values)
        case _:
            return _unknown_record(index, call_index, site_id, site_name, values)


def _lookup_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    stream_len, app_code = _split_len_code(values[4])
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "resultEaxHex": _u32_hex(values[0]),
        "resultAl": values[0] & 0xFF,
        "slotPtrHex": _u32_hex(values[1]),
        "messageObjectHex": _u32_hex(values[2]),
        "managerHex": _u32_hex(values[3]),
        "streamLen": stream_len,
        "appCodeHex": _u16_hex(app_code),
    }


def _input_before_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    stream_len, app_code = _split_len_code(values[4])
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "messageObjectHex": _u32_hex(values[0]),
        "vtableHex": _u32_hex(values[1]),
        "inputMethodHex": _u32_hex(values[2]),
        "streamPtrHex": _u32_hex(values[3]),
        "streamLen": stream_len,
        "appCodeHex": _u16_hex(app_code),
    }


def _input_after_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    stream_len, app_code = _split_len_code(values[4])
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "returnEaxHex": _u32_hex(values[0]),
        "messageObjectHex": _u32_hex(values[1]),
        "vtableHex": _u32_hex(values[2]),
        "streamPtrHex": _u32_hex(values[3]),
        "streamLen": stream_len,
        "appCodeHex": _u16_hex(app_code),
    }


def _handler_before_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "messageObjectHex": _u32_hex(values[0]),
        "vtableHex": _u32_hex(values[1]),
        "handlerMethodHex": _u32_hex(values[2]),
        "handlerContext18Hex": _u32_hex(values[3]),
        "handlerContext1cHex": _u32_hex(values[4]),
    }


def _handler_after_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    stream_len, app_code = _split_len_code(values[4])
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "returnEaxHex": _u32_hex(values[0]),
        "messageObjectHex": _u32_hex(values[1]),
        "vtableHex": _u32_hex(values[2]),
        "streamPtrHex": _u32_hex(values[3]),
        "streamLen": stream_len,
        "appCodeHex": _u16_hex(app_code),
    }


def _unknown_record(index: int, call_index: int, site_id: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "siteId": site_id,
        "valuesHex": [_u32_hex(value) for value in values],
    }


def _sites_seen(records: list[dict[str, JsonValue]]) -> list[str]:
    sites: list[str] = []
    for record in records:
        site = record.get("site")
        if isinstance(site, str) and site not in sites:
            sites.append(site)
    return sites


def _records_chronological(records: list[dict[str, JsonValue]]) -> list[dict[str, JsonValue]]:
    populated = [record for record in records if "callIndex" in record]
    empty = [record for record in records if "callIndex" not in record]
    return sorted(populated, key=lambda record: int(record["callIndex"])) + empty


def _verdict(sites_seen: list[str], records: list[dict[str, JsonValue]]) -> str:
    if "handlerAfter" in sites_seen:
        return "handler returned"
    if "handlerBefore" in sites_seen:
        return "handler entered"
    if "inputAfter" in sites_seen:
        return "input returned"
    if "inputBefore" in sites_seen:
        return "input entered"
    if "lookupResult" in sites_seen:
        lookup_records = [record for record in records if record.get("site") == "lookupResult"]
        if lookup_records and lookup_records[-1].get("resultAl") == 0:
            return "lookup failed"
        return "lookup succeeded"
    return "no filtered message-object evidence"


def _split_len_code(value: int) -> tuple[int, int]:
    return (value >> 16) & 0xFFFF, value & 0xFFFF


def _u16_hex(value: int) -> str:
    return f"0x{value & 0xFFFF:04x}"


def _u32_hex(value: int) -> str:
    return f"0x{value:08x}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode LOGH VII 0x2001 message-object probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    patch.add_argument("--app-code", default=f"0x{DEFAULT_APP_CODE:04x}")
    patch.add_argument("--wrap", action="store_true", help="overwrite old ring slots instead of stopping at capacity")
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    decode.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.command == "patch":
        patch_result = apply_message_object_probe_patch(
            args.source,
            args.out,
            args.manifest_out,
            app_code=int(args.app_code, 0),
            wrap_mode=args.wrap,
        )
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    try:
        decoded = decode_message_object_probe_ring(args.ring)
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
