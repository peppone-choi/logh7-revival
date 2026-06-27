from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Final

JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

NULL_LIST_MAGIC: Final[bytes] = b"SNL1"
RECORD_BYTES: Final[int] = 64
FIELD_NAMES: Final[tuple[str, ...]] = (
    "loadedEsi",
    "connectionThis",
    "socketHandle",
    "state78",
    "error7c",
    "member80",
    "member84",
    "runtimeManagerGlobal",
    "clientGlobal",
    "stackCode",
    "savedEax",
    "savedEdi",
)


def _hex(value: int) -> str:
    return f"0x{value:08x}"


def _decode_record(chunk: bytes, index: int) -> dict[str, JsonValue]:
    if chunk[:4] != NULL_LIST_MAGIC:
        return {"index": index, "magicHex": chunk[:4].hex(), "empty": True}
    event, site_id, branch_taken, reserved = struct.unpack_from("<BBBB", chunk, 4)
    false_continuation, true_target = struct.unpack_from("<II", chunk, 8)
    values = struct.unpack_from("<12I", chunk, 16)
    record: dict[str, JsonValue] = {
        "index": index,
        "magic": "SNL1",
        "event": event,
        "siteId": site_id,
        "branchTaken": branch_taken,
        "reserved": reserved,
        "falseContinuationHex": _hex(false_continuation),
        "trueTargetHex": _hex(true_target),
    }
    for name, value in zip(FIELD_NAMES, values, strict=True):
        record[f"{name}Hex"] = _hex(value)
        record[name] = value
    record["loadedEsiIsNull"] = int(record["loadedEsi"]) == 0
    record["verdict"] = (
        "null-list cleanup branch selected"
        if int(record["branchTaken"]) == 1 and int(record["loadedEsi"]) == 0
        else "non-null list or non-cleanup path observed"
    )
    return record


def _verdict(records: list[dict[str, JsonValue]]) -> str:
    if not records:
        return "null-list cleanup not observed"
    selected = [
        record
        for record in records
        if int(record.get("branchTaken", 0)) == 1 and int(record.get("loadedEsi", 1)) == 0
    ]
    if selected:
        return "null-list cleanup observed"
    return "dispatcher reached without null-list cleanup"


def decode_socket_dispatcher_null_list_ring(path: Path) -> dict[str, JsonValue]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("socket dispatcher null-list ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, JsonValue]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data):
        records.append(_decode_record(data[offset : offset + RECORD_BYTES], index))
        offset += RECORD_BYTES
        index += 1
    populated = [record for record in records if not bool(record.get("empty", False))]
    return {
        "path": str(path),
        "bytes": len(data),
        "counter": counter,
        "populatedRecords": len(populated),
        "verdict": _verdict(populated),
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Decode LOGH VII socket dispatcher null-list probe ring.")
    parser.add_argument("ring", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        decoded = decode_socket_dispatcher_null_list_ring(args.ring)
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
