"""Runtime probe: capture every GIN7 key-schedule key the client installs.

Hooks FUN_00613ad0 (the child-codec / GIN7 Blowfish key schedule). Every cipher
key the client sets up — the handshake S->C decipherKey AND any 0x31 keysetup —
flows through here, so the ring records reveal which key the LOBBY connection uses
to decode server->client frames (the open blocker, see handoff G155/G156).

Calling convention (__cdecl): FUN_00613ad0(P_dest, Sbox_dest, keyPtr, keyLen).
At entry keyPtr@[esp+0xc], keyLen@[esp+0x10]; after the trampoline's pushfd+pushad
(36 bytes) they are at [esp+0x30] / [esp+0x34].

Ring record (64-byte stride): [magic 4][callIndex 4][keyPtr 4][keyLen 4][keyBytes 40][pad 8].

Subcommands: patch <exe> --out <patched> --manifest-out <json>; decode <ring.bin> --out <json>.
"""
from __future__ import annotations

import argparse
import json
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

HOOK_VA: Final[int] = 0x00613AD0
CONTINUATION_VA: Final[int] = 0x00613AD5
HOOK_LENGTH: Final[int] = 5
ORIGINAL_HEX: Final[str] = "a032093503"  # mov al, byte ptr [0x03350932]

BUFFER_OFFSET: Final[int] = 176  # trampoline code lives below this; ring starts here (cave is 811B)
RECORD_BYTES: Final[int] = 64
RECORD_CAPACITY: Final[int] = 9
KEY_COPY_BYTES: Final[int] = 40
MAGIC: Final[bytes] = b"K7SK"


@dataclass(frozen=True, slots=True)
class KeysetupKeyProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "ringBuffer": {
                "virtualAddressHex": f"0x{ring_va:08x}",
                "counterBytes": 8,
                "recordBytes": RECORD_BYTES,
                "recordCapacity": RECORD_CAPACITY,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_keysetup_key_probe_patch(source: Path, out: Path, manifest_out: Path) -> KeysetupKeyProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"keysetup entry bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("keysetup key probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = KeysetupKeyProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))  # replay mov al, [0x03350932]
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("keysetup key trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    builder.append(b"\xa1")
    builder.u32(counter_va)  # mov eax, [counter_va]
    builder.append(b"\x83\xf8")
    builder.u8(RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)  # jb log_entry
    builder.append(b"\x61\x9d")  # popad; popfd
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    builder.append(b"\xbf")
    builder.u32(records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")  # mov ecx,eax; shl ecx,6; add edi,ecx (records + eax*64)
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex = old counter)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # keyPtr = [esp+0x30] -> [edi+8]
    builder.append(b"\x8b\x44\x24\x30\x89\x47\x08")
    # keyLen = [esp+0x34] -> [edi+0x0c]
    builder.append(b"\x8b\x44\x24\x34\x89\x47\x0c")
    # esi = keyPtr ([esp+0x30]); copy KEY_COPY_BYTES from [esi] to [edi+0x10..]
    builder.append(b"\x8b\x74\x24\x30")  # mov esi, [esp+0x30]
    for index in range(0, KEY_COPY_BYTES, 4):
        builder.append(b"\x8b\x46")  # mov eax, [esi+index]
        builder.u8(index)
        builder.append(b"\x89\x47")  # mov [edi+0x10+index], eax
        builder.u8(0x10 + index)
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")  # jb rel8 (placeholder)
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after = builder.base_va + opcode_offset + 5
    rel = destination - source_after
    struct.pack_into("<i", builder.data, opcode_offset + 1, rel)


def decode_keysetup_key_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("keysetup key ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, key_ptr, key_len = struct.unpack_from("<III", chunk, 4)
            key_bytes = chunk[0x10 : 0x10 + KEY_COPY_BYTES]
            shown = key_bytes[: key_len] if 0 < key_len <= KEY_COPY_BYTES else key_bytes
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "keyPtrHex": f"0x{key_ptr:08x}",
                    "keyLen": key_len,
                    "keyHex": shown.hex(),
                    "keyAscii": "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in shown),
                    "keyFull40Hex": key_bytes.hex(),
                }
            )
        offset += RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII GIN7 key-schedule ring probe.")
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
        patch_result = apply_keysetup_key_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_keysetup_key_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
