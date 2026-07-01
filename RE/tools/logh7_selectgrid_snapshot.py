# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot.jsonl"
DESCRIPTION: Final = "Read one LOGH VII SelectGrid/command-state snapshot without installing hooks."


def build_js(*, label: str = "snapshot", sample_bytes: int = 96) -> str:
    safe_label = json.dumps(label, ensure_ascii=False)
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = {max(0, int(sample_bytes))};
const LABEL = {safe_label};

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, String(value));
}}
function readPtr(address) {{ return safe(() => ptr(address).readPointer(), ptr('0x0')); }}
function readU8(address) {{ return safe(() => ptr(address).readU8(), null); }}
function readU16(address) {{ return safe(() => ptr(address).readU16(), null); }}
function readU32(address) {{ return safe(() => ptr(address).readU32(), null); }}
function readS32(address) {{ return safe(() => ptr(address).readS32(), null); }}
function readF32(address) {{ return safe(() => ptr(address).readFloat(), null); }}
function bytesHex(address, count) {{
  return safe(() => {{
    const p = ptr(address);
    if (p.isNull()) return null;
    const bytes = p.readByteArray(Math.min(Math.max(count, 0), SAMPLE_BYTES));
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }}, null);
}}
function uiObjectState(value) {{ const row = ptr(value); return {{ ptr: hex(row), gate04: readU8(row.add(4)), gate05: readU8(row.add(5)), idB04: readU16(row.add(0xb04)), rectX20: readS32(row.add(0x20)), rectY24: readS32(row.add(0x24)), rectW2c: readS32(row.add(0x2c)), rectH30: readS32(row.add(0x30)) }}; }}

const clientBasePtr = abs('0x007ccffc');
const dataRootPtr = abs('0x007cd04c');
const selectState = abs('0x009d2a30');
const commandMenu = abs('0x00c9e768');
const hud = abs('0x00c9e638');
const selectionList = abs('0x00c9eac4');
const selectedIndexGlobal = abs('0x00c9eabc');
const categoryGlobal = abs('0x00c9eac0');
const camera = {{ x: abs('0x00c5153c'), y: abs('0x00c51540'), z: abs('0x00c51544') }};
const markerToggle = abs('0x02214b78');

function clientBase() {{ return readPtr(clientBasePtr); }}
function dataRoot() {{ return readPtr(dataRootPtr); }}

function cellAt(x, y) {{
  const base = clientBase();
  if (base.isNull() || x === null || y === null || x < 0 || y < 0 || x >= 100 || y >= 50) {{
    return {{ x, y, index: null, cellValue: null, object0: null, object1: null, object2: null }};
  }}
  const index = y * 100 + x;
  const cellValue = readU8(base.add(0x2c03cc + index));
  const object = base.add(0x2c1755 + (cellValue || 0) * 3);
  return {{ x, y, index, cellValue, object0: readU8(object), object1: readU8(object.add(1)), object2: readU8(object.add(2)) }};
}}

function selectStateSnapshot() {{
  return {{
    p04Mode: readS32(selectState.add(0x04)),
    p0cPhase: readS32(selectState.add(0x0c)),
    p10TargetRaw: readS32(selectState.add(0x10)),
    p18SelectedX: readS32(selectState.add(0x18)),
    p1cSelectedY: readS32(selectState.add(0x1c)),
    p20Range: readS32(selectState.add(0x20)),
    p24ProjX: readS32(selectState.add(0x24)),
    p28ProjY: readS32(selectState.add(0x28)),
    p2cWorldX: readF32(selectState.add(0x2c)),
    p30WorldY: readF32(selectState.add(0x30)),
    p34WorldZ: readF32(selectState.add(0x34)),
  }};
}}

function commandState() {{
  const active = readPtr(commandMenu);
  const rowCount = readS32(commandMenu.add(0xd4 * 4));
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(rowCount || 0, 6)); i += 1) {{
    const row = readPtr(commandMenu.add((0x0c + i) * 4));
    const state = uiObjectState(row);
    state.index = i;
    rows.push(state);
  }}
  return {{
    activePtr: hex(active),
    activeGate04: readU8(active.add(4)),
    activeGate05: readU8(active.add(5)),
    rowCountD4: rowCount,
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
    rows,
  }};
}}

function selectionRows() {{
  const count = Math.max(0, Math.min(readS32(selectionList.add(0x188 * 4)) || 0, 16));
  const rows = [];
  for (let i = 0; i < count; i += 1) {{ rows.push({{ index: i, primary: uiObjectState(readPtr(selectionList.add((0x22 + i) * 4))), secondary: uiObjectState(readPtr(selectionList.add((0x32 + i) * 4))) }}); }}
  return rows;
}}

