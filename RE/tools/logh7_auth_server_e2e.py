"""End-to-end check: drive the REAL client against the authoritative login server.

Starts src/server/logh7-server.mjs serve-auth on 127.0.0.1:<port>, launches the
real G7MTClient.exe (which connects to 127.0.0.1:<port> via its String.txt), drives
the login UI, and reports the auth-server trace. Success = the trace shows
'redirect-sent' (login accepted) and a second 'connection' (client reconnected to
the lobby address). Also reveals whether the lobby connection stays open when the
server stays SILENT on inner 0x0020 (the auth server sends no app reply there).

The original client EXE/String.txt are restored in a finally block (the server
never writes to the game files). Verify SHA 2848be76... afterwards.

Usage:
  python -m tools.logh7_auth_server_e2e --port 47900 --timeout-seconds 14 \
      --trace-out .omo/ulw-loop/evidence/g143-auth-e2e-trace.jsonl \
      --result-out .omo/ulw-loop/evidence/g143-auth-e2e-result.json
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.logh7_process_memory import dump_client_memory
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_window_login import find_client_window, login

ROOT = Path(__file__).resolve().parents[1]
INSTALLED_ROOT = ROOT / ".omo/work/logh7-installed"


def _capture_window(hwnd: int, out_path: Path) -> bool:
    """Capture the client window to a PNG via PrintWindow (works unfocused)."""
    try:
        import ctypes

        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]
        import win32ui  # type: ignore[import-not-found]
        from PIL import Image  # type: ignore[import-not-found]

        left, top, right, bot = win32gui.GetWindowRect(hwnd)
        width, height = right - left, bot - top
        window_dc = win32gui.GetWindowDC(hwnd)
        mfc_dc = win32ui.CreateDCFromHandle(window_dc)
        save_dc = mfc_dc.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)
        ctypes.windll.user32.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)  # PW_RENDERFULLCONTENT
        info = bitmap.GetInfo()
        bits = bitmap.GetBitmapBits(True)
        image = Image.frombuffer("RGB", (info["bmWidth"], info["bmHeight"]), bits, "raw", "BGRX", 0, 1)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(str(out_path))
        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, window_dc)
        return True
    except Exception:  # noqa: BLE001 - best-effort diagnostic capture
        return False


def _dump_window_text(hwnd: int) -> list[dict[str, Any]]:
    """Enumerate child controls + their real Unicode text (bypasses screenshot mojibake)."""
    items: list[dict[str, Any]] = []
    try:
        import win32gui  # type: ignore[import-not-found]

        def callback(child: int, _: Any) -> bool:
            try:
                cls = win32gui.GetClassName(child)
                text = win32gui.GetWindowText(child)
                if text or cls:
                    items.append({"class": cls, "text": text, "visible": bool(win32gui.IsWindowVisible(child))})
            except Exception:  # noqa: BLE001
                pass
            return True

        items.append({"class": win32gui.GetClassName(hwnd), "text": win32gui.GetWindowText(hwnd), "main": True})
        win32gui.EnumChildWindows(hwnd, callback, None)
    except Exception:  # noqa: BLE001
        pass
    return items


def _wait_for_listening(server: subprocess.Popen[str]) -> None:
    deadline = time.time() + 8
    while time.time() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"auth server exited early: {server.returncode}")
        line = server.stdout.readline() if server.stdout is not None else ""
        if "listening" in line:
            return
        time.sleep(0.1)
    raise RuntimeError("auth server did not become ready")


def _summarize_trace(trace_out: Path) -> dict[str, Any]:
    connections = 0
    redirect_sent = 0
    login_messages: list[str] = []
    events: list[str] = []
    if trace_out.exists():
        for raw in trace_out.read_text(encoding="utf-8", errors="replace").splitlines():
            raw = raw.strip()
            if not raw:
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = event.get("event")
            events.append(kind)
            if kind == "connection":
                connections += 1
            elif kind == "redirect-sent":
                redirect_sent += 1
            elif kind == "login-message":
                login_messages.append(event.get("innerCodeHex", "?"))
    return {
        "connections": connections,
        "redirectSent": redirect_sent,
        "loginInnerCodes": login_messages,
        "eventSequence": events,
        "loginRedirectConfirmed": redirect_sent >= 1 and connections >= 2,
    }


def run(
    port: int,
    timeout_seconds: int,
    trace_out: Path,
    result_out: Path,
    patched_exe: Path | None = None,
    dump_out: Path | None = None,
    dump_address: int | None = None,
    dump_bytes: int = 0,
    screenshot_out: Path | None = None,
) -> int:
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]

    client_dir = INSTALLED_ROOT / "exe"
    client_exe = client_dir / "G7MTClient.exe"
    exe_backup = client_dir / "G7MTClient.exe.e2ebackup"
    trace_out.parent.mkdir(parents=True, exist_ok=True)
    if trace_out.exists():
        trace_out.unlink()
    _ensure_string_backup(client_dir)
    _kill_game_processes()
    _restore_string_file(client_dir)
    # Swap in a probe-patched client (trap); the original is restored in finally.
    if patched_exe is not None:
        shutil.copy2(client_exe, exe_backup)
        shutil.copy2(patched_exe, client_exe)

    server = subprocess.Popen(
        [
            "node",
            "src/server/logh7-server.mjs",
            "serve-auth",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--trace",
            str(trace_out),
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    result: dict[str, Any] = {"serverPid": server.pid, "trace": str(trace_out)}
    client: subprocess.Popen[bytes] | None = None
    try:
        _wait_for_listening(server)
        client = subprocess.Popen([str(client_exe)], cwd=client_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        result["clientPid"] = client.pid
        hwnd = find_client_window(win32gui, win32process, client.pid)
        result["window"] = list(win32gui.GetWindowRect(hwnd))
        login(win32api, win32con, win32gui, hwnd)
        time.sleep(timeout_seconds)
        # Capture the client screen (what UI it reached after lobby login) while alive.
        result["windowText"] = _dump_window_text(hwnd)
        if screenshot_out is not None:
            result["screenshotCaptured"] = _capture_window(hwnd, screenshot_out)
            result["screenshot"] = str(screenshot_out)
        # Dump the probe ring buffer while the client process is still alive.
        if dump_out is not None and dump_address is not None and dump_bytes > 0:
            dump_client_memory(result, client.pid, dump_out, dump_address, dump_bytes)
            result["memoryDump"] = {"path": str(dump_out), "addressHex": f"0x{dump_address:08x}", "bytes": dump_bytes}
    finally:
        _kill_game_processes()
        if client is not None:
            try:
                stdout, stderr = client.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                client.kill()
                stdout, stderr = client.communicate(timeout=3)
            result["clientExit"] = client.returncode
            result["clientStderr"] = stderr.decode(errors="replace")
        server.terminate()
        try:
            server_stdout, server_stderr = server.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()
            server_stdout, server_stderr = server.communicate(timeout=3)
        result["serverStdout"] = server_stdout
        result["serverStderr"] = server_stderr
        _restore_string_file(client_dir)
        if patched_exe is not None and exe_backup.exists():
            shutil.copy2(exe_backup, client_exe)
            exe_backup.unlink()
    result["summary"] = _summarize_trace(trace_out)
    result_out.parent.mkdir(parents=True, exist_ok=True)
    result_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--timeout-seconds", type=int, default=14)
    parser.add_argument("--trace-out", type=Path, default=Path(".omo/ulw-loop/evidence/g143-auth-e2e-trace.jsonl"))
    parser.add_argument("--result-out", type=Path, default=Path(".omo/ulw-loop/evidence/g143-auth-e2e-result.json"))
    parser.add_argument("--patched-exe", type=Path, default=None, help="probe-patched client to run instead of the original")
    parser.add_argument("--memory-dump-out", type=Path, default=None)
    parser.add_argument("--memory-dump-address-hex", default=None)
    parser.add_argument("--memory-dump-bytes", type=int, default=0)
    parser.add_argument("--screenshot-out", type=Path, default=None)
    args = parser.parse_args()
    dump_address = int(args.memory_dump_address_hex, 16) if args.memory_dump_address_hex is not None else None
    return run(
        args.port,
        args.timeout_seconds,
        args.trace_out,
        args.result_out,
        patched_exe=args.patched_exe,
        dump_out=args.memory_dump_out,
        dump_address=dump_address,
        dump_bytes=args.memory_dump_bytes,
        screenshot_out=args.screenshot_out,
    )


if __name__ == "__main__":
    raise SystemExit(main())
