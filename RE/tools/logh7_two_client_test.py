"""Concurrent two-client test (G170): prove the authoritative server handles two real LOGH VII
clients at once through the cipher handshake -> login -> lobby (the cryptographically hard path).

ui_explorer drives ONE client per session and kills game processes on start, so it can't run two.
This launches two pristine clients against an already-running server (start it separately with
LOGH_RELAY=1 on --port 47900), finds each window, runs the same UI login on both, then leaves them
at the lobby. Inspect the server trace afterward: two distinct connection sets reaching
lobby-login-ok == concurrent multiplayer sessions work.

Usage: python -m tools.logh7_two_client_test run [--settle 4.0]
"""
from __future__ import annotations

import argparse
import subprocess
import time

from tools.logh7_chat_driver import drive_inworld_chat
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_ui_explorer import CLIENT_DIR, CLIENT_EXE, _spawn_detached
from tools.logh7_window_login import find_client_window, login

# Post-login clicks that carry a client from the lobby into the world (scenario menu -> card).
# Window-relative; driven with mouse_event (hardware-level, so the in-world view accepts them).
WORLD_ENTRY_CLICKS = [(126, 194), (650, 315)]


def _click(win32api, win32con, win32gui, hwnd, x, y):
    left, top, _r, _b = win32gui.GetWindowRect(hwnd)
    win32api.SetCursorPos((left + x, top + y))
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def run(settle: float, chat: str | None = None) -> int:
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    pids = []
    for n in (1, 2):
        client = _spawn_detached([str(CLIENT_EXE)], CLIENT_DIR, subprocess.DEVNULL, subprocess.DEVNULL)
        pids.append(client.pid)
        print(f"client{n} launched pid={client.pid}")
        time.sleep(settle)

    def force_foreground(hwnd: int, x: int, y: int) -> None:
        # Two overlapping windows defeat SetForegroundWindow (Win32 foreground-steal lock). Move the
        # target to a distinct spot and AttachThreadInput to the current foreground thread so the
        # foreground switch is allowed, then bring it to top — so login()'s clicks land on it.
        try:
            win32gui.SetWindowPos(hwnd, 0, x, y, 0, 0, win32con.SWP_NOSIZE | win32con.SWP_NOZORDER)
        except Exception:  # noqa: BLE001
            pass
        try:
            fg = win32gui.GetForegroundWindow()
            fg_thread = win32process.GetWindowThreadProcessId(fg)[0] if fg else 0
            cur_thread = win32api.GetCurrentThreadId()
            if fg_thread and fg_thread != cur_thread:
                win32process.AttachThreadInput(cur_thread, fg_thread, True)
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.BringWindowToTop(hwnd)
            try:
                win32gui.SetForegroundWindow(hwnd)
            except Exception:  # noqa: BLE001
                pass
            if fg_thread and fg_thread != cur_thread:
                win32process.AttachThreadInput(cur_thread, fg_thread, False)
        except Exception as exc:  # noqa: BLE001
            print(f"  force_foreground warn: {exc}")
        time.sleep(0.4)

    # Find each window, position it distinctly + force-foreground, then run the login UI. Sequential
    # so each client's login completes (and its server connection opens) before the next.
    positions = [(20, 20), (560, 20)]
    for n, pid in enumerate(pids, start=1):
        try:
            hwnd = find_client_window(win32gui, win32process, pid)
            x, y = positions[(n - 1) % len(positions)]
            force_foreground(hwnd, x, y)
            print(f"client{n} pid={pid} hwnd={hwnd} pos=({x},{y}); logging in...")
            login(win32api, win32con, win32gui, hwnd)
            time.sleep(settle)
        except Exception as exc:  # noqa: BLE001 - report and continue to the other client
            print(f"client{n} pid={pid} login failed: {exc}")

    # Let BOTH lobbies fully load before any world-entry clicks. In G194 the first-launched client's
    # lobby was not ready when its clicks fired, so it stalled at the lobby while the second reached
    # the world. An extra dwell here makes 2/2 world entry reliable.
    time.sleep(settle * 1.5)

    # Carry both clients from the lobby into the world (mouse_event clicks work in-world). Re-assert
    # foreground right before each click and dwell, so the click lands on the intended window.
    hwnds = []
    for n, pid in enumerate(pids, start=1):
        try:
            hwnd = find_client_window(win32gui, win32process, pid)
            hwnds.append(hwnd)
            x, y = positions[(n - 1) % len(positions)]
            force_foreground(hwnd, x, y)
            time.sleep(1.0)
            for cx, cy in WORLD_ENTRY_CLICKS:
                force_foreground(hwnd, x, y)
                _click(win32api, win32con, win32gui, hwnd, cx, cy)
                time.sleep(1.0)
            print(f"client{n} pid={pid} world-entry clicks sent")
            time.sleep(settle)
        except Exception as exc:  # noqa: BLE001
            print(f"client{n} pid={pid} world-entry failed: {exc}")
            hwnds.append(None)

    # Client-initiated chat (G193): drive EVERY entered client to TAB -> type -> ENTER so whichever
    # actually reached the world SENDS 0x0f1c (we cannot predict which client wins the world race).
    if chat:
        time.sleep(settle)
        for n, hwnd in enumerate(hwnds, start=1):
            if not hwnd:
                continue
            try:
                sent = drive_inworld_chat(hwnd, f"{chat} {n}")
                print(f"client{n} drove in-world chat ({sent} key events)")
                time.sleep(settle)
            except Exception as exc:  # noqa: BLE001
                print(f"client{n} chat drive failed: {exc}")

    print(f"both clients launched + login attempted (pids={pids}); inspect the server trace.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    r = sub.add_parser("run")
    r.add_argument("--settle", type=float, default=4.0)
    r.add_argument("--chat", default=None, help="after world entry, drive client 1 to SEND this chat")
    r.set_defaults(func=run)
    args = parser.parse_args()
    return run(args.settle, args.chat)


if __name__ == "__main__":
    raise SystemExit(main())
