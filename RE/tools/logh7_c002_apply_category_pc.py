#!/usr/bin/env python3
"""Positive-control C002 command category application on the live game thread."""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-apply-category.jsonl"


def _session_pid(session_dir: Path) -> int:
    with (session_dir / "session.json").open("r", encoding="utf-8") as handle:
        return int(json.load(handle)["clientPid"])


def _build_js(category: int, final_ms: int) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const CATEGORY = {int(category)};
const FINAL_MS = {max(100, int(final_ms))};

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (error) {{ return fallback; }} }}
function hex(value) {{ return safe(function () {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, null); }}
function readPtr(address) {{ return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0')); }}
function readU8(address) {{ return safe(function () {{ return ptr(address).readU8(); }}, null); }}
function readS32(address) {{ return safe(function () {{ return ptr(address).readS32(); }}, null); }}
function readU16(address) {{ return safe(function () {{ return ptr(address).readU16(); }}, null); }}

const frameFn = abs('0x004fef90');
const applyCategory = new NativeFunction(abs('0x004f5cb0'), 'int', ['pointer', 'int'], 'thiscall');
const commandMenu = abs('0x00c9e768');

function rowState(index) {{
  const row = readPtr(commandMenu.add((0x0c + index) * 4));
  return {{
    index,
    ptr: hex(row),
    gate04: readU8(row.add(4)),
    gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)),
    flag15: readU8(row.add(0x15)),
    b00: readS32(row.add(0xb00)),
    idB04: readU16(row.add(0xb04)),
    rectX20: readS32(row.add(0x20)),
    rectY24: readS32(row.add(0x24)),
    rectW2c: readS32(row.add(0x2c)),
    rectH30: readS32(row.add(0x30)),
    factoryCdc: readS32(row.add(0xcdc)),
    factoryCe0: readS32(row.add(0xce0)),
  }};
}}

function snapshot() {{
  const active = readPtr(commandMenu);
  const rowCount = readS32(commandMenu.add(0xd4 * 4));
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(rowCount || 0, 12)); i += 1) rows.push(rowState(i));
  return {{
    activePtr: hex(active),
    activeGate04: readU8(active.add(4)),
    activeGate05: readU8(active.add(5)),
    pageD3: readS32(commandMenu.add(0xd3 * 4)),
    rowCountD4: rowCount,
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
    rows,
  }};
}}

const st = {{ called: 0, lastErr: null, ret: null, frameEcx: null, before: snapshot(), after: null }};

Interceptor.attach(frameFn, {{
  onEnter() {{
    if (st.called > 0) return;
    st.called += 1;
    st.frameEcx = hex(this.context.ecx);
    st.before = snapshot();
    try {{
      st.ret = applyCategory(commandMenu, CATEGORY);
    }} catch (error) {{
      st.lastErr = String(error.stack || error);
    }}
    st.after = snapshot();
    send({{ event: 'apply-category-call', state: st }});
  }},
}});

setTimeout(function () {{
  send({{ event: 'apply-category-final', state: st, final: snapshot() }});
}}, FINAL_MS);
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
    events = 0
    last_event: dict[str, Any] | None = None
    session = None
    script = None

    with args.out.open("a", encoding="utf-8") as out:
        def on_message(message: dict[str, Any], data: bytes | None) -> None:
            nonlocal events, last_event
            events += 1
            payload = message.get("payload") if message.get("type") == "send" else None
            if isinstance(payload, dict):
                last_event = payload
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(_build_js(args.category, int(args.seconds * 1000)))
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds + 0.2)
        finally:
            cleanup_errors = _cleanup(script, session)

    print(json.dumps({
        "attachedPid": pid,
        "out": str(args.out),
        "events": events,
        "cleanupErrors": cleanup_errors,
        "lastEvent": last_event,
    }, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--category", type=int, default=0)
    parser.add_argument("--seconds", type=float, default=2.0)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
