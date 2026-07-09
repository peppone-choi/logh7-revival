#!/usr/bin/env python3
"""로비 좌측 메뉴 버튼 좌표 프로브 — 샷으로 화면 변화 확인."""
from __future__ import annotations

import ctypes
import subprocess
import time
from ctypes import wintypes
from pathlib import Path

user32 = ctypes.windll.user32
INPUT_MOUSE = 0
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class RECT(ctypes.Structure):
    _fields_ = [("l", wintypes.LONG), ("t", wintypes.LONG), ("r", wintypes.LONG), ("b", wintypes.LONG)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]


class IU(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", IU)]


def find_hwnd() -> int:
    found: list[int] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _lp):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n <= 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        try:
            name = subprocess.check_output(
                ["powershell", "-NoP", "-C", f"(Get-Process -Id {pid.value}).ProcessName"],
                text=True, errors="ignore",
            ).strip().lower()
        except Exception:
            name = ""
        if "g7mt" in name:
            found.append(hwnd)
        return True

    user32.EnumWindows(cb, 0)
    if not found:
        raise RuntimeError("no client")
    return found[0]


def geom(hwnd: int):
    cr = RECT()
    user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.r - cr.l, cr.b - cr.t


def abs_xy(x: int, y: int):
    sx = user32.GetSystemMetrics(0)
    sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))


def click(sx: int, sy: int):
    for dx, dy in ((-3, -2), (0, 0)):
        ax, ay = abs_xy(sx + dx, sy + dy)
        inp = INPUT(type=INPUT_MOUSE, u=IU(mi=MOUSEINPUT(ax, ay, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, 0, None)))
        user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        time.sleep(0.03)
    d = INPUT(type=INPUT_MOUSE, u=IU(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None)))
    u = INPUT(type=INPUT_MOUSE, u=IU(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None)))
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT))
    time.sleep(0.05)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT))
    time.sleep(0.12)


def main():
    from PIL import ImageGrab

    hwnd = find_hwnd()
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.4)
    ox, oy, cw, ch = geom(hwnd)
    print("geom", ox, oy, cw, ch)

    shot_dir = Path("server/data/agent-drive")
    shot_dir.mkdir(parents=True, exist_ok=True)
    # 시각 샷 기준 좌측 버튼 중심 (1024x768 클라)
    cands = [
        (95, 162), (95, 212), (95, 262), (95, 312), (95, 362),
        (110, 212), (80, 212), (95, 190), (95, 230), (95, 250),
    ]
    for i, (cx, cy) in enumerate(cands):
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.12)
        ox, oy, cw, ch = geom(hwnd)
        sx, sy = ox + cx, oy + cy
        print(f"cand{i} client({cx},{cy}) screen({sx},{sy})")
        click(sx, sy)
        time.sleep(1.0)
        wr = RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(wr))
        img = ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))
        p = shot_dir / f"create-try-{i}.png"
        img.save(p)
        crop = img.crop((300, 150, 900, 650))
        avg = sum(sum(px[:3]) for px in crop.getdata()) / (crop.width * crop.height * 3)
        print("  avg_right", round(avg, 1), "->", p)


if __name__ == "__main__":
    main()
