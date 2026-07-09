#!/usr/bin/env python3
"""Create path: force case0x1a body → session picker → dclick LOGH VII → form.

서버 수정 후: 0x2009 create-pending → 0x200a (월드 진입 없음).
성공 기준: 생성 폼 UI 또는 0x1008 와이어.
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
'use strict';
const SCENE = ptr('0x02215e2c');
const MODE_A = ptr('0x02217398');
const MODE_B = ptr('0x0221670c');
rpc.exports = {
  snap() {
    const p = SCENE.readPointer();
    return {
      state: p.add(4).readU32(),
      modeA: MODE_A.readU32(),
      modeB: MODE_B.readU32(),
    };
  },
  forceCreate() {
    const p = SCENE.readPointer();
    const before = p.add(4).readU32();
    MODE_A.writeU32(0x40);
    MODE_B.writeU32(0x30);
    p.add(4).writeU32(0x2d);
    return { before: before, after: p.add(4).readU32(), modeA: 0x40 };
  },
};
"""


def click(sx: int, sy: int) -> None:
    user32.SetCursorPos(int(sx), int(sy))
    time.sleep(0.08)
    user32.mouse_event(2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(4, 0, 0, 0, 0)
    time.sleep(0.12)


def dclick(sx: int, sy: int) -> None:
    click(sx, sy)
    time.sleep(0.1)
    click(sx, sy)


def main() -> int:
    sd = Path("server/data/agent-drive/create-to-form")
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
                print("died", i, flush=True)
                return 2
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}", flush=True)
            if cw >= 1000 and i >= 11:
                break

    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch}", flush=True)
    screenshot(hwnd, sd / "01-lobby.png")

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()
    print("snap0", script.exports_sync.snap(), flush=True)

    print("=== force create picker ===", flush=True)
    print(script.exports_sync.force_create(), flush=True)
    time.sleep(1.2)
    print("snap1", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "02-picker.png")

    # Pure session rows (create mode): LOGH VII top card center ~ (600, 230-280)
    # From 02-force-1a-body: LOGH VII row mid-upper, LOGH7-B below
    points = [
        (600, 230),
        (600, 250),
        (600, 270),
        (550, 240),
        (650, 250),
        (600, 320),  # LOGH7-B
        (600, 340),
    ]
    advanced = False
    for i, (x, y) in enumerate(points):
        print(f"=== dclick ({x},{y}) ===", flush=True)
        st = script.exports_sync.snap()["state"]
        # 피커(0x2d~0x35) 를 벗어난 상태면 재강제·추가 클릭 금지
        if st not in (0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x17, 23):
            print(f"  left picker (state=0x{st:x}), stop — no re-force", flush=True)
            screenshot(hwnd, sd / f"03-left-st{st:02x}.png")
            advanced = True
            break
        dclick(ox + x, oy + y)
        time.sleep(1.5)
        snap = script.exports_sync.snap()
        print(f"  snap {snap}", flush=True)
        screenshot(hwnd, sd / f"03-dclick-{i}-{x}-{y}-st{snap['state']:02x}.png")
        if snap["state"] not in (0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35):
            print(f"  ** advanced to 0x{snap['state']:x} — hold **", flush=True)
            time.sleep(3.0)
            screenshot(hwnd, sd / f"04-hold-st{snap['state']:02x}.png")
            advanced = True
            break

    if advanced:
        # 폼 후보 좌표 몇 개만 (진영/다음)
        time.sleep(1.0)
        for x, y in [(600, 350), (700, 450), (650, 500), (750, 560), (550, 400)]:
            click(ox + x, oy + y)
            time.sleep(0.6)
            snap = script.exports_sync.snap()
            print(f"form-click ({x},{y}) {snap}", flush=True)
            screenshot(hwnd, sd / f"05-form-{x}-{y}-st{snap['state']:02x}.png")

    # after last, try a few next-button coords used historically (scaled 1024)
    print("=== form next/confirm probes ===", flush=True)
    for x, y in [(700, 560), (800, 560), (650, 580), (750, 600), (512, 600)]:
        click(ox + x, oy + y)
        time.sleep(0.5)
        snap = script.exports_sync.snap()
        print(f"btn ({x},{y}) {snap}", flush=True)
        screenshot(hwnd, sd / f"05-btn-{x}-{y}-st{snap['state']:02x}.png")

    print("final", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "99-final.png")
    session.detach()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
