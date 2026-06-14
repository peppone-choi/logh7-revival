#!/usr/bin/env python3
"""Decode the handler-map factory argument ring dumped by logh7_factory_probe_patch.

Buffer layout (see logh7_factory_probe_patch): u32 counter, u32 pad, then up to
FACTORY_RECORD_CAPACITY 64-byte records. Each record:
  magic 'FPB1', callIndex, arg1..arg12 (the factory's 12 stdcall arguments).

The decoder labels the guard arguments so a QA run can tell at a glance whether a
factory guard failed (arg5/arg7/arg8/arg9/arg10 == 0 -> map never built) or whether
the factory proceeded (so an empty map came from a ctor descriptor/count of 0).
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Final

FACTORY_PROBE_MAGIC: Final[bytes] = b"FPB1"
FACTORY_RECORD_BYTES: Final[int] = 64
FACTORY_ARG_COUNT: Final[int] = 12
# Factory 0x00612030 guard chain reads (verified against the prologue): the test/je
# at 0x00612037..0x0061205c gate args 5,6,7,8,9. arg8/arg9 are 16-bit (test bp/bx).
# arg10..arg12 are NOT guards (they are forwarded to ctor 0x006127d0 as descriptor/count).
GUARD_ARGS: Final[dict[int, str]] = {
    5: "guard (edx=[esp+0x14]); 0 -> factory bails, map never built",
    6: "guard (eax)",
    7: "guard (esi)",
    8: "guard word (bp)",
    9: "guard word (bx)",
}


def decode_factory_probe_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("factory probe ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + FACTORY_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + FACTORY_RECORD_BYTES]
        magic = chunk[:4]
        if magic != FACTORY_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
            offset += FACTORY_RECORD_BYTES
            index += 1
            continue
        call_index = struct.unpack_from("<I", chunk, 4)[0]
        args = list(struct.unpack_from("<12I", chunk, 8))
        word_guards = {8, 9}

        def _guard_zero(n: int) -> bool:
            value = args[n - 1]
            return (value & 0xFFFF) == 0 if n in word_guards else value == 0

        guards = {
            f"arg{n}": {"valueHex": f"0x{args[n - 1]:08x}", "isZero": _guard_zero(n), "role": role}
            for n, role in GUARD_ARGS.items()
        }
        failed = sorted(n for n in GUARD_ARGS if _guard_zero(n))
        records.append(
            {
                "index": index,
                "magic": magic.decode("ascii"),
                "callIndex": call_index,
                "args": [f"0x{value:08x}" for value in args],
                "guards": guards,
                "failedGuardArgs": [f"arg{n}" for n in failed],
                "verdict": (
                    f"factory bails at arg{failed[0]} -> handler map never built"
                    if failed
                    else "all guards pass -> factory reaches ctor; empty map (if any) comes from descriptor/count"
                ),
            }
        )
        offset += FACTORY_RECORD_BYTES
        index += 1
    populated = [r for r in records if not r.get("empty")]
    return {
        "path": str(path),
        "bytes": len(data),
        "counter": counter,
        "populatedRecords": len(populated),
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Decode LOGH VII handler-map factory argument ring.")
    parser.add_argument("ring", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        decoded = decode_factory_probe_ring(args.ring)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
