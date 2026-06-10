from __future__ import annotations

import time
from typing import Any


def find_client_window(win32gui: Any, win32process: Any, pid: int) -> int:
    deadline = time.time() + 8
    while time.time() < deadline:
        hits: list[int] = []

        def enum(hwnd: int, _extra: int) -> None:
            if not win32gui.IsWindowVisible(hwnd):
                return
            _, window_pid = win32process.GetWindowThreadProcessId(hwnd)
            if window_pid == pid:
                hits.append(hwnd)

        win32gui.EnumWindows(enum, 0)
        if hits:
            return hits[0]
        time.sleep(0.1)
    raise RuntimeError(f"client window not found for pid {pid}")


def login(win32api: Any, win32con: Any, win32gui: Any, hwnd: int) -> None:
    foreground_errors: tuple[type[BaseException], ...] = (OSError,)
    try:
        import pywintypes
    except ImportError:
        pass
    else:
        foreground_errors = (OSError, pywintypes.error)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except foreground_errors:
        pass
    time.sleep(0.3)
    _click(win32api, win32con, win32gui, hwnd, 325, 333)
    _type_text(win32con, win32gui, hwnd, "ginei00")
    _click(win32api, win32con, win32gui, hwnd, 325, 360)
    _type_text(win32con, win32gui, hwnd, "dummy")
    _click(win32api, win32con, win32gui, hwnd, 323, 389)


def _click(win32api: Any, win32con: Any, win32gui: Any, hwnd: int, x: int, y: int) -> None:
    left, top, _right, _bottom = win32gui.GetWindowRect(hwnd)
    win32api.SetCursorPos((left + x, top + y))
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    time.sleep(0.1)


def _type_text(win32con: Any, win32gui: Any, hwnd: int, text: str) -> None:
    for char in text:
        win32gui.PostMessage(hwnd, win32con.WM_CHAR, ord(char), 0)
        time.sleep(0.03)
