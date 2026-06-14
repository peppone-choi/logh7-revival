"""Ground-truth probe for the world-entry crash (G162): read the live client's PLAYER_INFO
table and the session/unit/focus state, to settle WHY the HUD FUN_004c7290(focusId) returns 0.

Run this against a WORLD-LOADED client (use the world-crash patch so it survives the [0x80]
read), driven with LOGH_WORLD_PLAYER=1. It reports:
  - clientBase = *(0x7ccffc)
  - focusCharId   @ clientBase+0x3584a0   (selected char id, set by 0x0204; the HUD lookup key)
  - sessionCount  @ clientBase+0x36a5dc   (number of 0x0323 records appended)
  - singletonRec0 @ clientBase+0x36a5e0   (the "my session" record[0] = char id)
  - sessionArr0   @ clientBase+0x36a8b4   (record[0] and record[9]=unit id of array slot 0)
  - unitCount     @ clientBase+0x41a364   (u16; 0x0325 unit table count)
  - unit0Id       @ clientBase+0x41a368   (first unit's id)
  - PLAYER_INFO   @ clientBase+0xc, stride 0x370, 592 slots: every ACTIVE slot (byte0!=0) with
    its id (slot+0x24). FUN_004c7290 returns non-null iff some active slot has id==focusCharId.

Usage: python -m tools.logh7_player_info_probe --pid <PID> [--out probe.json]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from tools.logh7_live_entity_scan import (
    CLIENT_OBJECT_POINTER_VA,
    _open_process,
    _read_process_memory,
)

PLAYER_INFO_BASE_OFFSET = 0x0C
PLAYER_INFO_STRIDE = 0x370
PLAYER_INFO_SLOTS = 592
PLAYER_INFO_ID_OFFSET = 0x24

FOCUS_CHAR_ID_OFFSET = 0x3584A0
SESSION_COUNT_OFFSET = 0x36A5DC
SINGLETON_REC0_OFFSET = 0x36A5E0
SESSION_ARRAY_OFFSET = 0x36A8B4
SESSION_RECORD_STRIDE = 0x2D4
UNIT_COUNT_OFFSET = 0x41A364
UNIT0_OFFSET = 0x41A368
UNIT_RECORD_STRIDE = 0x58


def _u32(process: int, address: int) -> int:
    return int.from_bytes(_read_process_memory(process, address, 4), "little")


def _u16(process: int, address: int) -> int:
    return int.from_bytes(_read_process_memory(process, address, 2), "little")


def probe(pid: int) -> dict[str, object]:
    process = _open_process(pid)
    client = _u32(process, CLIENT_OBJECT_POINTER_VA)
    if client == 0:
        return {"pid": pid, "clientObject": 0, "error": "client object pointer is null"}

    focus_char_id = _u32(process, client + FOCUS_CHAR_ID_OFFSET)
    session_count = _u32(process, client + SESSION_COUNT_OFFSET)
    singleton_rec0 = _u32(process, client + SINGLETON_REC0_OFFSET)
    session_arr0_rec0 = _u32(process, client + SESSION_ARRAY_OFFSET + 0x00)
    session_arr0_rec9 = _u32(process, client + SESSION_ARRAY_OFFSET + 0x24)
    unit_count = _u16(process, client + UNIT_COUNT_OFFSET)
    unit0_id = _u32(process, client + UNIT0_OFFSET)

    # Walk the PLAYER_INFO table (read it in one block, then parse) and list active slots.
    table = _read_process_memory(process, client + PLAYER_INFO_BASE_OFFSET, PLAYER_INFO_STRIDE * PLAYER_INFO_SLOTS)
    active = []
    for i in range(PLAYER_INFO_SLOTS):
        base = i * PLAYER_INFO_STRIDE
        if table[base] == 0:
            continue
        slot_id = int.from_bytes(table[base + PLAYER_INFO_ID_OFFSET : base + PLAYER_INFO_ID_OFFSET + 4], "little")
        active.append({"slot": i, "idHex": f"0x{slot_id:08x}", "id": slot_id})

    focus_match = any(s["id"] == focus_char_id for s in active)
    return {
        "pid": pid,
        "clientObjectHex": f"0x{client:08x}",
        "focusCharId": focus_char_id,
        "focusCharIdHex": f"0x{focus_char_id:08x}",
        "sessionCount": session_count,
        "singletonRecord0": singleton_rec0,
        "sessionArray0Record0": session_arr0_rec0,
        "sessionArray0Record9_unitId": session_arr0_rec9,
        "unitCount": unit_count,
        "unit0Id": unit0_id,
        "playerInfoActiveCount": len(active),
        "playerInfoActiveSlots": active[:16],
        "focusMatchesAnActiveSlot": focus_match,
        "verdict": (
            "PLAYER_INFO has a slot matching focusCharId -> FUN_004c7290 returns non-null (no crash expected)"
            if focus_match
            else "NO active PLAYER_INFO slot matches focusCharId -> FUN_004c7290 returns 0 -> HUD [0x80] crash"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--out", type=Path, default=Path(".omo/player-info-probe.json"))
    args = parser.parse_args()
    result = probe(args.pid)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text + "\n", encoding="utf-8")
    print(text)
    print(f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
