"""LOGH VII 인-월드 마우스 가두기(cursor clip) — 비침습 외부 도구.

배경(RE 확정):
  클라(G7MTClient, ImageBase 0x400000)는 ``ClipCursor``를 **한 번도 호출하지 않는다**
  (decompile 인덱스 grep 0건, import 테이블에도 없음). 매 프레임 입력 폴 ``FUN_00500b70``
  (VA 0x00500b70)은 ``GetCursorPos`` → ``ScreenToClient`` → ``GetClientRect`` 만 하고, 커서가
  클라 클라이언트 영역을 벗어나면 ``iViewFocusIn`` 플래그(``DAT_02214c28``)만 0이 된다. 즉
  멀티모니터/창 모드에서 커서가 게임 창 밖으로 새어나가 인-월드 마우스 드래그·클릭이
  유실되는 근본 원인이 **클립 부재**다. WndProc(``FUN_005db3b0``)도 WM_ACTIVATE/WM_ACTIVATEAPP
  에서 클립을 걸거나 풀지 않는다.

이 도구는 EXE를 건드리지 않고, 외부 프로세스가 클라 창에 ``ClipCursor``(client rect → screen
rect)를 적용한다. ui_explorer 통합용(``import`` 해서 ``apply_clip``/``release_clip``/``watch_clip``
호출) 및 단독 CLI 양쪽으로 쓴다.

주의:
  - ``ClipCursor``는 **전역**이라 프로세스가 살아 있는 동안만 유지된다. 창이 비활성화되거나
    포커스를 잃으면 OS가 자동으로 클립을 푼다. 그래서 ``watch`` 모드로 주기적으로 다시 건다.
  - 종료/포커스 상실 시 반드시 ``release``(=ClipCursor(NULL))로 풀어야 다른 앱이 막히지 않는다.
  - 멀티모니터 좌표는 가상 화면 기준 음수가 될 수 있다(왼쪽 모니터). client→screen 변환을
    그대로 쓰므로 음수 좌표도 정상 처리된다.

CLI:
  python tools/logh7_cursor_clip.py apply  --pid <clientPid>     # 1회 클립
  python tools/logh7_cursor_clip.py apply  --hwnd <hwndDec>      # hwnd 직접 지정
  python tools/logh7_cursor_clip.py watch  --pid <clientPid> [--interval 0.25] [--margin 0]
  python tools/logh7_cursor_clip.py release                     # 클립 해제(전역)
  python tools/logh7_cursor_clip.py status --pid <clientPid>    # 현재 클립 rect/창 rect 출력
  python tools/logh7_cursor_clip.py selftest                    # ctypes 라운드트립 자가검증

ui_explorer 통합 예:
  from tools.logh7_cursor_clip import apply_clip, release_clip, watch_clip
  rect = apply_clip(hwnd=hwnd)            # 또는 apply_clip(pid=clientPid)
  ...
  release_clip()                          # 종료 시
"""

from __future__ import annotations

import argparse
import ctypes
import sys
import time
from ctypes import wintypes
from typing import Any, Optional


# --- Win32 API 바인딩 (pywin32 불필요, ctypes만으로 동작) -----------------------------------

if sys.platform == "win32":
    _user32 = ctypes.windll.user32
    _kernel32 = ctypes.windll.kernel32
else:  # pragma: no cover - 비윈도우에서는 import는 되되 호출 시 에러
    _user32 = None  # type: ignore[assignment]
    _kernel32 = None  # type: ignore[assignment]


class _RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


class _POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


def _require_win32() -> None:
    if sys.platform != "win32" or _user32 is None:
        raise RuntimeError("logh7_cursor_clip는 Windows에서만 동작합니다(ClipCursor user32).")


def _check(ok: Any, what: str) -> None:
    if not ok:
        err = ctypes.get_last_error() if _kernel32 else 0
        raise OSError(f"{what} 실패 (GetLastError={err})")


# --- 창 핸들 찾기 -----------------------------------------------------------------------------

def find_client_hwnd(pid: int) -> int:
    """주어진 pid의 보이는(top-level) 창 핸들을 찾는다.

    tools/logh7_window_login.find_client_window와 동일한 전략(EnumWindows + 가시성 필터 +
    pid 매칭)을 ctypes로만 구현해 pywin32 의존성을 없앴다.
    """
    _require_win32()
    deadline = time.time() + 8.0
    enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    while time.time() < deadline:
        hits: list[int] = []

        def _enum(hwnd: int, _lparam: int) -> bool:
            if not _user32.IsWindowVisible(hwnd):
                return True
            wpid = wintypes.DWORD(0)
            _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
            if wpid.value == pid:
                hits.append(hwnd)
            return True

        _user32.EnumWindows(enum_proc_type(_enum), 0)
        if hits:
            return hits[0]
        time.sleep(0.1)
    raise RuntimeError(f"pid {pid}의 클라 창을 찾지 못했습니다.")


