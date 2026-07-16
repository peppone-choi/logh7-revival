#!/usr/bin/env python3
"""클라 창 스크린샷만 캡처 (조작 없음)."""
import ctypes, sys
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG),
                ("right", wintypes.LONG), ("bottom", wintypes.LONG)]

def find_hwnd():
    TH32CS_SNAPPROCESS = 0x2
    class PE(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]
    pids = set()
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    pe = PE(); pe.dwSize = ctypes.sizeof(PE)
    if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
        while True:
            if "g7mtclient" in pe.szExeFile.lower():
                pids.add(pe.th32ProcessID)
            if not kernel32.Process32NextW(snap, ctypes.byref(pe)):
                break
    kernel32.CloseHandle(snap)
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd): return True
        if user32.GetWindowTextLengthW(hwnd) <= 0: return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids: found.append(hwnd)
        return True
    user32.EnumWindows(cb, 0)
    return found[0] if found else 0

def main():
    out = Path(sys.argv[1])
    hwnd = find_hwnd()
    if not hwnd:
        print("no client window"); return 1
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    wr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.left, wr.top, wr.right, wr.bottom))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"shot {out} {img.size} hwnd={hwnd:#x}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
