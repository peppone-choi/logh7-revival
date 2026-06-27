from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Final

from tools.logh7_live_entity_scan import scan_live_selector1_keys
from tools.logh7_window_login import find_client_window, login

GUID_TRANSPORT_KEY_HEX: Final[str] = "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
DECIPHER_KEY_HEX: Final[str] = "5859"
DEFAULT_COMMAND_OK_RESPONSE_CODE: Final[int] = 0x0031


def build_dynamic_probe_manifest(
    *,
    client_exe: Path,
    port: int,
    evidence: str,
    command_ok_response_code: int = DEFAULT_COMMAND_OK_RESPONSE_CODE,
    command_ok_entity_key: int | None = None,
) -> dict[str, Any]:
    dynamic_probe: dict[str, str | int] = {
        "clientExePath": str(client_exe),
        "transportKeyHex": GUID_TRANSPORT_KEY_HEX,
        "decipherKeyHex": DECIPHER_KEY_HEX,
        "commandOkResponseCode": command_ok_response_code,
        "evidence": evidence,
        "policy": "explicit dynamic phase3 plus command OK real-client probe only",
    }
    if command_ok_entity_key is not None:
        dynamic_probe["commandOkEntityKey"] = command_ok_entity_key
    return {
        "title": "LOGH VII dynamic real-client probe",
        "server": {
            "gameplay": {
                "MODE": "tcp-capture-stub",
                "HOST": "127.0.0.1",
                "PORT": port,
                "LEGACY_ADDRESS": "202.8.80.179",
                "CLIENT_LITERAL": "ginei00",
                "dynamicProbe": dynamic_probe,
            }
        },
    }


def summarize_probe_analysis(analysis_path: Path) -> dict[str, int | str]:
    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    summary = analysis["summary"]
    finding = analysis["probeFindings"]["commandOkCandidateRuntimeProbe"]
    return {
        "payloadPackets": int(summary["payloadPackets"]),
        "responsePackets": int(summary["responsePackets"]),
        "commandOkResponseCandidates": int(summary["commandOkResponseCandidates"]),
        "postCommandOkClientPackets": int(summary["postCommandOkClientPackets"]),
        "commandOkFinding": str(finding),
    }


def write_dynamic_probe_manifest(
    destination: Path,
    *,
    client_exe: Path,
    port: int,
    evidence: str,
    command_ok_response_code: int,
    command_ok_entity_key: int | None,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            build_dynamic_probe_manifest(
                client_exe=client_exe,
                port=port,
                evidence=evidence,
                command_ok_response_code=command_ok_response_code,
                command_ok_entity_key=command_ok_entity_key,
            ),
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def run_real_client_dynamic_probe(
    *,
    installed_root: Path,
    manifest_out: Path,
    trace_out: Path,
    analysis_out: Path,
    result_out: Path,
    port: int,
    timeout_seconds: int,
    command_ok_response_code: int,
    command_ok_entity_key: int | None,
) -> None:
    if os.name != "nt":
        raise RuntimeError("real client probe requires Windows")
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    root = Path(__file__).resolve().parents[1]
    client_dir = installed_root / "exe"
    client_exe = client_dir / "G7MTClient.exe"
    _ensure_string_backup(client_dir)
    write_dynamic_probe_manifest(
        manifest_out,
        client_exe=client_exe.resolve(),
        port=port,
        evidence=result_out.name,
        command_ok_response_code=command_ok_response_code,
        command_ok_entity_key=command_ok_entity_key,
    )
    _kill_game_processes()
    _restore_string_file(client_dir)
    server = subprocess.Popen(
        [
            "node",
            "src/server/logh7-server.mjs",
            "serve-gameplay",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--manifest",
            str(manifest_out),
            "--trace",
            str(trace_out),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    result: dict[str, Any] = {"serverPid": server.pid, "manifest": str(manifest_out), "trace": str(trace_out)}
    client: subprocess.Popen[bytes] | None = None
    try:
        _wait_for_server(server)
        client = subprocess.Popen([str(client_exe)], cwd=client_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        result["clientPid"] = client.pid
        hwnd = find_client_window(win32gui, win32process, client.pid)
        result["window"] = list(win32gui.GetWindowRect(hwnd))
        login(win32api, win32con, win32gui, hwnd)
        _wait_for_trace(trace_out, timeout_seconds)
        result["entityScanAfterCommandOk"] = scan_live_selector1_keys(client.pid)
        time.sleep(2)
        _analyze_trace(root, trace_out, analysis_out)
        result["analysis"] = str(analysis_out)
        result["summary"] = summarize_probe_analysis(analysis_out)
        result["clientAliveBeforeCleanup"] = client.poll() is None
    finally:
        _kill_game_processes()
        if client is not None:
            try:
                stdout, stderr = client.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                client.kill()
                stdout, stderr = client.communicate(timeout=3)
            result["clientExit"] = client.returncode
            result["clientStdoutBytes"] = len(stdout)
            result["clientStderr"] = stderr.decode(errors="replace")
        server.terminate()
        try:
            server_stdout, server_stderr = server.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()
            server_stdout, server_stderr = server.communicate(timeout=3)
        result["serverExit"] = server.returncode
        result["serverStdout"] = server_stdout
        result["serverStderr"] = server_stderr
        _restore_string_file(client_dir)
    result_out.parent.mkdir(parents=True, exist_ok=True)
    result_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _wait_for_server(server: subprocess.Popen[str]) -> None:
    deadline = time.time() + 8
    while time.time() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"gameplay server exited early: {server.returncode}")
        line = server.stdout.readline() if server.stdout is not None else ""
        if "listening" in line:
            return
        time.sleep(0.1)
    raise RuntimeError("gameplay server did not become ready")


def _wait_for_trace(trace_out: Path, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if trace_out.exists() and "command-ok" in trace_out.read_text(encoding="utf-8", errors="replace"):
            return
        time.sleep(0.5)
    raise TimeoutError(f"command OK trace did not arrive within {timeout_seconds}s: {trace_out}")


def _analyze_trace(root: Path, trace_out: Path, analysis_out: Path) -> None:
    subprocess.run(
        [sys.executable, "tools/logh7_pipeline.py", "gameplay-trace-analyze", str(trace_out), "--out", str(analysis_out)],
        cwd=root,
        check=True,
    )


def _ensure_string_backup(client_dir: Path) -> None:
    target = client_dir / "String.txt"
    backup = client_dir / "String.txt.original"
    if backup.exists() or not target.exists() or target.stat().st_size == 0:
        return
    backup.write_bytes(target.read_bytes())


def _restore_string_file(client_dir: Path) -> None:
    canonical_ko = Path(__file__).resolve().parents[1] / ".omo/work/logh7-ko-overlay/exe/String.txt"
    if canonical_ko.exists():
        (client_dir / "String.txt").write_bytes(canonical_ko.read_bytes())
        return
    backup = client_dir / "String.txt.original"
    target = client_dir / "String.txt"
    if backup.exists():
        target.write_bytes(backup.read_bytes())


def _kill_game_processes() -> None:
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | "
            "Where-Object { $_.Name -in @('G7Start.exe','Gin7UpdateClient.exe') -or $_.Name -like 'G7MTClient*.exe' } | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
