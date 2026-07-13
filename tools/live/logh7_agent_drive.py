#!/usr/bin/env python3
"""실클라 자동 조작 — 로그인 → 로비 → 캐릭터 생성 클릭 경로.

좌표는 client-relative (GetClientRect 기준). 창 모드 기본 기준 644×484 로그인 좌표를
실제 클라이언트 크기로 스케일한다.
"""
from __future__ import annotations

import argparse
import ctypes
import struct
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
# 토스트 소유 프로세스 확인용 — 이미지 이름으로 ShellExperienceHost 만 좁혀 대상 삼는다.
kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.QueryFullProcessImageNameW.argtypes = [
    wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
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


def _caption_point(hwnd: int):
    """창 제목표시줄(캡션) 중앙의 화면 좌표. 캡션이 없으면 None.

    캡션은 게임 UI가 아니라 윈도우 프레임이라, 여기를 클릭해도 게임 상태는 변하지 않는다.
    활성화용 클릭 지점으로 안전하다.
    """
    wr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    cr = RECT()
    user32.GetClientRect(hwnd, ctypes.byref(cr))
    origin = POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(origin))
    caption_h = origin.y - wr.top
    if caption_h < 6:
        return None  # 보더리스/전체화면 — 캡션 없음
    return ((wr.left + wr.right) // 2, wr.top + caption_h // 2)


def _activate_by_caption_click(hwnd: int) -> bool:
    """제목표시줄을 실제로 클릭해 창을 활성화한다.

    윈도우 알림 토스트(Windows.UI.Core.CoreWindow / ShellExperienceHost)가 전경을 물면
    SetForegroundWindow 도 SwitchToThisWindow 도 전부 거부당한다(측정함: 둘 다 실패).
    그러나 '진짜 마우스 클릭'에 의한 활성화는 앱이 아니라 OS가 수행하므로 포어그라운드 락과
    무관하게 성공한다(측정함: 토스트가 전경인 상태에서 클릭 → 대상 창이 전경이 됨).
    사람이 토스트를 무시하고 창을 클릭하는 것과 정확히 같은 동작이며, 사용자 시스템 설정을
    바꾸지 않는다(SPI_SETFOREGROUNDLOCKTIMEOUT 변경 금지 — 사용자 머신 영구 변경은 위반).
    """
    point = _caption_point(hwnd)
    if point is None:
        return False
    # 캡션 지점마저 다른 창이 덮고 있으면 클릭이 그 창으로 샌다 — 시도하지 않는다.
    if window_owner_at(*point)['hwnd'] != int(hwnd):
        return False
    mouse_click(*point)
    time.sleep(0.3)
    return user32.GetForegroundWindow() == hwnd


def foreground(hwnd: int, timeout_s: float = 30.0):
    """클라 창을 전경으로 올린다.

    SetForegroundWindow 는 전경 창이 아직 정착 중이거나 알림 토스트가 전경을 물고 있으면
    정상적으로 실패한다(윈도우 포어그라운드 락). 과거엔 5회(≈4초)만 재시도해서, 토스트가
    떠 있는 동안 런 전체가 날아갔다(B75 run2/run3, B76 run1). 토스트가 전경을 계속 물고
    있으면 API 호출은 영원히 실패하므로, 실패 시 캡션 클릭으로 활성화한다(위 함수 주석).
    timeout_s 를 넘기면 그대로 예외 — fail-closed 다(게임 동작을 가리는 폴백이 아니다).

    주의: 사용자 머신의 전역 설정(SPI_SETFOREGROUNDLOCKTIMEOUT 등)은 절대 건드리지 않는다.
    QA 편의를 위해 사용자 Windows 설정을 영구 변경하는 것은 금지다.
    """
    deadline = time.monotonic() + timeout_s
    delay = 0.3
    while True:
        user32.ShowWindow(hwnd, SW_RESTORE)
        foreground_hwnd = user32.GetForegroundWindow()
        current_thread_id = kernel32.GetCurrentThreadId()
        foreground_thread_id = user32.GetWindowThreadProcessId(foreground_hwnd, None)
        attached = bool(foreground_thread_id) and foreground_thread_id != current_thread_id
        if attached:
            attached = bool(user32.AttachThreadInput(current_thread_id, foreground_thread_id, True))
        try:
            user32.BringWindowToTop(hwnd)
            activated = bool(user32.SetForegroundWindow(hwnd))
        finally:
            if attached:
                user32.AttachThreadInput(current_thread_id, foreground_thread_id, False)
        if activated or user32.GetForegroundWindow() == hwnd:
            time.sleep(0.25)
            return
        if _activate_by_caption_click(hwnd):
            time.sleep(0.25)
            return
        if time.monotonic() >= deadline:
            raise ForegroundActivationError(hwnd)
        time.sleep(delay)
        delay = min(delay * 1.5, 2.0)


GA_ROOT = 2
user32.WindowFromPoint.argtypes = [POINT]
user32.WindowFromPoint.restype = wintypes.HWND
user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
user32.GetAncestor.restype = wintypes.HWND


class ClickOccludedError(RuntimeError):
    """클릭 지점을 클라 창이 아닌 다른 창(주로 윈도우 알림 토스트)이 덮고 있다."""

    def __init__(self, label: str, x: int, y: int, offender: dict) -> None:
        self.label = label
        self.point = (x, y)
        self.offender = offender
        super().__init__(f"클릭 지점 가림: label={label} point=({x},{y}) offender={offender}")


def describe_window(hwnd: int) -> dict:
    if not hwnd:
        return {'hwnd': 0, 'cls': None, 'title': None, 'pid': 0, 'rect': None}
    cls = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, cls, 256)
    title = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(hwnd, title, 256)
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    # 가린 창의 rect 까지 남긴다 — 어디를 얼마나 덮었는지 없이는 사후 진단이 불가능하다.
    wr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    return {
        'hwnd': int(hwnd), 'cls': cls.value, 'title': title.value, 'pid': int(pid.value),
        'rect': [wr.left, wr.top, wr.right, wr.bottom],
    }


