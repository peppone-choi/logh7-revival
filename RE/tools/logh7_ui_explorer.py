"""Interactive UI-exploration harness for the REAL LOGH VII client + authoritative server.

Unlike the one-shot e2e (logh7_auth_server_e2e), this keeps the client AND server alive
ACROSS tool invocations by launching them DETACHED (breakaway from the parent job), so we can
press every button, type, and watch what the UI shows + what the server sends/receives, one
action at a time. Each interaction auto-captures a screenshot, the live child-window text, and
the NEW server trace events since the previous action -- so every click is self-documenting
("뭐가 나오고 진행되고 전송되고 받는지").

By default `start` runs the canonical playable client (`G7MTClient.playable.exe`) so Korean
glyphs and the menu/dialog fixes stay active. Pass --no-patch to drive the installed client as-is,
--patched-exe to use a probe build, --runtime-patch NAME to apply descriptor bytes in memory before
Frida resumes the canonical installed client, or --lobby-unblock-patch to exercise the older one-off patch.
On Windows, `start` first asks the installed LOGH7Launcher.exe to `--client-preflight` the same
installed game EXE so Smart App Control failures are detected before the local server is started.
`stop` restores and verifies the exact EXE SHA that was installed when `start` began; if a session
is abandoned, a later `start`/`stop` restores from the backup it left behind.

Subcommands (all take --session DIR, default .omo/ui-explorer/session):
  start  [--server-root P] [--port N] [--no-login] [--no-patch] [--patched-exe P] [--runtime-patch NAME]  launch server+client, login
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
       python -m tools.logh7_ui_explorer display --mode borderless
       python -m tools.logh7_ui_explorer click 323 389 --label confirm
       python -m tools.logh7_ui_explorer stop
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, assert_never

from tools.logh7_auth_server_e2e import _capture_window, _dump_window_text
from tools.logh7_client_exe import (
    CLIENT_DIR,
    COMMANDLINE_BOOTSTRAP_PATCH,
    INSTALLED_CLIENT_EXE,
    PLAYABLE_CLIENT_SHA256,
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
from tools.logh7_window_login import _click, _force_foreground, _type_text, find_client_window, login

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


def _validate_commandline_bootstrap_port(
    port: int,
    *,
    client_driven_login: bool,
    window_login: bool = False,
) -> None:
    if (client_driven_login or window_login) and port != COMMANDLINE_BOOTSTRAP_PORT:
        raise SystemExit(
            "this canonical client login route connects the client to 127.0.0.1:"
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


def _configure_korean_menu_mode(session: Path) -> dict[str, Any]:
    """Set the client's RE-confirmed win.ini Korean menu gate before launch."""
    receipt: dict[str, Any] = {
        "attempted": False,
        "method": "WriteProfileStringW",
        "section": "windows",
        "hangeulmenu": "hangeul",
        "kanjimenu": "roman",
    }
    if sys.platform != "win32":
        receipt["reason"] = "non-windows"
        return receipt
    log_path = session / "korean-menu-mode.json"
    try:
        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        write_profile_string = kernel32.WriteProfileStringW
        write_profile_string.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_wchar_p]
        write_profile_string.restype = ctypes.c_bool
        hangeul_ok = bool(write_profile_string("windows", "hangeulmenu", "hangeul"))
        kanji_ok = bool(write_profile_string("windows", "kanjimenu", "roman"))
        receipt.update({"attempted": True, "ok": hangeul_ok and kanji_ok, "hangeulOk": hangeul_ok, "kanjiOk": kanji_ok})
    except (AttributeError, OSError) as exc:
        receipt.update({"attempted": True, "ok": False, "error": str(exc)})
    log_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    receipt["log"] = str(log_path)
    return receipt


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


def _taskkill_pid(pid: int | None) -> bool:
    if not pid or not _process_alive(pid):
        return False
    subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
    return True


def _cleanup_failed_start(server_pid: int | None, client_pid: int | None) -> dict[str, bool]:
    return {
        "clientKilled": _taskkill_pid(client_pid),
        "serverKilled": _taskkill_pid(server_pid),
    }


def _windows_app_control_message(exe: Path, exc: BaseException) -> str | None:
    if not isinstance(exc, OSError) or getattr(exc, "winerror", None) != 4551:
        return None
    return (
        "client launch blocked by Windows Application Control / Smart App Control: "
        f"{exe}. Check Microsoft-Windows-CodeIntegrity/Operational events 3033/3077 "
        "for the exact policy evidence, or use an explicitly approved client-launch route."
    )


