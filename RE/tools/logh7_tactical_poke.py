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
import struct
from ctypes import wintypes

from tools.logh7_live_entity_scan import CLIENT_OBJECT_POINTER_VA, _read_process_memory

GRID_ACTIVE_OFFSET = 0x126710
MODE_BYTE_OFFSET = 0x126711  # 0 = tactical, 2 = strategic
TACTICAL_POOL_OFFSET = 0x126718  # tactical active-unit pool head
WORLD_ACTIVE_OFFSET = 0x2A58F8
GRID_SELECTOR_DWORD_OFFSET = 0x35F358
MODE_SELECTOR_OFFSET = 0x35F35A
TRANSITION_GATE_OFFSET = 0x357E84
TRANSITION_FLOAT_OFFSET = 0x357E88
TRANSITION_MODE_OFFSET = 0x357E8C
PREVIOUS_MODE_OFFSET = 0x358382
TACTICS_INFO_OFFSET = 0x4271A8  # 0x33b unit table dest; [u16 count]
UNIT_COUNT_OFFSET = 0x41A364  # 0x0325 unit table count (u16)

_PROCESS_VM_READ = 0x0010
_PROCESS_VM_WRITE = 0x0020
_PROCESS_VM_OPERATION = 0x0008
_PROCESS_QUERY_INFORMATION = 0x0400


def _open_process_read(pid: int) -> int:
    access = _PROCESS_VM_READ | _PROCESS_QUERY_INFORMATION
    handle = ctypes.windll.kernel32.OpenProcess(access, False, pid)
    if handle == 0:
        raise OSError(f"OpenProcess(READ) failed for pid {pid} (run elevated?)")
    return handle


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


def _raw_probe(process: int, address: int, size: int) -> dict[str, object]:
    raw = _read_process_memory(process, address, size)
    probe: dict[str, object] = {
        "addressHex": f"0x{address:08x}",
        "rawHex": raw.hex(),
    }
    if size >= 2:
        probe["u16le"] = int.from_bytes(raw[:2], "little")
        probe["u16be"] = int.from_bytes(raw[:2], "big")
    if size >= 4:
        probe["u32le"] = int.from_bytes(raw[:4], "little")
        probe["u32be"] = int.from_bytes(raw[:4], "big")
    return probe


def _f32_probe(process: int, address: int) -> dict[str, object]:
    probe = _raw_probe(process, address, 4)
    probe["f32le"] = struct.unpack("<f", bytes.fromhex(str(probe["rawHex"])))[0]
    return probe


def _read_state(process: int, client: int) -> dict[str, object]:
    mode = _u8(process, client + MODE_BYTE_OFFSET)
    pool_head = _u8(process, client + TACTICAL_POOL_OFFSET)
    tactics_count = _raw_probe(process, client + TACTICS_INFO_OFFSET, 2)
    unit_count = _raw_probe(process, client + UNIT_COUNT_OFFSET, 2)
    return {
        "clientBaseHex": f"0x{client:08x}",
        "gridActiveFlag": _u8(process, client + GRID_ACTIVE_OFFSET),
        "gridActiveProbe": _raw_probe(process, client + GRID_ACTIVE_OFFSET, 1),
        "modeByte": mode,  # 0=tactical 2=strategic
        "modeByteProbe": _raw_probe(process, client + MODE_BYTE_OFFSET, 1),
        "gridSelectorDword35f358Probe": _raw_probe(process, client + GRID_SELECTOR_DWORD_OFFSET, 4),
        "modeSelector35f35a": _u8(process, client + MODE_SELECTOR_OFFSET),
        "modeSelector35f35aProbe": _raw_probe(process, client + MODE_SELECTOR_OFFSET, 1),
        "previousMode358382": _u8(process, client + PREVIOUS_MODE_OFFSET),
        "previousMode358382Probe": _raw_probe(process, client + PREVIOUS_MODE_OFFSET, 1),
        "worldActive2a58f8": _u8(process, client + WORLD_ACTIVE_OFFSET),
        "worldActive2a58f8Probe": _raw_probe(process, client + WORLD_ACTIVE_OFFSET, 4),
        "transitionGate357e84": _u8(process, client + TRANSITION_GATE_OFFSET),
        "transitionGate357e84Probe": _raw_probe(process, client + TRANSITION_GATE_OFFSET, 1),
        "transitionFloat357e88Probe": _f32_probe(process, client + TRANSITION_FLOAT_OFFSET),
        "transitionMode357e8cProbe": _raw_probe(process, client + TRANSITION_MODE_OFFSET, 4),
        "poolHead": pool_head,  # non-zero once populated
        "poolHeadProbe": _raw_probe(process, client + TACTICAL_POOL_OFFSET, 4),
        "tacticsInfoCount": tactics_count["u16le"],  # legacy field; see tacticsInfoCountProbe.
        "tacticsInfoCountProbe": tactics_count,
        "tacticsInfoFirstRecord0Probe": _raw_probe(process, client + TACTICS_INFO_OFFSET + 4, 4),
        "tacticsInfoFirstRecord8Probe": _raw_probe(process, client + TACTICS_INFO_OFFSET + 12, 4),
        "unitTableCount": unit_count["u16le"],  # legacy field; server traces often compare BE too.
        "unitTableCountProbe": unit_count,
        "unitTableFirstRecord0Probe": _raw_probe(process, client + UNIT_COUNT_OFFSET + 4, 4),
        "unitTableFirstRecord4Probe": _raw_probe(process, client + UNIT_COUNT_OFFSET + 8, 4),
    }


def probe(pid: int) -> dict[str, object]:
    process = _open_process_read(pid)
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
