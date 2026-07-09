#!/usr/bin/env python3
"""Login → force scene state 0x20 (session picker) → click LOGH VII card → proceed."""
from __future__ import annotations

import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import find_client_hwnd, foreground, client_geometry, screenshot, do_login

SCRIPT = r"""
rpc.exports = {
  scene() {
    const p = ptr('0x02215e2c').readPointer();
    return { p: p.toString(), state: p.add(4).readU32() };
  },
  setState(v) {
    const p = ptr('0x02215e2c').readPointer();
    p.add(4).writeU32(v >>> 0);
    return p.add(4).readU32();
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


def dclick(sx: int, sy: int) -> None:
    click(sx, sy)
    time.sleep(0.12)
    click(sx, sy)


def main() -> int:
    sd = Path("server/data/agent-drive/session-drive")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    print(f"hwnd={hwnd:#x} pid={pid.value}")
    foreground(hwnd)

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(16):
            time.sleep(1)
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}")
            if cw >= 1000 and i >= 11:
                break
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy})")
    screenshot(hwnd, sd / "01-settled.png")

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()
    print("scene", script.exports_sync.scene())

    # open session picker via state 0x20 (live-proven)
    st = script.exports_sync.set_state(0x20)
    print("set state 0x20 ->", st, "now", script.exports_sync.scene())
    time.sleep(1.2)
    # re-assert if FSM moved away
    for _ in range(5):
        cur = script.exports_sync.scene()["state"]
        if cur in (0x20, 0x1C, 0x2D, 0x2E, 0x2F):
            break
        print("state drifted to", cur, "re-force 0x20")
        script.exports_sync.set_state(0x20)
        time.sleep(0.5)
    screenshot(hwnd, sd / "02-picker.png")
    print("picker scene", script.exports_sync.scene())

    # click top session card LOGH VII (measured from force-st-20 shot)
    # card roughly center panel: face ~520-560, body ~600-700, y~280-340
    candidates = [
        (600, 300),
        (650, 310),
        (550, 300),
        (700, 320),
        (600, 280),
        (600, 340),
        (520, 300),
    ]
    for i, (x, y) in enumerate(candidates):
        print(f"dclick session card {i} ({x},{y})")
        dclick(ox + x, oy + y)
        time.sleep(1.0)
        screenshot(hwnd, sd / f"03-card-{i}-{x}-{y}.png")
        st = script.exports_sync.scene()["state"]
        print("  state", st, hex(st))

    # try 戻る area and create after selection
    # if still on picker, click create menu
    print("click CREATE menu")
    click(ox + 164, oy + 256)
    time.sleep(1.0)
    script.exports_sync.set_state(0x20)
    time.sleep(0.8)
    screenshot(hwnd, sd / "04-after-create-menu.png")

    # double-click top card again then look for form fields
    dclick(ox + 600, oy + 300)
    time.sleep(1.2)
    screenshot(hwnd, sd / "05-after-select.png")
    print("final scene", script.exports_sync.scene())

    session.detach()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
