#!/usr/bin/env python3
"""실클라 자동 조작 — 로그인 → 로비 → 캐릭터 생성 클릭 경로.

좌표는 client-relative (GetClientRect 기준). 창 모드 기본 기준 644×484 로그인 좌표를
실제 클라이언트 크기로 스케일한다.
"""
from __future__ import annotations

import argparse
import ctypes
import struct
import sys
import time
from ctypes import wintypes
from pathlib import Path

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
user32.GetForegroundWindow.argtypes = []
user32.GetForegroundWindow.restype = wintypes.HWND
kernel32.GetCurrentThreadId.argtypes = []
kernel32.GetCurrentThreadId.restype = wintypes.DWORD
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
user32.AttachThreadInput.restype = wintypes.BOOL
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.ShowWindow.restype = wintypes.BOOL
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.restype = ctypes.c_int

# ── Win32 상수 ────────────────────────────────────────────────────────────────
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
SW_RESTORE = 9
GW_OWNER = 4

# 로그인 기준 (client 644×484 기준, 문서 journal)
LOGIN_REF = (644, 484)
LOGIN_ID = (374, 290)
LOGIN_PW = (376, 318)
LOGIN_BTN = (352, 347)

# 로비 좌측 메뉴 — 1024×768 실측 (2026-07-09)
# Y mid: start192 create256 original313 delete371 session429 settings480 credits544
# settings@480 = 環境設定 패널 라이브 OK. session@429 하이라이트 OK, 피커 패널 미전환.
LOBBY_MENU_START = (164, 192)
LOBBY_MENU_CREATE = (164, 256)
LOBBY_MENU_SESSION = (164, 429)
LOBBY_MENU_SETTINGS = (164, 480)
LOBBY_MENU_CREATE_BY_RES = {
    (1024, 768): (164, 256),
    (1028, 772): (164, 256),
    (1920, 1080): (150, 255),
}
# 세션 picker 행 (1024 추정; 저널 1920 2행 피커 스케일)
SESSION_ROW1 = (520, 280)
SESSION_ROW2 = (520, 340)
# 출신/캐릭슬롯 카드 (1024×768 — 빈 슬롯 UI 실측, 생성 폼 좌표는 후속)
ORIGIN_FACE1 = (515, 310)
ORIGIN_FACE2 = (510, 470)
ORIGIN_OK = (655, 585)
LOBBY_BACK = (512, 600)
# 1920×1080 참고
ORIGIN_FACE1_1920 = (961, 445)
ORIGIN_FACE2_1920 = (960, 667)
ORIGIN_OK_1920 = (1029, 851)

# 캐릭터 작성 폼 (대략, 우측 패널 — HD 레이아웃 참고)
CREATE_REF = (1024, 768)
CREATE_LASTNAME = (780, 300)
CREATE_FIRSTNAME = (780, 340)
CREATE_CONFIRM = (820, 700)
CREATE_OK = (560, 420)  # 중앙 확인 다이얼로그


class ForegroundActivationError(RuntimeError):
    def __init__(self, hwnd: int) -> None:
        self.hwnd = hwnd
        super().__init__(f"창 전면 활성화 실패: hwnd={hwnd}")


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG),
                ("right", wintypes.LONG), ("bottom", wintypes.LONG)]


user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
user32.GetClientRect.restype = wintypes.BOOL
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(POINT)]
user32.ClientToScreen.restype = wintypes.BOOL


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG), ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]


class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", INPUT_UNION)]


def find_client_hwnd(expected_pid: int | None = None) -> int:
    """G7MTClient 메인 창 탐색 (Toolhelp 프로세스명 + EnumWindows)."""
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

    pids = set()
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap not in (0, 0xFFFFFFFF, -1):
        try:
            pe = PROCESSENTRY32W()
            pe.dwSize = ctypes.sizeof(PROCESSENTRY32W)
            if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
                while True:
                    if "g7mtclient" in pe.szExeFile.lower() and (expected_pid is None or pe.th32ProcessID == expected_pid):
                        pids.add(pe.th32ProcessID)
                    if not kernel32.Process32NextW(snap, ctypes.byref(pe)):
                        break
        finally:
            kernel32.CloseHandle(snap)

    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_cb(hwnd, _lp):
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.GetWindowTextLengthW(hwnd) <= 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids:
            found.append(hwnd)
        return True

    user32.EnumWindows(enum_cb, 0)
    if not found:
        raise RuntimeError("G7MTClient window not found")
    return found[0]