function selectionState() {{
  const payload = readPtr(selectionList.add(0x18a * 4));
  const base = clientBase();
  const currentPayload = base.isNull() ? ptr('0x0') : readPtr(base.add(8));
  return {{
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    selectedIndexGlobal: readS32(selectedIndexGlobal),
    categoryGlobal: readS32(categoryGlobal),
    listPage187: readS32(selectionList.add(0x187 * 4)),
    listCount188: readS32(selectionList.add(0x188 * 4)),
    listSelected189: readS32(selectionList.add(0x189 * 4)),
    listPayload18a: hex(payload),
    payloadCount270: readS32(payload.add(0x270)),
    payloadCount270U8: readU8(payload.add(0x270)),
    payloadWord26c: readU16(payload.add(0x26c)),
    payloadWord274: readU16(payload.add(0x274)),
    payloadBytes260: bytesHex(payload.add(0x260), 64),
    currentPayload: hex(currentPayload),
    currentPayloadCount270: readS32(currentPayload.add(0x270)),
    currentPayloadCount270U8: readU8(currentPayload.add(0x270)),
    currentPayloadWord274: readU16(currentPayload.add(0x274)),
    rows: selectionRows(),
  }};
}}

function runtimeCommandTable() {{
  const base = clientBase();
  if (base.isNull()) return {{ clientBase: null }};
  const table305 = base.add(0x3416d8);
  const table307 = base.add(0x3468ea);
  return {{
    clientBase: hex(base),
    table305: {{ address: hex(table305), guard00: readU8(table305), commandCount14: readU8(table305.add(0x14)), firstFactory16: readU16(table305.add(0x16)), bytes: bytesHex(table305, 48) }},
    table307: {{ address: hex(table307), guard00: readU8(table307), commandCount14: readU8(table307.add(0x14)), firstFactory16: readU16(table307.add(0x16)), bytes: bytesHex(table307, 48) }},
  }};
}}

function linkageState() {{
  const base = clientBase();
  if (base.isNull()) return {{ clientBase: null }};
  const charCount = readU32(base.add(0x36a5dc));
  const unitCount = readU16(base.add(0x41a364));
  const char0 = base.add(0x36a8b4);
  const unit0 = base.add(0x41a368);
  const player0 = base.add(0x0c);
  return {{
    gridActive126710: readU8(base.add(0x126710)),
    fieldMode126711: readU8(base.add(0x126711)),
    worldActive2a58f8: readU32(base.add(0x2a58f8)),
    focusChar3584a0: readU32(base.add(0x3584a0)),
    charCount36a5dc: charCount,
    char0: {{ id00: readU32(char0), flagship24: readU32(char0.add(0x24)), bytes: bytesHex(char0, 64) }},
    unitCount41a364: unitCount,
    unit0: {{ id00: readU32(unit0), bytes: bytesHex(unit0, 96) }},
    playerInfo0: {{ id00: readU32(player0), x40: readU32(player0.add(0x40)), y44: readU32(player0.add(0x44)), bytes: bytesHex(player0, 96) }},
  }};
}}

function rootState() {{
  const root = dataRoot();
  const raw = root.isNull() ? null : readS32(root.add(0x11178));
  return {{
    dataRoot: hex(root),
    currentRaw11178: raw,
    currentX: raw === null || raw < 0 ? null : raw % 100,
    currentY: raw === null || raw < 0 ? null : Math.floor(raw / 100),
    listCount1117c: root.isNull() ? null : readU32(root.add(0x1117c)),
    listHead11180: root.isNull() ? null : bytesHex(root.add(0x11180), 96),
  }};
}}

function snapshot() {{
  const state = selectStateSnapshot();
  return {{
    tag: 'snapshot',
    label: LABEL,
    t: Date.now(),
    moduleBase: hex(moduleBase),
    root: rootState(),
    selectState: state,
    projectedCell: cellAt(state.p24ProjX, state.p28ProjY),
    selectedCell: cellAt(state.p18SelectedX, state.p1cSelectedY),
    camera: {{ x: readF32(camera.x), y: readF32(camera.y), z: readF32(camera.z) }},
    markerToggle: {{ p1c: readU8(markerToggle.add(0x1c)), p1d: readU8(markerToggle.add(0x1d)), bytes: bytesHex(markerToggle, 64) }},
    command: commandState(),
    selection: selectionState(),
    runtimeCommandTable: runtimeCommandTable(),
    linkage: linkageState(),
  }};
}}

send(snapshot());
"""


def _session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}: {pid}")
    return pid


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    session = None
    script = None
    with args.out.open("a", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(build_js(label=args.label, sample_bytes=args.sample_bytes))
            script.on("message", on_message)
            script.load()
            time.sleep(args.wait)
        finally:
            if script is not None:
                script.unload()
            if session is not None:
                session.detach()

    print(json.dumps({"attachedPid": pid, "out": str(args.out), "events": events}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None, help="attach to this PID instead of reading session.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--label", default="snapshot")
    parser.add_argument("--sample-bytes", type=int, default=96)
    parser.add_argument("--wait", type=float, default=0.25)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
