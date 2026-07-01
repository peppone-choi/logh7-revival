#!/usr/bin/env python3
"""Inject a temporary C002 resident command table category in a live client.

This is a dev-only playable-route probe. It does not change server defaults and
does not claim the injected factory ids are canonical.
"""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-inject-command-table.jsonl"
DEFAULT_FACTORIES: Final = "0x002b,0x0041"


def _session_pid(session_dir: Path) -> int:
    with (session_dir / "session.json").open("r", encoding="utf-8") as handle:
        return int(json.load(handle)["clientPid"])


def _parse_factories(value: str) -> list[int]:
    factories: list[int] = []
    for raw_part in value.replace(",", " ").split():
        part = raw_part.strip()
        if not part:
            continue
        parsed = int(part, 0)
        if not 0 <= parsed <= 0xFFFF:
            raise argparse.ArgumentTypeError(f"factory id out of u16 range: {part}")
        factories.append(parsed)
    if not factories:
        raise argparse.ArgumentTypeError("at least one factory id is required")
    if len(factories) > 24:
        raise argparse.ArgumentTypeError("the command menu has at most 24 rows")
    return factories


def _build_js(
    category: int,
    factories: list[int],
    final_ms: int,
    dispatch_index: int | None,
    dispatch_abi: str,
) -> str:
    factory_json = json.dumps([int(item) for item in factories])
    dispatch_json = "null" if dispatch_index is None else str(int(dispatch_index))
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const CATEGORY = {int(category)};
const FACTORIES = {factory_json};
const FINAL_MS = {max(100, int(final_ms))};
const DISPATCH_INDEX = {dispatch_json};
const DISPATCH_ABI = {json.dumps(dispatch_abi)};

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

function readPtr(address) {{
  return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0'));
}}

function readU8(address) {{
  return safe(function () {{ return ptr(address).readU8(); }}, null);
}}

function readU16(address) {{
  return safe(function () {{ return ptr(address).readU16(); }}, null);
}}

function readS32(address) {{
  return safe(function () {{ return ptr(address).readS32(); }}, null);
}}

function writeU8(address, value) {{
  ptr(address).writeU8(value & 0xff);
}}

function writeU16(address, value) {{
  ptr(address).writeU16(value & 0xffff);
}}

function stateSnapshot() {{
  const clientBase = readPtr(abs('0x007ccffc'));
  const table = clientBase.isNull() ? ptr('0x0') : clientBase.add(0x3416d8);
  const rec = table.isNull() ? ptr('0x0') : table.add(CATEGORY * 0x46);
  const commandMenu = abs('0x00c9e768');
  const commandMenuHeap = readPtr(abs('0x00c9e638'));
  const scene = readPtr(abs('0x02215e2c'));
  const factories = [];
  const legacyFactories = [];
  if (!rec.isNull()) {{
    for (let i = 0; i < 24; i++) {{
      factories.push(readU16(rec.add(0x20 + i * 2)));
      legacyFactories.push(readU16(rec.add(0x16 + i * 2)));
    }}
  }}
  return {{
    clientBase: hex(clientBase),
    table: hex(table),
    category: CATEGORY,
    rec: hex(rec),
    tableGuard00: table.isNull() ? null : readU8(table),
    recGuard00: rec.isNull() ? null : readU8(rec),
    count14Candidate: rec.isNull() ? null : readU16(rec.add(0x14)),
    count1eByte: rec.isNull() ? null : readU8(rec.add(0x1e)),
    count1eWord: rec.isNull() ? null : readU16(rec.add(0x1e)),
    factories20: factories,
    legacyFactories16: legacyFactories,
    commandMenu: hex(commandMenu),
    commandMenuHeapC9e638: hex(commandMenuHeap),
    scene: hex(scene),
    scenePlusC: scene.isNull() ? null : hex(readPtr(scene.add(0x0c))),
    rowCount350: commandMenu.isNull() ? null : readS32(commandMenu.add(0x350)),
    selected354: commandMenu.isNull() ? null : readS32(commandMenu.add(0x354)),
    menuCategory358: commandMenu.isNull() ? null : readS32(commandMenu.add(0x358))
  }};
}}

