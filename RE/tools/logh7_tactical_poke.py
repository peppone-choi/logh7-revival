"""Tactical-mode poke (G196): force the live client into tactical mode so the server-fed unit
table (0x33b) populates the tactical active-unit pool clientBase+0x126718 — the universal gate
for in-world interactivity (controllable ships AND chat).

WHY a poke is needed (proven by workflows wxwn9n6u6 + wnxq1e3hz, HIGH confidence): the only thing
that populates 0x126718 is FUN_004c32a0, which hard-gates on the mode byte clientBase+0x126711==0.
That byte is written by ZERO server-message handlers and is measured ==2 (strategic) in our world
spawn. So a pure server message stream cannot flip it; the irreducible step is a 1-byte runtime
poke 0x126711=0, timed AFTER world-load and BEFORE the grid-enter (0xb09/0xb0a) the server emits.
This pokes only live process memory — the on-disk EXE is never modified (SHA stays pristine).

Recipe (this tool = STEP 1; server provides the rest):
  STEP 0  server: LOGH_WORLD_PLAYER=1 (0x0325 unit table, unitCount!=0)
  STEP 1  THIS:   poke clientBase+0x126711 = 0   (tactical mode)
  STEP 2  server: LOGH_TACTICS_UNIT=1 (0x33b -> clientBase+0x4271a8, one controllable unit)
  STEP 3+4 server: LOGH_GRID_ENTER=1 (0xb09 + 0xb0a) -> FUN_004c32a0 populates 0x126718

Usage:
  python -m tools.logh7_tactical_poke probe --pid <PID>            # read mode/pool, no write
  python -m tools.logh7_tactical_poke poke  --pid <PID>            # poke mode byte = 0, report before/after
"""
from __future__ import annotations

import argparse
import ctypes
import json
from ctypes import wintypes

from tools.logh7_live_entity_scan import CLIENT_OBJECT_POINTER_VA, _read_process_memory

MODE_BYTE_OFFSET = 0x126711  # 0 = tactical, 2 = strategic
TACTICAL_POOL_OFFSET = 0x126718  # tactical active-unit pool head
TACTICS_INFO_OFFSET = 0x4271A8  # 0x33b unit table dest; [u16 count]
UNIT_COUNT_OFFSET = 0x41A364  # 0x0325 unit table count (u16)

_PROCESS_VM_READ = 0x0010
_PROCESS_VM_WRITE = 0x0020
_PROCESS_VM_OPERATION = 0x0008
_PROCESS_QUERY_INFORMATION = 0x0400


def _open_process_rw(pid: int) -> int:
    access = _PROCESS_VM_READ | _PROCESS_VM_WRITE | _PROCESS_VM_OPERATION | _PROCESS_QUERY_INFORMATION
    handle = ctypes.windll.kernel32.OpenProcess(access, False, pid)
    if handle == 0:
        raise OSError(f"OpenProcess(RW) failed for pid {pid} (run elevated?)")
    return handle


def _write_process_memory(process: int, address: int, data: bytes) -> int:
    written = ctypes.c_size_t()
    ok = ctypes.windll.kernel32.WriteProcessMemory(
        wintypes.HANDLE(process),
        ctypes.c_void_p(address),
        data,
        len(data),
        ctypes.byref(written),
    )
    if ok == 0:
        raise OSError(f"WriteProcessMemory failed at 0x{address:08x} (GetLastError={ctypes.get_last_error()})")
    return written.value


def _u8(process: int, address: int) -> int:
    return _read_process_memory(process, address, 1)[0]


def _u16(process: int, address: int) -> int:
    return int.from_bytes(_read_process_memory(process, address, 2), "little")


def _read_state(process: int, client: int) -> dict[str, object]:
    return {
        "clientBaseHex": f"0x{client:08x}",
        "modeByte": _u8(process, client + MODE_BYTE_OFFSET),  # 0=tactical 2=strategic
        "poolHead": _u8(process, client + TACTICAL_POOL_OFFSET),  # non-zero once populated
        "tacticsInfoCount": _u16(process, client + TACTICS_INFO_OFFSET),  # 0x33b count landed?
        "unitTableCount": _u16(process, client + UNIT_COUNT_OFFSET),  # 0x0325 count
    }


def probe(pid: int) -> dict[str, object]:
    process = _open_process_rw(pid)
    client = int.from_bytes(_read_process_memory(process, CLIENT_OBJECT_POINTER_VA, 4), "little")
    if client == 0:
        return {"pid": pid, "error": "client object pointer is null (not world-loaded yet)"}
    state = _read_state(process, client)
    state["pid"] = pid
    state["interpretation"] = (
        "mode tactical (0); pool populated" if state["modeByte"] == 0 and state["poolHead"] != 0
        else "mode tactical (0); pool still empty" if state["modeByte"] == 0
        else "mode strategic (2); tactical pool gated off"
    )
    return state


def poke(pid: int) -> dict[str, object]:
    process = _open_process_rw(pid)
    client = int.from_bytes(_read_process_memory(process, CLIENT_OBJECT_POINTER_VA, 4), "little")
    if client == 0:
        return {"pid": pid, "error": "client object pointer is null (not world-loaded yet)"}
    before = _read_state(process, client)
    _write_process_memory(process, client + MODE_BYTE_OFFSET, b"\x00")
    after = _read_state(process, client)
    return {
        "pid": pid,
        "before": before,
        "after": after,
        "poked": "clientBase+0x126711 = 0",
        "ok": after["modeByte"] == 0,
        "note": "now send grid-enter (LOGH_GRID_ENTER=1) so FUN_004c32a0 populates 0x126718; re-probe poolHead",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("probe", help="read mode/pool state (no write)")
    p.add_argument("--pid", type=int, required=True)
    p.set_defaults(func=lambda a: probe(a.pid))
    k = sub.add_parser("poke", help="poke mode byte 0x126711 = 0 (tactical)")
    k.add_argument("--pid", type=int, required=True)
    k.set_defaults(func=lambda a: poke(a.pid))
    args = parser.parse_args()
    result = args.func(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
