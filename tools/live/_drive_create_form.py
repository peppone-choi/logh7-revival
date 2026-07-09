#!/usr/bin/env python3
"""Login → force session picker (0x20) → try create-form entry paths.

근거:
- state 0x20/0x1c = 세션 피커 (LOGH VII 표시 라이브 확인)
- 메뉴 클릭은 state를 안 바꿈 → Frida setState 우회
- 생성 폼은 FUN_00594f20 계열 state 0x40+ 후보
"""
from __future__ import annotations

import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (
    find_client_hwnd,
    foreground,
    client_geometry,
    screenshot,
    do_login,
)

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
    time.sleep(0.12)


def dclick(sx: int, sy: int) -> None:
    click(sx, sy)
    time.sleep(0.1)
    click(sx, sy)


def main() -> int:
    sd = Path("server/data/agent-drive/create-form")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    print(f"hwnd={hwnd:#x} pid={pid.value}", flush=True)
    foreground(hwnd)

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(16):
            time.sleep(1)
            if not user32.IsWindow(hwnd):
                print("died settle", i, flush=True)
                return 2
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}", flush=True)
            if cw >= 1000 and i >= 11:
                break

    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy})", flush=True)
    screenshot(hwnd, sd / "01-settled.png")

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()
    print("base", script.exports_sync.scene(), flush=True)

    def force_picker() -> int:
        script.exports_sync.set_state(0x20)
        time.sleep(0.8)
        st = script.exports_sync.scene()["state"]
        if st not in (0x20, 0x1C, 0x1E, 0x2D, 0x2E, 0x2F):
            script.exports_sync.set_state(0x20)
            time.sleep(0.5)
            st = script.exports_sync.scene()["state"]
        return st

    # 1) open picker
    st = force_picker()
    print(f"picker state={st}(0x{st:x})", flush=True)
    screenshot(hwnd, sd / "02-picker.png")

    # 2) try create-related states while holding picker context
    # FUN_00594f20 character-management: 0x40-0x56
    # plus journal charge states around 0x46-0x48
    create_states = [
        0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
        0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F,
        0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56,
        # also try from picker-adjacent
        0x15, 0x18, 0x19, 0x1A, 0x1B, 0x1D, 0x1F, 0x21, 0x22,
    ]

    interesting = []
    for st_try in create_states:
        # reset to picker first so we have session context
        force_picker()
        r = script.exports_sync.set_state(st_try)
        time.sleep(0.7)
        cur = script.exports_sync.scene()["state"]
        # screenshot when state sticks near target or looks different from idle/picker
        stick = cur == st_try or cur in range(0x40, 0x58)
        if stick or cur not in (0x2A, 0x20, 0x1E, 0x2F, 0x17, 42, 32, 30, 47, 23):
            print(f"  try 0x{st_try:02x} write={r} now={cur}(0x{cur:x}) *", flush=True)
            screenshot(hwnd, sd / f"st-{st_try:02x}-now-{cur:02x}.png")
            interesting.append((st_try, cur))
        else:
            print(f"  try 0x{st_try:02x} -> {cur}(0x{cur:x})", flush=True)

    # 3) picker + dclick LOGH VII header, then force create states
    force_picker()
    time.sleep(0.5)
    # LOGH VII banner / top session card header
    for x, y in [(600, 255), (650, 260), (550, 255), (700, 270), (600, 290)]:
        print(f"dclick card ({x},{y})", flush=True)
        dclick(ox + x, oy + y)
        time.sleep(0.6)
        st = script.exports_sync.scene()["state"]
        print(f"  state={st}(0x{st:x})", flush=True)
        screenshot(hwnd, sd / f"card-{x}-{y}-st{st:02x}.png")

    # after card select, try create states again
    for st_try in [0x46, 0x47, 0x48, 0x40, 0x41, 0x42, 0x50, 0x54]:
        r = script.exports_sync.set_state(st_try)
        time.sleep(0.8)
        cur = script.exports_sync.scene()["state"]
        print(f"post-card try 0x{st_try:02x} -> {cur}(0x{cur:x})", flush=True)
        screenshot(hwnd, sd / f"post-card-st-{st_try:02x}-now-{cur:02x}.png")

    screenshot(hwnd, sd / "99-final.png")
    print("interesting", interesting, flush=True)
    print("final", script.exports_sync.scene(), flush=True)
    session.detach()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
