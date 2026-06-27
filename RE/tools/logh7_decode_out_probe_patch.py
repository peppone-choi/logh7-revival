"""Runtime probe: capture the child-decode result + decoded output at FUN_006130a0 0x613196.

With the server 4-byte subheader, conn2 now reaches the decode dispatch (0x613193 call [edx+0x18])
but decipher fails (mgr baseline stays 0). This hooks right after the decode (0x613196 `test al,al`)
and records: al (decode success/fail) + the first 16 bytes of the output buffer [esi+0x18] (the
decrypted body). A valid body starts [u16 checksum][u32 id][u16 innerLen][inner 0x2001...]; garbage
=> wrong key, a short/zero tail => wrong length. esi = transport.

Displaces `test al,al` (84 c0) + short `jne 0x6131b7` (75 1d) +
`mov esi,[esp+0x1c]` (8b 74 24 1c) = 8 bytes, replays the same branch and falls through to
0x61319e after replaying the displaced mov.
Record (32B): [magic][counter][al][esi][out0..11 (12 bytes)].
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import RuntimeCodeCave, enable_section_write_for_virtual_address, find_runtime_probe_code_cave
from tools.logh7_x86_patch import X86Builder, hook_jump

HOOK_VA: Final[int] = 0x00613196
CONTINUATION_VA: Final[int] = 0x0061319E
JNE_TARGET_VA: Final[int] = 0x006131B7
HOOK_LENGTH: Final[int] = 8
ORIGINAL_HEX: Final[str] = "84c0751d8b74241c"
BUFFER_OFFSET: Final[int] = 176
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7DO"


@dataclass(frozen=True, slots=True)
class DecodeOutProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str

    def to_json(self) -> dict[str, object]:
        return {
            "hook": {
                "virtualAddressHex": f"0x{HOOK_VA:08x}",
                "continuationHex": f"0x{CONTINUATION_VA:08x}",
                "originalHex": ORIGINAL_HEX,
                "bytesHex": self.hook_bytes_hex,
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{self.cave.virtual_address + BUFFER_OFFSET:08x}",
                "recordCapacity": RECORD_CAPACITY,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "recordFormat": {"magic": MAGIC.hex(), "recordBytes": RECORD_BYTES},
        }


def apply_decode_out_probe_patch(source: Path, out: Path, manifest_out: Path) -> DecodeOutProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"decode post bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")
    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("decode-out probe exceeds code cave")
    patched = bytearray(raw)
    enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))
    patch = DecodeOutProbePatch(cave, hook_bytes.hex())
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    counter_va = buffer_va
    records_va = buffer_va + 8
    b = X86Builder(base_va)
    b.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    b.append(b"\xa1"); b.u32(counter_va)
    b.append(b"\xbf"); b.u32(records_va)
    b.append(b"\x8b\xc8\x83\xe1\x0f\xc1\xe1\x05\x03\xf9")  # slot = records + (counter&0xf)*0x20
    b.append(b"\xc7\x07"); b.u32(int.from_bytes(MAGIC, "little"))
    b.append(b"\x89\x47\x04")  # [edi+4]=counter
    b.append(b"\xff\x05"); b.u32(counter_va)
    # al = saved eax low byte: saved eax at [esp+0x1c] after pushfd+pushad
    b.append(b"\x8b\x44\x24\x1c\x89\x47\x08")  # mov eax,[esp+0x1c]; mov [edi+8],eax (full eax; low byte=al)
    b.append(b"\x89\x77\x0c")  # [edi+0xc] = esi (transport)
    # The decode output argument is lea edi,[esi+0x18], so decoded bytes are inline in transport.
    b.append(b"\x8b\x46\x18\x89\x47\x10")
    b.append(b"\x8b\x46\x1c\x89\x47\x14")
    b.append(b"\x8b\x46\x20\x89\x47\x18")
    b.append(b"\x61\x9d")  # popad; popfd
    # Replay the displaced short-JNE block with a rel32 jump because the trampoline is out of range.
    b.append(b"\x84\xc0")  # test al,al
    b.append(b"\x0f\x85"); b.u32((JNE_TARGET_VA - (base_va + len(b.data) + 4)) & 0xFFFFFFFF)  # jne 0x6131b7
    b.append(b"\x8b\x74\x24\x1c")
    b.jmp_rel32(CONTINUATION_VA)
    if len(b.data) > BUFFER_OFFSET:
        raise ValueError("overlap")
    while len(b.data) < BUFFER_OFFSET:
        b.u8(0x90)
    b.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(b.data)


def decode_decode_out(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    counter = struct.unpack_from("<I", data, 0)[0]
    out = []
    off = 8
    while off + RECORD_BYTES <= len(data):
        chunk = data[off : off + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            cnt, al, tr, o0, o1, o2 = struct.unpack_from("<IIIIII", chunk, 4)
            body = struct.pack("<III", o0, o1, o2)
            checksum = struct.unpack(">H", body[0:2])[0]
            mid = struct.unpack(">I", body[2:6])[0]
            innerlen = struct.unpack(">H", body[6:8])[0]
            inner = struct.unpack(">H", body[8:10])[0]
            out.append({"counter": cnt, "decodeAl": al & 0xff, "transportHex": f"0x{tr:08x}",
                        "outBodyHex": body.hex(), "checksum": f"0x{checksum:04x}", "id": mid,
                        "innerLen": innerlen, "innerCodeHex": f"0x{inner:04x}"})
        off += RECORD_BYTES
    out.sort(key=lambda r: r["counter"])
    return {"counter": counter, "records": out}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    pp = sub.add_parser("patch"); pp.add_argument("source", type=Path); pp.add_argument("--out", type=Path, required=True); pp.add_argument("--manifest-out", type=Path, required=True)
    dd = sub.add_parser("decode"); dd.add_argument("ring", type=Path)
    args = p.parse_args()
    if args.command == "patch":
        print(json.dumps(apply_decode_out_probe_patch(args.source, args.out, args.manifest_out).to_json(), ensure_ascii=False, indent=2)); return 0
    print(json.dumps(decode_decode_out(args.ring), ensure_ascii=False, indent=2)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
