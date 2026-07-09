#!/usr/bin/env python3
"""Force character-CREATE mode via RE-confirmed globals + FSM state.

RE (FUN_0051a370 jump table, live EXE):
  case 0x1a (新キャラクターの作成):
    mov [ebp+4], 0x2d
    mov [DAT_02217398], 0x40   ; create-mode marker
    mov [DAT_0221670c], 0x30
    jmp epilogue

  case 0x19 (세션 피커/다른 모드):
    mov [ebp+4], 0x2d
    mov [DAT_02217398], 0x41
    mov [DAT_0221670c], 0x30

이전 실패: state만 0x20/0x1c 강제 → 로그인 캐릭 선택 UI (mode 미설정).
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

const SCENE_PTR = ptr('0x02215e2c');
const MODE_A = ptr('0x02217398');   // case 0x1a writes 0x40 (create)
const MODE_B = ptr('0x0221670c');   // case 0x1a writes 0x30
const MODE_C = ptr('0x02216c38');   // case 0x18/0x1b alternate path

function scenePtr() {
  return SCENE_PTR.readPointer();
}

rpc.exports = {
  snap() {
    const p = scenePtr();
    return {
      scene: p.toString(),
      state: p.add(4).readU32(),
      modeA: MODE_A.readU32(),
      modeB: MODE_B.readU32(),
      modeC: MODE_C.readU32(),
    };
  },
  // 정확한 case 0x1a 바디 재현
  forceCreateCase1a() {
    const p = scenePtr();
    const before = {
      state: p.add(4).readU32(),
      modeA: MODE_A.readU32(),
      modeB: MODE_B.readU32(),
    };
    MODE_A.writeU32(0x40);
    MODE_B.writeU32(0x30);
    p.add(4).writeU32(0x2d);
    return { before: before, after: {
      state: p.add(4).readU32(),
      modeA: MODE_A.readU32(),
      modeB: MODE_B.readU32(),
    }};
  },
  // state=0x1a 만 넣고 FSM이 case 0x1a 를 타게 함
  armState1a() {
    const p = scenePtr();
    const before = p.add(4).readU32();
    p.add(4).writeU32(0x1a);
    return { before: before, after: p.add(4).readU32() };
  },
  // 세션 변경 피커 모드(0x41) — 대조군
  forceSessionMode() {
    const p = scenePtr();
    MODE_A.writeU32(0x41);
    MODE_B.writeU32(0x30);
    p.add(4).writeU32(0x2d);
    return {
      state: p.add(4).readU32(),
      modeA: MODE_A.readU32(),
      modeB: MODE_B.readU32(),
    };
  },
  setState(v) {
    const p = scenePtr();
    p.add(4).writeU32(v >>> 0);
    return p.add(4).readU32();
  },
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


def find_hwnd_by_pid_name(name_sub: str = "g7mtclient") -> tuple[int, int]:
    """Find G7MTClient main window by process name (Toolhelp) + EnumWindows."""
    kernel32 = ctypes.windll.kernel32
    TH32CS_SNAPPROCESS = 0x00000002

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", wintypes.WCHAR * 260),
        ]

    pids: list[int] = []
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap == ctypes.c_void_p(-1).value or snap == 0xFFFFFFFF:
        raise RuntimeError("CreateToolhelp32Snapshot failed")
    try:
        pe = PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(PROCESSENTRY32W)
        if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
            while True:
                if name_sub.lower() in pe.szExeFile.lower():
                    pids.append(pe.th32ProcessID)
                if not kernel32.Process32NextW(snap, ctypes.byref(pe)):
                    break
    finally:
        kernel32.CloseHandle(snap)

    if not pids:
        raise RuntimeError(f"process matching {name_sub!r} not running")

    found: list[tuple[int, int]] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_cb(hwnd, _lp):
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.GetWindowTextLengthW(hwnd) <= 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids:
            found.append((hwnd, pid.value))
        return True

    user32.EnumWindows(enum_cb, 0)
    if not found:
        raise RuntimeError(f"visible window for pids={pids} not found")
    return found[0]


def main() -> int:
    sd = Path("server/data/agent-drive/force-create-mode")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd, pid_val = find_hwnd_by_pid_name()
    print(f"hwnd={hwnd:#x} pid={pid_val}", flush=True)
    foreground(hwnd)

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(18):
            time.sleep(1)
            if not user32.IsWindow(hwnd):
                print("client died settle", i, flush=True)
                return 2
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}", flush=True)
            if cw >= 1000 and i >= 12:
                break

    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy})", flush=True)
    screenshot(hwnd, sd / "01-settled.png")

    session = frida.attach(pid_val)
    script = session.create_script(SCRIPT)
    script.load()
    print("snap0", script.exports_sync.snap(), flush=True)

    # 1) 정확한 case 0x1a 바디 재현
    print("=== forceCreateCase1a ===", flush=True)
    print(script.exports_sync.force_create_case1a(), flush=True)
    time.sleep(1.2)
    print("snap1", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "02-force-1a-body.png")

    # 2) 세션 카드 더블클릭 (LOGH VII 영역 — 1024 피커 실측 근처)
    # 강제 0x20 때 카드 중심 대략 (600, 255~320)
    card_points = [
        (600, 255),
        (600, 280),
        (600, 310),
        (520, 280),
        (650, 300),
        (550, 340),
        (600, 400),
    ]
    for i, (x, y) in enumerate(card_points):
        print(f"dclick card ({x},{y})", flush=True)
        dclick(ox + x, oy + y)
        time.sleep(0.7)
        snap = script.exports_sync.snap()
        print(f"  snap {snap}", flush=True)
        screenshot(hwnd, sd / f"03-dclick-{i}-{x}-{y}-st{snap['state']:02x}.png")
        # create form 후보: state 가 0x2d 피커를 벗어남
        if snap["state"] not in (0x2D, 0x20, 0x1E, 0x17, 0x2A, 0x1C, 0x19, 0x1A):
            print("  ** state left picker-ish **", flush=True)

    # 3) 피커 유지 안 되면 재강제 후 Next/決定 좌표도 시도
    print("=== re-force create + bottom buttons ===", flush=True)
    print(script.exports_sync.force_create_case1a(), flush=True)
    time.sleep(0.8)
    screenshot(hwnd, sd / "04-reforce.png")
    for x, y in [(512, 600), (700, 600), (400, 600), (600, 560), (800, 580)]:
        click(ox + x, oy + y)
        time.sleep(0.5)
        snap = script.exports_sync.snap()
        print(f"btn ({x},{y}) {snap}", flush=True)
        screenshot(hwnd, sd / f"05-btn-{x}-{y}-st{snap['state']:02x}.png")

    # 4) 대조: arm state 0x1a only (FSM tick 경로)
    print("=== armState1a only ===", flush=True)
    # back to lobby-ish first if possible
    print(script.exports_sync.arm_state1a(), flush=True)
    time.sleep(1.5)
    print("snap arm1a", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "06-arm-1a.png")

    # 5) session mode 대조 스크린
    print("=== force session mode 0x41 ===", flush=True)
    print(script.exports_sync.force_session_mode(), flush=True)
    time.sleep(1.0)
    print("snap sess", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "07-session-mode.png")

    print("=== final create again ===", flush=True)
    print(script.exports_sync.force_create_case1a(), flush=True)
    time.sleep(1.0)
    print("snap final", script.exports_sync.snap(), flush=True)
    screenshot(hwnd, sd / "99-final-create.png")

    session.detach()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