function injectTable() {{
  const clientBase = readPtr(abs('0x007ccffc'));
  if (clientBase.isNull()) {{
    throw new Error('DAT_007ccffc client base is null');
  }}
  const table = clientBase.add(0x3416d8);
  const rec = table.add(CATEGORY * 0x46);
  const count = FACTORIES.length;

  writeU8(table, 1);
  writeU8(rec, 1);

  // FUN_004f5cb0 reads the count at rec+0x1e and ids at rec+0x20.
  writeU8(rec.add(0x1e), count);
  writeU8(rec.add(0x1f), 0);
  for (let i = 0; i < 24; i++) {{
    writeU16(rec.add(0x20 + i * 2), i < count ? FACTORIES[i] : 0);
  }}

  // Older probes watched a candidate count/id area at rec+0x14/0x16.
  writeU16(rec.add(0x14), count);
  for (let i = 0; i < 4; i++) {{
    writeU16(rec.add(0x16 + i * 2), i < count ? FACTORIES[i] : 0);
  }}

  return {{ table: hex(table), rec: hex(rec), count, factories: FACTORIES }};
}}

const applyCategory = new NativeFunction(abs('0x004f5cb0'), 'int', ['pointer', 'int'], 'thiscall');
const dispatchCommandManager = new NativeFunction(
  abs('0x004f93c0'),
  'uint8',
  ['pointer', 'uint', 'uint'],
  'thiscall'
);
const frameFn = abs('0x004fef90');
let armed = true;
let state = {{
  loadedAt: Date.now(),
  before: stateSnapshot(),
  injected: null,
  afterInject: null,
  applyResult: null,
  afterApply: null,
  dispatch: null,
  afterDispatch: null,
  lastError: null
}};

Interceptor.attach(frameFn, {{
  onEnter: function () {{
    if (!armed) {{
      return;
    }}
    armed = false;
    try {{
      state.before = stateSnapshot();
      state.injected = injectTable();
      state.afterInject = stateSnapshot();
      state.applyResult = applyCategory(abs('0x00c9e768'), CATEGORY);
      state.afterApply = stateSnapshot();
      if (DISPATCH_INDEX !== null) {{
const clientBase = readPtr(abs('0x007ccffc'));
const table = clientBase.add(0x3416d8);
const rec = table.add(CATEGORY * 0x46);
const factoryId = readU16(rec.add(0x20 + DISPATCH_INDEX * 2));
const manager = abs('0x00c9e2e0');
state.dispatch = {{
index: DISPATCH_INDEX,
factoryId,
manager: hex(manager),
managerEnabled: readU8(manager),
managerBusy18: readS32(manager.add(0x18))
}};
state.dispatch.result = dispatchCommandManager(manager, factoryId, CATEGORY);
state.afterDispatch = stateSnapshot();
      }}
    }} catch (error) {{
      state.lastError = String(error.stack || error);
    }}
    send({{ event: 'inject-command-table-applied', state }});
    setTimeout(function () {{
      send({{ event: 'inject-command-table-final', state, final: stateSnapshot() }});
    }}, FINAL_MS);
  }}
}});

send({{ event: 'inject-command-table-loaded', state }});
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
    factories = _parse_factories(args.factories)
    if args.dispatch_index is not None and not 0 <= args.dispatch_index < len(factories):
        raise SystemExit("--dispatch-index must reference one of the injected factories")
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
            out.write(
                json.dumps(
                    {"fridaMessage": message, "dataLength": 0 if data is None else len(data)},
                    ensure_ascii=False,
                )
                + "\n"
            )
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(
                _build_js(
                    args.category,
                    factories,
                    int(args.seconds * 1000),
                    args.dispatch_index,
                    args.dispatch_abi,
                )
            )
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds + 0.2)
        finally:
            cleanup_errors = _cleanup(script, session)

    print(
        json.dumps(
            {
                "attachedPid": pid,
                "category": args.category,
                "factories": factories,
                "out": str(args.out),
                "events": events,
                "cleanupErrors": cleanup_errors,
                "lastEvent": last_event,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--category", type=int, default=0)
    parser.add_argument("--factories", default=DEFAULT_FACTORIES)
    parser.add_argument("--dispatch-index", type=int, default=None)
    parser.add_argument("--dispatch-abi", choices=("thiscall", "stack"), default="thiscall")
    parser.add_argument("--seconds", type=float, default=2.0)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
