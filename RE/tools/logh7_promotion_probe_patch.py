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

PROMOTION_MAGIC: Final[bytes] = b"PRM1"
PROMOTION_RECORD_BYTES: Final[int] = 40
PROMOTION_RECORD_CAPACITY: Final[int] = 8
PROMOTION_BUFFER_OFFSET: Final[int] = 480

ROUTER_RETURN_HOOK_VA: Final[int] = 0x00613222
ROUTER_RETURN_CONTINUATION_VA: Final[int] = 0x00613229
ROUTER_RETURN_ORIGINAL_HEX: Final[str] = "8b3f668b542410"
ROUTER_RETURN_HOOK_LENGTH: Final[int] = 7

DISPATCH_FRAME_HOOK_VA: Final[int] = 0x0061231B
DISPATCH_FRAME_CONTINUATION_VA: Final[int] = 0x00612323
DISPATCH_FRAME_ORIGINAL_HEX: Final[str] = "8b0f33c0668b4708"
DISPATCH_FRAME_HOOK_LENGTH: Final[int] = 8

LOOKUP_HOOK_VA: Final[int] = 0x00612348
LOOKUP_ORIGINAL_HEX: Final[str] = "8bf885ff742a"
LOOKUP_HOOK_LENGTH: Final[int] = 6
LOOKUP_MISS_TARGET_VA: Final[int] = 0x00612378
LOOKUP_HIT_TARGET_VA: Final[int] = 0x0061234E

ENQUEUE_HOOK_VA: Final[int] = 0x004B8850
ENQUEUE_CONTINUATION_VA: Final[int] = 0x004B8858
ENQUEUE_ORIGINAL_HEX: Final[str] = "515355568b742418"
ENQUEUE_HOOK_LENGTH: Final[int] = 8

SITE_ROUTER_RETURN: Final[int] = 1
SITE_DISPATCH_FRAME: Final[int] = 2
SITE_HANDLER_LOOKUP: Final[int] = 3
SITE_ENQUEUE: Final[int] = 4

SITE_NAMES: Final[dict[int, str]] = {
    SITE_ROUTER_RETURN: "routerReturn",
    SITE_DISPATCH_FRAME: "dispatchFrame",
    SITE_HANDLER_LOOKUP: "handlerLookup",
    SITE_ENQUEUE: "enqueue",
}


@dataclass(frozen=True, slots=True)
class PromotionHook:
    target: str
    virtual_address: int
    continuation_address: int | None
    original_hex: str
    patched_hex: str
    trampoline_address: int

    def to_json(self) -> dict[str, JsonValue]:
        result: dict[str, JsonValue] = {
            "target": self.target,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "originalHex": self.original_hex,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_address:08x}",
        }
        if self.continuation_address is not None:
            result["continuationHex"] = f"0x{self.continuation_address:08x}"
        return result


@dataclass(frozen=True, slots=True)
class PromotionProbePatch:
    cave: RuntimeCodeCave
    hooks: tuple[PromotionHook, ...]
    before_characteristics: int
    after_characteristics: int
    wrap_mode: bool

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + PROMOTION_BUFFER_OFFSET
        return {
            "hooks": [hook.to_json() for hook in self.hooks],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": PROMOTION_BUFFER_OFFSET + 8 + PROMOTION_RECORD_BYTES * PROMOTION_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + PROMOTION_BUFFER_OFFSET:08x}",
                "recordCapacity": PROMOTION_RECORD_CAPACITY,
                "totalBytes": 8 + PROMOTION_RECORD_BYTES * PROMOTION_RECORD_CAPACITY,
                "mode": "wrap" if self.wrap_mode else "stop-at-capacity",
            },
            "recordFormat": {
                "magic": PROMOTION_MAGIC.hex(),
                "recordBytes": PROMOTION_RECORD_BYTES,
                "layout": "magic,callIndex,siteId,value0,value1,value2,value3,value4,value5",
            },
        }


