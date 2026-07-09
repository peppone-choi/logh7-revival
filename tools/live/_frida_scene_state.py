#!/usr/bin/env python3
"""Read/write lobby scene state (DAT_02215e2c+4) while clicking menu / forcing states."""
from __future__ import annotations

import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import find_client_hwnd, foreground, client_geometry, screenshot

SCRIPT = r"""
rpc.exports = {
  scene() {
    const p = ptr('0x02215e2c').readPointer();
    return { p: p.toString(), state: p.add(4).readU32() };
  },
  setState(v) {
    const p = ptr('0x02215e2c').readPointer();
    const before = p.add(4).readU32();
    p.add(4).writeU32(v >>> 0);
    return { before: before, after: p.add(4).readU32() };
  }
};
"""


def click(sx: int, sy: int) -> None:
    user32.SetCursorPos(int(sx), int(sy))
    time.sleep(0.1)
    user32.mouse_event(2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(4, 0, 0, 0, 0)
    time.sleep(0.15)


def main() -> int:
    sd = Path("server/data/agent-drive/fsm-probe3")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy}) pid={pid.value}")

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()
    print("base", script.exports_sync.scene())

    for lab, y in [
        ("SESSION", 429),
        ("CREATE", 256),
        ("START", 192),
        ("SETTINGS", 480),
        ("DELETE", 371),
    ]:
        click(ox + 700, oy + 620)
        time.sleep(0.4)
        before = script.exports_sync.scene()
        click(ox + 164, oy + y)
        time.sleep(1.2)
        after = script.exports_sync.scene()
        print(
            f"{lab:10s} y={y} state {before['state']}(0x{before['state']:x})"
            f" -> {after['state']}(0x{after['state']:x})"
        )
        screenshot(hwnd, sd / f"st-{lab.lower()}.png")

    # force journal states
    for st in [0x15, 0x1C, 0x19, 0x2D, 0x2E, 0x16, 0x17, 0x20, 0x2A]:
        r = script.exports_sync.set_state(st)
        time.sleep(0.9)
        cur = script.exports_sync.scene()
        print(
            f"set 0x{st:02x}: before={r['before']} after_write={r['after']}"
            f" now={cur['state']}(0x{cur['state']:x})"
        )
        screenshot(hwnd, sd / f"force-st-{st:02x}.png")

    session.detach()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
