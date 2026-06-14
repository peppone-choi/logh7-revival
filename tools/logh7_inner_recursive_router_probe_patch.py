from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import enable_section_write_for_virtual_address, find_runtime_probe_code_cave
from tools.logh7_x86_patch import X86Builder, hook_jump


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]
MAGIC: Final[bytes] = b"IRR1"
RECORD_BYTES: Final[int] = 64
RECORD_CAPACITY: Final[int] = 4
BUFFER_OFFSET: Final[int] = 320
HOOK_VA: Final[int] = 0x00613210
CONTINUATION_VA: Final[int] = 0x00613217
ROUTER_VA: Final[int] = 0x006130A0
ORIGINAL_HEX: Final[str] = "5653e889feffff"
HOOK_LENGTH: Final[int] = 7


def apply_inner_recursive_router_probe_patch(source: Path, destination: Path, manifest_out: Path) -> dict[str, JsonValue]:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = raw[hook_offset : hook_offset + HOOK_LENGTH]
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"inner recursive router bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")
    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("inner recursive router probe exceeds code cave capacity")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)
    patch = _patch_json(cave, hook_bytes, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _patch_json(cave: object, hook_bytes: bytes, before: int, after: int) -> dict[str, JsonValue]:
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    return {
        "hooks": [{
            "target": "innerRecursiveRouterCall",
            "virtualAddressHex": f"0x{HOOK_VA:08x}",
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "originalHex": ORIGINAL_HEX,
            "patchedHex": hook_bytes.hex(),
            "trampolineHex": f"0x{cave.virtual_address:08x}",
        }],
        "trampoline": {
            "virtualAddressHex": f"0x{cave.virtual_address:08x}",
            "fileOffsetHex": f"0x{cave.file_offset:08x}",
            "capacityBytes": cave.length_bytes,
            "bytesUsed": BUFFER_OFFSET + 8 + RECORD_BYTES * RECORD_CAPACITY,
            "sectionCharacteristicsBeforeHex": f"0x{before:08x}",
            "sectionCharacteristicsAfterHex": f"0x{after:08x}",
        },
        "ringBuffer": {
            "virtualAddressHex": f"0x{buffer_va:08x}",
            "fileOffsetHex": f"0x{cave.file_offset + BUFFER_OFFSET:08x}",
            "recordCapacity": RECORD_CAPACITY,
            "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
        },
        "recordFormat": {
            "magic": MAGIC.hex(),
            "recordBytes": RECORD_BYTES,
            "layout": "magic,callIndex,event,returnEax,manager,context,managerObject,selectorOffset,listRoot,pendingPtr,pendingLen,pendingFlag,contextBase,contextCursor,contextLen",
        },
    }


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va, 1)
    builder.append(b"\x56\x53")
    _call_rel32(builder, ROUTER_VA)
    _append_record(builder, buffer_va, 2)
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("inner recursive router trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int, event: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9\x89\x47\x04")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(MAGIC, "little"))
    _u32(builder, b"\xc7\x47\x08", event)
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x0c")
    builder.append(b"\x8b\x44\x24\x04\x89\x47\x10")
    builder.append(b"\x8b\x44\x24\x10\x89\x47\x14")
    builder.append(b"\x8b\x44\x24\x00\x89\x47\x18")
    builder.append(b"\x8b\x4c\x24\x04\x0f\xb7\x41\x12\x89\x47\x1c")
    builder.append(b"\x8b\x41\x14\x89\x47\x20\x8b\x41\x24\x89\x47\x24")
    builder.append(b"\x0f\xb7\x41\x2c\x89\x47\x28\x0f\xb6\x41\x30\x89\x47\x2c")
    builder.append(b"\x8b\x4c\x24\x10\x8b\x01\x89\x47\x30\x8b\x41\x04\x89\x47\x34")
    builder.append(b"\x0f\xb7\x41\x08\x89\x47\x38\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_inner_recursive_router_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("inner recursive router ring is too small")
    records = _decode_records(data)
    events = [record["event"] for record in records if not record.get("empty")]
    after = next((record for record in records if record.get("event") == "after"), None)
    return {
        "path": str(path),
        "bytes": len(data),
        "counter": struct.unpack_from("<I", data, 0)[0],
        "recursiveRouterObserved": bool(events),
        "events": events,
        "afterReturnEaxHex": None if after is None else after["returnEaxHex"],
        "records": records,
    }


def _decode_records(data: bytes) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for index, offset in enumerate(range(8, len(data) - RECORD_BYTES + 1, RECORD_BYTES)):
        chunk = data[offset : offset + RECORD_BYTES]
        records.append({"index": index, "empty": True} if chunk[:4] != MAGIC else _decode_record(index, chunk))
    return records


def _decode_record(index: int, chunk: bytes) -> dict[str, object]:
    values = struct.unpack_from("<IIIIIIIIIIIIII", chunk, 4)
    ci, event, eax, manager, context, obj, selector, root, pending, pending_len, flag, base, cursor, length = values
    return {
        "index": index,
        "callIndex": ci,
        "event": "before" if event == 1 else "after" if event == 2 else f"unknown-{event}",
        "returnEaxHex": f"0x{eax:08x}",
        "managerHex": f"0x{manager:08x}",
        "contextHex": f"0x{context:08x}",
        "managerObjectHex": f"0x{obj:08x}",
        "selectorOffsetHex": f"0x{selector:04x}",
        "managerListRootHex": f"0x{root:08x}",
        "pendingPtrHex": f"0x{pending:08x}",
        "pendingLen": pending_len,
        "pendingFlag": flag,
        "contextBaseHex": f"0x{base:08x}",
        "contextCursorHex": f"0x{cursor:08x}",
        "contextLen": length,
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
    offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII inner recursive router ring probe.")
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
        apply_inner_recursive_router_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        print(f"wrote {args.manifest_out}")
        return 0
    try:
        decoded = decode_inner_recursive_router_ring(args.ring)
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
