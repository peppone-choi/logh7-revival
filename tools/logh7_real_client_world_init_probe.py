from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_live_entity_scan import scan_live_selector1_keys
from tools.logh7_process_memory import dump_client_memory, dump_follow_memory
from tools.logh7_real_client_probe import (
    DECIPHER_KEY_HEX,
    GUID_TRANSPORT_KEY_HEX,
    _ensure_string_backup,
    _kill_game_processes,
    _restore_string_file,
    _wait_for_server,
)
from tools.logh7_window_login import find_client_window, login

BootstrapTiming = str
BootstrapEncoding = str


def run_real_client_world_init_probe(
    *,
    installed_root: Path,
    trace_out: Path,
    result_out: Path,
    port: int,
    timeout_seconds: int,
    bootstrap_timing: BootstrapTiming = "after-0036",
    bootstrap_encoding: BootstrapEncoding = "phase1-child-codec",
    bootstrap_body_hex: str = "01",
    memory_dump_out: Path | None = None,
    memory_dump_address: int | None = None,
    memory_dump_bytes: int = 0,
    follow_dump_out: Path | None = None,
    follow_record_bytes: int = 0,
    follow_address_offset: int = 0,
    follow_dump_bytes: int = 0,
) -> None:
    if os.name != "nt":
        raise RuntimeError("real client world-init probe requires Windows")
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    root = Path(__file__).resolve().parents[1]
    client_dir = installed_root / "exe"
    client_exe = client_dir / "G7MTClient.exe"
    _ensure_string_backup(client_dir)
    _kill_game_processes()
    _restore_string_file(client_dir)
    server = subprocess.Popen(
        build_world_init_probe_server_command(
            port=port,
            trace_out=trace_out,
            client_exe=client_exe.resolve(),
            bootstrap_timing=bootstrap_timing,
            bootstrap_encoding=bootstrap_encoding,
            bootstrap_body_hex=bootstrap_body_hex,
        ),
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    result: dict[str, Any] = {
        "serverPid": server.pid,
        "trace": str(trace_out),
        "bootstrapTiming": bootstrap_timing,
        "bootstrapEncoding": bootstrap_encoding,
        "bootstrapBodyHex": bootstrap_body_hex,
    }
    client: subprocess.Popen[bytes] | None = None
    probe_error: BaseException | None = None
    try:
        _wait_for_server(server)
        client = subprocess.Popen([str(client_exe)], cwd=client_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        result["clientPid"] = client.pid
        hwnd = find_client_window(win32gui, win32process, client.pid)
        result["window"] = list(win32gui.GetWindowRect(hwnd))
        login(win32api, win32con, win32gui, hwnd)
        _wait_for_world_init_trace(trace_out, timeout_seconds)
        time.sleep(1)
        result["entityScanAfterWorldInitCandidates"] = scan_live_selector1_keys(client.pid)
        result["clientAliveBeforeCleanup"] = client.poll() is None
    except BaseException as error:
        probe_error = error
        result["probeError"] = repr(error)
    finally:
        if client is not None and client.poll() is None and memory_dump_out is not None:
            dump_client_memory(
                result,
                client.pid,
                memory_dump_out,
                memory_dump_address,
                memory_dump_bytes,
            )
            if follow_dump_out is not None and memory_dump_out.exists():
                dump_follow_memory(
                    result,
                    client.pid,
                    ring_dump=memory_dump_out,
                    destination=follow_dump_out,
                    record_bytes=follow_record_bytes,
                    address_offset=follow_address_offset,
                    size=follow_dump_bytes,
                )
        _kill_game_processes()
        if client is not None:
            _collect_client(result, client)
        server.terminate()
        _collect_server(result, server)
        _restore_string_file(client_dir)
    result_out.parent.mkdir(parents=True, exist_ok=True)
    result_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if probe_error is not None:
        raise probe_error


def build_world_init_probe_server_command(
    *,
    port: int,
    trace_out: Path,
    client_exe: Path,
    bootstrap_timing: BootstrapTiming,
    bootstrap_encoding: BootstrapEncoding = "phase1-child-codec",
    bootstrap_body_hex: str = "01",
) -> list[str]:
    return [
        "node",
        "tools/logh7_world_init_probe_server.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--trace",
        str(trace_out),
        "--client-exe",
        str(client_exe),
        "--transport-key-hex",
        GUID_TRANSPORT_KEY_HEX,
        "--decipher-key-hex",
        DECIPHER_KEY_HEX,
        "--bootstrap-timing",
        bootstrap_timing,
        "--bootstrap-encoding",
        bootstrap_encoding,
        "--bootstrap-body-hex",
        bootstrap_body_hex,
    ]


def _wait_for_world_init_trace(trace_out: Path, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if trace_out.exists() and "dynamic-world-init-candidate" in trace_out.read_text(encoding="utf-8", errors="replace"):
            return
        time.sleep(0.5)
    raise TimeoutError(f"world init trace did not arrive within {timeout_seconds}s: {trace_out}")


def _collect_client(result: dict[str, Any], client: subprocess.Popen[bytes]) -> None:
    try:
        stdout, stderr = client.communicate(timeout=3)
    except subprocess.TimeoutExpired:
        client.kill()
        stdout, stderr = client.communicate(timeout=3)
    result["clientExit"] = client.returncode
    result["clientStdoutBytes"] = len(stdout)
    result["clientStderr"] = stderr.decode(errors="replace")


def _collect_server(result: dict[str, Any], server: subprocess.Popen[str]) -> None:
    try:
        stdout, stderr = server.communicate(timeout=3)
    except subprocess.TimeoutExpired:
        server.kill()
        stdout, stderr = server.communicate(timeout=3)
    result["serverExit"] = server.returncode
    result["serverStdout"] = stdout
    result["serverStderr"] = stderr


def main() -> int:
    parser = argparse.ArgumentParser(description="Run LOGH VII real-client world/grid init candidate probe.")
    parser.add_argument("installed_root", type=Path)
    parser.add_argument("--trace-out", type=Path, required=True)
    parser.add_argument("--result-out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument("--bootstrap-timing", choices=("after-0036", "after-0030", "both"), default="after-0036")
    parser.add_argument("--bootstrap-encoding", choices=("phase1-child-codec", "raw"), default="phase1-child-codec")
    parser.add_argument("--bootstrap-body-hex", default="01")
    parser.add_argument("--memory-dump-out", type=Path)
    parser.add_argument("--memory-dump-address-hex")
    parser.add_argument("--memory-dump-bytes", type=int, default=0)
    parser.add_argument("--follow-dump-out", type=Path)
    parser.add_argument("--follow-record-bytes", type=int, default=0)
    parser.add_argument("--follow-address-offset", type=int, default=0)
    parser.add_argument("--follow-dump-bytes", type=int, default=0)
    args = parser.parse_args()
    run_real_client_world_init_probe(
        installed_root=args.installed_root,
        trace_out=args.trace_out,
        result_out=args.result_out,
        port=args.port,
        timeout_seconds=args.timeout_seconds,
        bootstrap_timing=args.bootstrap_timing,
        bootstrap_encoding=args.bootstrap_encoding,
        bootstrap_body_hex=args.bootstrap_body_hex,
        memory_dump_out=args.memory_dump_out,
        memory_dump_address=int(args.memory_dump_address_hex, 16) if args.memory_dump_address_hex else None,
        memory_dump_bytes=args.memory_dump_bytes,
        follow_dump_out=args.follow_dump_out,
        follow_record_bytes=args.follow_record_bytes,
        follow_address_offset=args.follow_address_offset,
        follow_dump_bytes=args.follow_dump_bytes,
    )
    print(f"wrote {args.result_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
