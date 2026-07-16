#!/usr/bin/env python3
"""단일 클라 좌표 클릭 + 스크린샷. usage: _click_shot.py <cx> <cy> <out.png>"""
import ctypes, sys, time
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]
class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG), ("right", wintypes.LONG), ("bottom", wintypes.LONG)]
class MI(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class IU(ctypes.Union):
    _fields_ = [("mi", MI)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", IU)]

def find_hwnd():
    TH32 = 0x2
    class PE(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                    ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)), ("th32ModuleID", wintypes.DWORD),
                    ("cntThreads", wintypes.DWORD), ("th32ParentProcessID", wintypes.DWORD),
                    ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]
    pids = set()
    snap = kernel32.CreateToolhelp32Snapshot(TH32, 0)
    pe = PE(); pe.dwSize = ctypes.sizeof(PE)
    if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
        while True:
            if "g7mtclient" in pe.szExeFile.lower(): pids.add(pe.th32ProcessID)
            if not kernel32.Process32NextW(snap, ctypes.byref(pe)): break
    kernel32.CloseHandle(snap)
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(h, _):
        if not user32.IsWindowVisible(h): return True
        if user32.GetWindowTextLengthW(h) <= 0: return True
        pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
        if pid.value in pids: found.append(h)
        return True
    user32.EnumWindows(cb, 0)
    return found[0] if found else 0

def move(x, y):
    sx = user32.GetSystemMetrics(0); sy = user32.GetSystemMetrics(1)
    ax = int(x * 65535 / max(sx-1,1)); ay = int(y * 65535 / max(sy-1,1))
    inp = INPUT(); inp.type = 0
    inp.u.mi = MI(ax, ay, 0, 0x0001 | 0x8000, 0, None)
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

def click(x, y):
    move(x-2, y-1); time.sleep(0.03); move(x, y); time.sleep(0.1)
    d = INPUT(); d.type = 0; d.u.mi = MI(0,0,0,0x0002,0,None)
    u = INPUT(); u.type = 0; u.u.mi = MI(0,0,0,0x0004,0,None)
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT)); time.sleep(0.05)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.12)

def main():
    cx, cy, out = int(sys.argv[1]), int(sys.argv[2]), Path(sys.argv[3])
    dbl = len(sys.argv) > 4 and sys.argv[4] == "double"
    hwnd = find_hwnd()
    if not hwnd: print("no window"); return 1
    user32.ShowWindow(hwnd, 9); user32.SetForegroundWindow(hwnd); time.sleep(0.3)
    pt = POINT(0,0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
    sx, sy = pt.x + cx, pt.y + cy
    print(f"click client=({cx},{cy}) screen=({sx},{sy}) hwnd={hwnd:#x}")
    click(sx, sy)
    if dbl: click(sx, sy)
    time.sleep(1.8)
    wr = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.left, wr.top, wr.right, wr.bottom))
    out.parent.mkdir(parents=True, exist_ok=True); img.save(out)
    print(f"shot {out} {img.size}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