def apply_promotion_probe_patch(
    source: Path, destination: Path, manifest_out: Path, *, wrap_mode: bool = False
) -> PromotionProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    _assert_original(raw, image, ROUTER_RETURN_HOOK_VA, ROUTER_RETURN_HOOK_LENGTH, ROUTER_RETURN_ORIGINAL_HEX)
    _assert_original(raw, image, DISPATCH_FRAME_HOOK_VA, DISPATCH_FRAME_HOOK_LENGTH, DISPATCH_FRAME_ORIGINAL_HEX)
    _assert_original(raw, image, LOOKUP_HOOK_VA, LOOKUP_HOOK_LENGTH, LOOKUP_ORIGINAL_HEX)
    _assert_original(raw, image, ENQUEUE_HOOK_VA, ENQUEUE_HOOK_LENGTH, ENQUEUE_ORIGINAL_HEX)

    cave = find_runtime_probe_code_cave(source)
    trampoline, trampoline_vas = _build_trampoline(
        cave.virtual_address, cave.virtual_address + PROMOTION_BUFFER_OFFSET, wrap_mode
    )
    if len(trampoline) > cave.length_bytes:
        raise ValueError("promotion probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)

    hooks = (
        _patch_hook(
            patched,
            image,
            "routerDecodedReturn",
            ROUTER_RETURN_HOOK_VA,
            ROUTER_RETURN_HOOK_LENGTH,
            ROUTER_RETURN_ORIGINAL_HEX,
            ROUTER_RETURN_CONTINUATION_VA,
            trampoline_vas["router"],
        ),
        _patch_hook(
            patched,
            image,
            "dispatchFrame",
            DISPATCH_FRAME_HOOK_VA,
            DISPATCH_FRAME_HOOK_LENGTH,
            DISPATCH_FRAME_ORIGINAL_HEX,
            DISPATCH_FRAME_CONTINUATION_VA,
            trampoline_vas["dispatch"],
        ),
        _patch_hook(
            patched,
            image,
            "handlerLookup",
            LOOKUP_HOOK_VA,
            LOOKUP_HOOK_LENGTH,
            LOOKUP_ORIGINAL_HEX,
            None,
            trampoline_vas["lookup"],
        ),
        _patch_hook(
            patched,
            image,
            "decodedMessageEnqueue",
            ENQUEUE_HOOK_VA,
            ENQUEUE_HOOK_LENGTH,
            ENQUEUE_ORIGINAL_HEX,
            ENQUEUE_CONTINUATION_VA,
            trampoline_vas["enqueue"],
        ),
    )
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    patch = PromotionProbePatch(cave, hooks, before, after, wrap_mode)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _assert_original(raw: bytearray, image: object, va: int, length: int, expected_hex: str) -> None:
    offset = _virtual_address_to_offset(image, va)
    original = raw[offset : offset + length]
    if original.hex() != expected_hex:
        raise ValueError(f"promotion probe bytes drift at 0x{va:08x}: {original.hex()}")


def _patch_hook(
    patched: bytearray,
    image: object,
    target: str,
    hook_va: int,
    hook_length: int,
    original_hex: str,
    continuation_va: int | None,
    trampoline_va: int,
) -> PromotionHook:
    hook_offset = _virtual_address_to_offset(image, hook_va)
    hook_bytes = hook_jump(hook_va, trampoline_va, hook_length)
    patched[hook_offset : hook_offset + hook_length] = hook_bytes
    return PromotionHook(target, hook_va, continuation_va, original_hex, hook_bytes.hex(), trampoline_va)


def _build_trampoline(base_va: int, buffer_va: int, wrap_mode: bool) -> tuple[bytes, dict[str, int]]:
    builder = X86Builder(base_va)
    trampoline_vas: dict[str, int] = {}

    trampoline_vas["router"] = builder.current_va
    _append_router_return_trampoline(builder, buffer_va, wrap_mode)

    trampoline_vas["dispatch"] = builder.current_va
    _append_dispatch_frame_trampoline(builder, buffer_va, wrap_mode)

    trampoline_vas["lookup"] = builder.current_va
    _append_lookup_trampoline(builder, buffer_va, wrap_mode)

    trampoline_vas["enqueue"] = builder.current_va
    _append_enqueue_trampoline(builder, buffer_va, wrap_mode)

    if len(builder.data) > PROMOTION_BUFFER_OFFSET:
        raise ValueError("promotion trampoline code exceeds reserved buffer offset")
    while len(builder.data) < PROMOTION_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + PROMOTION_RECORD_BYTES * PROMOTION_RECORD_CAPACITY))
    return bytes(builder.data), trampoline_vas


