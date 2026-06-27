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

# Transport router 0x006130a0 peeks a big-endian opcode (0x614c70) into [esp+0x20] and at
# 0x006130fb compares it to 0x30: ==0x30 takes the vtable parse fast-path (bypasses the empty
# handler map), anything else falls to the std::map lookup (empty -> frame ignored). This probe
# hooks 0x006130fb and records the opcode the client reads for EVERY received frame, revealing
# which transport codes the client actually recognizes/routes.
ROUTER_PROBE_MAGIC: Final[bytes] = b"ROP1"
ROUTER_RECORD_BYTES: Final[int] = 64
ROUTER_RECORD_CAPACITY: Final[int] = 8
ROUTER_BUFFER_OFFSET: Final[int] = 200
ROUTER_HOOK_VA: Final[int] = 0x006130FB
ROUTER_CONTINUATION_VA: Final[int] = 0x00613101  # the je that follows the cmp
ROUTER_ORIGINAL_HEX: Final[str] = "66837c242030"  # cmp word ptr [esp+0x20], 0x30
ROUTER_HOOK_LENGTH: Final[int] = 6


@dataclass(frozen=True, slots=True)
class RouterProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "transportRouterOpcodeCompare",
            "virtualAddressHex": f"0x{ROUTER_HOOK_VA:08x}",
            "continuationHex": f"0x{ROUTER_CONTINUATION_VA:08x}",
            "originalHex": ROUTER_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class RouterProbePatch:
    cave: RuntimeCodeCave
    hook: RouterProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + ROUTER_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": ROUTER_BUFFER_OFFSET + 8 + ROUTER_RECORD_BYTES * ROUTER_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + ROUTER_BUFFER_OFFSET:08x}",
                "recordCapacity": ROUTER_RECORD_CAPACITY,
                "totalBytes": 8 + ROUTER_RECORD_BYTES * ROUTER_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": ROUTER_PROBE_MAGIC.hex(),
                "recordBytes": ROUTER_RECORD_BYTES,
                "layout": "magic,callIndex,opcode",
            },
        }


def apply_router_opcode_probe_patch(source: Path, destination: Path, manifest_out: Path) -> RouterProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, ROUTER_HOOK_VA)
    original = raw[hook_offset : hook_offset + ROUTER_HOOK_LENGTH]
    if original.hex() != ROUTER_ORIGINAL_HEX:
        raise ValueError(f"transport router opcode-compare bytes drift at 0x{ROUTER_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + ROUTER_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("transport router opcode probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(ROUTER_HOOK_VA, cave.virtual_address, ROUTER_HOOK_LENGTH)
    patched[hook_offset : hook_offset + ROUTER_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = RouterProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = RouterProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\x66\x83\x7c\x24\x20\x30")  # replay cmp word ptr [esp+0x20], 0x30
    builder.jmp_rel32(ROUTER_CONTINUATION_VA)
    if len(builder.data) > ROUTER_BUFFER_OFFSET:
        raise ValueError("transport router opcode trampoline overlaps its ring buffer")
    while len(builder.data) < ROUTER_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + ROUTER_RECORD_BYTES * ROUTER_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld  (esp -= 0x24)
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(ROUTER_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    builder.append(b"\x89\x47\x04")
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(ROUTER_PROBE_MAGIC, "little"))
    # opcode = word [esp+0x20] -> after pushfd+pushad -> word [esp+0x44]
    builder.append(b"\x0f\xb7\x44\x24\x44\x89\x47\x08")  # movzx eax, word [esp+0x44]; mov [edi+8], eax
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_router_opcode_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("router opcode ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + ROUTER_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + ROUTER_RECORD_BYTES]
        if chunk[:4] != ROUTER_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, opcode = struct.unpack_from("<II", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "opcodeHex": f"0x{opcode & 0xFFFF:04x}",
                    "isFastPath0x30": (opcode & 0xFFFF) == 0x30,
                }
            )
        offset += ROUTER_RECORD_BYTES
        index += 1
    opcodes = [r["opcodeHex"] for r in records if not r.get("empty")]
    return {"path": str(path), "counter": counter, "opcodesSeen": opcodes, "records": records}


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
    parser = argparse.ArgumentParser(description="Patch LOGH VII transport router opcode ring probe.")
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
        apply_router_opcode_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        print(f"wrote {args.manifest_out}")
        return 0
    try:
        decoded = decode_router_opcode_ring(args.ring)
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