def window_owner_at(x: int, y: int) -> dict:
    """화면 좌표 (x,y) 를 실제로 점유한 최상위 창을 돌려준다(WindowFromPoint→GA_ROOT)."""
    hit = user32.WindowFromPoint(POINT(int(x), int(y)))
    if not hit:
        return describe_window(0)
    root = user32.GetAncestor(hit, GA_ROOT) or hit
    info = describe_window(root)
    info['hitHwnd'] = int(hit)
    return info


# --- 알림 토스트 dismissal -------------------------------------------------
# 배경: 클라는 로그인 후 화면을 1024x768(D3D8 전체화면)로 바꾼다. 윈도우 알림 토스트는
# 데스크톱 우하단에 도킹하는데, 1024x768 에서 그 도킹 영역이 キャラカード 위에 정확히
# 겹친다(실측 rect [628,51,1024,728], 클릭점 (655,304)). Chrome 이 YouTube 알림을 계속
# 밀어 넣으므로 이 충돌은 런마다 재발한다. 그래서 '내 클릭 경로를 막는 토스트'만 닫는다.
#
# 안전 경계(반드시 지킬 것):
#  - 클래스가 Windows.UI.Core.CoreWindow 이고 소유 프로세스가 ShellExperienceHost.exe
#    인 창만 대상. 사용자의 브라우저·에디터·탐색기 등 일반 창은 절대 닫지 않는다.
#  - 프로세스를 죽이지 않는다. 시스템 설정을 바꾸지 않는다.
#  - 알림 내용은 알림 센터에 남으므로 사용자 정보 손실이 없다(토스트는 일시적 UI).
#  - 닫은 뒤 WindowFromPoint 로 가림 해소를 재확인한다. 해소 안 되면 클릭하지 않고 예외.
TOAST_CLASS = 'Windows.UI.Core.CoreWindow'
TOAST_PROCESS = 'shellexperiencehost.exe'
WM_CLOSE = 0x0010
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
MAX_TOAST_DISMISSALS = 5

# 닫은 토스트 증거 로그 — 조용히 닫지 않는다. 프로브가 evdir 로 덤프한다.
DISMISSED_TOASTS: list = []


def _process_image_name(pid: int) -> str:
    if not pid:
        return ''
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not handle:
        return ''
    try:
        buf = ctypes.create_unicode_buffer(512)
        size = wintypes.DWORD(512)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return ''
        return Path(buf.value).name
    finally:
        kernel32.CloseHandle(handle)


def is_notification_toast(info: dict) -> bool:
    """이 창이 '윈도우 알림 토스트'가 확실한가. 확실할 때만 True — 그 외 전부 False."""
    if not info or not info.get('hwnd'):
        return False
    if info.get('cls') != TOAST_CLASS:
        return False
    return _process_image_name(info.get('pid', 0)).lower() == TOAST_PROCESS


