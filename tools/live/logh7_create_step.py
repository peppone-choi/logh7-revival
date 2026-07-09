#!/usr/bin/env python3
"""캐릭터 작성: 출신 카드 선택 → 진행 버튼 (1920x1080 풀스크린 기준)."""
from __future__ import annotations

import ctypes
import subprocess
import time
from ctypes import wintypes
from pathlib import Path

from PIL import ImageGrab

user32 = ctypes.windll.user32


class RECT(ctypes.Structure):
    _fields_ = [("l", wintypes.LONG), ("t", wintypes.LONG), ("r", wintypes.LONG), ("b", wintypes.LONG)]


class MI(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KI(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class HI(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]


class IU(ctypes.Union):
    _fields_ = [("mi", MI), ("ki", KI), ("hi", HI)]


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


def abs_xy(x: int, y: int):
    sx = user32.GetSystemMetrics(0)
    sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))


def click(sx: int, sy: int, times: int = 1):
    for _ in range(times):
        for dx, dy in ((-2, -1), (0, 0), (1, 0)):
            ax, ay = abs_xy(sx + dx, sy + dy)
            i = INPUT(type=0, u=IU(mi=MI(ax, ay, 0, 0x0001 | 0x8000, 0, None)))
            user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INPUT))
            time.sleep(0.02)
        d = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0002, 0, None)))
        u = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0004, 0, None)))
        user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT))
        time.sleep(0.05)
        user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT))
        time.sleep(0.12)


def shot(hwnd: int, path: Path):
    wr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print("shot", path, img.size)
    return img


def main():
    hwnd = find_hwnd()
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.3)
    sd = Path("server/data/agent-drive")

    # 메뉴 → 신캐릭 (1920x1080 실측 성공 좌표)
    click(80, 212)
    time.sleep(1.0)
    shot(hwnd, sd / "e1-menu.png")

    # 출신 카드1 포트레잇/본문 (여러 후보, 더블클릭)
    for i, (x, y) in enumerate([
        (720, 400), (780, 400), (850, 400), (950, 400), (1050, 400),
        (720, 450), (850, 450), (1000, 450),
        (720, 550), (850, 550), (1000, 550),
    ]):
        user32.SetForegroundWindow(hwnd)
        click(x, y, times=2)
        time.sleep(0.4)
        img = shot(hwnd, sd / f"e2-sel-{i}.png")
        # 버튼 영역 밝기 변화 감지
        btn = img.crop((800, 700, 1120, 860))
        avg = sum(sum(p[:3]) for p in btn.getdata()) / (btn.width * btn.height * 3)
        print(f"  sel{i} ({x},{y}) btn_avg={avg:.1f}")

    # 진행 버튼 후보 (더블클릭 포함)
    for i, (x, y) in enumerate([
        (960, 740), (960, 760), (960, 780), (960, 800), (960, 820),
        (900, 780), (1020, 780), (960, 700), (960, 850),
    ]):
        user32.SetForegroundWindow(hwnd)
        click(x, y, times=2)
        time.sleep(0.7)
        img = shot(hwnd, sd / f"e3-go-{i}.png")
        # 화면 중앙 평균 — 폼 전환 감지
        mid = img.crop((400, 200, 1500, 700))
        avg = sum(sum(p[:3]) for p in mid.getdata()) / (mid.width * mid.height * 3)
        print(f"  go{i} ({x},{y}) mid_avg={avg:.1f}")


if __name__ == "__main__":
    main()
