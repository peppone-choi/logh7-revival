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
    # 좌표 정정(2026-06-25): 창모드 client 영역 644x484 기준 로그인 폼 위치.
    # 이전 (325,333)/(325,360)/(323,389)는 어긋나 ID칸을 빗나갔다(라이브 격자 측정).
    # The playable client can open with a "NO DATA" confirm panel above the login fields.
    # Close it first, then type the legacy default account without the old first-key duplicate.
    _click(win32api, win32con, win32gui, hwnd, 452, 293)
    _click(win32api, win32con, win32gui, hwnd, 374, 290)
    _type_text(win32con, win32gui, hwnd, "ginei00", win32api, compensate_first=False)
    _click(win32api, win32con, win32gui, hwnd, 376, 318)
    _type_text(win32con, win32gui, hwnd, "dummy", win32api)
    _click(win32api, win32con, win32gui, hwnd, 352, 347)


def _click(win32api: Any, win32con: Any, win32gui: Any, hwnd: int, x: int, y: int) -> None:
    """Click at window-relative (x, y).

    The in-game scenes (lobby/title/world) read the cursor POSITION via GetCursorPos but ONLY
    poll it while the mouse is moving — a bare SetCursorPos (no movement event) leaves the game's
    last-known cursor stale, so the down/up lands at the wrong place and the widget never fires
    (live-verified: SetCursorPos clicks never dispatched lobby buttons; the game polled GetCursorPos
    0 times in that window). So we drive the cursor with injected ABSOLUTE MOVE events (which the
    game DOES poll, 575x in 2s) and keep it moving THROUGH the down and up so a GetCursorPos poll
    coincides with the button edge. This makes synthetic clicks fire the same as a physical mouse.
    """
    # 포커스 선행: 클라 입력 객체(FUN_00500580)가 GetFocus 게이트를 보므로 마우스 클릭은 창 포커스가
    # 있어야 active 플래그를 채운다(--hw 키는 keybd_event라 포커스 무관이었지만 마우스는 다름).
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass
    time.sleep(0.05)
    # 좌표 정합: 클라는 GetCursorPos(screen)→ScreenToClient 후 client 좌표로 hit-test하므로,
    # client 좌표 (x,y)를 ClientToScreen으로 screen 좌표화해 주입한다(타이틀바/보더 오프셋 제거).
    try:
        sx, sy = win32gui.ClientToScreen(hwnd, (x, y))
    except Exception:
        left, top, _right, _bottom = win32gui.GetWindowRect(hwnd)
        sx, sy = left + x, top + y
    screen_w = max(win32api.GetSystemMetrics(0), 1)
    screen_h = max(win32api.GetSystemMetrics(1), 1)
    move = win32con.MOUSEEVENTF_MOVE | win32con.MOUSEEVENTF_ABSOLUTE

    def _amove(px: int, py: int, extra: int = 0) -> None:
        nx = int(px * 65535 / screen_w)
        ny = int(py * 65535 / screen_h)
        win32api.mouse_event(move | extra, nx, ny, 0, 0)

    win32api.SetCursorPos((sx, sy))
    # Glide in so the scene starts polling GetCursorPos, ending on the target.
    for i in range(1, 9):
        _amove(sx, sy - 32 + (32 * i) // 8)
        time.sleep(0.02)
    _amove(sx, sy)
    time.sleep(0.03)
    # LEFTDOWN 후 버튼을 여러 프레임 동안 유지하며 ±1px 지글한다: active→edge 변환
    # (DAT_02214c00→DAT_022142b0, FUN_00507f20)이 눌림을 연속 폴링 프레임에서 봐야 edge가 생긴다.
    # 원샷 down/up(한 호출에 붙음)은 폴링 프레임을 누락해 선택 확정(+0xb02 SET)에 도달하지 못했다.
    _amove(sx + 1, sy, win32con.MOUSEEVENTF_LEFTDOWN)
    for _ in range(6):
        _amove(sx + 1, sy)
        time.sleep(0.025)
        _amove(sx, sy)
        time.sleep(0.025)
    _amove(sx, sy, win32con.MOUSEEVENTF_LEFTUP)
    time.sleep(0.12)


def _type_text(
    win32con: Any,
    win32gui: Any,
    hwnd: int,
    text: str,
    win32api_module: Any | None = None,
    *,
    compensate_first: bool = False,
) -> str:
    sent_text = f"{text[0]}{text}" if compensate_first and text else text
    if _type_text_with_key_events(win32con, sent_text, win32api_module=win32api_module):
        return sent_text
    _post_chars(win32con, win32gui, hwnd, sent_text)
    return sent_text


def _post_chars(win32con: Any, win32gui: Any, hwnd: int, text: str) -> None:
    # WM_CHAR 폴백. ASCII는 그대로 보내고, 비-ASCII(한글 등)는 원작 DBCS 위젯 규약에 맞춰
    # cp949 바이트쌍(lead+trail)을 각각 WM_CHAR로 연속 주입한다. 클라는 이름칸 charset이
    # cp949 + Pretendard로 패치돼 있어 가타카나 입력과 동일한 2바이트 경로로 한글을 받는다.
    # 주의: PostMessageW(=win32gui.PostMessage)는 wParam을 UTF-16 코드유닛으로 재해석하므로
    # 바이트(0x80~0xFF lead) 주입은 PostMessageA(ctypes)로 보내야 위젯이 원시 바이트로 읽는다.
    import ctypes  # noqa: PLC0415

    post_a = ctypes.windll.user32.PostMessageA
    wm_char = win32con.WM_CHAR
    for char in text:
        cp = ord(char)
        if cp < 0x80:
            win32gui.PostMessage(hwnd, wm_char, cp, 0)
            time.sleep(0.03)
            continue
        try:
            encoded = char.encode("cp949")
        except UnicodeEncodeError:
            continue  # cp949 미수록 문자는 건너뛴다(드롭).
        for byte in encoded:
            post_a(hwnd, wm_char, byte, 0)
            time.sleep(0.02)
        time.sleep(0.03)


def _type_text_with_key_events(win32con: Any, text: str, win32api_module: Any | None = None) -> bool:
    if not text:
        return True
    api = win32api_module
    if api is None:
        try:
            import win32api as api  # type: ignore[import-not-found,no-redef]
        except ImportError:
            return False

    sequence: list[tuple[int, int]] = []
    for char in text:
        scan = api.VkKeyScan(char)
        if scan == -1:
            return False
        vk = scan & 0xFF
        shift_state = (scan >> 8) & 0xFF
        if shift_state & ~0x01:
            return False
        sequence.append((vk, shift_state))

    keyup = getattr(win32con, "KEYEVENTF_KEYUP", 0x0002)
    vk_shift = getattr(win32con, "VK_SHIFT", 0x10)
    time.sleep(0.08)
    for vk, shift_state in sequence:
        if shift_state & 0x01:
            api.keybd_event(vk_shift, 0, 0, 0)
            time.sleep(0.01)
        api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.02)
        api.keybd_event(vk, 0, keyup, 0)
        if shift_state & 0x01:
            time.sleep(0.01)
            api.keybd_event(vk_shift, 0, keyup, 0)
        time.sleep(0.03)
    return True
