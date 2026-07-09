#!/usr/bin/env python3
"""On session picker (state 0x20), dense-scan LOGH VII card for create-form entry."""
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
    p.add(4).writeU32(v >>> 0);
    return p.add(4).readU32();
  }
};
"""


def click(sx: int, sy: int) -> None:
    user32.SetCursorPos(int(sx), int(sy))
    time.sleep(0.08)
    user32.mouse_event(2, 0, 0, 0, 0)
    time.sleep(0.04)
    user32.mouse_event(4, 0, 0, 0, 0)
    time.sleep(0.1)


def dclick(sx: int, sy: int) -> None:
    click(sx, sy)
    time.sleep(0.08)
    click(sx, sy)


def main() -> int:
    sd = Path("server/data/agent-drive/session-drive2")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy})")

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()

    script.exports_sync.set_state(0x20)
    time.sleep(1.0)
    print("picker", script.exports_sync.scene())
    screenshot(hwnd, sd / "01-picker.png")

    # create menu + keep picker
    click(ox + 164, oy + 256)
    time.sleep(0.5)
    script.exports_sync.set_state(0x20)
    time.sleep(0.5)
    screenshot(hwnd, sd / "02-create-hl.png")

    interesting = {0x20, 0x1E, 0x2A, 0x2F, 0x1C, 0x2D, 0x2E, 0x15, 0x16, 0x17}
    found = []
    pts = []
    for y in range(230, 380, 12):
        for x in range(470, 800, 30):
            pts.append((x, y))

    print(f"scan {len(pts)} pts")
    for i, (x, y) in enumerate(pts):
        dclick(ox + x, oy + y)
        time.sleep(0.28)
        st = script.exports_sync.scene()["state"]
        if st not in interesting and st not in (32, 30, 42, 47):
            print(f"NEW state {st}(0x{st:x}) at ({x},{y})")
            screenshot(hwnd, sd / f"new-{x}-{y}-st{st:02x}.png")
            found.append((x, y, st))
        if i % 12 == 0:
            print(f"  i={i} ({x},{y}) st={st}(0x{st:x})")
            # re-open picker if lost
            if st in (0x2A, 42):
                script.exports_sync.set_state(0x20)
                time.sleep(0.3)

    screenshot(hwnd, sd / "03-final.png")
    print("final", script.exports_sync.scene())
    print("found", found)
    session.detach()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