def client_geometry(hwnd: int):
    cr = RECT()
    user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.right - cr.left, cr.bottom - cr.top


def foreground(hwnd: int):
    user32.ShowWindow(hwnd, SW_RESTORE)
    foreground_hwnd = user32.GetForegroundWindow()
    current_thread_id = kernel32.GetCurrentThreadId()
    foreground_thread_id = user32.GetWindowThreadProcessId(foreground_hwnd, None)
    attached = bool(foreground_thread_id) and foreground_thread_id != current_thread_id
    if attached:
        attached = bool(user32.AttachThreadInput(current_thread_id, foreground_thread_id, True))
    try:
        activated = bool(user32.SetForegroundWindow(hwnd))
    finally:
        if attached:
            user32.AttachThreadInput(current_thread_id, foreground_thread_id, False)
    if not activated:
        raise ForegroundActivationError(hwnd)
    time.sleep(0.25)


def abs_coords(x: int, y: int):
    sx = user32.GetSystemMetrics(0)
    sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))


def mouse_move(x: int, y: int):
    ax, ay = abs_coords(x, y)
    inp = INPUT()
    inp.type = INPUT_MOUSE
    inp.union.mi = MOUSEINPUT(ax, ay, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, 0, None)
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def mouse_click(screen_x: int, screen_y: int, settle: float = 0.08):
    # glide
    mouse_move(screen_x - 2, screen_y - 1)
    time.sleep(0.03)
    mouse_move(screen_x, screen_y)
    time.sleep(settle)
    down = INPUT()
    down.type = INPUT_MOUSE
    down.union.mi = MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None)
    up = INPUT()
    up.type = INPUT_MOUSE
    up.union.mi = MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None)
    user32.SendInput(1, ctypes.byref(down), ctypes.sizeof(INPUT))
    time.sleep(0.05)
    user32.SendInput(1, ctypes.byref(up), ctypes.sizeof(INPUT))
    time.sleep(0.12)


def type_unicode(text: str):
    for ch in text:
        down = INPUT()
        down.type = INPUT_KEYBOARD
        down.union.ki = KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE, 0, None)
        up = INPUT()
        up.type = INPUT_KEYBOARD
        up.union.ki = KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None)
        user32.SendInput(1, ctypes.byref(down), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(up), ctypes.sizeof(INPUT))
        time.sleep(0.06)  # 게임 메시지 펌프가 유니코드 이벤트를 씹지 않게 완속


def scale_pt(ref_w, ref_h, x, y, cw, ch):
    return int(x * cw / ref_w), int(y * ch / ref_h)


def client_click(hwnd, ref, pt, cw, ch, ox, oy, label=""):
    rx, ry = scale_pt(ref[0], ref[1], pt[0], pt[1], cw, ch)
    sx, sy = ox + rx, oy + ry
    print(f"  click {label} client=({rx},{ry}) screen=({sx},{sy})")
    mouse_click(sx, sy)


def screenshot(hwnd: int, path: Path):
    # 간단: 전체 창 PrintWindow 대신 화면 캡처 (ClientToScreen 원점)
    ox, oy, cw, ch = client_geometry(hwnd)
    wr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab(bbox=(wr.left, wr.top, wr.right, wr.bottom))
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"  shot {path} {img.size}")
    except Exception as e:
        print(f"  shot failed: {e}")


