#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "frida>=17.2",
#     "pillow>=11.3",
#     "pydantic>=2.11",
#     "typer>=0.16",
# ]
# ///

# ─── How to run ───
# 1. Install uv: https://docs.astral.sh/uv/getting-started/installation/
# 2. Run: uv run tools/live/_m3_multiclient_probe.py EVIDENCE_DIR --exe PATH
# 3. Help: uv run tools/live/_m3_multiclient_probe.py --help
# ──────────────────

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Final

import frida
import typer

ROOT: Final = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.live.m3_multiclient_support import (  # noqa: E402
    ACCOUNT_A_RAW,
    ACCOUNT_B_RAW,
    AccountSpec,
    Fact,
    GateEvidence,
    HarnessConfig,
    HarnessInputError,
    HarnessRuntimeError,
    LiveClient,
    LobbyDriver,
    LiveServer,
    direct_launch,
    drive_lobby_entry,
    gate_json,
    initial_results,
    load_live_module,
    natural_move_steps,
    observer_gate,
    port_closed,
    probe_client,
    retention_gate,
    store_cell,
    terminate_process,
    trace_count,
    wait_hwnd,
    write_probe_snapshot,
    write_seed_store_once,
)

app = typer.Typer(help="Direct two-client LOGH VII live-QA harness.")
SERVER_LAUNCH: Final = ROOT / "tools/live/_m2_launch.mjs"
PROBE_JS: Final = Path(__file__).with_name("_frida_crash_probe.js")
VISUAL_PROBE_JS: Final = Path(__file__).with_name("_frida_render_probe.js")
LOADING_DISMISSED_FADE: Final = 1.0 - 1e-5


def _start_client(config: HarnessConfig, account: AccountSpec, phase: Path) -> LiveClient:
    driver = load_live_module("tools.live.logh7_agent_drive")
    launch = direct_launch(config.exe)
    process = subprocess.Popen(list(launch.argv), cwd=launch.cwd)  # noqa: S603
    ready = False
    try:
        hwnd = wait_hwnd(process.pid)
        session = frida.attach(process.pid)
        script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
        script.load()
        visual_script = session.create_script(VISUAL_PROBE_JS.read_text(encoding="utf-8"))
        visual_script.load()
        client = LiveClient(account, process, hwnd, session, script)
        phase.mkdir(parents=True, exist_ok=True)
        driver.do_login(hwnd, account.account, account.password, phase)
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline and client.alive:
            origin_x, origin_y, width, height = driver.client_geometry(hwnd)
            if width >= 1000:
                break
            time.sleep(0.5)
        else:
            raise HarnessRuntimeError(f"lobby not reached for {account.account}")
        drive_lobby_entry(
            LobbyDriver(driver.foreground, driver.client_geometry, driver.click_guarded), hwnd, time.sleep,
        )
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and client.alive:
            snapshot, world_active = probe_client(client)
            if (world_active and snapshot.registry_ids
                    and isinstance(fade := visual_script.exports_sync.snap()["fade"], (int, float)) and fade >= LOADING_DISMISSED_FADE):
                time.sleep(9.0)
                if not client.alive:
                    raise HarnessRuntimeError(f"client exited during visual settle for {account.account}")
                settled, settled_world_active = probe_client(client)
                settled_fade = visual_script.exports_sync.snap()["fade"]
                if (not settled_world_active or not settled.registry_ids
                        or not isinstance(settled_fade, (int, float)) or settled_fade < LOADING_DISMISSED_FADE):
                    raise HarnessRuntimeError(f"world lost during visual settle for {account.account}")
                driver.foreground(hwnd)
                driver.screenshot(hwnd, phase / "world.png")
                ready = True
                return client
            time.sleep(0.35)
        raise HarnessRuntimeError(f"world not reached for {account.account}")
    finally:
        if not ready:
            terminate_process(process)


