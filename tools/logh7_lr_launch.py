"""Launch the LOGH VII client through Locale Remulator (ko-KR) against the local auth server.

Locale Remulator (InWILL) runtime-hooks GetACP/locale/codepage APIs (Detours), so it forces the
process to CP949 / ko-KR regardless of the machine's system ANSI code page (here UTF-8/65001).
That makes the client's ANSI text path (CreateFontA DEFAULT_CHARSET + MultiByteToWideChar) use
Korean — so the CP949 constmsg/String.txt render as Korean with NO EXE patch.

LRProc spawns the client as a SEPARATE process (with the hook injected), so we find the client
window by class/title, not by the spawned PID. Usage:
  python -m tools.logh7_lr_launch --port 47900 --seconds 10 --shot .omo/ui-explorer/lr-shot.png
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import time
from pathlib import Path

from tools.logh7_real_client_probe import _kill_game_processes, _restore_string_file

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / ".omo/work/logh7-installed/exe"
CLIENT_EXE = CLIENT_DIR / "G7MTClient.exe"
MSGDAT = ROOT / ".omo/work/logh7-installed/data/MsgDat"
KO_CONSTMSG = ROOT / ".omo/work/logh7-ko-overlay/data/MsgDat/constmsg.dat"
LR_DIR = ROOT / ".omo/tools/locale-remulator/Locale_Remulator.1.6.0"
LRPROC = LR_DIR / "LRProc.exe"
KO_GUID = "0f9a7b21-1c4d-4e8a-9f33-7a5e6b1c2d3e"  # Run in Korean (NoAdmin), CP949/ko-KR
CLIENT_CLASS = "Afx:400000"  # G7MTClient main window class prefix
CLIENT_TITLE = "銀河英雄伝説"  # 銀河英雄伝説


def find_client_window(win32gui, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        hits = []

        def enum(hwnd, _):
            if not win32gui.IsWindowVisible(hwnd):
                return
            try:
                cls = win32gui.GetClassName(hwnd)
                title = win32gui.GetWindowText(hwnd)
            except Exception:
                return
            if CLIENT_CLASS in cls or CLIENT_TITLE in title:
                hits.append(hwnd)

        win32gui.EnumWindows(enum, 0)
        if hits:
            return hits[0]
        time.sleep(0.25)
    raise RuntimeError("client window not found (LR launch)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Launch client via Locale Remulator ko-KR + auth server.")
    ap.add_argument("--port", type=int, default=47900)
    ap.add_argument("--seconds", type=float, default=10.0)
    ap.add_argument("--shot", type=Path, default=ROOT / ".omo/ui-explorer/lr-shot.png")
    ap.add_argument("--no-login", action="store_true")
    ap.add_argument("--patched-exe", type=Path, default=None,
                    help="overlay this client EXE (e.g. the HANGEUL-charset + 굴림-font patched one) before launch")
    args = ap.parse_args()

    import win32api, win32con, win32gui  # type: ignore
    from PIL import ImageGrab  # type: ignore
    from tools.logh7_window_login import login

    if not LRPROC.exists():
        print(f"LRProc not found at {LRPROC}", flush=True)
        return 1
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)
    # overlay Korean constmsg (backup the JA original once)
    ja_bak = MSGDAT / "constmsg.dat.ja-bak"
    if not ja_bak.exists():
        shutil.copy2(MSGDAT / "constmsg.dat", ja_bak)
    shutil.copy2(KO_CONSTMSG, MSGDAT / "constmsg.dat")
    # optionally overlay a patched client EXE (HANGEUL charset + 굴림 font) so that under LR's forced
    # ko-KR codepage the menu/dialog text resolves to a Korean font (the stock EXE hardcodes ＭＳ ゴシック).
    exe_bak = CLIENT_DIR / "G7MTClient.exe.lrbak"
    if args.patched_exe is not None:
        shutil.copy2(CLIENT_EXE, exe_bak)
        shutil.copy2(args.patched_exe, CLIENT_EXE)

    env = dict(os.environ)
    env["LOGH_LOBBY_OK_FORMAT"] = "message32"
    env["LOGH_SS_FORMAT"] = "message32"
    env["LOGH_WORLD_PLAYER"] = "1"
    env["LOGH_LOBBY_PROACTIVE_OK"] = "1"
    server = subprocess.Popen(
        ["node", "src/server/logh7-server.mjs", "serve-auth", "--host", "127.0.0.1", "--port", str(args.port)],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
    )
    deadline = time.time() + 8
    while time.time() < deadline:
        line = server.stdout.readline() if server.stdout else ""
        if "listening" in line:
            break

    # launch the client THROUGH Locale Remulator with the ko-KR profile
    lr = subprocess.Popen([str(LRPROC), KO_GUID, str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
    print(f"LRProc launched (guid {KO_GUID})", flush=True)

    try:
        hwnd = find_client_window(win32gui)
        print(f"client hwnd={hwnd}", flush=True)
        time.sleep(2.5)
        try:
            win32gui.SetForegroundWindow(hwnd)
        except Exception:
            pass
        if not args.no_login:
            login(win32api, win32con, win32gui, hwnd)
        time.sleep(args.seconds)
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        args.shot.parent.mkdir(parents=True, exist_ok=True)
        ImageGrab.grab(bbox=(left, top, right, bottom)).save(args.shot)
        print(f"shot -> {args.shot} ({right-left}x{bottom-top})", flush=True)
    finally:
        _kill_game_processes()
        try:
            lr.terminate()
        except Exception:
            pass
        server.terminate()
        _restore_string_file(CLIENT_DIR)
        if ja_bak.exists():
            shutil.copy2(ja_bak, MSGDAT / "constmsg.dat")
            ja_bak.unlink()
        if args.patched_exe is not None and exe_bak.exists():
            shutil.copy2(exe_bak, CLIENT_EXE)
            exe_bak.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