def _client_preflight_with_launcher(session: Path, run_exe: Path, *, enabled: bool = True) -> dict[str, Any]:
    installed_root = CLIENT_DIR.parent
    launcher = installed_root / "LOGH7Launcher.exe"
    receipt: dict[str, Any] = {
        "attempted": False,
        "enabled": enabled,
        "method": "LOGH7Launcher.exe --client-preflight",
        "launcher": str(launcher),
        "runExe": str(run_exe),
    }
    out_path = session / "client-preflight.json"
    if not enabled:
        receipt["reason"] = "disabled"
        out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return receipt
    if sys.platform != "win32":
        receipt["reason"] = f"unsupported-platform:{sys.platform}"
        out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return receipt
    if not launcher.exists():
        receipt["reason"] = "launcher-not-found"
        out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return receipt
    try:
        if run_exe.resolve() != CLIENT_EXE.resolve():
            receipt["reason"] = "non-installed-client"
            out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return receipt
    except OSError as exc:
        receipt["reason"] = f"resolve-failed:{exc}"
        out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return receipt

    completed = subprocess.run(
        [str(launcher), "--client-preflight"],
        cwd=str(installed_root),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=20,
        check=False,
    )
    receipt.update({
        "attempted": True,
        "exitCode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    })
    out_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "see installed logh7-runtime/logs/launcher.log"
        raise SystemExit(f"client preflight failed before server start: {detail}")
    return receipt


def _canonical_playable_source_receipt(source: Path) -> dict[str, str]:
    source_sha = sha256_file(source)
    if source_sha != PLAYABLE_CLIENT_SHA256:
        raise SystemExit(
            "canonical playable source drift: "
            f"{source} sha256 {source_sha} ({label_for_sha(source_sha)}) != "
            f"expected {PLAYABLE_CLIENT_SHA256} ({label_for_sha(PLAYABLE_CLIENT_SHA256)}). "
            "Rebuild with python -m tools.logh7_build_playable_client --deploy."
        )
    return {
        "source": str(source),
        "sourceSha": source_sha,
        "sourceKind": label_for_sha(source_sha),
        "expectedSha": PLAYABLE_CLIENT_SHA256,
    }


def _runtime_patch_names(raw_names: list[str] | None) -> list[str]:
    names: list[str] = []
    for raw_name in raw_names or []:
        name = raw_name.strip()
        if not name:
            raise SystemExit("--runtime-patch requires a non-empty patch name")
        if name.endswith(".json"):
            name = Path(name).stem
        names.append(name)
    return names


def _validate_runtime_patch_start_args(args: argparse.Namespace) -> list[str]:
    patch_names = _runtime_patch_names(getattr(args, "runtime_patch", None))
    if not patch_names:
        return []
    if getattr(args, "patched_exe", None) is not None:
        raise SystemExit("--runtime-patch cannot be combined with --patched-exe; it patches the canonical installed EXE in memory")
    if getattr(args, "lobby_unblock_patch", False):
        raise SystemExit("--runtime-patch cannot be combined with --lobby-unblock-patch; it must leave the on-disk EXE canonical")
    return patch_names


def _import_frida_for_runtime_patch() -> Any:
    try:
        import frida  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit(
            "Frida is required for --runtime-patch; install the frida Python package and ensure local spawn/attach is available"
        ) from exc
    return frida


def _load_runtime_patch_sets(patch_names: list[str]) -> list[dict[str, Any]]:
    from tools.logh7_runtime_patch_apply import _load_patch

    return [_load_patch(name) for name in patch_names]


def _build_runtime_patch_js(patch_sets: list[dict[str, Any]]) -> str:
    from tools.logh7_runtime_patch_apply import _build_js

    return _build_js(patch_sets)


def _runtime_patch_receipt(patch_names: list[str], events: list[dict[str, Any]]) -> dict[str, Any]:
    event_receipts = [dict(event) for event in events]
    byte_events = [dict(event) for event in event_receipts if event.get("tag") == "patch-applied"]
    complete = any(event.get("tag") == "runtime-patch-complete" for event in event_receipts)
    return {
        "method": "frida-spawn-resume",
        "patchNames": list(patch_names),
        "ok": complete and bool(byte_events) and all(event.get("ok") is True for event in byte_events),
        "bytes": byte_events,
        "events": event_receipts,
    }


def _spawn_runtime_patched_client(
    exe: Path,
    cwd: Path,
    patch_names: list[str],
    *,
    frida_module: Any | None = None,
    patch_loader: Callable[[list[str]], list[dict[str, Any]]] = _load_runtime_patch_sets,
    js_builder: Callable[[list[dict[str, Any]]], str] = _build_runtime_patch_js,
    timeout: float = 3.0,
) -> tuple[int, dict[str, Any]]:
    frida = frida_module if frida_module is not None else _import_frida_for_runtime_patch()
    events: list[dict[str, Any]] = []
    device = None
    session = None
    script = None
    pid = 0
    resumed = False
    try:
        patch_sets = patch_loader(patch_names)
        script_source = js_builder(patch_sets)
        device = frida.get_local_device()
        pid = int(device.spawn([str(exe)], cwd=str(cwd)))
        session = device.attach(pid)

        def on_message(message: dict[str, Any], _data: bytes | None) -> None:
            if message.get("type") == "send" and isinstance(message.get("payload"), dict):
                events.append(message["payload"])
                return
            events.append({"tag": "frida-message", "message": message})

        script = session.create_script(script_source)
        script.on("message", on_message)
        script.load()
        deadline = time.time() + timeout
        while not any(event.get("tag") == "runtime-patch-complete" for event in events) and time.time() < deadline:
            time.sleep(0.01)
        receipt = _runtime_patch_receipt(patch_names, events)
        if not receipt["ok"]:
            raise RuntimeError(json.dumps(receipt, ensure_ascii=False))
        device.resume(pid)
        resumed = True
        cleanup_warnings: list[str] = []
        try:
            script.unload()
        except Exception as exc:
            cleanup_warnings.append(f"script unload warning: {exc}")
        script = None
        try:
            session.detach()
        except Exception as exc:
            cleanup_warnings.append(f"session detach warning: {exc}")
        session = None
        if cleanup_warnings:
            receipt["warnings"] = cleanup_warnings
        return pid, receipt
    except Exception as exc:
        if script is not None:
            try:
                script.unload()
            except Exception:
                pass
        if session is not None:
            try:
                session.detach()
            except Exception:
                pass
        if device is not None and pid and not resumed:
            try:
                device.kill(pid)
            except Exception:
                pass
        raise SystemExit(f"--runtime-patch failed before client resume: {exc}") from exc


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
    # windowed/borderless: keep dgVoodoo in windowed presentation so 2D UI is not
    # fake-fullscreen stretched to a non-16:9 monitor. ui_explorer applies the
    # borderless HWND style itself.
    windowed = mode in {"windowed", "borderless"}
    fullscreen_attributes = "fake" if mode == "borderless" else "fullscreensize"
    replacements = {
        "FullScreenMode": "false" if windowed else "true",
        "ScalingMode": "centered" if windowed else "stretched",
        "Resampling": "pointsampled" if windowed else "lanczos-3",
        "FullscreenAttributes": fullscreen_attributes,
        "WindowedAttributes": "borderless" if mode == "borderless" else "",
        "WatermarkDisplayDuration": "1",
        "3DfxWatermark": "false",
        "3DfxSplashScreen": "false",
        "dgVoodooWatermark": "false",
        "Filtering": "appdriven" if windowed else "16",
        "Antialiasing": "off" if windowed else "4x",
        "RTTexturesForceScaleAndMSAA": "false" if windowed else "true",
        "SmoothedDepthSampling": "false" if windowed else "true",
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
        "fullScreenMode": replacements["FullScreenMode"],
        "scalingMode": replacements["ScalingMode"],
        "resampling": replacements["Resampling"],
        "fullscreenAttributes": fullscreen_attributes,
        "windowedAttributes": replacements["WindowedAttributes"],
        "watermarkDisplayDuration": replacements["WatermarkDisplayDuration"],
        "threeDfxWatermark": replacements["3DfxWatermark"],
        "threeDfxSplashScreen": replacements["3DfxSplashScreen"],
        "dgVoodooWatermark": replacements["dgVoodooWatermark"],
        "filtering": replacements["Filtering"],
        "antialiasing": replacements["Antialiasing"],
        "rtTexturesForceScaleAndMSAA": replacements["RTTexturesForceScaleAndMSAA"],
        "smoothedDepthSampling": replacements["SmoothedDepthSampling"],
    }


def _aspect_fit_rect(
    left: int,
    top: int,
    right: int,
    bottom: int,
    *,
    aspect_w: int = 16,
    aspect_h: int = 9,
) -> tuple[int, int, int, int]:
    width = max(1, right - left)
    height = max(1, bottom - top)
    target_w = width
    target_h = (target_w * aspect_h) // aspect_w
    if target_h > height:
        target_h = height
        target_w = (target_h * aspect_w) // aspect_h
    x = left + (width - target_w) // 2
    y = top + (height - target_h) // 2
    return x, y, target_w, target_h


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
    if mode == "borderless":
        x, y, width, height = _aspect_fit_rect(left, top, right, bottom)
    else:
        x, y, width, height = left, top, right - left, bottom - top
    win32gui.SetWindowPos(
        hwnd,
        win32con.HWND_TOP,
        x,
        y,
        width,
        height,
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
        "targetAspect": "16:9" if mode == "borderless" else "monitor",
        "windowRect": list(win32gui.GetWindowRect(hwnd)),
        "clientRect": list(win32gui.GetClientRect(hwnd)),
    }


def _force_borderless_fullscreen(win32api: Any, win32con: Any, win32gui: Any, hwnd: int) -> dict[str, Any]:
    return _apply_display_mode(win32api, win32con, win32gui, hwnd, "borderless")


def _cursor_clip_enabled(mode: str, policy: str) -> bool:
    if policy == "on":
        return True
    if policy == "off":
        return False
    if policy != "auto":
        raise ValueError(f"unknown cursor clip policy: {policy}")
    return mode in {"borderless", "fullscreen"}


def _set_cursor_clip(hwnd: int, mode: str, policy: str = "auto", margin: int = 0) -> dict[str, Any]:
    enabled = _cursor_clip_enabled(mode, policy)
    receipt: dict[str, Any] = {
        "attempted": True,
        "mode": mode,
        "policy": policy,
        "enabled": enabled,
        "margin": margin,
    }
    try:
        if enabled:
            from tools.logh7_cursor_clip import apply_clip

            applied = apply_clip(hwnd=hwnd, margin=margin)
            return {
                **receipt,
                "ok": True,
                "hwnd": f"0x{int(applied['hwnd']):x}",
                "rect": list(applied["rect"]),
            }

        from tools.logh7_cursor_clip import release_clip

        release_clip()
        return {**receipt, "ok": True, "released": True}
    except Exception as exc:  # noqa: BLE001 - cursor confinement must not kill a live diagnostic session
        return {**receipt, "ok": False, "error": str(exc)}


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



class _ExplorerFlowDriver:
    def __init__(self, state: dict[str, Any], session: Path) -> None:
        self._state = state
        self._session = session

    def click(self, x: int, y: int, *, label: str, settle: float) -> dict[str, Any]:
        import win32api  # type: ignore[import-not-found]
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]

        hwnd = _resolve_hwnd(self._state)
        _force_foreground(hwnd)
        time.sleep(0.2)
        _click(win32api, win32con, win32gui, hwnd, x, y)
        report = _observe(self._state, self._session, label, settle=settle)
        report["action"] = {"type": "click", "x": x, "y": y}
        return report

    def text(self, value: str, *, label: str, settle: float) -> dict[str, Any]:
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]

        hwnd = _resolve_hwnd(self._state)
        _force_foreground(hwnd)
        time.sleep(0.2)
        compensate_first = label == "login-account-text" and os.environ.get("LOGH_UI_TEXT_COMPENSATE_FIRST") == "1"
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
        if not CLIENT_EXE.exists() or sha256_file(exe_backup) != sha256_file(CLIENT_EXE):
            shutil.copy2(exe_backup, CLIENT_EXE)
        exe_backup.unlink()

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    if args.no_patch and args.lobby_unblock_patch:
        raise SystemExit("--no-patch and --lobby-unblock-patch cannot be combined")
    runtime_patch_names = _validate_runtime_patch_start_args(args)

    expected_client_sha = sha256_file(CLIENT_EXE)
    expected_client_kind = label_for_sha(expected_client_sha)
    if runtime_patch_names:
        launch_plan = choose_ui_explorer_launch(no_patch=True, patched_exe=None, lobby_unblock_patch=False)
        launch_stack = playable_manifest_stack()
    else:
        launch_plan = choose_ui_explorer_launch(
            no_patch=args.no_patch,
            patched_exe=args.patched_exe,
            lobby_unblock_patch=args.lobby_unblock_patch,
        )
        launch_stack = playable_manifest_stack(launch_plan.source) if launch_plan.source is not None else ()
    client_driven_login = COMMANDLINE_BOOTSTRAP_PATCH in launch_stack
    _validate_commandline_bootstrap_port(
        args.port,
        client_driven_login=client_driven_login or bool(runtime_patch_names),
        window_login=not client_driven_login and not args.no_login,
    )
    run_exe = CLIENT_EXE
    patch_info: Any = None
    if launch_plan.uses_backup:
        shutil.copy2(CLIENT_EXE, exe_backup)
        match launch_plan.mode:
            case ClientLaunchMode.EXPLICIT_EXE:
                source = launch_plan.source
                if source is None:
                    raise SystemExit("selected client launch plan has no source EXE")
                source_sha = sha256_file(source)
                if source_sha != sha256_file(CLIENT_EXE):
                    shutil.copy2(source, CLIENT_EXE)
                patch_info = {
                    "mode": launch_plan.mode.value,
                    "source": str(source),
                    "sourceSha": source_sha,
                    "sourceKind": label_for_sha(source_sha),
                }
            case ClientLaunchMode.CANONICAL_PLAYABLE:
                source = launch_plan.source
                if source is None:
                    raise SystemExit("selected client launch plan has no source EXE")
                patch_info = {
                    "mode": launch_plan.mode.value,
                    **_canonical_playable_source_receipt(source),
                }
                if patch_info["sourceSha"] != sha256_file(CLIENT_EXE):
                    shutil.copy2(source, CLIENT_EXE)
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
    runtime_patch_frida = None
    if runtime_patch_names:
        if run_client_sha != PLAYABLE_CLIENT_SHA256:
            raise SystemExit(
                "--runtime-patch requires the installed G7MTClient.exe to remain the canonical playable "
                f"build ({PLAYABLE_CLIENT_SHA256}); got {run_client_sha} ({label_for_sha(run_client_sha)})"
            )
    try:
        client_preflight = _client_preflight_with_launcher(
            session,
            run_exe,
            enabled=not args.no_client_preflight,
        )
    except BaseException:
        if launch_plan.uses_backup and exe_backup.exists():
            shutil.copy2(exe_backup, CLIENT_EXE)
            exe_backup.unlink()
        raise
    if runtime_patch_names:
        runtime_patch_frida = _import_frida_for_runtime_patch()
    korean_menu_mode = _configure_korean_menu_mode(session)
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
    server: subprocess.Popen[bytes] | None = None
    try:
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
                raise SystemExit(f"server exited early; log:\n{server_log.read_text(errors='replace')}")
            if server_log.exists() and "listening" in server_log.read_text(errors="replace"):
                ready = True
                break
            time.sleep(0.1)
        if not ready:
            _cleanup_failed_start(server.pid, None)
            raise SystemExit("server did not become ready within 10s")
    finally:
        log_handle.close()

    runtime_patch_info: dict[str, Any] | None = None
    client_pid: int | None = None
    try:
        if runtime_patch_names:
            client_pid, runtime_patch_info = _spawn_runtime_patched_client(
                run_exe,
                CLIENT_DIR,
                runtime_patch_names,
                frida_module=runtime_patch_frida,
            )
        else:
            client = _spawn_detached([str(run_exe)], CLIENT_DIR, subprocess.DEVNULL, subprocess.DEVNULL)
            client_pid = client.pid
        hwnd = find_client_window(win32gui, win32process, client_pid)
    except BaseException as exc:
        _cleanup_failed_start(server.pid if server else None, client_pid)
        block_message = _windows_app_control_message(run_exe, exc)
        if block_message:
            raise SystemExit(block_message) from exc
        raise
    display_receipt = _apply_display_mode(win32api, win32con, win32gui, hwnd, display_mode)
    cursor_clip = _set_cursor_clip(
        hwnd,
        display_mode,
        policy=args.cursor_clip,
        margin=args.cursor_clip_margin,
    )

    state: dict[str, Any] = {
        "session": str(session),
        "port": args.port,
        "serverPid": server.pid,
        "serverRoot": str(server_root),
        "clientPid": client_pid,
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
        "clientPreflight": client_preflight,
        "displayMode": display_mode,
        "dgVoodooDisplay": dgvoodoo_display,
        "windowDisplay": display_receipt,
        "borderlessFullscreen": display_receipt if display_mode == "borderless" else None,
        "cursorClip": cursor_clip,
        "loginAutomation": (
            "client-commandline-bootstrap"
            if client_driven_login
            else ("disabled" if args.no_login else "window-login")
        ),
        "fontRegistration": font_registration,
        "koreanMenuMode": korean_menu_mode,
        **logh_env_receipt,
        "traceOffset": 0,
        "loggedIn": False,
    }
    if runtime_patch_info is not None:
        state["runtimePatch"] = runtime_patch_info
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
        # 신뢰성(2026-06-28 라이브 확정): 흐름 시작 전 BOTHTEC/MPS 스플래시(~25-35s)와 로비 렌더 완료를
        # 기다린다(스킬 #1 gotcha). 부족하면 첫 클릭이 스플래시/미준비 로비에 빗나가 흐름이 로비에서 정체한다.
        # --lobby-wait로 조정(기본 10s). 그래도 100% 결정론은 아니므로 호출자는 월드진입(0x0f02/0x0323)을 트레이스로
        # 확인하고 미진입 시 재호출하는 것을 권장한다.
        _observe(state, session, "create-flow-lobby-wait", settle=max(args.lobby_wait, 0.0))
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
    _force_foreground(hwnd)
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
    _force_foreground(hwnd)
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
    _force_foreground(hwnd)
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
    cursor_clip = _set_cursor_clip(
        hwnd,
        mode,
        policy=args.cursor_clip,
        margin=args.cursor_clip_margin,
    )
    state["displayMode"] = mode
    state["dgVoodooDisplay"] = dgvoodoo_display
    state["windowDisplay"] = display_receipt
    state["borderlessFullscreen"] = display_receipt if mode == "borderless" else None
    state["cursorClip"] = cursor_clip
    _save_session(session, state)
    print(json.dumps(
        {
            "mode": mode,
            "dgVoodooDisplay": dgvoodoo_display,
            "windowDisplay": display_receipt,
            "cursorClip": cursor_clip,
        },
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
    if "runtimePatch" in state:
        info["runtimePatch"] = state["runtimePatch"]
    if "cursorClip" in state:
        info["cursorClip"] = state["cursorClip"]
    print(json.dumps(info, ensure_ascii=False, indent=2))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    session: Path = args.session
    state = _load_session(session)
    result: dict[str, Any] = {"session": str(session)}
    result["cursorClip"] = _set_cursor_clip(0, "windowed", policy="off")

    server_pid = int(state["serverPid"]) if state.get("serverPid") else None
    _taskkill_pid(server_pid)
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
    p_start.add_argument(
        "--runtime-patch",
        action="append",
        default=[],
        metavar="NAME",
        help=(
            "apply tools/client_patches/NAME.json to the canonical installed client via Frida "
            "spawn/attach before resume; repeatable; incompatible with --patched-exe and --lobby-unblock-patch"
        ),
    )
    p_start.add_argument("--lobby-unblock-patch", action="store_true")
    # windowed: keep the original bordered login window; switch later with display --mode borderless.
    p_start.add_argument("--display-mode", choices=["fullscreen", "borderless", "windowed"], default="windowed")
    p_start.add_argument(
        "--cursor-clip",
        choices=["auto", "on", "off"],
        default="auto",
        help="cursor confinement policy: auto clips only borderless/fullscreen, on always clips, off releases",
    )
    p_start.add_argument("--cursor-clip-margin", type=int, default=0)
    p_start.add_argument(
        "--no-client-preflight",
        action="store_true",
        help="skip the LOGH7Launcher.exe --client-preflight check before starting the server",
    )
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
    # 신뢰성: 폼 단계가 렌더되기 전 다음 클릭이 빗나가지 않게 기본 settle을 상향(라이브 확정 2026-06-28: 1.0은
    # 폼 전환에 부족해 흐름이 자주 정체, 3.0 부근에서 월드진입 도달). 빠른 진단은 --settle로 낮출 수 있다.
    p_create.add_argument("--settle", type=float, default=3.0)
    # 흐름 시작 전 스플래시/로비 렌더 완료 대기(초). 스킬 #1 gotcha 대응.
    p_create.add_argument("--lobby-wait", type=float, default=10.0)
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
    p_display.add_argument(
        "--cursor-clip",
        choices=["auto", "on", "off"],
        default="auto",
        help="cursor confinement policy: auto clips only borderless/fullscreen, on always clips, off releases",
    )
    p_display.add_argument("--cursor-clip-margin", type=int, default=0)
    p_display.set_defaults(func=cmd_display)

    sub.add_parser("info").set_defaults(func=cmd_info)
    sub.add_parser("stop").set_defaults(func=cmd_stop)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