def _stop_client(client: LiveClient) -> None:
    try:
        client.script.unload()
        client.session.detach()
    except (
        frida.InvalidOperationError, frida.ProcessNotFoundError, frida.TransportError,
        frida.TimedOutError, frida.ProtocolError,
    ) as error:
        print(f"probe detach skipped for pid {client.process.pid}: {error}", file=sys.stderr)
    terminate_process(client.process)


def _start_server(evidence_dir: Path, index: int) -> LiveServer:
    log_path = evidence_dir / f"server-{index}-stdout.txt"
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(  # noqa: S603
        ["node", str(SERVER_LAUNCH), str(evidence_dir)], cwd=ROOT, stdout=log,
        stderr=subprocess.STDOUT,
    )
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and process.poll() is None:
        log.flush()
        if "m2-server-ready" in log_path.read_text(encoding="utf-8", errors="replace"):
            return LiveServer(process, log)
        time.sleep(0.25)
    log.close()
    terminate_process(process)
    raise HarnessRuntimeError(f"server {index} did not become ready")


def _stop_server(server: LiveServer) -> None:
    terminate_process(server.process)
    server.log.close()


def _movement_seen(path: Path, boundary: int) -> bool:
    request_seen = False
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[boundary:]:
        record = json.loads(line)
        if record.get("event") == "0030-decoded" and record.get("innerCodeHex") == "0x0b01":
            request_seen = True
        if request_seen and record.get("event") == "world-response-sent" and "0x0b07" in record.get("codes", []):
            return True
    return False


def _drive_move(client: LiveClient, phase: Path) -> None:
    driver = load_live_module("tools.live.logh7_agent_drive")
    driver.foreground(client.hwnd)
    origin_x, origin_y, width, _height = driver.client_geometry(client.hwnd)
    for name, (x, y) in natural_move_steps(width):
        driver.click_guarded(client.hwnd, origin_x + x, origin_y + y, name)
        time.sleep(1.5)
        driver.screenshot(client.hwnd, phase / f"move-{name}.png")


