"""Interactive UI-exploration harness for the REAL LOGH VII client + authoritative server.

Unlike the one-shot e2e (logh7_auth_server_e2e), this keeps the client AND server alive
ACROSS tool invocations by launching them DETACHED (breakaway from the parent job), so we can
press every button, type, and watch what the UI shows + what the server sends/receives, one
action at a time. Each interaction auto-captures a screenshot, the live child-window text, and
the NEW server trace events since the previous action -- so every click is self-documenting
("뭐가 나오고 진행되고 전송되고 받는지").

By default `start` applies the lobby-unblock client patch (logh7_lobby_unblock_patch) so conn2
stays open past 0x2000; pass --no-patch to drive the pristine client, or --patched-exe to use a
prebuilt one. The original EXE is restored (and SHA-verified) by `stop`; if a session is
abandoned, a later `start`/`stop` restores from the backup it left behind.

Subcommands (all take --session DIR, default .omo/ui-explorer/session):
  start  [--port N] [--no-login] [--no-patch] [--patched-exe P]  launch server+client, login
  shot   [--label L]                                             screenshot + window text
  click  X Y [--label L] [--settle S]                            click (window-relative) + observe
  rclick X Y [...]                                               right-click + observe
  key    NAME|VK [...]                                           virtual-key press + observe
  text   STR [...]                                               type via WM_CHAR + observe
  trace  [--all]                                                 dump new (or all) server trace
  info                                                           session + process liveness
  stop                                                           kill client, restore+verify EXE

Usage: python -m tools.logh7_ui_explorer start --port 47900
       python -m tools.logh7_ui_explorer shot --label post-login
       python -m tools.logh7_ui_explorer click 323 389 --label confirm
       python -m tools.logh7_ui_explorer stop
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.logh7_auth_server_e2e import _capture_window, _dump_window_text
from tools.logh7_lobby_unblock_patch import apply_lobby_unblock_patch
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_window_login import _click, _type_text, find_client_window, login

ROOT = Path(__file__).resolve().parents[1]
INSTALLED_ROOT = ROOT / ".omo/work/logh7-installed"
CLIENT_DIR = INSTALLED_ROOT / "exe"
CLIENT_EXE = CLIENT_DIR / "G7MTClient.exe"
DEFAULT_SESSION = ROOT / ".omo/ui-explorer/session"
ORIGINAL_SHA = "2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345"

# Windows process-creation flags so the children survive the Bash tool's job-object teardown.
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_BREAKAWAY_FROM_JOB = 0x01000000

VK_NAMES: dict[str, int] = {
    "ENTER": 0x0D, "RETURN": 0x0D, "ESC": 0x1B, "ESCAPE": 0x1B, "TAB": 0x09,
    "SPACE": 0x20, "BACK": 0x08, "BACKSPACE": 0x08, "DELETE": 0x2E, "DEL": 0x2E,
    "UP": 0x26, "DOWN": 0x28, "LEFT": 0x25, "RIGHT": 0x27, "HOME": 0x24, "END": 0x23,
    "PAGEUP": 0x21, "PAGEDOWN": 0x22, "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73,
    "F5": 0x74, "F6": 0x75, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79,
    "F11": 0x7A, "F12": 0x7B,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _process_alive(pid: int) -> bool:
    import ctypes

    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    code = ctypes.c_ulong()
    ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(handle)
    return bool(ok) and code.value == 259  # STILL_ACTIVE


def _spawn_detached(args: list[str], cwd: Path, stdout: Any, stderr: Any, env: dict[str, str] | None = None) -> subprocess.Popen[bytes]:
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB
    try:
        return subprocess.Popen(
            args, cwd=str(cwd), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=flags, env=env
        )
    except OSError:
        # Job forbids breakaway -- fall back; the children may still be cleaned up with the parent.
        flags &= ~CREATE_BREAKAWAY_FROM_JOB
        return subprocess.Popen(
            args, cwd=str(cwd), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=flags, env=env
        )


def _session_path(session: Path) -> Path:
    return session / "session.json"


def _load_session(session: Path) -> dict[str, Any]:
    path = _session_path(session)
    if not path.exists():
        raise SystemExit(f"no active session at {session} (run `start` first)")
    return json.loads(path.read_text(encoding="utf-8"))


def _save_session(session: Path, state: dict[str, Any]) -> None:
    _session_path(session).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _resolve_hwnd(state: dict[str, Any]) -> int:
    """Re-validate the stored hwnd; re-resolve from pid if the window handle went stale."""
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    hwnd = int(state.get("hwnd") or 0)
    if hwnd and win32gui.IsWindow(hwnd):
        return hwnd
    return find_client_window(win32gui, win32process, int(state["clientPid"]))


def _read_new_trace(state: dict[str, Any], session: Path, *, reset: bool = False) -> list[dict[str, Any]]:
    trace_path = Path(state["tracePath"])
    if not trace_path.exists():
        return []
    raw = trace_path.read_bytes()
    offset = 0 if reset else int(state.get("traceOffset", 0))
    chunk = raw[offset:]
    state["traceOffset"] = len(raw)
    _save_session(session, state)
    events: list[dict[str, Any]] = []
    for line in chunk.decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _next_shot(session: Path, label: str) -> Path:
    shots = session / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    counter_file = session / ".shot-counter"
    counter = int(counter_file.read_text()) if counter_file.exists() else 0
    counter += 1
    counter_file.write_text(str(counter))
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label) or "shot"
    return shots / f"{counter:03d}-{safe}.png"


def _observe(state: dict[str, Any], session: Path, label: str, settle: float) -> dict[str, Any]:
    """After an action: settle, screenshot, dump live window text, and collect new trace events."""
    time.sleep(settle)
    hwnd = _resolve_hwnd(state)
    shot = _next_shot(session, label)
    captured = _capture_window(hwnd, shot)
    window_text = [item for item in _dump_window_text(hwnd) if item.get("text")]
    events = _read_new_trace(state, session)
    report = {
        "label": label,
        "screenshot": str(shot) if captured else None,
        "windowText": window_text,
        "newTrace": events,
        "newTraceEvents": [event.get("event") for event in events],
    }
    return report


# --------------------------------------------------------------------------- commands


def cmd_start(args: argparse.Namespace) -> int:
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    session: Path = args.session
    session.mkdir(parents=True, exist_ok=True)
    exe_backup = CLIENT_DIR / "G7MTClient.exe.uiexplorer"

    # If a previous session left a backup, restore it before swapping again (avoid double-patch).
    if exe_backup.exists():
        shutil.copy2(exe_backup, CLIENT_EXE)
        exe_backup.unlink()

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    run_exe = CLIENT_EXE
    patch_info: Any = None
    if not args.no_patch:
        shutil.copy2(CLIENT_EXE, exe_backup)
        if args.patched_exe is not None:
            shutil.copy2(args.patched_exe, CLIENT_EXE)
            patch_info = {"source": str(args.patched_exe)}
        else:
            patched = session / "G7MTClient.patched.exe"
            applied = apply_lobby_unblock_patch(exe_backup, patched)
            shutil.copy2(patched, CLIENT_EXE)
            patch_info = {"patches": [p.name for p in applied]}

    trace_path = session / "trace.jsonl"
    if trace_path.exists():
        trace_path.unlink()
    server_log = session / "server.log"
    log_handle = server_log.open("wb")
    import os
    server_env = dict(os.environ)
    for pair in getattr(args, "env", None) or []:
        if "=" in pair:
            k, v = pair.split("=", 1)
            server_env[k] = v
    server = _spawn_detached(
        ["node", "src/server/logh7-server.mjs", "serve-auth",
         "--host", "127.0.0.1", "--port", str(args.port), "--trace", str(trace_path)],
        ROOT, log_handle, log_handle, env=server_env,
    )

    # Wait for "listening" in the server log.
    deadline = time.time() + 10
    ready = False
    while time.time() < deadline:
        if not _process_alive(server.pid):
            log_handle.close()
            raise SystemExit(f"server exited early; log:\n{server_log.read_text(errors='replace')}")
        if server_log.exists() and "listening" in server_log.read_text(errors="replace"):
            ready = True
            break
        time.sleep(0.1)
    log_handle.close()
    if not ready:
        raise SystemExit("server did not become ready within 10s")

    client = _spawn_detached([str(run_exe)], CLIENT_DIR, subprocess.DEVNULL, subprocess.DEVNULL)
    hwnd = find_client_window(win32gui, win32process, client.pid)

    state: dict[str, Any] = {
        "session": str(session),
        "port": args.port,
        "serverPid": server.pid,
        "clientPid": client.pid,
        "hwnd": hwnd,
        "tracePath": str(trace_path),
        "serverLog": str(server_log),
        "exeBackup": str(exe_backup) if not args.no_patch else None,
        "patched": patch_info,
        "traceOffset": 0,
        "loggedIn": False,
    }
    _save_session(session, state)

    if not args.no_login:
        login(win32api, win32con, win32gui, hwnd)
        state["loggedIn"] = True
        report = _observe(state, session, "after-login", settle=max(args.settle, 2.0))
        _save_session(session, state)
        print(json.dumps({"started": state, "afterLogin": report}, ensure_ascii=False, indent=2))
    else:
        report = _observe(state, session, "initial", settle=max(args.settle, 1.0))
        print(json.dumps({"started": state, "initial": report}, ensure_ascii=False, indent=2))
    return 0


def cmd_shot(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    report = _observe(state, session, args.label, settle=args.settle)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_click(args: argparse.Namespace) -> int:
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]

    session: Path = args.session
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:  # noqa: BLE001
        pass
    time.sleep(0.2)
    if args.right:
        left, top, _r, _b = win32gui.GetWindowRect(hwnd)
        win32api.SetCursorPos((left + args.x, top + args.y))
        win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
        win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        time.sleep(0.1)
    else:
        _click(win32api, win32con, win32gui, hwnd, args.x, args.y)
    label = args.label or f"{'r' if args.right else ''}click-{args.x}-{args.y}"
    report = _observe(state, session, label, settle=args.settle)
    report["action"] = {"type": "rclick" if args.right else "click", "x": args.x, "y": args.y}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_key(args: argparse.Namespace) -> int:
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]

    session: Path = args.session
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    token = args.vk.upper()
    vk = VK_NAMES.get(token, None)
    if vk is None:
        vk = int(args.vk, 0)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:  # noqa: BLE001
        pass
    time.sleep(0.2)
    win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, 0)
    time.sleep(0.05)
    win32gui.PostMessage(hwnd, win32con.WM_KEYUP, vk, 0)
    label = args.label or f"key-{token}"
    report = _observe(state, session, label, settle=args.settle)
    report["action"] = {"type": "key", "vk": f"0x{vk:02x}", "name": token}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_text(args: argparse.Namespace) -> int:
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]

    session: Path = args.session
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:  # noqa: BLE001
        pass
    time.sleep(0.2)
    _type_text(win32con, win32gui, hwnd, args.value)
    report = _observe(state, session, args.label or "text", settle=args.settle)
    report["action"] = {"type": "text", "value": args.value}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_trace(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    events = _read_new_trace(state, session, reset=args.all)
    print(json.dumps({"events": events, "count": len(events)}, ensure_ascii=False, indent=2))
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    import win32gui  # type: ignore[import-not-found]

    hwnd = int(state.get("hwnd") or 0)
    info = {
        "session": str(session),
        "port": state.get("port"),
        "serverPid": state.get("serverPid"),
        "serverAlive": _process_alive(int(state["serverPid"])) if state.get("serverPid") else False,
        "clientPid": state.get("clientPid"),
        "clientAlive": _process_alive(int(state["clientPid"])) if state.get("clientPid") else False,
        "hwndValid": bool(hwnd and win32gui.IsWindow(hwnd)),
        "loggedIn": state.get("loggedIn"),
        "tracePath": state.get("tracePath"),
        "traceOffset": state.get("traceOffset"),
        "patched": state.get("patched"),
    }
    print(json.dumps(info, ensure_ascii=False, indent=2))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    result: dict[str, Any] = {"session": str(session)}

    server_pid = int(state["serverPid"]) if state.get("serverPid") else None
    if server_pid:
        subprocess.run(["taskkill", "/F", "/PID", str(server_pid)], capture_output=True)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    exe_backup = state.get("exeBackup")
    if exe_backup and Path(exe_backup).exists():
        shutil.copy2(exe_backup, CLIENT_EXE)
        Path(exe_backup).unlink()
    restored_sha = _sha256(CLIENT_EXE)
    result["restoredSha"] = restored_sha
    result["shaVerified"] = restored_sha == ORIGINAL_SHA

    # Final trace snapshot.
    result["finalTrace"] = _read_new_trace(state, session, reset=True)
    state["stopped"] = True
    _save_session(session, state)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["shaVerified"]:
        print(f"WARNING: client SHA {restored_sha} != original {ORIGINAL_SHA}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start")
    p_start.add_argument("--port", type=int, default=47900)
    p_start.add_argument("--no-login", action="store_true")
    p_start.add_argument("--no-patch", action="store_true")
    p_start.add_argument("--patched-exe", type=Path, default=None)
    p_start.add_argument("--env", action="append", default=[], help="KEY=VAL server env (repeatable)")
    p_start.add_argument("--settle", type=float, default=1.5)
    p_start.set_defaults(func=cmd_start)

    p_shot = sub.add_parser("shot")
    p_shot.add_argument("--label", default="shot")
    p_shot.add_argument("--settle", type=float, default=0.3)
    p_shot.set_defaults(func=cmd_shot)

    p_click = sub.add_parser("click")
    p_click.add_argument("x", type=int)
    p_click.add_argument("y", type=int)
    p_click.add_argument("--label", default=None)
    p_click.add_argument("--right", action="store_true")
    p_click.add_argument("--settle", type=float, default=0.8)
    p_click.set_defaults(func=cmd_click)

    p_rclick = sub.add_parser("rclick")
    p_rclick.add_argument("x", type=int)
    p_rclick.add_argument("y", type=int)
    p_rclick.add_argument("--label", default=None)
    p_rclick.add_argument("--settle", type=float, default=0.8)
    p_rclick.set_defaults(func=lambda a: cmd_click(argparse.Namespace(**{**vars(a), "right": True})))

    p_key = sub.add_parser("key")
    p_key.add_argument("vk")
    p_key.add_argument("--label", default=None)
    p_key.add_argument("--settle", type=float, default=0.8)
    p_key.set_defaults(func=cmd_key)

    p_text = sub.add_parser("text")
    p_text.add_argument("value")
    p_text.add_argument("--label", default=None)
    p_text.add_argument("--settle", type=float, default=0.8)
    p_text.set_defaults(func=cmd_text)

    p_trace = sub.add_parser("trace")
    p_trace.add_argument("--all", action="store_true")
    p_trace.set_defaults(func=cmd_trace)

    sub.add_parser("info").set_defaults(func=cmd_info)
    sub.add_parser("stop").set_defaults(func=cmd_stop)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