def _append_router_return_trampoline(builder: X86Builder, buffer_va: int, wrap_mode: bool) -> None:
    skip = _append_log_header(builder, buffer_va, SITE_ROUTER_RETURN, wrap_mode)
    _write_saved_dword(builder, 0x1C, 12)
    _write_saved_dword(builder, 0x04, 16)
    _write_saved_dword(builder, 0x00, 20)
    _write_dword_from_saved_pointer(builder, 0x00, 0, 24)
    _write_stack_dword(builder, 0x20, 28)
    _write_stack_word(builder, 0x10, 32)
    _append_log_footer(builder, skip)
    builder.append(bytes.fromhex(ROUTER_RETURN_ORIGINAL_HEX))
    builder.jmp_rel32(ROUTER_RETURN_CONTINUATION_VA)


def _append_dispatch_frame_trampoline(builder: X86Builder, buffer_va: int, wrap_mode: bool) -> None:
    skip = _append_log_header(builder, buffer_va, SITE_DISPATCH_FRAME, wrap_mode)
    _write_saved_dword(builder, 0x00, 12)
    _write_dword_from_saved_pointer(builder, 0x00, 0, 16)
    _write_dword_from_saved_pointer(builder, 0x00, 4, 20)
    _write_word_from_saved_pointer(builder, 0x00, 8, 24)
    _write_nested_frame_body_dword(builder, 28)
    _write_dword_from_saved_pointer(builder, 0x04, 8, 32)
    _append_log_footer(builder, skip)
    builder.append(bytes.fromhex(DISPATCH_FRAME_ORIGINAL_HEX))
    builder.jmp_rel32(DISPATCH_FRAME_CONTINUATION_VA)


def _append_lookup_trampoline(builder: X86Builder, buffer_va: int, wrap_mode: bool) -> None:
    skip = _append_log_header(builder, buffer_va, SITE_HANDLER_LOOKUP, wrap_mode)
    _write_saved_dword(builder, 0x1C, 12)
    _write_saved_dword(builder, 0x04, 16)
    _write_dword_from_saved_pointer(builder, 0x04, 8, 20)
    _write_dword_from_saved_pointer(builder, 0x04, 0x2C, 24)
    _write_saved_dword(builder, 0x00, 28)
    _write_stack_dword(builder, 0, 32)
    _append_log_footer(builder, skip)
    builder.append(b"\x8b\xf8\x85\xff")
    je_va = builder.current_va
    builder.append(b"\x0f\x84")
    builder.u32((LOOKUP_MISS_TARGET_VA - (je_va + 6)) & 0xFFFFFFFF)
    builder.jmp_rel32(LOOKUP_HIT_TARGET_VA)


def _append_enqueue_trampoline(builder: X86Builder, buffer_va: int, wrap_mode: bool) -> None:
    skip = _append_log_header(builder, buffer_va, SITE_ENQUEUE, wrap_mode)
    _write_stack_dword(builder, 4, 12)
    _write_stack_dword(builder, 8, 16)
    _write_saved_dword(builder, 0x18, 20)
    _write_dword_from_stack_pointer(builder, 8, 0, 24)
    _append_log_footer(builder, skip)
    builder.append(bytes.fromhex(ENQUEUE_ORIGINAL_HEX))
    builder.jmp_rel32(ENQUEUE_CONTINUATION_VA)


