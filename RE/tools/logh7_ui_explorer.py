"""Interactive UI-exploration harness for the REAL LOGH VII client + authoritative server.

Unlike the one-shot e2e (logh7_auth_server_e2e), this keeps the client AND server alive
ACROSS tool invocations by launching them DETACHED (breakaway from the parent job), so we can
press every button, type, and watch what the UI shows + what the server sends/receives, one
action at a time. Each interaction auto-captures a screenshot, the live child-window text, and
the NEW server trace events since the previous action -- so every click is self-documenting
("뭐가 나오고 진행되고 전송되고 받는지").

By default `start` runs the canonical playable client (`G7MTClient.playable.exe`) so Korean
glyphs and the menu/dialog fixes stay active. Pass --no-patch to drive the installed client as-is,
--patched-exe to use a probe build, or --lobby-unblock-patch to exercise the older one-off patch.
`stop` restores and verifies the exact EXE SHA that was installed when `start` began; if a session
is abandoned, a later `start`/`stop` restores from the backup it left behind.

Subcommands (all take --session DIR, default .omo/ui-explorer/session):
  start  [--server-root P] [--port N] [--no-login] [--no-patch] [--patched-exe P]  launch server+client, login
  login  --account ID --password-stdin                               login with supplied account and stdin password
  wait-trace --code HEX --timeout SEC                                wait for a server trace code
  create-character --session-row N --faction empire|alliance ...     drive signup character creation
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
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, assert_never

from tools.logh7_auth_server_e2e import _capture_window, _dump_window_text
from tools.logh7_client_exe import (
    CLIENT_DIR,
    COMMANDLINE_BOOTSTRAP_PATCH,
    INSTALLED_CLIENT_EXE,
    REPO_ROOT,
    UI_EXPLORER_BACKUP_EXE,
    ClientLaunchMode,
    choose_ui_explorer_launch,
    label_for_sha,
    playable_manifest_stack,
    sha256_file,
    verify_client_sha,
)
from tools.logh7_lobby_unblock_patch import apply_lobby_unblock_patch
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_ui_flow import (
    CharacterFlowSpec,
    InvalidFactionError,
    InvalidSessionRowError,
    InvalidTraceCodeError,
    LoginSpec,
    matching_trace_events,
    normalize_code_hex,
    parse_faction,
    parse_trace_code,
    run_create_character_flow,
    run_login_flow,
)
from tools.logh7_window_login import _click, _type_text, find_client_window, login

ROOT = REPO_ROOT
CLIENT_EXE = INSTALLED_CLIENT_EXE
DEFAULT_SESSION = ROOT / ".omo/ui-explorer/session"
COMMANDLINE_BOOTSTRAP_PORT = 47900

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

FORBIDDEN_DEFAULT_LOGH_FLAGS = (
    "LOGH_NPC_AI",
    "LOGH_RELAY",
    "LOGH_AUTHORITATIVE",
    "LOGH_DUTY_CARDS",
    "LOGH_ROSTER_PUSH",
)

FontRegistrationReceipt = dict[str, str | int | bool]


def _validate_commandline_bootstrap_port(port: int, *, client_driven_login: bool) -> None:
    if client_driven_login and port != COMMANDLINE_BOOTSTRAP_PORT:
        raise SystemExit(
            "login-commandline-bootstrap connects the client to 127.0.0.1:"
            f"{COMMANDLINE_BOOTSTRAP_PORT}; start the server with --port "
            f"{COMMANDLINE_BOOTSTRAP_PORT} or use a client build without that patch"
        )


def _effective_logh_env_receipt(env: dict[str, str]) -> dict[str, Any]:
    effective = {key: env[key] for key in sorted(env) if key.startswith("LOGH_")}
    forbidden = {
        key: effective[key]
        for key in FORBIDDEN_DEFAULT_LOGH_FLAGS
        if key in effective
    }
    return {
        "effectiveLoghEnv": effective,
        "forbiddenDefaultLoghFlags": {
            "checked": list(FORBIDDEN_DEFAULT_LOGH_FLAGS),
            "present": forbidden,
            "absent": [key for key in FORBIDDEN_DEFAULT_LOGH_FLAGS if key not in effective],
        },
    }


def _register_pretendard_fonts(session: Path, font_roots: list[Path] | None = None) -> FontRegistrationReceipt:
    roots = font_roots or [CLIENT_DIR.parent / "fonts", CLIENT_DIR.parents[1] / "fonts", ROOT / "client/fonts"]
    fonts = sorted(
        path
        for root in roots
        if root.exists()
        for pattern in ("*.ttf", "*.otf")
        for path in root.rglob(pattern)
    )
    if not fonts:
        return {"attempted": False, "reason": "fonts-not-found"}
    log_path = session / "font-registration.log"
    try:
        import ctypes

        gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        loaded = 0
        for font in fonts:
            loaded += max(0, int(gdi32.AddFontResourceExW(str(font.resolve()), 0, None)))
        result = ctypes.c_ulong()
        user32.SendMessageTimeoutW(ctypes.c_void_p(0xFFFF), 0x001D, 0, None, 0x0002, 5000, ctypes.byref(result))
    except (AttributeError, OSError) as exc:
        log_path.write_text(str(exc), encoding="utf-8")
        return {"attempted": True, "ok": False, "method": "AddFontResourceExW", "error": str(exc), "log": str(log_path)}

    log_path.write_text(
        f"method=AddFontResourceExW\nfontCount={len(fonts)}\nloaded={loaded}\n",
        encoding="utf-8",
    )
    return {
        "attempted": True,
        "ok": loaded > 0,
        "method": "AddFontResourceExW",
        "fontCount": len(fonts),
        "loaded": loaded,
        "log": str(log_path),
    }


def _text_action_report(label: str, value: str, sent_text: str, *, compensate_first: bool) -> dict[str, Any]:
    if "password" in label:
        return {
            "type": "text",
            "redacted": True,
            "valueLength": len(value),
            "sentKeyEventLength": len(sent_text),
            "firstKeyCompensation": compensate_first,
        }
    return {
        "type": "text",
        "value": value,
        "sentKeyEvents": sent_text,
        "firstKeyCompensation": compensate_first,
    }


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


def _resolve_server_root(server_root: Path) -> Path:
    resolved = server_root.resolve()
    server_entry = resolved / "src/server/logh7-server.mjs"
    if not server_entry.exists():
        raise SystemExit(f"server root missing src/server/logh7-server.mjs: {resolved}")
    return resolved


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


def _patch_dgvoodoo_display_mode(client_dir: Path, mode: str) -> dict[str, Any]:
    conf = client_dir / "dgVoodoo.conf"
    if not conf.exists():
        return {"attempted": False, "reason": "dgVoodoo.conf-not-found", "mode": mode}
    # windowed: 로그인 화면은 원작이 테두리 있는 창모드라, dgVoodoo도 전체화면을 끈다(FullScreenMode=false).
    # 그 외(fullscreen/borderless)는 기존대로 전체화면을 켜고 어트리뷰트만 분기한다.
    windowed = mode == "windowed"
    fullscreen_attributes = "fake" if mode == "borderless" else "fullscreensize"
    replacements = {
        "FullScreenMode": "false" if windowed else "true",
        "ScalingMode": "stretched",
        "FullscreenAttributes": fullscreen_attributes,
        "WatermarkDisplayDuration": "0",
        "3DfxWatermark": "false",
        "3DfxSplashScreen": "false",
        "dgVoodooWatermark": "false",
    }
    lines = conf.read_text(encoding="utf-8", errors="replace").splitlines()
    seen: set[str] = set()
    patched: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        matched = next((key for key in replacements if stripped.startswith(key) and "=" in stripped), None)
        if matched is None:
            patched.append(line)
            continue
        prefix = line[: len(line) - len(stripped)]
        patched.append(f"{prefix}{matched:<36} = {replacements[matched]}")
        seen.add(matched)
    for key, value in replacements.items():
        if key not in seen:
            patched.append(f"{key:<36} = {value}")
    conf.write_text("\n".join(patched) + "\n", encoding="utf-8")
    return {
        "attempted": True,
        "mode": mode,
        "config": str(conf),
        "fullscreenAttributes": fullscreen_attributes,
    }


def _apply_display_mode(win32api: Any, win32con: Any, win32gui: Any, hwnd: int, mode: str) -> dict[str, Any]:
    monitor = win32api.MonitorFromWindow(hwnd, 2)
    info = win32api.GetMonitorInfo(monitor)
    left, top, right, bottom = info["Monitor"]
    # windowed: 원작 로그인 화면은 테두리 있는 네이티브 창모드다. WS_POPUP 리라이트나 모니터 리사이즈를
    # 하면 창 프레임이 사라지고 로그인 클릭이 빗나가므로, 창 스타일을 건드리지 않고 현재 창/클라이언트
    # rect만 기록해 돌려준다(로그인 후 `display` 서브커맨드로 전체화면 전환). 기존 모드는 종전과 동일.
    if mode == "windowed":
        return {
            "attempted": True,
            "mode": mode,
            "windowed": True,
            "monitorRect": [left, top, right, bottom],
            "windowRect": list(win32gui.GetWindowRect(hwnd)),
            "clientRect": list(win32gui.GetClientRect(hwnd)),
        }
    old_style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
    ex_style_index = getattr(win32con, "GWL_EXSTYLE", -20)
    old_ex_style = win32gui.GetWindowLong(hwnd, ex_style_index)
    frame_ex_mask = (
        getattr(win32con, "WS_EX_DLGMODALFRAME", 0x00000001)
        | getattr(win32con, "WS_EX_WINDOWEDGE", 0x00000100)
        | getattr(win32con, "WS_EX_CLIENTEDGE", 0x00000200)
        | getattr(win32con, "WS_EX_STATICEDGE", 0x00020000)
        | getattr(win32con, "WS_EX_TOOLWINDOW", 0x00000080)
    )
    new_ex_style = (old_ex_style & ~frame_ex_mask) | getattr(win32con, "WS_EX_APPWINDOW", 0x00040000)
    win32gui.SetMenu(hwnd, 0)
    win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, win32con.WS_POPUP | win32con.WS_VISIBLE)
    win32gui.SetWindowLong(hwnd, ex_style_index, new_ex_style)
    win32gui.SetWindowPos(
        hwnd,
        win32con.HWND_TOP,
        left,
        top,
        right - left,
        bottom - top,
        win32con.SWP_FRAMECHANGED | win32con.SWP_SHOWWINDOW,
    )
    return {
        "attempted": True,
        "mode": mode,
        "oldStyleHex": f"0x{old_style & 0xffffffff:08x}",
        "newStyleHex": f"0x{win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE) & 0xffffffff:08x}",
        "oldExStyleHex": f"0x{old_ex_style & 0xffffffff:08x}",
        "newExStyleHex": f"0x{win32gui.GetWindowLong(hwnd, ex_style_index) & 0xffffffff:08x}",
        "hasMenu": bool(win32gui.GetMenu(hwnd)),
        "monitorRect": [left, top, right, bottom],
        "windowRect": list(win32gui.GetWindowRect(hwnd)),
        "clientRect": list(win32gui.GetClientRect(hwnd)),
    }


def _force_borderless_fullscreen(win32api: Any, win32con: Any, win32gui: Any, hwnd: int) -> dict[str, Any]:
    return _apply_display_mode(win32api, win32con, win32gui, hwnd, "borderless")


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


def _foreground_errors() -> tuple[type[BaseException], ...]:
    try:
        import pywintypes  # type: ignore[import-not-found]
    except ImportError:
        return (OSError,)
    return (OSError, pywintypes.error)


class _ExplorerFlowDriver:
    def __init__(self, state: dict[str, Any], session: Path) -> None:
        self._state = state
        self._session = session

    def click(self, x: int, y: int, *, label: str, settle: float) -> dict[str, Any]:
        import win32api  # type: ignore[import-not-found]
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]

        hwnd = _resolve_hwnd(self._state)
        try:
            win32gui.SetForegroundWindow(hwnd)
        except _foreground_errors():
            pass
        time.sleep(0.2)
        _click(win32api, win32con, win32gui, hwnd, x, y)
        report = _observe(self._state, self._session, label, settle=settle)
        report["action"] = {"type": "click", "x": x, "y": y}
        return report

    def text(self, value: str, *, label: str, settle: float) -> dict[str, Any]:
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]

        hwnd = _resolve_hwnd(self._state)
        try:
            win32gui.SetForegroundWindow(hwnd)
        except _foreground_errors():
            pass
        time.sleep(0.2)
        compensate_first = label == "login-account-text"
        sent_text = _type_text(win32con, win32gui, hwnd, value, compensate_first=compensate_first)
        report = _observe(self._state, self._session, label, settle=settle)
        report["action"] = _text_action_report(label, value, sent_text, compensate_first=compensate_first)
        return report


# --------------------------------------------------------------------------- commands


def cmd_start(args: argparse.Namespace) -> int:
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    session: Path = args.session.resolve()
    session.mkdir(parents=True, exist_ok=True)
    exe_backup = UI_EXPLORER_BACKUP_EXE

    # If a previous session left a backup, restore it before swapping again (avoid double-patch).
    if exe_backup.exists():
        shutil.copy2(exe_backup, CLIENT_EXE)
        exe_backup.unlink()

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    if args.no_patch and args.lobby_unblock_patch:
        raise SystemExit("--no-patch and --lobby-unblock-patch cannot be combined")

    expected_client_sha = sha256_file(CLIENT_EXE)
    expected_client_kind = label_for_sha(expected_client_sha)
    launch_plan = choose_ui_explorer_launch(
        no_patch=args.no_patch,
        patched_exe=args.patched_exe,
        lobby_unblock_patch=args.lobby_unblock_patch,
    )
    launch_stack = playable_manifest_stack(launch_plan.source) if launch_plan.source is not None else ()
    client_driven_login = COMMANDLINE_BOOTSTRAP_PATCH in launch_stack
    _validate_commandline_bootstrap_port(args.port, client_driven_login=client_driven_login)
    run_exe = CLIENT_EXE
    patch_info: Any = None
    if launch_plan.uses_backup:
        shutil.copy2(CLIENT_EXE, exe_backup)
        match launch_plan.mode:
            case ClientLaunchMode.EXPLICIT_EXE | ClientLaunchMode.CANONICAL_PLAYABLE:
                source = launch_plan.source
                if source is None:
                    raise SystemExit("selected client launch plan has no source EXE")
                shutil.copy2(source, CLIENT_EXE)
                patch_info = {
                    "mode": launch_plan.mode.value,
                    "source": str(source),
                    "sourceSha": sha256_file(source),
                    "sourceKind": label_for_sha(sha256_file(source)),
                }
            case ClientLaunchMode.LOBBY_UNBLOCK:
                patched = session / "G7MTClient.patched.exe"
                applied = apply_lobby_unblock_patch(exe_backup, patched)
                shutil.copy2(patched, CLIENT_EXE)
                patch_info = {"mode": launch_plan.mode.value, "patches": [p.name for p in applied]}
            case ClientLaunchMode.NO_PATCH:
                patch_info = {"mode": launch_plan.mode.value}
            case unreachable:
                assert_never(unreachable)
    run_client_sha = sha256_file(CLIENT_EXE)
    font_registration = _register_pretendard_fonts(session)
    display_mode = args.display_mode
    dgvoodoo_display = _patch_dgvoodoo_display_mode(CLIENT_DIR, display_mode)

    trace_path = session / "trace.jsonl"
    if trace_path.exists():
        trace_path.unlink()
    server_log = session / "server.log"
    log_handle = server_log.open("wb")
    server_root = _resolve_server_root(args.server_root)
    import os
    from tools.logh7_launch_config import STANDARD_SERVER_ENV
    server_env = dict(os.environ)
    # 단일 표준 ENV(tools/logh7_launch_config.py)를 먼저 깔아, 테스트가 유저와 동일한 env로 뜬다.
    # 이후 --env CLI 인자가 이를 덮어쓰거나 확장한다(기존 동작 보존).
    server_env.update(STANDARD_SERVER_ENV)
    for pair in getattr(args, "env", None) or []:
        if "=" in pair:
            k, v = pair.split("=", 1)
            server_env[k] = v
    logh_env_receipt = _effective_logh_env_receipt(server_env)
    server = _spawn_detached(
        ["node", "src/server/logh7-server.mjs", "serve-auth",
         "--host", "127.0.0.1", "--port", str(args.port), "--trace", str(trace_path)],
        server_root, log_handle, log_handle, env=server_env,
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
    display_receipt = _apply_display_mode(win32api, win32con, win32gui, hwnd, display_mode)

    state: dict[str, Any] = {
        "session": str(session),
        "port": args.port,
        "serverPid": server.pid,
        "serverRoot": str(server_root),
        "clientPid": client.pid,
        "hwnd": hwnd,
        "tracePath": str(trace_path),
        "serverLog": str(server_log),
        "exeBackup": str(exe_backup) if launch_plan.uses_backup else None,
        "patched": patch_info,
        "expectedClientSha": expected_client_sha,
        "expectedClientKind": expected_client_kind,
        "runClientSha": run_client_sha,
        "runClientKind": label_for_sha(run_client_sha),
        "launchStack": list(launch_stack),
        "displayMode": display_mode,
        "dgVoodooDisplay": dgvoodoo_display,
        "windowDisplay": display_receipt,
        "borderlessFullscreen": display_receipt if display_mode == "borderless" else None,
        "loginAutomation": (
            "client-commandline-bootstrap"
            if client_driven_login
            else ("disabled" if args.no_login else "window-login")
        ),
        "fontRegistration": font_registration,
        **logh_env_receipt,
        "traceOffset": 0,
        "loggedIn": False,
    }
    _save_session(session, state)

    if client_driven_login:
        state["loggedIn"] = True
        report = _observe(state, session, "after-client-commandline-bootstrap", settle=max(args.settle, 2.0))
        _save_session(session, state)
        print(json.dumps({"started": state, "afterClientCommandlineBootstrap": report}, ensure_ascii=False, indent=2))
    elif not args.no_login:
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


def cmd_login(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    driver = _ExplorerFlowDriver(state, session)
    password = _strip_one_trailing_newline(sys.stdin.read())
    result = run_login_flow(driver, LoginSpec(account=args.account, password=password), settle=args.settle)
    state["loggedIn"] = True
    _save_session(session, state)
    print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
    return 0


def _strip_one_trailing_newline(value: str) -> str:
    if value.endswith("\r\n"):
        return value[:-2]
    if value.endswith("\n") or value.endswith("\r"):
        return value[:-1]
    return value


def cmd_wait_trace(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    try:
        code = parse_trace_code(args.code)
    except InvalidTraceCodeError as exc:
        raise SystemExit(str(exc)) from exc
    code_hex = normalize_code_hex(code)
    deadline = time.monotonic() + max(args.timeout, 0.0)
    seen: list[dict[str, Any]] = []
    first_read = True
    while True:
        events = _read_new_trace(state, session, reset=args.all and first_read)
        first_read = False
        seen.extend(events)
        matches = matching_trace_events(events, code)
        if matches:
            print(json.dumps({"matched": True, "code": code_hex, "matches": list(matches), "seen": len(seen)}, ensure_ascii=False, indent=2))
            return 0
        if time.monotonic() >= deadline:
            print(json.dumps({"matched": False, "code": code_hex, "seen": len(seen)}, ensure_ascii=False, indent=2))
            return 1
        time.sleep(min(0.2, max(0.01, deadline - time.monotonic())))


def cmd_create_character(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    driver = _ExplorerFlowDriver(state, session)
    try:
        spec = CharacterFlowSpec(
            session_row=args.session_row,
            faction=parse_faction(args.faction),
            lastname=args.lastname,
            firstname=args.firstname,
            flagship=args.flagship,
        )
        result = run_create_character_flow(driver, spec, settle=args.settle)
    except (InvalidFactionError, InvalidSessionRowError) as exc:
        raise SystemExit(str(exc)) from exc
    _save_session(session, state)
    print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
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
        # 좌표 정합: (x,y)를 client 좌표로 보고 ClientToScreen으로 screen 좌표화한다.
        # borderless에선 client 원점==창 원점이라 종전과 동일, windowed에선 보더/타이틀바를 정확히 보정한다.
        try:
            sx, sy = win32gui.ClientToScreen(hwnd, (args.x, args.y))
        except Exception:  # noqa: BLE001
            left, top, _r, _b = win32gui.GetWindowRect(hwnd)
            sx, sy = left + args.x, top + args.y
        win32api.SetCursorPos((sx, sy))
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
    hw = getattr(args, "hw", False)
    if hw:
        # 하드웨어 레벨 키 주입(keybd_event) — GetAsyncKeyState 폴링에 잡힌다(인-월드 전략맵 키 입력).
        import win32api  # type: ignore[import-not-found]
        KEYEVENTF_KEYUP = 0x0002
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.05)
        win32api.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
    else:
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, 0)
        time.sleep(0.05)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, vk, 0)
    label = args.label or f"key-{token}"
    report = _observe(state, session, label, settle=args.settle)
    report["action"] = {"type": "key", "vk": f"0x{vk:02x}", "name": token, "hw": bool(hw)}
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


def cmd_display(args: argparse.Namespace) -> int:
    """로그인 후 재기동 없이 라이브 창의 디스플레이 모드를 다시 적용한다(주로 windowed→borderless 전환)."""
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]

    session: Path = args.session
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    mode = args.mode
    # dgVoodoo.conf도 모드에 맞게 다시 패치(전체화면 어트리뷰트/FullScreenMode) — 다음 기동/리셋 대비.
    dgvoodoo_display = _patch_dgvoodoo_display_mode(CLIENT_DIR, mode)
    display_receipt = _apply_display_mode(win32api, win32con, win32gui, hwnd, mode)
    state["displayMode"] = mode
    state["dgVoodooDisplay"] = dgvoodoo_display
    state["windowDisplay"] = display_receipt
    state["borderlessFullscreen"] = display_receipt if mode == "borderless" else None
    _save_session(session, state)
    print(json.dumps(
        {"mode": mode, "dgVoodooDisplay": dgvoodoo_display, "windowDisplay": display_receipt},
        ensure_ascii=False, indent=2,
    ))
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
        "expectedClientSha": state.get("expectedClientSha"),
        "expectedClientKind": state.get("expectedClientKind"),
        "runClientSha": state.get("runClientSha"),
        "runClientKind": state.get("runClientKind"),
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
    expected_sha_value = state.get("expectedClientSha")
    expected_sha = expected_sha_value if isinstance(expected_sha_value, str) and expected_sha_value else None
    restored = verify_client_sha(CLIENT_EXE, expected_sha256=expected_sha)
    result["restoredSha"] = restored.sha256
    result["restoredClientKind"] = restored.label
    result["expectedSha"] = restored.expected_sha256
    result["expectedClientKind"] = restored.expected_label
    result["shaVerified"] = restored.verified

    # Final trace snapshot.
    result["finalTrace"] = _read_new_trace(state, session, reset=True)
    state["stopped"] = True
    _save_session(session, state)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["shaVerified"]:
        expected = restored.expected_sha256 or "known canonical client SHA"
        print(f"WARNING: client SHA {restored.sha256} != expected {expected}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start")
    p_start.add_argument("--server-root", type=Path, default=ROOT)
    p_start.add_argument("--port", type=int, default=47900)
    p_start.add_argument("--no-login", action="store_true")
    p_start.add_argument("--no-patch", action="store_true")
    p_start.add_argument("--patched-exe", type=Path, default=None)
    p_start.add_argument("--lobby-unblock-patch", action="store_true")
    # windowed: 원작 로그인 화면(테두리 창모드)을 보존한다. 기본은 종전대로 borderless(하위호환).
    p_start.add_argument("--display-mode", choices=["fullscreen", "borderless", "windowed"], default="borderless")
    p_start.add_argument("--env", action="append", default=[], help="KEY=VAL server env (repeatable)")
    p_start.add_argument("--settle", type=float, default=1.5)
    p_start.set_defaults(func=cmd_start)

    p_shot = sub.add_parser("shot")
    p_shot.add_argument("--label", default="shot")
    p_shot.add_argument("--settle", type=float, default=0.3)
    p_shot.set_defaults(func=cmd_shot)

    p_login = sub.add_parser("login")
    p_login.add_argument("--account", required=True)
    p_login.add_argument("--password-stdin", action="store_true", required=True)
    p_login.add_argument("--settle", type=float, default=2.0)
    p_login.set_defaults(func=cmd_login)

    p_wait_trace = sub.add_parser("wait-trace")
    p_wait_trace.add_argument("--code", required=True)
    p_wait_trace.add_argument("--timeout", type=float, required=True)
    p_wait_trace.add_argument("--all", action="store_true")
    p_wait_trace.set_defaults(func=cmd_wait_trace)

    p_create = sub.add_parser("create-character")
    p_create.add_argument("--session-row", type=int, required=True)
    p_create.add_argument("--faction", choices=["empire", "alliance"], required=True)
    p_create.add_argument("--lastname", required=True)
    p_create.add_argument("--firstname", required=True)
    p_create.add_argument("--flagship", required=True)
    p_create.add_argument("--settle", type=float, default=1.0)
    p_create.set_defaults(func=cmd_create_character)

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
    # --hw: PostMessage 대신 keybd_event(하드웨어 레벨)로 주입 → 게임의 GetAsyncKeyState 폴링에 잡힌다
    # (인-월드 전략맵은 GetAsyncKeyState로 키를 읽으므로 PostMessage는 무시됨 — RE 2026-06-20).
    p_key.add_argument("--hw", action="store_true", help="keybd_event(하드웨어) 주입: GetAsyncKeyState 폴링용")
    p_key.set_defaults(func=cmd_key)

    p_text = sub.add_parser("text")
    p_text.add_argument("value")
    p_text.add_argument("--label", default=None)
    p_text.add_argument("--settle", type=float, default=0.8)
    p_text.set_defaults(func=cmd_text)

    p_trace = sub.add_parser("trace")
    p_trace.add_argument("--all", action="store_true")
    p_trace.set_defaults(func=cmd_trace)

    # 로그인 후(재기동 없이) 라이브 hwnd를 전체화면으로 전환: start --display-mode windowed → 수동 로그인 → display
    p_display = sub.add_parser("display")
    p_display.add_argument("--mode", choices=["fullscreen", "borderless", "windowed"], default="borderless")
    p_display.set_defaults(func=cmd_display)

    sub.add_parser("info").set_defaults(func=cmd_info)
    sub.add_parser("stop").set_defaults(func=cmd_stop)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
