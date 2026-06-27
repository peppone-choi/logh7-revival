"""In-world chat driver (G193): make a real LOGH VII client SEND a CommandGridChat (0x0f1c).

The G192 relay demo was server-initiated (a self-test broadcast). A *true* multiplayer proof is
client-initiated: one player types in the world, the server relays it, the other player sees it.

Reverse engineering (workflow wpobtyvts) mapped the client chat SEND chain:
  TAB key -> chat focus (FUN_005123b0/poller FUN_00500b70) -> per-frame FUN_00516bf0 chat input
  -> FUN_004b5600 builds the 0x8c-byte 0x0f1c struct -> FUN_004b78a0(0,0x79,buf) -> code 0xf1c
  -> generic send wrapper FUN_00612cb0 -> socket send().

CRITICAL: the client reads control keys via GetAsyncKeyState/GetKeyboardState (FUN_00500b70/
FUN_005009d0), NOT the window message queue. So PostMessage(WM_CHAR) -- which login() uses for the
Win32 login EDIT controls -- is INVISIBLE in-world. We must inject at the HID layer with SendInput
(updates async+sync key state AND posts WM_CHAR), and the target window must be foreground+focused.

This module's *core* (plan_chat_key_events) is pure and unit-testable without a live client; the
SendInput/window plumbing is live-only and imported lazily.

Usage (drive a chat into an already-in-world client window):
  python -m tools.logh7_chat_driver drive --title "G7MTClient" --text "HELLO FROM A"
  python -m tools.logh7_chat_driver drive --pid 12345 --text "ANNYEONG"
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass

# FUN_004b5600 rejects msgLen > 0x41 (the wide-char count). Keep our send within that.
MAX_CHAT_CHARS = 0x41  # 65

VK_TAB = 0x09
VK_RETURN = 0x0D


@dataclass(frozen=True)
class KeyEvent:
    """One key action to inject. Exactly one of vk/unicode is meaningful.

    kind='vk'      -> a virtual-key press (TAB/RETURN); `code` is the VK.
    kind='unicode' -> a literal character; `code` is the UTF-16 code unit (KEYEVENTF_UNICODE).
    `keyup` False = press (down), True = release (up).
    """

    kind: str
    code: int
    keyup: bool


def plan_chat_key_events(text: str) -> list[KeyEvent]:
    """Pure core: the exact ordered key events to send a GridChat with body `text`.

    TAB (focus chat) -> each character down/up (KEYEVENTF_UNICODE) -> RETURN (submit).
    Raises ValueError if the message exceeds the client's hard cap (FUN_004b5600 len > 0x41).

    UTF-16 surrogate pairs (chars outside the BMP) count as two code units toward the cap, matching
    the client's wide-char (UTF-16) length accounting.
    """
    # UTF-16 code units (a non-BMP char becomes a surrogate pair = 2 units, matching the client).
    code_units = list(str(text).encode("utf-16-le"))
    code_units = [code_units[i] | (code_units[i + 1] << 8) for i in range(0, len(code_units), 2)]
    if len(code_units) > MAX_CHAT_CHARS:
        raise ValueError(
            f"chat message is {len(code_units)} UTF-16 units; client caps at {MAX_CHAT_CHARS}"
        )

    events: list[KeyEvent] = [KeyEvent("vk", VK_TAB, False), KeyEvent("vk", VK_TAB, True)]
    for unit in code_units:
        events.append(KeyEvent("unicode", unit, False))
        events.append(KeyEvent("unicode", unit, True))
    events.append(KeyEvent("vk", VK_RETURN, False))
    events.append(KeyEvent("vk", VK_RETURN, True))
    return events


# --------------------------------------------------------------------------------------------------
# Live plumbing (ctypes SendInput). Imported lazily so the pure core stays testable everywhere.
# --------------------------------------------------------------------------------------------------

def _sendinput_machinery():  # pragma: no cover - live only
    import ctypes
    from ctypes import wintypes

    ULONG_PTR = wintypes.WPARAM
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004
    INPUT_KEYBOARD = 1

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", wintypes.WORD),
            ("wScan", wintypes.WORD),
            ("dwFlags", wintypes.DWORD),
            ("time", wintypes.DWORD),
            ("dwExtraInfo", ULONG_PTR),
        ]

    class MOUSEINPUT(ctypes.Structure):  # included so the union is sized correctly
        _fields_ = [
            ("dx", wintypes.LONG),
            ("dy", wintypes.LONG),
            ("mouseData", wintypes.DWORD),
            ("dwFlags", wintypes.DWORD),
            ("time", wintypes.DWORD),
            ("dwExtraInfo", ULONG_PTR),
        ]

    class _INPUTUNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", _INPUTUNION)]

    def make_input(event: KeyEvent) -> "INPUT":
        flags = 0
        if event.kind == "unicode":
            flags |= KEYEVENTF_UNICODE
            wvk, wscan = 0, event.code
        else:
            wvk, wscan = event.code, 0
        if event.keyup:
            flags |= KEYEVENTF_KEYUP
        ki = KEYBDINPUT(wVk=wvk, wScan=wscan, dwFlags=flags, time=0, dwExtraInfo=0)
        return INPUT(type=INPUT_KEYBOARD, u=_INPUTUNION(ki=ki))

    def send_one(event: KeyEvent) -> None:
        inp = make_input(event)
        n = ctypes.windll.user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        if n != 1:
            raise OSError(f"SendInput failed (GetLastError={ctypes.get_last_error()})")

    return send_one


def _focus_window(hwnd: int) -> None:  # pragma: no cover - live only
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    # In-world key polling (GetAsyncKeyState / GetKeyboardState) only returns nonzero for the
    # foreground+focused window, so we must genuinely activate it. AttachThreadInput defeats the
    # Win32 foreground-steal lock; SetFocus makes GetFocus() return our hwnd (FUN_00500580 gate).
    try:
        fg = win32gui.GetForegroundWindow()
        fg_thread = win32process.GetWindowThreadProcessId(fg)[0] if fg else 0
        cur = win32api.GetCurrentThreadId()
        if fg_thread and fg_thread != cur:
            win32process.AttachThreadInput(cur, fg_thread, True)
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.BringWindowToTop(hwnd)
        try:
            win32gui.SetForegroundWindow(hwnd)
        except Exception:  # noqa: BLE001
            pass
        try:
            win32gui.SetFocus(hwnd)
        except Exception:  # noqa: BLE001
            pass
        if fg_thread and fg_thread != cur:
            win32process.AttachThreadInput(cur, fg_thread, False)
    except Exception as exc:  # noqa: BLE001
        print(f"  focus warn: {exc}")
    time.sleep(0.3)


def drive_inworld_chat(hwnd: int, text: str, *, frame: float = 0.05) -> int:  # pragma: no cover
    """Live: focus `hwnd` and inject TAB / message / ENTER via SendInput so the client sends 0x0f1c.

    `frame` is the per-event gap; the client polls keys per-frame and edge-detects, so each press
    must straddle at least one frame (~33ms). Returns the number of key events sent.
    """
    events = plan_chat_key_events(text)
    send_one = _sendinput_machinery()
    _focus_window(hwnd)
    # TAB to open chat focus, then let a couple of frames pass before typing.
    send_one(events[0])
    time.sleep(frame)
    send_one(events[1])
    time.sleep(frame * 3)
    for event in events[2:-2]:
        send_one(event)
        time.sleep(frame)
    time.sleep(frame * 2)
    # ENTER to submit.
    send_one(events[-2])
    time.sleep(frame)
    send_one(events[-1])
    time.sleep(frame * 4)
    return len(events)


def _find_window(title: str | None, pid: int | None) -> int:  # pragma: no cover - live only
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    hits: list[int] = []

    def enum(hwnd: int, _extra: int) -> None:
        if not win32gui.IsWindowVisible(hwnd):
            return
        if pid is not None:
            _, wpid = win32process.GetWindowThreadProcessId(hwnd)
            if wpid != pid:
                return
        if title is not None and title.lower() not in win32gui.GetWindowText(hwnd).lower():
            return
        hits.append(hwnd)

    win32gui.EnumWindows(enum, 0)
    if not hits:
        raise RuntimeError(f"no window for title={title!r} pid={pid}")
    return hits[0]


def _cmd_drive(args: argparse.Namespace) -> int:  # pragma: no cover - live only
    hwnd = _find_window(args.title, args.pid)
    print(f"driving chat into hwnd={hwnd}: {args.text!r}")
    sent = drive_inworld_chat(hwnd, args.text, frame=args.frame)
    print(f"sent {sent} key events")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("drive", help="drive a chat into a running in-world client window")
    d.add_argument("--title", default=None, help="window title substring (default: any visible)")
    d.add_argument("--pid", type=int, default=None, help="client process id")
    d.add_argument("--text", required=True, help="message to type (<= 65 UTF-16 units)")
    d.add_argument("--frame", type=float, default=0.05, help="per-event gap seconds")
    d.set_defaults(func=_cmd_drive)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