def dismiss_toast(info: dict, reason: str) -> dict:
    """토스트를 정상 dismiss 경로로 닫는다(WM_CLOSE → UIA 닫기 버튼 invoke).

    프로세스를 죽이지 않는다. 어느 창을 왜 닫았는지 DISMISSED_TOASTS 에 남긴다.
    """
    hwnd = int(info['hwnd'])
    record = {
        'hwnd': hwnd, 'cls': info.get('cls'), 'title': info.get('title'),
        'pid': info.get('pid'), 'rect': info.get('rect'),
        'reason': reason, 'method': None, 'gone': False, 't': time.time(),
    }
    # 1) 창의 정상 닫기 메시지.
    user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
    time.sleep(1.0)
    if not user32.IsWindow(hwnd) or not user32.IsWindowVisible(hwnd):
        record['method'] = 'WM_CLOSE'
        record['gone'] = True
        DISMISSED_TOASTS.append(record)
        return record
    # 2) 접근성(UIA)으로 토스트의 닫기/Dismiss 버튼을 눌러준다 — 사람이 X 를 누르는 것과 동일.
    ps = (
        "Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes;"
        f"$h=[IntPtr]{hwnd};"
        "$e=[System.Windows.Automation.AutomationElement]::FromHandle($h);"
        "if($e -ne $null){"
        "$c=[System.Windows.Automation.Condition]::TrueCondition;"
        "$btns=$e.FindAll([System.Windows.Automation.TreeScope]::Descendants,$c);"
        "foreach($b in $btns){"
        "$n=$b.Current.Name;"
        "if($n -match '닫기|Dismiss|Close'){"
        "try{$p=$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);"
        "$p.Invoke(); Write-Output \"invoked:$n\"}catch{}}}}"
    )
    try:
        out = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
                             capture_output=True, text=True, timeout=25)
        record['uiaStdout'] = (out.stdout or '').strip()[:300]
    except (OSError, subprocess.SubprocessError) as exc:
        record['uiaError'] = str(exc)[:200]
    time.sleep(1.0)
    gone = not user32.IsWindow(hwnd) or not user32.IsWindowVisible(hwnd)
    record['method'] = 'UIA-dismiss-button'
    record['gone'] = bool(gone)
    DISMISSED_TOASTS.append(record)
    return record


def click_guarded(hwnd: int, x: int, y: int, label: str = '',
                  timeout_s: float = 30.0, settle: float = 0.08) -> dict:
    """클라 창이 실제로 점유한 지점만 클릭한다.

    윈도우 알림 토스트(ShellExperienceHost)는 WS_EX_TOPMOST 라서 SetForegroundWindow
    로도 그 아래로 내려가지 않는다. 즉 foreground() 가 성공해도 토스트가 클릭 좌표를
    덮고 있으면 SendInput 클릭은 게임이 아니라 토스트로 들어간다. 게임은 아무 일도
    일어나지 않은 것과 구별되지 않으므로 하네스는 조용히 오진한다.

    B75(2026-07-14)가 정확히 이 함정으로 죽었다: キャラカード 클릭점(클라 좌표
    657,306) 위에 알림 토스트 3장이 떠 있었고(.omo/live-qa/m3-B75-marker-endian-
    20260714/shots/02-after-login.png, 실패한 attempt 4 의 캡처), 클릭이 전부 토스트에
    먹혀 클라가 월드 연결을 아예 열지 않았다 — 서버 로그에 0x2009 프레임이 없다.
    반면 ゲームスタート(클라 좌표 125,192)는 토스트 바깥이라 정상 동작했다.

    그래서 클릭 직전에 WindowFromPoint 로 그 지점의 실제 소유 창을 확인한다. 클라가
    아니면 클릭하지 않는다. 가린 창이 '윈도우 알림 토스트로 확인된 경우에만' 정상 닫기
    경로로 닫고(dismiss_toast), 닫은 뒤 가림이 실제로 해소됐는지 재확인한 다음에야
    클릭한다. 그 외의 창(브라우저·에디터 등)은 절대 닫지 않고 걷힐 때까지 기다린다.
    timeout_s 안에 안 걷히거나 토스트 dismissal 이 한도(MAX_TOAST_DISMISSALS)를 넘으면
    가린 창의 정체를 담아 예외를 던진다 — 허공을 클릭하고 "게임이 반응하지 않았다"고
    오진하지 않는다(fail-closed).
    """
    deadline = time.monotonic() + timeout_s
    blocked_by = None
    dismissals = 0
    while True:
        foreground(hwnd)
        owner = window_owner_at(x, y)
        if owner['hwnd'] == int(hwnd):
            mouse_click(x, y, settle=settle)
            return {'label': label, 'point': [int(x), int(y)], 'blockedBy': blocked_by,
                    'toastDismissals': dismissals}
        blocked_by = owner
        if is_notification_toast(owner):
            if dismissals >= MAX_TOAST_DISMISSALS:
                # 토스트가 계속 재생성된다 — 무한 루프 대신 fail-closed.
                raise ClickOccludedError(label, int(x), int(y), owner)
            dismissals += 1
            dismiss_toast(owner, reason=f'클릭 경로 가림: label={label} point=({x},{y})')
            # 닫았다고 넘어가지 않는다. 다음 루프의 WindowFromPoint 로 해소를 재확인한다.
            continue
        if time.monotonic() >= deadline:
            raise ClickOccludedError(label, int(x), int(y), owner)
        time.sleep(0.5)


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
    # 로그인 UI 는 전경 창이어야 SendInput 키 입력을 받는다. foreground() 는 내부에서
    # 타임아웃까지 재시도하고, 그래도 실패하면 ForegroundActivationError 를 던진다.
    # 여기서 그 예외를 삼키지 마라 — 전경을 못 잡은 채로 진행하면 키 입력이 남의 창으로
    # 새고, 하네스는 "게임이 반응하지 않았다"고 오진한다. fail-closed 가 정본이다.
    foreground(hwnd, timeout_s=60.0)
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