def _resolve_hwnd(hwnd: Optional[int], pid: Optional[int]) -> int:
    if hwnd:
        if not _user32.IsWindow(hwnd):
            raise RuntimeError(f"hwnd 0x{hwnd:x}는 유효한 창이 아닙니다.")
        return int(hwnd)
    if pid:
        return find_client_hwnd(pid)
    raise ValueError("hwnd 또는 pid 중 하나는 지정해야 합니다.")


# --- 클립 적용/해제 ---------------------------------------------------------------------------

def client_screen_rect(hwnd: int, margin: int = 0) -> tuple[int, int, int, int]:
    """창의 client 영역을 screen 좌표 (left, top, right, bottom)으로 반환.

    클라가 ``GetClientRect`` + ``ScreenToClient``로 hit-test하므로, 가두는 영역도 정확히
    client 영역이어야 한다(타이틀바/보더 제외). margin>0이면 안쪽으로 그만큼 줄인다.
    """
    _require_win32()
    rc = _RECT()
    _check(_user32.GetClientRect(hwnd, ctypes.byref(rc)), "GetClientRect")
    top_left = _POINT(rc.left, rc.top)
    bottom_right = _POINT(rc.right, rc.bottom)
    _check(_user32.ClientToScreen(hwnd, ctypes.byref(top_left)), "ClientToScreen(TL)")
    _check(_user32.ClientToScreen(hwnd, ctypes.byref(bottom_right)), "ClientToScreen(BR)")
    left = top_left.x + margin
    top = top_left.y + margin
    right = bottom_right.x - margin
    bottom = bottom_right.y - margin
    # margin이 과해 뒤집히면 최소 1x1 보장
    if right <= left:
        right = left + 1
    if bottom <= top:
        bottom = top + 1
    return left, top, right, bottom


def get_clip_rect() -> tuple[int, int, int, int]:
    """현재 OS 전역 클립 rect(screen 좌표)를 반환."""
    _require_win32()
    rc = _RECT()
    _check(_user32.GetClipCursor(ctypes.byref(rc)), "GetClipCursor")
    return rc.left, rc.top, rc.right, rc.bottom


def apply_clip(hwnd: Optional[int] = None, pid: Optional[int] = None, margin: int = 0) -> dict[str, Any]:
    """클라 창 client 영역으로 커서를 가둔다. 적용된 screen rect를 dict로 반환."""
    _require_win32()
    target = _resolve_hwnd(hwnd, pid)
    left, top, right, bottom = client_screen_rect(target, margin=margin)
    rc = _RECT(left, top, right, bottom)
    _check(_user32.ClipCursor(ctypes.byref(rc)), "ClipCursor")
    return {"hwnd": target, "rect": (left, top, right, bottom), "margin": margin}


def release_clip() -> None:
    """커서 가두기 해제(전역 ClipCursor(NULL))."""
    _require_win32()
    _check(_user32.ClipCursor(None), "ClipCursor(NULL)")


def watch_clip(
    hwnd: Optional[int] = None,
    pid: Optional[int] = None,
    interval: float = 0.25,
    margin: int = 0,
    only_when_foreground: bool = True,
    log: Any = None,
) -> None:
    """주기적으로 클립을 다시 건다(블로킹).

    OS는 창이 포커스를 잃으면 클립을 자동 해제하므로, 활성/포그라운드일 때만 다시 건다.
    Ctrl+C 또는 창 소멸 시 클립을 풀고 빠져나온다. ui_explorer가 백그라운드 스레드/프로세스로
    돌릴 수 있게 단독 함수로 분리.
    """
    _require_win32()
    target = _resolve_hwnd(hwnd, pid)

    def _emit(msg: str) -> None:
        if log is not None:
            log(msg)

    _emit(f"[cursor-clip] watch 시작 hwnd=0x{target:x} interval={interval}s margin={margin}")
    try:
        while True:
            if not _user32.IsWindow(target):
                _emit("[cursor-clip] 창이 사라짐 — watch 종료")
                break
            foreground_ok = True
            if only_when_foreground:
                foreground_ok = _user32.GetForegroundWindow() == target
            if foreground_ok:
                try:
                    left, top, right, bottom = client_screen_rect(target, margin=margin)
                    rc = _RECT(left, top, right, bottom)
                    _user32.ClipCursor(ctypes.byref(rc))
                except OSError:
                    pass
            else:
                # 비활성: OS가 이미 풀었을 것이므로 우리가 잡고 있던 클립도 명시적으로 해제
                _user32.ClipCursor(None)
            time.sleep(interval)
    except KeyboardInterrupt:
        _emit("[cursor-clip] 중단 요청 — 클립 해제")
    finally:
        try:
            _user32.ClipCursor(None)
        except Exception:
            pass


