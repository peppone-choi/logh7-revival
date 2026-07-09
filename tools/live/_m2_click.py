#!/usr/bin/env python3
# M2 라이브QA 정밀 클릭 헬퍼 (검증 전용). drive_robust 의 SendInput 절대이동+클릭
# 방식(로그인에서 검증됨)을 재사용해 로비 메뉴 버튼을 정확히 누른다.
# usage: python _m2_click.py <client_x> <client_y> <label> [shot_dir]
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
class IU(ctypes.Union):
    _fields_ = [("mi", MI)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", IU)]

def process_name(pid):
    h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h: return ""
    try:
        buf = ctypes.create_unicode_buffer(512); size = wintypes.DWORD(512)
        q = kernel32.QueryFullProcessImageNameW
        q.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        q.restype = wintypes.BOOL
        return buf.value.lower() if q(h, 0, buf, ctypes.byref(size)) else ""
    finally:
        kernel32.CloseHandle(h)

def find_hwnd():
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd): return True
        if user32.GetWindowTextLengthW(hwnd) <= 0: return True
        pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if "g7mtclient" in process_name(pid.value): found.append(hwnd)
        return True
    user32.EnumWindows(cb, 0)
    if not found: raise RuntimeError("G7MTClient window not found")
    best, best_a = None, -1
    for h in found:
        wr = RECT(); user32.GetWindowRect(h, ctypes.byref(wr))
        a = max(0, wr.r-wr.l)*max(0, wr.b-wr.t)
        if a > best_a: best_a, best = a, h
    return best

def geom(hwnd):
    cr = RECT(); user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0,0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.r-cr.l, cr.b-cr.t

def abs_xy(x, y):
    sx = user32.GetSystemMetrics(0); sy = user32.GetSystemMetrics(1)
    return int(x*65535/max(sx-1,1)), int(y*65535/max(sy-1,1))

def send_click(sx, sy):
    for dx, dy in ((-3,-2),(0,0)):
        ax, ay = abs_xy(sx+dx, sy+dy)
        i = INPUT(type=0, u=IU(mi=MI(ax, ay, 0, MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE, 0, None)))
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INPUT)); time.sleep(0.03)
    d = INPUT(type=0, u=IU(mi=MI(0,0,0,MOUSEEVENTF_LEFTDOWN,0,None)))
    u = INPUT(type=0, u=IU(mi=MI(0,0,0,MOUSEEVENTF_LEFTUP,0,None)))
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT)); time.sleep(0.06)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.12)

def post_click(hwnd, cx, cy):
    lp = (cy<<16)|(cx&0xFFFF)
    user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lp); time.sleep(0.05)
    user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lp); time.sleep(0.1)

def shot(hwnd, path):
    wr = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))
    path.parent.mkdir(parents=True, exist_ok=True); img.save(path)
    print(f"shot {path} {img.size}"); return img

def main():
    cx, cy = int(sys.argv[1]), int(sys.argv[2])
    label = sys.argv[3] if len(sys.argv) > 3 else "click"
    shot_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else Path(".")
    hwnd = find_hwnd()
    user32.ShowWindow(hwnd, SW_RESTORE); user32.SetForegroundWindow(hwnd); time.sleep(0.3)
    ox, oy, cw, ch = geom(hwnd)
    sx, sy = ox+cx, oy+cy
    print(f"hwnd={hex(hwnd)} client={cw}x{ch} origin=({ox},{oy}) click client=({cx},{cy}) screen=({sx},{sy})")
    send_click(sx, sy)
    post_click(hwnd, cx, cy)
    time.sleep(1.8)
    hwnd = find_hwnd()
    shot(hwnd, shot_dir / f"{label}.png")

if __name__ == "__main__":
    main()
