#!/usr/bin/env python3
"""Read live command-target candidate slots used by the strategy command panel."""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-command-target-state.jsonl"


def _session_pid(session_dir: Path) -> int:
    with (session_dir / "session.json").open("r", encoding="utf-8") as handle:
        return int(json.load(handle)["clientPid"])


def _build_js(max_entries: int) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const MAX_ENTRIES = {max(1, int(max_entries))};

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

function readPtr(address) {{
  return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0'));
}}

function readU8(address) {{
  return safe(function () {{ return ptr(address).readU8(); }}, null);
}}

function readU16(address) {{
  return safe(function () {{ return ptr(address).readU16(); }}, null);
}}

function readU32(address) {{
  return safe(function () {{ return ptr(address).readU32(); }}, null);
}}

function hex(value) {{
  return safe(function () {{
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  }}, null);
}}

function readEntry(base, stride, index) {{
  const off = base.add(index * stride);
  return {{
    index,
    address: hex(off),
    u8_00: readU8(off),
    u8_01: readU8(off.add(1)),
    u16_00: readU16(off),
    u16_02: readU16(off.add(2)),
    u16_04: readU16(off.add(4)),
    u32_00: readU32(off),
    u32_02: readU32(off.add(2)),
  }};
}}

const clientBase = readPtr(abs('0x007ccffc'));
const result = {{
  event: 'command-target-state',
  moduleBase: hex(moduleBase),
  clientBase: hex(clientBase),
}};

if (!clientBase.isNull()) {{
  const aCount = readU8(clientBase.add(0x3e0998));
  const bCount = readU8(clientBase.add(0x3e0bec));
  const cardCount = readU8(clientBase.add(0x3facf4));
  result.slots = {{
    commandCandidateCount_3e0998: aCount,
    commandCandidateBase_3e099c: hex(clientBase.add(0x3e099c)),
    secondaryCandidateCount_3e0bec: bCount,
    secondaryCandidateBase_3e0bee: hex(clientBase.add(0x3e0bee)),
    authorityCardCount_3facf4: cardCount,
    authorityCardBase_3facf8: hex(clientBase.add(0x3facf8)),
  }};
  result.commandCandidates = [];
  for (let i = 0; i < Math.min(aCount || 0, MAX_ENTRIES); i++) {{
    result.commandCandidates.push(readEntry(clientBase.add(0x3e099c), 6, i));
  }}
  result.secondaryCandidates = [];
  for (let i = 0; i < Math.min(bCount || 0, MAX_ENTRIES); i++) {{
    result.secondaryCandidates.push(readEntry(clientBase.add(0x3e0bee), 6, i));
  }}
  result.authorityCards = [];
  for (let i = 0; i < Math.min(cardCount || 0, MAX_ENTRIES); i++) {{
    const off = clientBase.add(0x3facf8 + i * 0x180);
    const factories = [];
    for (let j = 0; j < 24; j++) {{
      factories.push(readU16(off.add(0x20 + j * 2)));
    }}
    result.authorityCards.push({{
      index: i,
      address: hex(off),
      id_00: readU32(off),
      b04: readU8(off.add(4)),
      commandCount14: readU8(off.add(0x14)),
      commandCount1e: readU8(off.add(0x1e)),
      factories20: factories,
    }});
  }}
}}

send(result);
"""


def _cleanup(script: Any | None, session: Any | None) -> list[str]:
    errors: list[str] = []
    if script is not None:
        try:
            script.unload()
        except Exception as exc:  # pragma: no cover - defensive cleanup
            errors.append(f"script.unload: {exc}")
    if session is not None:
        try:
            session.detach()
        except Exception as exc:  # pragma: no cover - defensive cleanup
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
            script = session.create_script(_build_js(args.max_entries))
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
    parser.add_argument("--max-entries", type=int, default=16)
    parser.add_argument("--wait", type=float, default=0.25)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