def do_login(hwnd, account="inei00", password="dummy", shot_dir: Path | None = None):
    foreground(hwnd)
    # IME 컴포지션 차단 — 헛글자 유입(예: "inei00"→"ehinei00") 방지. 창에서 IME
    # 컨텍스트를 떼어내 한글/조합 입력이 SendInput 유니코드에 끼어들지 못하게 한다.
    try:
        ctypes.windll.imm32.ImmAssociateContext(hwnd, 0)
    except Exception as e:
        print(f"  IME detach skip: {e}")
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"login geometry client={cw}x{ch} origin=({ox},{oy})")
    if shot_dir:
        screenshot(hwnd, shot_dir / "01-login-before.png")

    # 커스텀 D3D8 입력(표준 EDIT 컨트롤 아님) — 필드 클릭 직후 포커스가 안정되기
    # 전에 첫 키가 유실됨(선두 드롭). 넉넉한 settle + 클리어 후 1회 입력.
    def enter_field(pt, text, label):
        client_click(hwnd, LOGIN_REF, pt, cw, ch, ox, oy, label)
        time.sleep(0.6)               # 포커스 안정 대기 (드롭 방지)
        type_unicode("\b" * 16)       # 잔여 문자 클리어
        time.sleep(0.15)
        type_unicode(text)
        time.sleep(0.3)

    enter_field(LOGIN_ID, account, "ID")
    enter_field(LOGIN_PW, password, "PW")

    client_click(hwnd, LOGIN_REF, LOGIN_BTN, cw, ch, ox, oy, "LOGIN")
    time.sleep(2.5)
    if shot_dir:
        screenshot(hwnd, shot_dir / "02-after-login.png")


def do_lobby_create(hwnd, lastname="Reinhard", firstname="Test", shot_dir: Path | None = None):
    """로비 → 新キャラクターの作成 → 세션 picker → (진영/출신/이름 → 0x1008).

    2026-07-09 라이브 정정:
    - (160,175/191) 은 ゲーム開始(빈 캐릭 선택) — 출신 폼이 아님.
    - 생성 버튼 (160,255) 하이라이트는 되나 우측 패널이 お知らせ 유지
      (= 0x2006 세션 목록이 피커에 안 뜨는 블로커). 0x1008 미도달.
    - 저널 #2 정상 경로(1920): 새캐릭 → 세션 picker 2행 → 더블클릭 → 진영/출신/이름.
    """
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"lobby geometry client={cw}x{ch}")
    if shot_dir:
        screenshot(hwnd, shot_dir / "03-lobby.png")

    menu = LOBBY_MENU_CREATE_BY_RES.get((cw, ch), LOBBY_MENU_CREATE)
    print(f"  CREATE_MENU client={menu}")
    mouse_click(ox + menu[0], oy + menu[1])
    time.sleep(1.5)
    if shot_dir:
        screenshot(hwnd, shot_dir / "04-after-create-menu.png")

    # 세션 picker 행 후보 (피커가 보이면 더블클릭)
    rows = [SESSION_ROW1, SESSION_ROW2, (520, 250), (520, 300), (520, 360), (600, 280)]
    if cw >= 1800:
        rows = [scale_pt(1024, 768, x, y, cw, ch) for x, y in rows]
    for i, pt in enumerate(rows):
        print(f"  SESSION_ROW_{i} client={pt}")
        mouse_click(ox + pt[0], oy + pt[1])
        time.sleep(0.12)
        mouse_click(ox + pt[0], oy + pt[1])
        time.sleep(0.8)
        if shot_dir:
            screenshot(hwnd, shot_dir / f"05-session-{i}.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot-dir", default="server/data/agent-drive")
    ap.add_argument("--account", default="inei00")
    ap.add_argument("--password", default="dummy")
    ap.add_argument("--lastname", default="Reinhard")
    ap.add_argument("--firstname", default="Pilot")
    ap.add_argument("--skip-login", action="store_true")
    ap.add_argument("--login-only", action="store_true")
    args = ap.parse_args()

    shot_dir = Path(args.shot_dir)
    shot_dir.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    print(f"hwnd={hwnd:#x}")
    foreground(hwnd)

    if not args.skip_login:
        do_login(hwnd, args.account, args.password, shot_dir)
    if args.login_only:
        print("login-only done")
        return 0

    time.sleep(1.0)
    do_lobby_create(hwnd, args.lastname, args.firstname, shot_dir)
    print("drive sequence finished")
    return 0


if __name__ == "__main__":
    sys.exit(main())
