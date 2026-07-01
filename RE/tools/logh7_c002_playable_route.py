#!/usr/bin/env python3
"""Run the proven dev-only C002 playable command route.

This is a speed tool, not canon content recovery. It drives the currently
proven path:

1. start the standard live client/server profile;
2. enter the session and select the first character;
3. inject the temporary resident command table and dispatch factory 0x002b;
4. click a target grid cell and confirm;
5. verify historical trace evidence for 0x0b01 and 0x0b07.

The injected factory ids remain development-only until original authority-card
and command-factory mappings are recovered from the client/manual/assets.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
REPO_ROOT: Final = ROOT.parent
DEFAULT_SESSION: Final = REPO_ROOT / ".omo/ui-explorer/c002-playable-route"
DEFAULT_SERVER_ROOT: Final = REPO_ROOT / "server"
DEFAULT_FACTORIES: Final = "0x002b,0x0041"
DEFAULT_ADMIN_TOKEN: Final = "c002-playable-route-token"
DEFAULT_DEV_GRID_FALLBACK_SYSTEM: Final = "バーラト"
FACTORY_STATIC_ANCHORS: Final = {
    "0x002b": {
        "index": 0x2B,
        "pointerGlobal": "DAT_00c9e3a8",
        "function": "FUN_00581c80",
        "va": "0x00581c80",
        "labels": ["SelectGrid", "TARGET_GRID", "TARGET_BASE_GRID"],
        "request": "0x0b01",
        "response": "0x0b07",
        "evidence": "FUN_0058c750 assigns _DAT_00c9e3a8 = FUN_00581c80; (0x00c9e3a8 - 0x00c9e2fc) / 4 = 0x2b.",
        "confidence": "P0-static",
    },
    "0x0041": {
        "index": 0x41,
        "pointerGlobal": "DAT_00c9e400",
        "function": "FUN_00584c90",
        "va": "0x00584c90",
        "labels": ["FromDialog", "TARGET_ORGANIZE", "FLOW_FLAGNUM"],
        "evidence": "FUN_0058c750 assigns _DAT_00c9e400 = FUN_00584c90; (0x00c9e400 - 0x00c9e2fc) / 4 = 0x41.",
        "confidence": "P0-static-index/P2-semantic",
    },
}


def _xy(value: str) -> tuple[int, int]:
    parts = value.replace(",", " ").split()
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("coordinate must be 'X,Y' or 'X Y'")
    try:
        return int(parts[0], 0), int(parts[1], 0)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid coordinate: {value}") from exc


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-") or "step"


def _normalize_factory(value: str | int) -> str:
    if isinstance(value, int):
        n = value
    else:
        n = int(str(value).strip(), 0)
    return f"0x{n & 0xffff:04x}"


def _factory_ids(spec: str) -> list[str]:
    ids: list[str] = []
    for part in str(spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        ids.append(_normalize_factory(part))
    return ids


def _factory_provenance(spec: str) -> dict[str, Any]:
    ids = _factory_ids(spec)
    return {
        "factoryIds": ids,
        "anchors": [
            {
                "factoryId": factory_id,
                **FACTORY_STATIC_ANCHORS[factory_id],
            }
            for factory_id in ids
            if factory_id in FACTORY_STATIC_ANCHORS
        ],
        "unknownFactoryIds": [factory_id for factory_id in ids if factory_id not in FACTORY_STATIC_ANCHORS],
        "devOnly": True,
    }


def _tail(value: str, *, lines: int = 20, chars: int = 4000) -> str:
    selected = "\n".join(value.splitlines()[-lines:])
    if len(selected) > chars:
        selected = selected[-chars:]
    return selected


def _run_step(
    summary: dict[str, Any],
    log_dir: Path,
    name: str,
    command: list[str],
    *,
    allow_fail: bool = False,
) -> dict[str, Any]:
    index = len(summary["steps"]) + 1
    safe = _safe_name(f"{index:02d}-{name}")
    started = time.time()
    proc = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    elapsed = time.time() - started

    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = log_dir / f"{safe}.stdout.txt"
    stderr_path = log_dir / f"{safe}.stderr.txt"
    stdout_path.write_text(proc.stdout, encoding="utf-8")
    stderr_path.write_text(proc.stderr, encoding="utf-8")

    record = {
        "name": name,
        "command": command,
        "returncode": proc.returncode,
        "elapsedSeconds": round(elapsed, 3),
        "stdout": str(stdout_path),
        "stderr": str(stderr_path),
        "stdoutTail": _tail(proc.stdout),
        "stderrTail": _tail(proc.stderr),
    }
    summary["steps"].append(record)
    if proc.returncode != 0 and not allow_fail:
        raise RuntimeError(f"{name} failed with exit code {proc.returncode}; see {stdout_path} / {stderr_path}")
    return record


def _ui_command(args: argparse.Namespace, *parts: str) -> list[str]:
    return [
        sys.executable,
        "-m",
        "tools.logh7_ui_explorer",
        "--session",
        str(args.session),
        *parts,
    ]


def _start_command(args: argparse.Namespace) -> list[str]:
    command = _ui_command(
        args,
        "start",
        "--server-root",
        str(args.server_root),
        "--port",
        str(args.port),
        "--display-mode",
        args.display_mode,
        "--settle",
        str(args.start_settle),
    )
    if args.admin_snapshot:
        command.extend(["--env", f"LOGH_ADMIN_PORT={args.admin_port}"])
        command.extend(["--env", f"LOGH_ADMIN_TOKEN={args.admin_token}"])
    fallback_cell = _dev_grid_fallback_cell(args)
    if fallback_cell is not None:
        command.extend(["--env", f"LOGH_DEV_GRID_MOVE_FALLBACK_CELL={fallback_cell}"])
    for item in args.server_env:
        command.extend(["--env", item])
    return command


def _system_cell(server_root: Path, system_name: str) -> int | None:
    galaxy_path = server_root / "content" / "galaxy.json"
    try:
        data = json.loads(galaxy_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    for system in data.get("systems", []):
        if system.get("system") != system_name:
            continue
        col = system.get("canonGameCol")
        row = system.get("canonGameRow")
        if isinstance(col, int) and isinstance(row, int):
            return row * 100 + col
    return None


def _dev_grid_fallback_cell(args: argparse.Namespace) -> int | None:
    if not args.dev_grid_fallback:
        return None
    if args.dev_grid_fallback_cell is not None:
        return args.dev_grid_fallback_cell
    return _system_cell(args.server_root, args.dev_grid_fallback_system)


def _admin_session_state_url(args: argparse.Namespace) -> str | None:
    if args.admin_url:
        return args.admin_url
    server_log = args.session / "server.log"
    if server_log.exists():
        text = server_log.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"\[admin:\s+(https?://[^\]\s]+)", text)
        if match:
            parsed = urllib.parse.urlsplit(match.group(1))
            return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/admin/session-state", "", ""))
    if args.admin_port > 0:
        return f"http://127.0.0.1:{args.admin_port}/admin/session-state"
    return None


def _target_counts(targets: Any) -> dict[str, int]:
    if not isinstance(targets, dict):
        return {}
    return {
        key: len(value)
        for key, value in targets.items()
        if isinstance(value, list)
    }


def _readiness_summary(snapshot: dict[str, Any]) -> dict[str, Any]:
    readiness = snapshot.get("devCommandReadiness")
    if not isinstance(readiness, dict):
        readiness = {}
    catalog = snapshot.get("devCommandCatalog")
    if not isinstance(catalog, dict):
        catalog = {}
    return {
        "totalCards": readiness.get("totalCards", catalog.get("cards") and len(catalog.get("cards", []))),
        "totalCommands": readiness.get("totalCommands"),
        "executableCommands": readiness.get("executableCommands"),
        "blockedCommands": readiness.get("blockedCommands"),
        "unknownTargetCommands": readiness.get("unknownTargetCommands"),
        "targetCounts": _target_counts(snapshot.get("commandTargets")),
    }


def _catalog_factory_anchors(snapshot: dict[str, Any]) -> list[str]:
    catalog = snapshot.get("devCommandCatalog")
    if not isinstance(catalog, dict):
        return []
    found: list[str] = []

    def add(value: Any) -> None:
        if isinstance(value, str) and value not in found:
            found.append(value)

    for anchor in catalog.get("factoryAnchors", []):
        if isinstance(anchor, dict):
            add(anchor.get("factoryIdHex"))
    for card in catalog.get("cards", []):
        if not isinstance(card, dict):
            continue
        for command in card.get("commands", []):
            if not isinstance(command, dict):
                continue
            anchor = command.get("factoryAnchor")
            if isinstance(anchor, dict):
                add(anchor.get("factoryIdHex"))
    return found


def _fetch_admin_snapshot(args: argparse.Namespace, log_dir: Path) -> dict[str, Any]:
    url = _admin_session_state_url(args)
    if not url:
        return {"ok": False, "error": "admin URL unavailable"}
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {args.admin_token}"})
    try:
        with urllib.request.urlopen(request, timeout=args.admin_timeout) as response:
            payload = response.read()
    except urllib.error.URLError as exc:
        return {"ok": False, "url": url, "error": str(exc)}
    out = log_dir / "admin-session-state.json"
    out.write_bytes(payload)
    try:
        data = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        return {"ok": False, "url": url, "path": str(out), "error": f"invalid JSON: {exc}"}
    world = data.get("world", {})
    if not isinstance(world, dict):
        world = {}
    recent = world.get("recentCommands", [])
    sessions = data.get("sessions", [])
    if not isinstance(sessions, list):
        sessions = []
    return {
        "ok": True,
        "url": url,
        "path": str(out),
        "commandRecords": data.get("counts", {}).get("commandRecords", 0),
        "recentCommands": recent[-args.admin_command_tail :],
        "worldReadiness": _readiness_summary(world),
        "worldFactoryAnchors": _catalog_factory_anchors(world),
        "sessions": [
            {
                "sessionId": session.get("sessionId"),
                "commandRecords": session.get("commandRecords", 0),
                "readiness": _readiness_summary(session),
                "factoryAnchors": _catalog_factory_anchors(session),
            }
            for session in sessions
            if isinstance(session, dict)
        ],
    }


def _route_verification(summary: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    steps = summary.get("steps", [])
    if not isinstance(steps, list):
        steps = []
        errors.append("steps missing")
    by_name = {step.get("name"): step for step in steps if isinstance(step, dict)}
    required_zero = [
        "start",
        "game-start",
        "select-character",
        "inject-dispatch-command",
        "target-grid-cell",
        "confirm-command",
        "wait-trace-0x0b01",
        "wait-trace-0x0b07",
    ]
    for name in required_zero:
        step = by_name.get(name)
        if not step:
            errors.append(f"missing step {name}")
            continue
        if step.get("returncode") != 0:
            errors.append(f"step {name} returncode {step.get('returncode')}")

    stop_steps = [
        step for step in steps
        if isinstance(step, dict)
        and (
            step.get("name") == "stop-at-end"
            or str(step.get("name", "")).startswith("stop-at-end-retry-")
        )
    ]
    if not stop_steps:
        errors.append("missing step stop-at-end")
    elif not any(step.get("returncode") == 0 for step in stop_steps):
        errors.append("stop-at-end failed after retries")
    if summary.get("devOnly") is not True:
        errors.append("devOnly marker missing")

    provenance = summary.get("factoryProvenance")
    factory_anchors: list[str] = []
    select_grid_anchor = False
    if not isinstance(provenance, dict):
        errors.append("factoryProvenance missing")
        provenance = {}
    else:
        if provenance.get("devOnly") is not True:
            errors.append("factoryProvenance devOnly marker missing")
        unknown_ids = provenance.get("unknownFactoryIds", [])
        if unknown_ids:
            errors.append(f"unknown injected factory ids {unknown_ids}")
        anchors = provenance.get("anchors", [])
        if isinstance(anchors, list):
            for anchor in anchors:
                if not isinstance(anchor, dict):
                    continue
                factory_id = anchor.get("factoryId")
                if isinstance(factory_id, str):
                    factory_anchors.append(factory_id)
                if (
                    factory_id == "0x002b"
                    and anchor.get("function") == "FUN_00581c80"
                    and anchor.get("request") == "0x0b01"
                    and anchor.get("response") == "0x0b07"
                ):
                    select_grid_anchor = True
        if not select_grid_anchor:
            errors.append("0x002b SelectGrid factory anchor missing")

    admin = summary.get("adminSnapshot")
    if not isinstance(admin, dict) or not admin.get("ok"):
        errors.append("admin snapshot unavailable")
        admin = {}

    admin_factory_anchors = admin.get("worldFactoryAnchors", [])
    if not isinstance(admin_factory_anchors, list):
        admin_factory_anchors = []
    if admin and admin_factory_anchors and "0x002b" not in admin_factory_anchors:
        warnings.append("admin factory anchors do not include 0x002b")
    elif admin and not admin_factory_anchors:
        warnings.append("admin factory anchors missing; snapshot predates server exposure")

    recent = admin.get("recentCommands", [])
    if not isinstance(recent, list):
        recent = []
    accepted_grid = [
        cmd for cmd in recent
        if isinstance(cmd, dict)
        and int(cmd.get("innerCode", -1)) == 0x0B01
        and cmd.get("accept") is True
        and cmd.get("effect") == "fleet-grid-move"
    ]
    if not accepted_grid:
        errors.append("no accepted 0x0b01 fleet-grid-move in admin recentCommands")

    world_readiness = admin.get("worldReadiness", {})
    if isinstance(world_readiness, dict):
        executable = int(world_readiness.get("executableCommands") or 0)
        total = int(world_readiness.get("totalCommands") or 0)
        if total <= 0 or executable <= 0:
            errors.append("world dev command readiness is empty")
        elif executable < total:
            warnings.append(f"world readiness partial {executable}/{total}")
    else:
        errors.append("worldReadiness missing")

    sessions = admin.get("sessions", [])
    if not isinstance(sessions, list) or not sessions:
        warnings.append("no session readiness summaries")
        sessions = []
    for session in sessions:
        if not isinstance(session, dict):
            continue
        readiness = session.get("readiness", {})
        if not isinstance(readiness, dict):
            warnings.append(f"session {session.get('sessionId')} readiness missing")
            continue
        executable = int(readiness.get("executableCommands") or 0)
        total = int(readiness.get("totalCommands") or 0)
        if total <= 0 or executable <= 0:
            warnings.append(f"session {session.get('sessionId')} readiness empty")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "devOnly": True,
        "proven": {
            "accepted0b01": bool(accepted_grid),
            "waitTrace0b01": by_name.get("wait-trace-0x0b01", {}).get("returncode") == 0,
            "waitTrace0b07": by_name.get("wait-trace-0x0b07", {}).get("returncode") == 0,
            "adminRecentCommandCount": len(recent),
            "factoryAnchors": factory_anchors,
            "adminFactoryAnchors": admin_factory_anchors,
        },
    }


def _click(
    args: argparse.Namespace,
    summary: dict[str, Any],
    log_dir: Path,
    label: str,
    xy: tuple[int, int],
    settle: float,
) -> None:
    _run_step(
        summary,
        log_dir,
        label,
        _ui_command(args, "click", str(xy[0]), str(xy[1]), "--label", label, "--settle", str(settle)),
    )


def run(args: argparse.Namespace) -> int:
    args.session = args.session.resolve()
    args.server_root = args.server_root.resolve()
    out = (args.out or (args.session / "playable-route-summary.json")).resolve()
    log_dir = (args.log_dir or (args.session / "playable-route-logs")).resolve()

    summary: dict[str, Any] = {
        "devOnly": True,
        "session": str(args.session),
        "serverRoot": str(args.server_root),
        "logDir": str(log_dir),
        "factoryProvenance": _factory_provenance(args.factories),
        "steps": [],
        "notes": [
            "factory ids are injected diagnostics, not canonical authority-card mappings",
            "trace wait uses --all because click observation can advance the trace cursor",
        ],
    }

    try:
        if args.stop_existing:
            _run_step(summary, log_dir, "stop-existing", _ui_command(args, "stop"), allow_fail=True)

        if not args.no_start:
            _run_step(
                summary,
                log_dir,
                "start",
                _start_command(args),
            )

        if not args.no_lobby_click:
            _click(args, summary, log_dir, "game-start", args.game_start, args.lobby_settle)

        if not args.no_character_click:
            _click(args, summary, log_dir, "select-character", args.select_character, args.character_settle)

        if not args.no_inject:
            inject_out = log_dir / "inject-command-table.jsonl"
            inject_cmd = [
                sys.executable,
                "-m",
                "tools.logh7_c002_inject_command_table",
                "--session",
                str(args.session),
                "--category",
                str(args.category),
                "--factories",
                args.factories,
                "--dispatch-index",
                str(args.dispatch_index),
                "--seconds",
                str(args.inject_seconds),
                "--out",
                str(inject_out),
            ]
            _run_step(summary, log_dir, "inject-dispatch-command", inject_cmd)
            summary["injectOut"] = str(inject_out)

        if not args.no_target_click:
            _click(args, summary, log_dir, "target-grid-cell", args.target_grid_cell, args.target_settle)

        if not args.no_confirm_click:
            _click(args, summary, log_dir, "confirm-command", args.confirm_command, args.confirm_settle)

        if not args.no_wait_trace:
            for code in ("0x0b01", "0x0b07"):
                _run_step(
                    summary,
                    log_dir,
                    f"wait-trace-{code}",
                    _ui_command(args, "wait-trace", "--code", code, "--timeout", str(args.trace_timeout), "--all"),
                )

        if args.admin_snapshot:
            summary["adminSnapshot"] = _fetch_admin_snapshot(args, log_dir)

    finally:
        if args.stop_at_end:
            last_stop_error: Exception | None = None
            for attempt in range(1, args.stop_retries + 1):
                try:
                    _run_step(
                        summary,
                        log_dir,
                        "stop-at-end" if attempt == 1 else f"stop-at-end-retry-{attempt}",
                        _ui_command(args, "stop"),
                        allow_fail=False,
                    )
                    last_stop_error = None
                    break
                except Exception as exc:  # pragma: no cover - diagnostic cleanup path
                    last_stop_error = exc
                    if attempt < args.stop_retries:
                        time.sleep(args.stop_retry_delay)
            if last_stop_error is not None:
                summary["stopAtEndError"] = str(last_stop_error)
    summary["verification"] = _route_verification(summary)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--server-root", type=Path, default=DEFAULT_SERVER_ROOT)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--display-mode", choices=("windowed", "borderless", "fullscreen"), default="windowed")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--log-dir", type=Path, default=None)
    parser.add_argument("--server-env", action="append", default=[], help="extra KEY=VAL env passed to ui_explorer start")
    parser.add_argument("--no-admin-snapshot", dest="admin_snapshot", action="store_false")
    parser.add_argument("--admin-url", default=None, help="explicit admin session-state URL for --no-start runs")
    parser.add_argument("--admin-port", type=int, default=0, help="0 lets serve-auth choose an ephemeral local admin port")
    parser.add_argument("--admin-token", default=DEFAULT_ADMIN_TOKEN)
    parser.add_argument("--admin-timeout", type=float, default=3.0)
    parser.add_argument("--admin-command-tail", type=int, default=20)
    parser.set_defaults(admin_snapshot=True)
    parser.add_argument("--no-dev-grid-fallback", dest="dev_grid_fallback", action="store_false")
    parser.add_argument("--dev-grid-fallback-system", default=DEFAULT_DEV_GRID_FALLBACK_SYSTEM)
    parser.add_argument("--dev-grid-fallback-cell", type=int, default=None)
    parser.set_defaults(dev_grid_fallback=True)

    parser.add_argument("--stop-existing", action="store_true")
    parser.add_argument("--stop-at-end", action="store_true")
    parser.add_argument("--stop-retries", type=int, default=3)
    parser.add_argument("--stop-retry-delay", type=float, default=3.0)
    parser.add_argument("--no-start", action="store_true")
    parser.add_argument("--no-lobby-click", action="store_true")
    parser.add_argument("--no-character-click", action="store_true")
    parser.add_argument("--no-inject", action="store_true")
    parser.add_argument("--no-target-click", action="store_true")
    parser.add_argument("--no-confirm-click", action="store_true")
    parser.add_argument("--no-wait-trace", action="store_true")

    parser.add_argument("--game-start", type=_xy, default=_xy("574,350"))
    parser.add_argument("--select-character", type=_xy, default=_xy("1100,455"))
    parser.add_argument("--target-grid-cell", type=_xy, default=_xy("1100,455"))
    parser.add_argument("--confirm-command", type=_xy, default=_xy("1018,656"))

    parser.add_argument("--start-settle", type=float, default=16.0)
    parser.add_argument("--lobby-settle", type=float, default=2.0)
    parser.add_argument("--character-settle", type=float, default=8.0)
    parser.add_argument("--target-settle", type=float, default=5.0)
    parser.add_argument("--confirm-settle", type=float, default=5.0)
    parser.add_argument("--trace-timeout", type=float, default=3.0)

    parser.add_argument("--category", type=int, default=0)
    parser.add_argument("--factories", default=DEFAULT_FACTORIES)
    parser.add_argument("--dispatch-index", type=int, default=0)
    parser.add_argument("--inject-seconds", type=float, default=1.5)

    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
