#!/usr/bin/env python3
"""Positive-control C002 HUD mode activation on the live game thread."""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-drive-hud.jsonl"


def _session_pid(session_dir: Path) -> int:
    state_path = session_dir / "session.json"
    with state_path.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    return int(state["clientPid"])


def _build_js(mode: int, animate: int, final_ms: int) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const MODE = {int(mode)};
const ANIMATE = {int(animate)};
const FINAL_MS = {max(100, int(final_ms))};

function abs(vaText) {{
  return moduleBase.add(ptr(vaText).sub(IMAGE_BASE));
}}

function safe(fn, fallback) {{
  try {{
    return fn();
  }} catch (error) {{
    return fallback;
  }}
}}

function hex(value) {{
  return safe(function () {{
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  }}, null);
}}

function readPtr(address) {{ return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0')); }}
function readU8(address) {{ return safe(function () {{ return ptr(address).readU8(); }}, null); }}
function readS32(address) {{ return safe(function () {{ return ptr(address).readS32(); }}, null); }}

const fd7a0 = new NativeFunction(abs('0x004fd7a0'), 'int', ['pointer', 'int', 'int'], 'thiscall');
const frameFn = abs('0x004fef90');
const hud = abs('0x00c9e638');
const commandMenu = abs('0x00c9e768');
const selectionList = abs('0x00c9eac4');
const activeSceneGlobal = abs('0x02215e2c');

function objState(p) {{
  return {{
    ptr: hex(p),
    gate04: readU8(ptr(p).add(4)),
    gate05: readU8(ptr(p).add(5)),
    valid08: readU8(ptr(p).add(8)),
    b00: readS32(ptr(p).add(0xb00)),
    b01: readU8(ptr(p).add(0xb01)),
    b02: readU8(ptr(p).add(0xb02)),
  }};
}}

function snapshot() {{
  const activeScene = readPtr(activeSceneGlobal);
  const commandActive = readPtr(commandMenu);
  const mode2Primary = readPtr(hud.add(0x14));
  const mode2Fallback = readPtr(hud.add(0x28));
  const payload = readPtr(selectionList.add(0x18a * 4));
  return {{
    activeScene: hex(activeScene),
    activeSceneF4: readS32(activeScene.add(0xf4)),
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudMode2Primary: objState(mode2Primary),
    hudMode2Fallback: objState(mode2Fallback),
    commandActive: objState(commandActive),
    commandRowCountD4: readS32(commandMenu.add(0xd4 * 4)),
    commandSelectedD5: readS32(commandMenu.add(0xd5 * 4)),
    selectionCount188: readS32(selectionList.add(0x188 * 4)),
    selectionSelected189: readS32(selectionList.add(0x189 * 4)),
    payloadCount270: readS32(payload.add(0x270)),
  }};
}}

const st = {{
  called: 0,
  lastErr: null,
  ret: null,
  frameEcx: null,
  before: snapshot(),
  after: null,
}};

Interceptor.attach(frameFn, {{
  onEnter() {{
    if (st.called > 0) return;
    st.called += 1;
    st.frameEcx = hex(this.context.ecx);
    st.before = snapshot();
    try {{
      st.ret = fd7a0(hud, MODE, ANIMATE);
    }} catch (error) {{
      st.lastErr = String(error.stack || error);
    }}
    st.after = snapshot();
    send({{ event: 'hud-mode-call', state: st }});
  }},
}});

setTimeout(function () {{
  send({{ event: 'hud-mode-final', state: st, final: snapshot() }});
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
    final_state: dict[str, Any] | None = None
    events = 0
    session = None
    script = None

    with args.out.open("a", encoding="utf-8") as out:
        def on_message(message: dict[str, Any], data: bytes | None) -> None:
            nonlocal events, final_state
            events += 1
            payload = message.get("payload") if message.get("type") == "send" else None
            if isinstance(payload, dict):
                final_state = payload
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(_build_js(args.mode, args.animate, int(args.seconds * 1000)))
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
        "lastEvent": final_state,
    }, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--mode", type=int, default=2)
    parser.add_argument("--animate", type=int, default=1)
    parser.add_argument("--seconds", type=float, default=3.0)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
