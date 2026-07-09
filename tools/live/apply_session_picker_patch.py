#!/usr/bin/env python3
"""session-change-opens-picker + SJIS charset 패치를 g7mtclient.exe 에 적용.

근거: 2026-07-01 debug-journal — FUN_0051a370 case 0x1c no-op 을
case 0x19 피커 초기화(0x0051ad73)로 점프. 라이브 검증됨.
"""
from __future__ import annotations

import json
import shutil
import struct
from pathlib import Path

DEFAULT_EXE = Path(
    r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
)

# 로비 유지 + 세션 피커 오픈 (2026-07-01 live-verified 스택 최소 세트)
PATCHES = [
    {
        "name": "router-null-result-no-teardown",
        "va": 0x00613157,
        "original_hex": "e8d4190000",
        "patched_hex": "9090909090",
        "rationale": "NOP router teardown call so conn2 survives null frame",
    },
    {
        "name": "fsm-scene-active-gate-bypass",
        "va": 0x0051A39C,
        "original_hex": "0f84d8160000",
        "patched_hex": "909090909090",
        "rationale": "NOP scene-active early-exit so lobby FSM keeps ticking",
    },
    {
        "name": "session-change-opens-picker",
        "va": 0x0051ADED,
        "original_hex": "683c677800c7450416000000e8a275070083c404e9570c0000",
        "patched_hex": "e981ffffff9090909090909090909090909090909090909090",
        "rationale": (
            "FUN_0051a370 case 0x1c no-op -> jmp case 0x19 picker init 0x0051ad73"
        ),
    },
]

# CreateFontA charset push 1 -> SHIFTJIS 0x80
SJIS_SITES = (0x004AEDEB, 0x004B0B97)


def pe_va_to_off(data: bytes, va: int, image_base: int = 0x400000) -> int:
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    coff = e_lfanew + 4
    nsec = struct.unpack_from("<H", data, coff + 2)[0]
    opt_size = struct.unpack_from("<H", data, coff + 16)[0]
    sec_off = coff + 20 + opt_size
    rva = va - image_base
    for i in range(nsec):
        o = sec_off + i * 40
        vsize, vaddr, rsize, roff = struct.unpack_from("<IIII", data, o + 8)
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return roff + (rva - vaddr)
    raise ValueError(f"VA not in section: 0x{va:08x}")


def apply(exe: Path = DEFAULT_EXE) -> dict:
    backup = exe.with_suffix(".exe.bak-pre-session-picker")
    if not backup.exists():
        shutil.copy2(exe, backup)

    data = bytearray(exe.read_bytes())
    applied = []

    for spec in PATCHES:
        off = pe_va_to_off(data, spec["va"])
        orig = bytes.fromhex(spec["original_hex"])
        patch = bytes.fromhex(spec["patched_hex"])
        cur = bytes(data[off : off + len(orig)])
        if cur == patch:
            applied.append({**spec, "status": "already", "fileOffset": off})
        elif cur == orig:
            data[off : off + len(patch)] = patch
            applied.append({**spec, "status": "applied", "fileOffset": off})
        else:
            raise ValueError(
                f"{spec['name']} drift @0x{off:x}: expected {orig.hex()} got {cur.hex()}"
            )

    # SJIS font
    for va in SJIS_SITES:
        fo = pe_va_to_off(data, va)
        b = bytes(data[fo : fo + 2])
        if b == b"\x6a\x80":
            applied.append({"name": "sjis-charset", "va": va, "status": "already", "fileOffset": fo})
        elif b == b"\x6a\x01":
            data[fo : fo + 2] = b"\x6a\x80"
            applied.append({"name": "sjis-charset", "va": va, "status": "applied", "fileOffset": fo})
        else:
            applied.append(
                {
                    "name": "sjis-charset",
                    "va": va,
                    "status": f"unexpected:{b.hex()}",
                    "fileOffset": fo,
                }
            )

    exe.write_bytes(data)

    man = Path(__file__).resolve().parent / "patches" / "session-change-opens-picker.json"
    man.parent.mkdir(parents=True, exist_ok=True)
    man.write_text(
        json.dumps(
            {
                "exe": str(exe),
                "backup": str(backup),
                "patches": applied,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {"exe": str(exe), "backup": str(backup), "patches": applied}


if __name__ == "__main__":
    print(json.dumps(apply(), ensure_ascii=False, indent=2))