def _append_log_header(builder: X86Builder, buffer_va: int, site_id: int, wrap_mode: bool) -> int | None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    if wrap_mode:
        _u32(builder, b"\xbf", records_va)
        builder.append(b"\x8b\xc8")
        builder.append(b"\x83\xe1")
        builder.u8(PROMOTION_RECORD_CAPACITY - 1)
        builder.append(b"\x6b\xc9")
        builder.u8(PROMOTION_RECORD_BYTES)
        builder.append(b"\x03\xf9")
        _u32(builder, b"\xff\x05", counter_va)
        _u32(builder, b"\xc7\x07", int.from_bytes(PROMOTION_MAGIC, "little"))
        builder.append(b"\x89\x47\x04")
        _u32(builder, b"\xc7\x47\x08", site_id)
        return None
    builder.append(b"\x83\xf8")
    builder.u8(PROMOTION_RECORD_CAPACITY)
    skip = _jae_rel8(builder)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x05\x8d\x0c\xc1\x03\xf9")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(PROMOTION_MAGIC, "little"))
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xc7\x47\x08", site_id)
    return skip


def _append_log_footer(builder: X86Builder, skip: int | None) -> None:
    if skip is not None:
        builder.patch_rel8(skip, builder.current_va)
    builder.append(b"\x61\x9d")


