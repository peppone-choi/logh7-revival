"""Runtime probe: capture who calls closesocket (and the socket), to find the conn2 teardown.

Hooks the closesocket import thunk at 0x00640b7e (`jmp dword [0x66b6e0]` = WS2_32 ord3). The
caller did `call thunk`, so at hook entry [esp] = the caller's return address (the EXE code that
triggered the close) and [esp+4] = the socket. The trampoline records (caller, socket) then
replays `jmp [0x66b6e0]` to the real closesocket (which returns to the original caller).

Decisive question (handoff G182): the lobby FSM freezes at state6 and conn2 closes ~5ms later at
the transport level via a DELIBERATE close (not the recv-error path). Which code closes conn2? The
recorded caller return-address identifies the trigger so it can be patched (the keystone for the
lobby-unblock client patch: prevent conn2's premature close so the recv pump can read the 0x2001).

Saved-frame layout after `pushfd; pushad`: return-addr@[esp+0x24], socket@[esp+0x28].
Ring record (16-byte stride): [magic 4][callIndex 4][caller 4][socket 4].

Subcommands: patch <exe> --out <patched> --manifest-out <json>; decode <ring.bin> --out <json>.
"""
from __future__ import annotations

import argparse
import json
import struct
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

HOOK_VA: Final[int] = 0x00640B7E
HOOK_LENGTH: Final[int] = 6  # jmp dword [0x66b6e0]
ORIGINAL_HEX: Final[str] = "ff25e0b66600"
CLOSESOCKET_IAT: Final[int] = 0x0066B6E0

BUFFER_OFFSET: Final[int] = 176
RECORD_BYTES: Final[int] = 16
RECORD_CAPACITY: Final[int] = 24
MAGIC: Final[bytes] = b"L7CS"  # LOGH7 CloseSocket


@dataclass(frozen=True, slots=True)
class CloseCallerProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "closesocketIatHex": f"0x{CLOSESOCKET_IAT:08x}",
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


def apply_close_caller_probe_patch(source: Path, out: Path, manifest_out: Path) -> CloseCallerProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"closesocket thunk bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("close caller probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = CloseCallerProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    # Replay the original thunk: jmp dword [CLOSESOCKET_IAT]  (transfers to closesocket; returns to caller).
    builder.append(b"\xff\x25")
    builder.u32(CLOSESOCKET_IAT)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("close caller trampoline overlaps its ring buffer")
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
    builder.append(b"\x8b\xc8\xc1\xe1\x04\x03\xf9")  # mov ecx,eax; shl ecx,4; add edi,ecx
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # The closesocket thunk is called by the wrapper 0x615d70 (which pushed the socket arg first),
    # so [esp+0x24]=wrapper-internal-ret, [esp+0x28]=socket, [esp+0x2c]=the wrapper's CALLER (the
    # real close trigger). Record the wrapper's caller and the socket.
    # caller (wrapper's caller) = [esp+0x2c] -> [edi+8]
    builder.append(b"\x8b\x44\x24\x2c\x89\x47\x08")
    # socket = [esp+0x28] -> [edi+0x0c]
    builder.append(b"\x8b\x44\x24\x28\x89\x47\x0c")
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


def decode_close_caller_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("close caller ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, caller, socket = struct.unpack_from("<III", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "callerHex": f"0x{caller:08x}",
                    "socketHex": f"0x{socket:08x}",
                }
            )
        offset += RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII closesocket-caller ring probe.")
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
        patch_result = apply_close_caller_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_close_caller_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
