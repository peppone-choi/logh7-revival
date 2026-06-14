#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Final

ROBOT_TRIGGER_MAGIC: Final[bytes] = b"RST1"
RECORD_BYTES: Final[int] = 64
REGISTER_NAMES: Final[tuple[str, ...]] = ("eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi")
EVENT_NAMES: Final[dict[int, str]] = {
    1: "robotApiEntry",
    2: "robotBootstrap",
    3: "sessionBootstrapSetupCall.beforeCall",
    4: "sessionBootstrapSetupCall.afterCall",
}


def _hex(value: int) -> str:
    return f"0x{value:08x}"


def _decode_record(chunk: bytes, index: int) -> dict[str, object]:
    if chunk[:4] != ROBOT_TRIGGER_MAGIC:
        return {"index": index, "empty": True}
    event, site_id = struct.unpack_from("<BB", chunk, 4)
    hook_va, continuation_va, target_va = struct.unpack_from("<III", chunk, 8)
    saved = struct.unpack_from("<8I", chunk, 20)
    session_map, runtime_manager, client = struct.unpack_from("<III", chunk, 52)
    return {
        "index": index,
        "magic": "RST1",
        "event": event,
        "eventName": EVENT_NAMES.get(event, f"unknown-{event}"),
        "siteId": site_id,
        "hookVaHex": _hex(hook_va),
        "continuationVaHex": _hex(continuation_va),
        "targetVaHex": _hex(target_va),
        "savedRegisters": {name: _hex(value) for name, value in zip(REGISTER_NAMES, saved, strict=True)},
        "sessionMapGlobalHex": _hex(session_map),
        "runtimeManagerGlobalHex": _hex(runtime_manager),
        "clientGlobalHex": _hex(client),
    }


def _verdict(populated: list[dict[str, object]]) -> str:
    events = {int(record["event"]) for record in populated}
    if not populated:
        return "robot/autoclient bootstrap not reached in this run"
    if 4 in events:
        return "full session setup call returned; inspect saved eax and globals for manager state"
    if 3 in events:
        return "session setup call was reached but no post-call record was captured"
    if 2 in events:
        return "robot bootstrap reached but session setup call was not reached"
    return "only outer robot API entry reached"


def decode_robot_setup_trigger_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("robot setup trigger ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data):
        records.append(_decode_record(data[offset : offset + RECORD_BYTES], index))
        offset += RECORD_BYTES
        index += 1
    populated = [record for record in records if not record.get("empty")]
    return {
        "path": str(path),
        "bytes": len(data),
        "counter": counter,
        "populatedRecords": len(populated),
        "events": [record["eventName"] for record in populated],
        "verdict": _verdict(populated),
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Decode LOGH VII robot setup trigger probe ring.")
    parser.add_argument("ring", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        decoded = decode_robot_setup_trigger_ring(args.ring)
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
