#!/usr/bin/env python3
"""Read-only C002 root-boundary snapshot for the live LOGH VII client."""

from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-root-snapshot.jsonl"


def _session_pid(session_dir: Path) -> int:
    state_path = session_dir / "session.json"
    with state_path.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    pid = int(state["clientPid"])
    if pid <= 0:
        raise RuntimeError(f"invalid clientPid in {state_path}: {pid}")
    return pid


def _build_js(label: str, sample_bytes: int) -> str:
    safe_label = json.dumps(label, ensure_ascii=True)
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = {max(0, int(sample_bytes))};
const LABEL = {safe_label};

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

function imageVa(value) {{
  return safe(function () {{
    const p = ptr(value);
    return p.isNull() ? null : '0x' + p.sub(moduleBase).add(IMAGE_BASE).toString(16);
  }}, hex(value));
}}

function readPtr(address) {{ return safe(function () {{ return ptr(address).readPointer(); }}, ptr('0x0')); }}
function readU8(address) {{ return safe(function () {{ return ptr(address).readU8(); }}, null); }}
function readU16(address) {{ return safe(function () {{ return ptr(address).readU16(); }}, null); }}
function readS32(address) {{ return safe(function () {{ return ptr(address).readS32(); }}, null); }}
function readU32(address) {{ return safe(function () {{ return ptr(address).readU32(); }}, null); }}

function bytesHex(address, count) {{
  if (count <= 0) return null;
  return safe(function () {{
    const bytes = ptr(address).readByteArray(count);
    return Array.prototype.map.call(new Uint8Array(bytes), function (b) {{
      return ('0' + b.toString(16)).slice(-2);
    }}).join('');
  }}, null);
}}

function objState(value) {{
  const p = ptr(value || 0);
  return {{
    ptr: hex(p),
    imageVa: imageVa(p),
    gate04: readU8(p.add(4)),
    gate05: readU8(p.add(5)),
    valid08: readU8(p.add(8)),
    flag0a: readU8(p.add(0x0a)),
    s32_0c: readS32(p.add(0x0c)),
    s32_10: readS32(p.add(0x10)),
    u8_14: readU8(p.add(0x14)),
    u8_15: readU8(p.add(0x15)),
    b00: readS32(p.add(0xb00)),
    b01: readU8(p.add(0xb01)),
    b02: readU8(p.add(0xb02)),
    idB04: readU16(p.add(0xb04)),
    bytes: bytesHex(p, SAMPLE_BYTES),
  }};
}}

function strategyLikeState(value) {{
  const p = ptr(value || 0);
  return Object.assign(objState(p), {{
    state_4: readS32(p.add(4)),
    activeWindow_0c: hex(readPtr(p.add(0x0c))),
    catGate_f4: readS32(p.add(0xf4)),
    cmdRowCount_480: readS32(p.add(0x480)),
    sel_624: readS32(p.add(0x624)),
    word_126710: readU16(p.add(0x126710)),
    byte_126710: readU8(p.add(0x126710)),
    byte_126711: readU8(p.add(0x126711)),
    byte_126718: readU8(p.add(0x126718)),
  }});
}}

function commandMenuState(commandMenu) {{
  const active = readPtr(commandMenu);
  const rowCount = readS32(commandMenu.add(0xd4 * 4));
  const rows = [];
  const count = Math.max(0, Math.min(rowCount || 0, 12));
  for (let i = 0; i < count; i += 1) {{
    const row = readPtr(commandMenu.add((0x0c + i) * 4));
    rows.push(Object.assign({{ index: i }}, objState(row)));
  }}
  return {{
    object: objState(commandMenu),
    activePtr: hex(active),
    activeState: objState(active),
    pageD3: readS32(commandMenu.add(0xd3 * 4)),
    rowCountD4: rowCount,
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
    rows,
  }};
}}

function selectionListState(selectionList, clientBasePtr) {{
  const active = readPtr(selectionList);
  const payload = readPtr(selectionList.add(0x18a * 4));
  const currentPayload = clientBasePtr.isNull() ? ptr('0x0') : readPtr(clientBasePtr.add(8));
  const rows = [];
  const count = Math.max(0, Math.min(readS32(selectionList.add(0x188 * 4)) || 0, 12));
  for (let i = 0; i < count; i += 1) {{
    rows.push({{
      index: i,
      primary: objState(readPtr(selectionList.add((0x22 + i) * 4))),
      secondary: objState(readPtr(selectionList.add((0x32 + i) * 4))),
    }});
  }}
  return {{
    object: objState(selectionList),
    activePtr: hex(active),
    activeState: objState(active),
    page187: readS32(selectionList.add(0x187 * 4)),
    listCount188: readS32(selectionList.add(0x188 * 4)),
    listSelected189: readS32(selectionList.add(0x189 * 4)),
    payload18a: hex(payload),
    payloadCount270: readS32(payload.add(0x270)),
    currentPayload: hex(currentPayload),
    currentPayloadCount270: readS32(currentPayload.add(0x270)),
    rows,
  }};
}}

