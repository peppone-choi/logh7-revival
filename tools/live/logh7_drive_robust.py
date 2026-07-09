#!/usr/bin/env python3
"""Robust live drive: login -> create menu -> origin select -> OK, with PostMessage fallback."""
from __future__ import annotations
import ctypes, time, sys
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP = 0x0202
MK_LBUTTON = 0x0001
SW_RESTORE = 9

class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]
class RECT(ctypes.Structure):
    _fields_ = [("l", wintypes.LONG), ("t", wintypes.LONG), ("r", wintypes.LONG), ("b", wintypes.LONG)]
class MI(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class KI(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class HI(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]
class IU(ctypes.Union):
    _fields_ = [("mi", MI), ("ki", KI), ("hi", HI)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", IU)]

def process_name(pid: int) -> str:
    h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(512)
        size = wintypes.DWORD(512)
        # QueryFullProcessImageNameW
        q = kernel32.QueryFullProcessImageNameW
        q.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        q.restype = wintypes.BOOL
        if q(h, 0, buf, ctypes.byref(size)):
            return buf.value.lower()
        return ""
    finally:
        kernel32.CloseHandle(h)

def find_hwnd() -> int:
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n <= 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        path = process_name(pid.value)
        if "g7mtclient" in path:
            found.append(hwnd)
        return True
    user32.EnumWindows(cb, 0)
    if not found:
        raise RuntimeError("G7MTClient window not found")
    # prefer main game window (largest area)
    best = None
    best_a = -1
    for h in found:
        wr = RECT()
        user32.GetWindowRect(h, ctypes.byref(wr))
        a = max(0, wr.r - wr.l) * max(0, wr.b - wr.t)
        if a > best_a:
            best_a = a
            best = h
    return best

def geom(hwnd):
    cr = RECT(); user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0, 0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.r - cr.l, cr.b - cr.t

def abs_xy(x, y):
    sx = user32.GetSystemMetrics(0); sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))

def send_click(sx, sy):
    for dx, dy in ((-2, -1), (0, 0)):
        ax, ay = abs_xy(sx + dx, sy + dy)
        i = INPUT(type=0, u=IU(mi=MI(ax, ay, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, 0, None)))
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INPUT)); time.sleep(0.02)
    d = INPUT(type=0, u=IU(mi=MI(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None)))
    u = INPUT(type=0, u=IU(mi=MI(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None)))
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT)); time.sleep(0.05)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.1)

def post_click(hwnd, cx, cy):
    lp = (cy << 16) | (cx & 0xFFFF)
    user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lp)
    time.sleep(0.05)
    user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lp)
    time.sleep(0.1)

def dual_click(hwnd, ox, oy, cx, cy, label=""):
    sx, sy = ox + cx, oy + cy
    print(f"  click {label} client=({cx},{cy}) screen=({sx},{sy})")
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.05)
    send_click(sx, sy)
    post_click(hwnd, cx, cy)

def type_u(text):
    for ch in text:
        d = INPUT(type=1, u=IU(ki=KI(0, ord(ch), KEYEVENTF_UNICODE, 0, None)))
        u = INPUT(type=1, u=IU(ki=KI(0, ord(ch), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None)))
        user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.035)

def shot(hwnd, path: Path):
    wr = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"  shot {path.name} {img.size}")
    return img

def list_crash():
    out = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n <= 0:
            return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if "Runtime" in buf.value or "Visual C" in buf.value:
            out.append(buf.value)
        return True
    user32.EnumWindows(cb, 0)
    return out

def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"
    sd = Path("server/data/agent-drive")
    hwnd = find_hwnd()
    print("hwnd", hex(hwnd), "mode", mode)
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.3)
    ox, oy, cw, ch = geom(hwnd)
    print(f"geom client={cw}x{ch} origin=({ox},{oy})")

    if mode in ("login", "full"):
        shot(hwnd, sd / "s01-login.png")
        LOGIN_REF = (644, 484)
        for label, pt, text in [("ID", (374, 290), "inei00"), ("PW", (376, 318), "dummy")]:
            cx, cy = scale(LOGIN_REF, pt, cw, ch)
            dual_click(hwnd, ox, oy, cx, cy, label)
            time.sleep(0.12)
            for _ in range(14):
                type_u("\b")
            type_u(text)
            time.sleep(0.12)
        cx, cy = scale(LOGIN_REF, (352, 347), cw, ch)
        dual_click(hwnd, ox, oy, cx, cy, "LOGIN")
        time.sleep(3.5)
        hwnd = find_hwnd()
        user32.SetForegroundWindow(hwnd); time.sleep(0.2)
        ox, oy, cw, ch = geom(hwnd)
        print(f"post-login client={cw}x{ch}")
        shot(hwnd, sd / "s02-lobby.png")
        crashes = list_crash()
        print("crashes", crashes)
        if crashes:
            return 2

    if mode == "login":
        return 0

    # create menu - resolution aware
    if (cw, ch) in ((1024, 768), (1028, 772)) or cw >= 1000:
        menu = (90, 212)
        face1 = (515, 310)
        face2 = (510, 470)
        ok = (655, 585)
    else:
        # scale from 1024x768
        menu = scale((1024, 768), (90, 212), cw, ch)
        face1 = scale((1024, 768), (515, 310), cw, ch)
        face2 = scale((1024, 768), (510, 470), cw, ch)
        ok = scale((1024, 768), (655, 585), cw, ch)

    dual_click(hwnd, ox, oy, menu[0], menu[1], "CREATE_MENU")
    time.sleep(1.5)
    hwnd = find_hwnd(); ox, oy, cw, ch = geom(hwnd)
    shot(hwnd, sd / "s03-create.png")
    crashes = list_crash()
    if crashes:
        print("crashes after create", crashes)
        return 3

    # select face1 then OK
    dual_click(hwnd, ox, oy, face1[0], face1[1], "FACE1")
    time.sleep(0.5)
    shot(hwnd, sd / "s04-face.png")
    dual_click(hwnd, ox, oy, ok[0], ok[1], "OK")
    time.sleep(1.2)
    shot(hwnd, sd / "s05-after-ok.png")

    # if still same screen, try double-click face and alternate OK positions
    dual_click(hwnd, ox, oy, face1[0], face1[1], "FACE1_dbl")
    time.sleep(0.1)
    dual_click(hwnd, ox, oy, face1[0], face1[1], "FACE1_dbl2")
    time.sleep(0.4)
    for i, pt in enumerate([(655, 585), (640, 580), (670, 590), (655, 600), (600, 585), (700, 585)]):
        dual_click(hwnd, ox, oy, pt[0], pt[1], f"OK_try{i}")
        time.sleep(0.7)
        img = shot(hwnd, sd / f"s06-oktry{i}.png")
        crashes = list_crash()
        if crashes:
            print("crashes", crashes)
            return 4
        # crude change detect: mid panel avg
        mid = img.crop((350, 150, 900, 550))
        avg = sum(sum(p[:3]) for p in mid.getdata()) / (mid.width * mid.height * 3)
        print(f"  mid_avg={avg:.1f}")
        if avg < 35 or avg > 90:  # significant layout change heuristic vs dark blue ~45-55
            print("possible advance")
            break

    shot(hwnd, sd / "s07-final.png")
    print("done crashes", list_crash())
    return 0

if __name__ == "__main__":
    sys.exit(main())