def run_harness(config: HarnessConfig) -> None:
    evidence_dir, store_path, trace_path = config.evidence_dir, config.evidence_dir / "store.json", config.evidence_dir / "trace.jsonl"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    write_seed_store_once(store_path)
    results = dict(initial_results())
    clients: list[LiveClient] = []
    servers: list[LiveServer] = []
    launches: list[dict[str, Fact | list[str]]] = []
    boundaries: list[int] = []
    error: str | None = None
    try:
        servers.append(_start_server(evidence_dir, 1))
        boundaries.append(trace_count(trace_path))
        a = _start_client(config, config.account_a, evidence_dir / "01-simultaneous/a")
        clients.append(a)
        b = _start_client(config, config.account_b, evidence_dir / "01-simultaneous/b")
        clients.append(b)
        for phase_name, client in (("simultaneous-a", a), ("simultaneous-b", b)):
            launches.append({"phase": phase_name, "argv": [str(config.exe)], "pid": client.process.pid,
                             "hwnd": client.hwnd, "helperOrOverlay": False})
        results["twoDirectProcesses"] = GateEvidence(a.process.pid != b.process.pid and a.alive and b.alive, {})
        results["bothWorld"] = GateEvidence(probe_client(a)[1] and probe_client(b)[1], {})
        before, _ = probe_client(b)
        write_probe_snapshot(evidence_dir / "01-simultaneous/b-before.json", before)
        move_boundary = trace_count(trace_path)
        _drive_move(a, evidence_dir / "01-simultaneous")
        time.sleep(3)
        after, _ = probe_client(b)
        write_probe_snapshot(evidence_dir / "01-simultaneous/b-after.json", after)
        observer = observer_gate(before, after, mover_unit_id=config.account_a.unit_id,
                                 both_alive=a.alive and b.alive)
        results["aMoveRequest"] = GateEvidence(_movement_seen(trace_path, move_boundary), {})
        results["bNotifyReceived"] = GateEvidence(after.disp_b07 > before.disp_b07,
                                                   {"notifyDelta": after.disp_b07 - before.disp_b07})
        results["bNotifyApplied"] = observer
        expected_a_cell = store_cell(store_path, config.account_a)
        old_a_pid = a.process.pid
        _stop_client(a)
        clients.remove(a)
        a = _start_client(config, config.account_a, evidence_dir / "02-relogin/a")
        clients.append(a)
        launches.append({"phase": "relogin-a", "argv": [str(config.exe)], "pid": a.process.pid,
                         "hwnd": a.hwnd, "helperOrOverlay": False})
        results["reloginRetention"] = retention_gate(
            expected_cell=expected_a_cell, stored_cell=store_cell(store_path, config.account_a),
            previous_pid=old_a_pid, current_pid=a.process.pid, world_active=probe_client(a)[1],
        )
        old_restart_pids = {a.process.pid, b.process.pid}
        for client in tuple(clients):
            _stop_client(client)
            clients.remove(client)
        _stop_server(servers.pop())
        boundaries.append(trace_count(trace_path))
        servers.append(_start_server(evidence_dir, 2))
        a = _start_client(config, config.account_a, evidence_dir / "03-restart/a")
        b = _start_client(config, config.account_b, evidence_dir / "03-restart/b")
        clients.extend((a, b))
        for phase_name, client in (("restart-a", a), ("restart-b", b)):
            launches.append({"phase": phase_name, "argv": [str(config.exe)], "pid": client.process.pid,
                             "hwnd": client.hwnd, "helperOrOverlay": False})
        restart_fresh = not old_restart_pids.intersection({a.process.pid, b.process.pid})
        restart_cells = (store_cell(store_path, config.account_a) == expected_a_cell
                         and store_cell(store_path, config.account_b) == 2597)
        results["restartRetention"] = GateEvidence(
            restart_fresh and restart_cells and probe_client(a)[1] and probe_client(b)[1],
                                                    {"freshPids": restart_fresh, "storeCellsMatch": restart_cells})
    except (
        HarnessRuntimeError, OSError, frida.InvalidOperationError, frida.ProcessNotFoundError,
        frida.TransportError, frida.TimedOutError, frida.ProtocolError, json.JSONDecodeError,
    ) as caught:
        error = str(caught)
    finally:
        tracked_clients = tuple(clients)
        tracked_servers = tuple(servers)
        for client in tracked_clients:
            _stop_client(client)
        for server in tracked_servers:
            _stop_server(server)
        time.sleep(0.5)
        cleanup = all(not client.alive for client in tracked_clients) and all(
            server.process.poll() is not None for server in tracked_servers) and port_closed()
        results["cleanup"] = GateEvidence(cleanup, {"port47900Closed": port_closed()})
        manifest = {"exe": str(config.exe), "exeSha256": hashlib.sha256(config.exe.read_bytes()).hexdigest(),
                    "directLaunches": launches, "helperOrOverlay": False, "traceBoundaries": boundaries,
                    "error": error}
        (evidence_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        (evidence_dir / "results.json").write_text(
            json.dumps({name: gate_json(gate) for name, gate in results.items()}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    if error is not None:
        raise HarnessRuntimeError(error)
    if not all(gate.passed for gate in results.values()):
        raise HarnessRuntimeError(f"M3 gates failed; see {evidence_dir / 'results.json'}")


@app.command(help="Run direct two-client world, observer, relogin, and restart gates.")
def main(
    evidence_dir: Path,
    exe: Path = typer.Option(..., exists=False, dir_okay=False),
    account_a: str = typer.Option(ACCOUNT_A_RAW),
    account_b: str = typer.Option(ACCOUNT_B_RAW),
) -> None:
    try:
        config = HarnessConfig.parse(evidence_dir, exe, account_a, account_b)
        run_harness(config)
    except (HarnessInputError, HarnessRuntimeError) as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(2) from error


if __name__ == "__main__":
    app()