# --- 자가검증(라운드트립) ---------------------------------------------------------------------

def selftest() -> int:
    """실클라 없이 ctypes 바인딩이 정상인지 라운드트립으로 자가검증.

    임의 rect로 ClipCursor → GetClipCursor가 같은 값을 돌려주는지 확인하고, 즉시 해제한다.
    """
    _require_win32()
    # 현재 클립을 백업했다가 복원
    before = get_clip_rect()
    # 화면 중앙 200x150 영역
    sw = _user32.GetSystemMetrics(0)
    sh = _user32.GetSystemMetrics(1)
    left = sw // 2 - 100
    top = sh // 2 - 75
    right = left + 200
    bottom = top + 150
    rc = _RECT(left, top, right, bottom)
    _check(_user32.ClipCursor(ctypes.byref(rc)), "ClipCursor")
    got = get_clip_rect()
    # 해제 후 원래 클립(보통 전체 화면)으로 복원
    _user32.ClipCursor(None)
    ok = got == (left, top, right, bottom)
    print(f"[selftest] set={(left, top, right, bottom)} got={got} match={ok}")
    print(f"[selftest] prior_clip={before} (released to full screen)")
    if not ok:
        print("[selftest] FAIL — ClipCursor/GetClipCursor 라운드트립 불일치")
        return 1
    print("[selftest] PASS — cursor-clip ctypes 바인딩 정상")
    return 0


# --- CLI -------------------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LOGH VII 인-월드 마우스 가두기(cursor clip) 외부 도구")
    sub = parser.add_subparsers(dest="command", required=True)

    def _add_target(p: argparse.ArgumentParser) -> None:
        p.add_argument("--pid", type=int, default=None, help="클라 프로세스 pid")
        p.add_argument("--hwnd", type=lambda s: int(s, 0), default=None, help="창 핸들(10/16진)")
        p.add_argument("--margin", type=int, default=0, help="안쪽 여백(px)")

    p_apply = sub.add_parser("apply", help="1회 클립")
    _add_target(p_apply)

    p_watch = sub.add_parser("watch", help="주기적으로 다시 클립(블로킹)")
    _add_target(p_watch)
    p_watch.add_argument("--interval", type=float, default=0.25, help="재적용 주기(초)")
    p_watch.add_argument("--any-focus", action="store_true", help="포그라운드 아니어도 클립 유지")

    sub.add_parser("release", help="클립 해제(전역)")

    p_status = sub.add_parser("status", help="현재 클립/창 rect 출력")
    _add_target(p_status)

    sub.add_parser("selftest", help="ctypes 라운드트립 자가검증")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    cmd = args.command

    if cmd == "selftest":
        return selftest()

    if cmd == "release":
        release_clip()
        print("[cursor-clip] released (ClipCursor NULL)")
        return 0

    if cmd == "apply":
        result = apply_clip(hwnd=args.hwnd, pid=args.pid, margin=args.margin)
        print(f"[cursor-clip] applied hwnd=0x{result['hwnd']:x} rect={result['rect']}")
        return 0

    if cmd == "status":
        hwnd = _resolve_hwnd(args.hwnd, args.pid)
        win_rect = client_screen_rect(hwnd, margin=args.margin)
        clip = get_clip_rect()
        print(f"[cursor-clip] hwnd=0x{hwnd:x}")
        print(f"  client(screen) rect = {win_rect}")
        print(f"  current clip   rect = {clip}")
        print(f"  clipped_to_window   = {clip == win_rect}")
        return 0

    if cmd == "watch":
        watch_clip(
            hwnd=args.hwnd,
            pid=args.pid,
            interval=args.interval,
            margin=args.margin,
            only_when_foreground=not args.any_focus,
            log=print,
        )
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