def _write_saved_dword(builder: X86Builder, source_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(source_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_stack_dword(builder: X86Builder, original_stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(original_stack_offset + 0x24)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_stack_word(builder: X86Builder, original_stack_offset: int, record_offset: int) -> None:
    builder.append(b"\x0f\xb7\x44\x24")
    builder.u8(original_stack_offset + 0x24)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_dword_from_saved_pointer(
    builder: X86Builder, saved_register_offset: int, pointer_offset: int, record_offset: int
) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(saved_register_offset)
    if pointer_offset == 0:
        builder.append(b"\x8b\x00")
    else:
        builder.append(b"\x8b\x80")
        builder.u32(pointer_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_word_from_saved_pointer(
    builder: X86Builder, saved_register_offset: int, pointer_offset: int, record_offset: int
) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(saved_register_offset)
    if pointer_offset == 0:
        builder.append(b"\x0f\xb7\x00")
    else:
        builder.append(b"\x0f\xb7\x80")
        builder.u32(pointer_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_dword_from_stack_pointer(
    builder: X86Builder, original_stack_offset: int, pointer_offset: int, record_offset: int
) -> None:
    builder.append(b"\x8b\x44\x24")
    builder.u8(original_stack_offset + 0x24)
    if pointer_offset == 0:
        builder.append(b"\x8b\x00")
    else:
        builder.append(b"\x8b\x80")
        builder.u32(pointer_offset)
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _write_nested_frame_body_dword(builder: X86Builder, record_offset: int) -> None:
    builder.append(b"\x8b\x44\x24\x00")
    builder.append(b"\x8b\x00")
    builder.append(b"\x8b\x00")
    builder.append(b"\x89\x47")
    builder.u8(record_offset)


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jae_rel8(builder: X86Builder) -> int:
    builder.append(b"\x73\x00")
    return len(builder.data) - 1


def decode_promotion_probe_ring(path: Path) -> dict[str, JsonValue]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("promotion probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, JsonValue]] = []
    offset = 8
    index = 0
    while offset + PROMOTION_RECORD_BYTES <= len(data) and index < PROMOTION_RECORD_CAPACITY:
        chunk = data[offset : offset + PROMOTION_RECORD_BYTES]
        if chunk[:4] == PROMOTION_MAGIC:
            call_index, site_id, v0, v1, v2, v3, v4, v5 = struct.unpack_from("<IIIIIIII", chunk, 4)
            records.append(_record_to_json(index, call_index, site_id, (v0, v1, v2, v3, v4, v5)))
        else:
            records.append({"index": index, "empty": True})
        offset += PROMOTION_RECORD_BYTES
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


def _record_to_json(index: int, call_index: int, site_id: int, values: tuple[int, int, int, int, int, int]) -> dict[str, JsonValue]:
    site_name = SITE_NAMES.get(site_id, f"unknown-{site_id}")
    match site_id:
        case 1:
            return _router_return_record(index, call_index, site_name, values)
        case 2:
            return _dispatch_frame_record(index, call_index, site_name, values)
        case 3:
            return _handler_lookup_record(index, call_index, site_name, values)
        case 4:
            return _enqueue_record(index, call_index, site_name, values)
        case _:
            return _unknown_record(index, call_index, site_id, site_name, values)


def _router_return_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "innerCodeHex": _u16_hex(values[0]),
        "transportHex": _u32_hex(values[1]),
        "decodedSlotHex": _u32_hex(values[2]),
        "decodedBodyPtrHex": _u32_hex(values[3]),
        "stackInnerCodeHex": _u16_hex(values[4]),
        "decodedLen": values[5],
    }


def _dispatch_frame_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "frameHex": _u32_hex(values[0]),
        "bodyPtrHex": _u32_hex(values[1]),
        "cursorHex": _u32_hex(values[2]),
        "lenField": values[3],
        "bodyFirstDwordHex": _u32_hex(values[4]),
        "pumpKeyHex": _u16_hex(values[5]),
    }


def _handler_lookup_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "lookupResultHex": _u32_hex(values[0]),
        "hit": values[0] != 0,
        "pumpThisHex": _u32_hex(values[1]),
        "keyHex": _u16_hex(values[2]),
        "innerCodeHex": _u16_hex(values[3]),
        "savedEdiHex": _u32_hex(values[4]),
        "stackTopHex": _u32_hex(values[5]),
    }


def _enqueue_record(index: int, call_index: int, site_name: str, values: tuple[int, ...]) -> dict[str, JsonValue]:
    return {
        "index": index,
        "callIndex": call_index,
        "site": site_name,
        "internalCodeHex": _u16_hex(values[0]),
        "bodyPtrHex": _u32_hex(values[1]),
        "clientHex": _u32_hex(values[2]),
        "bodyFirstDwordHex": _u32_hex(values[3]),
        "queueFirstPtrHex": _u32_hex(values[4]),
        "queueFirstCodeHex": _u16_hex(values[5]),
    }


def _unknown_record(
    index: int, call_index: int, site_id: int, site_name: str, values: tuple[int, ...]
) -> dict[str, JsonValue]:
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
    if "enqueue" in sites_seen:
        return "enqueue reached"
    if "handlerLookup" in sites_seen:
        misses = [record for record in records if record.get("site") == "handlerLookup" and record.get("hit") is False]
        if misses:
            return "handler lookup miss"
        return "handler lookup reached"
    if "dispatchFrame" in sites_seen:
        return "dispatch loop reached"
    if "routerReturn" in sites_seen:
        return "router return only"
    return "no promotion evidence"


def _u16_hex(value: int) -> str:
    return f"0x{value & 0xFFFF:04x}"


def _u32_hex(value: int) -> str:
    return f"0x{value:08x}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode LOGH VII decoded-message promotion boundary probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    patch.add_argument("--wrap", action="store_true", help="Use the ring as a circular latest-event buffer.")
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    decode.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.command == "patch":
        patch_result = apply_promotion_probe_patch(args.source, args.out, args.manifest_out, wrap_mode=args.wrap)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    try:
        decoded = decode_promotion_probe_ring(args.ring)
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