function hudState(hud) {{
  const mode2Primary = readPtr(hud.add(0x14));
  const mode4Primary = readPtr(hud.add(0x18));
  const mode6Fallback = readPtr(hud.add(0x24));
  const mode2Fallback = readPtr(hud.add(0x28));
  return {{
    object: objState(hud),
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    modeTargets: [
      {{ role: 'mode2Primary_hud14', state: objState(mode2Primary) }},
      {{ role: 'mode4Primary_hud18', state: objState(mode4Primary) }},
      {{ role: 'mode6Fallback_hud24', state: objState(mode6Fallback) }},
      {{ role: 'mode2Fallback_hud28', state: objState(mode2Fallback) }},
    ],
  }};
}}

function dataRootState(dataRoot) {{
  const raw = dataRoot.isNull() ? null : readS32(dataRoot.add(0x11178));
  return {{
    ptr: hex(dataRoot),
    currentRaw11178: raw,
    currentX: raw === null || raw < 0 ? null : raw % 100,
    currentY: raw === null || raw < 0 ? null : Math.floor(raw / 100),
    listCount1117c: dataRoot.isNull() ? null : readU32(dataRoot.add(0x1117c)),
  }};
}}

function snapshot() {{
  const activeSceneGlobal = abs('0x02215e2c');
  const clientBaseGlobal = abs('0x007ccffc');
  const dataRootGlobal = abs('0x007cd04c');
  const hud = abs('0x00c9e638');
  const commandMenu = abs('0x00c9e768');
  const selectionList = abs('0x00c9eac4');
  const selectedIndexGlobal = abs('0x00c9eabc');
  const categoryGlobal = abs('0x00c9eac0');

  const activeScene = readPtr(activeSceneGlobal);
  const activeWindow = activeScene.isNull() ? ptr('0x0') : readPtr(activeScene.add(0x0c));
  const clientBase = readPtr(clientBaseGlobal);
  const dataRoot = readPtr(dataRootGlobal);

  return {{
    label: LABEL,
    moduleBase: hex(moduleBase),
    globals: {{
      activeSceneGlobal: hex(activeSceneGlobal),
      clientBaseGlobal: hex(clientBaseGlobal),
      dataRootGlobal: hex(dataRootGlobal),
      hud: hex(hud),
      commandMenu: hex(commandMenu),
      selectionList: hex(selectionList),
      selectedIndexGlobal: readS32(selectedIndexGlobal),
      categoryGlobal: readS32(categoryGlobal),
    }},
    pointers: {{
      activeScene: hex(activeScene),
      activeSceneImageVa: imageVa(activeScene),
      activeWindow: hex(activeWindow),
      activeWindowImageVa: imageVa(activeWindow),
      clientBase: hex(clientBase),
      dataRoot: hex(dataRoot),
    }},
    activeScene: strategyLikeState(activeScene),
    activeWindow: objState(activeWindow),
    hud: hudState(hud),
    commandMenu: commandMenuState(commandMenu),
    selectionList: selectionListState(selectionList, clientBase),
    dataRoot: dataRootState(dataRoot),
    clientBaseState: clientBase.isNull() ? null : {{
      gridActive126710: readU8(clientBase.add(0x126710)),
      fieldMode126711: readU8(clientBase.add(0x126711)),
      modeFlag126718: readU8(clientBase.add(0x126718)),
      worldActive2a58f8: readU32(clientBase.add(0x2a58f8)),
      focusChar3584a0: readU32(clientBase.add(0x3584a0)),
      charCount36a5dc: readU32(clientBase.add(0x36a5dc)),
      unitCount41a364: readU16(clientBase.add(0x41a364)),
    }},
  }};
}}

send({{ event: 'c002-root-snapshot', snapshot: snapshot() }});
"""


def _cleanup(script: Any | None, session: Any | None) -> list[str]:
    errors: list[str] = []
    if script is not None:
        try:
            script.unload()
        except Exception as exc:  # pragma: no cover - best effort for live tool
            errors.append(f"script.unload: {exc}")
    if session is not None:
        try:
            session.detach()
        except Exception as exc:  # pragma: no cover - best effort for live tool
            errors.append(f"session.detach: {exc}")
    return errors


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    session = None
    script = None
    messages: list[dict[str, Any]] = []
    snapshot: dict[str, Any] | None = None

    with args.out.open("a", encoding="utf-8") as out:
        def on_message(message: dict[str, Any], data: bytes | None) -> None:
            nonlocal snapshot
            payload = message.get("payload") if message.get("type") == "send" else None
            if isinstance(payload, dict) and payload.get("event") == "c002-root-snapshot":
                candidate = payload.get("snapshot")
                if isinstance(candidate, dict):
                    snapshot = candidate
            entry = {
                "fridaMessage": message,
                "dataLength": 0 if data is None else len(data),
            }
            messages.append(entry)
            out.write(json.dumps(entry, ensure_ascii=False) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(_build_js(args.label, args.sample_bytes))
            script.on("message", on_message)
            script.load()
            time.sleep(args.wait)
        finally:
            cleanup_errors = _cleanup(script, session)

    result = {
        "attachedPid": pid,
        "out": str(args.out),
        "messages": len(messages),
        "cleanupErrors": cleanup_errors,
        "snapshot": snapshot,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--label", default="root-snapshot")
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--wait", type=float, default=0.25)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
