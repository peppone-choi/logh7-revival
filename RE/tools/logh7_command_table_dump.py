#!/usr/bin/env python3
"""Dump the live LOGH VII resident command category table."""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-command-table-dump.jsonl"


def _session_pid(session_dir: Path) -> int:
    with (session_dir / "session.json").open("r", encoding="utf-8") as handle:
        return int(json.load(handle)["clientPid"])


def _build_js(categories: int, max_factories: int) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const CATEGORIES = {max(1, int(categories))};
const MAX_FACTORIES = {max(1, int(max_factories))};

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (error) {{ return fallback; }} }}
function hex(value) {{ return safe(function () {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, null); }}
function readPtr(address) {{ return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0')); }}
function readU8(address) {{ return safe(function () {{ return ptr(address).readU8(); }}, null); }}
function readU16(address) {{ return safe(function () {{ return ptr(address).readU16(); }}, null); }}
function readU32(address) {{ return safe(function () {{ return ptr(address).readU32(); }}, null); }}

const clientBase = readPtr(abs('0x007ccffc'));
const table = clientBase.isNull() ? ptr('0x0') : clientBase.add(0x3416d8);
const categories = [];
for (let cat = 0; cat < CATEGORIES; cat += 1) {{
  const rec = table.add(cat * 0x46);
  const countCandidate = readU8(rec.add(0x14));
  const count = readU8(rec.add(0x1e));
  const factories = [];
  const n = Math.max(0, Math.min(count || 0, MAX_FACTORIES));
  for (let i = 0; i < n; i += 1) {{
    factories.push({{
      index: i,
      factory: readU16(rec.add(0x20 + i * 2)),
    }});
  }}
  categories.push({{
    category: cat,
    guard00: readU8(rec),
    count14Candidate: countCandidate,
    firstFactory16Candidate: readU16(rec.add(0x16)),
    count1e: readU8(rec.add(0x1e)),
    firstFactory20: readU16(rec.add(0x20)),
    factories,
  }});
}}

send({{
  event: 'command-table-dump',
  moduleBase: hex(moduleBase),
  clientBase: hex(clientBase),
  table: hex(table),
  categories,
}});
"""


def _cleanup(script: Any | None, session: Any | None) -> list[str]:
    errors: list[str] = []
    if script is not None:
        try:
            script.unload()
        except Exception as exc:  # pragma: no cover
            errors.append(f"script.unload: {exc}")
    if session is not None:
        try:
            session.detach()
        except Exception as exc:  # pragma: no cover
            errors.append(f"session.detach: {exc}")
    return errors


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    snapshot: dict[str, Any] | None = None
    session = None
    script = None

    with args.out.open("a", encoding="utf-8") as out:
        def on_message(message: dict[str, Any], data: bytes | None) -> None:
            nonlocal snapshot
            payload = message.get("payload") if message.get("type") == "send" else None
            if isinstance(payload, dict):
                snapshot = payload
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(_build_js(args.categories, args.max_factories))
            script.on("message", on_message)
            script.load()
            time.sleep(args.wait)
        finally:
            cleanup_errors = _cleanup(script, session)

    print(json.dumps({
        "attachedPid": pid,
        "out": str(args.out),
        "cleanupErrors": cleanup_errors,
        "snapshot": snapshot,
    }, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--categories", type=int, default=32)
    parser.add_argument("--max-factories", type=int, default=24)
    parser.add_argument("--wait", type=float, default=0.25)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
