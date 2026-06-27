# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_endpoint_cache_snapshot.py --session .omo/ui-explorer/session --label spot-check
from __future__ import annotations

import argparse
import importlib
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-endpoint-cache-snapshot.jsonl"
DESCRIPTION: Final = "Read LOGH VII endpoint caches for static base, dynamic base, and institution records."


def build_js(*, label: str = "endpoint-cache", sample_records: int = 10) -> str:
    safe_label = json.dumps(label, ensure_ascii=False)
    sample_limit = max(1, min(int(sample_records), 32))
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const LABEL = {safe_label};
const SAMPLE_RECORDS = {sample_limit};

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
function clampCount(value, cap) {{
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(value, cap));
}}
function gridToPoint(grid) {{
  if (grid === null || grid < 0) return {{ x: null, y: null }};
  return {{ x: grid % 100, y: Math.trunc(grid / 100) }};
}}
function readUtf16(address, count) {{
  const length = clampCount(count, 13);
  let text = '';
  for (let i = 0; i < length; i += 1) {{
    const ch = readU16(ptr(address).add(i * 2));
    if (ch === null || ch === 0) break;
    text += String.fromCharCode(ch);
  }}
  return text;
}}

const clientBasePtr = abs('0x007ccffc');
const strategyManager = abs('0x007cd048');
const selectedSystemActive = abs('0x009d15b0');
const selectedSystemCell = abs('0x009d15c0');
const planetNodes = abs('0x009d2f74');

function clientBase() {{ return readPtr(clientBasePtr); }}

function staticBaseRecordAt(table, index) {{
  const row = ptr(table).add(4 + index * 0x3c);
  const grid = readU16(row.add(4));
  const nameLen = readU8(row.add(0x0a));
  return {{
    index,
    row: hex(row),
    id: readU32(row),
    grid,
    gridPoint: gridToPoint(grid),
    field06: readU16(row.add(6)), field08: readU16(row.add(8)), nameLen, name: readUtf16(row.add(0x0c), nameLen),
    class26: readU8(row.add(0x26)), diameter28: readF32(row.add(0x28)), u2c: readU32(row.add(0x2c)),
    revolutionDirection30: readU8(row.add(0x30)), revolutionCycle34: readF32(row.add(0x34)), revolutionInitAngle38: readF32(row.add(0x38)),
  }};
}}
function staticBaseCount(table) {{
  const countU16 = readU16(table);
  const countU32 = readU32(table);
  return {{
    countU8: readU8(table),
    countU16,
    countU32,
    effective: clampCount(countU16 !== null ? countU16 : countU32, 0x15e),
  }};
}}
function staticBaseTable(table) {{
  const counts = staticBaseCount(table);
  const records = [];
  for (let i = 0; i < Math.min(counts.effective, SAMPLE_RECORDS); i += 1) records.push(staticBaseRecordAt(table, i));
  return {{ address: hex(table), ...counts, records }};
}}
function findStaticByGrid(table, grid) {{
  if (grid === null) return null;
  const count = staticBaseCount(table).effective;
  for (let i = 0; i < count; i += 1) {{
    const record = staticBaseRecordAt(table, i);
    if (record.grid === grid) return record;
  }}
  return null;
}}

function dynamicBaseRecordAt(table, index) {{
  const row = ptr(table).add(4 + index * 0x180);
  return {{
    index,
    row: hex(row),
    id: readU32(row),
    b04: readU8(row.add(4)), b05: readU8(row.add(5)), field120: readU32(row.add(0x11c)),
    transportCount1c: readU8(row.add(0x1c)), outfitCount98: readU8(row.add(0x98)),
    budgetingCount12a: readU8(row.add(0x12a)), budgeting0_12c: readU16(row.add(0x12c)),
    budgetCount138: readU8(row.add(0x138)), budget0_13c: readU32(row.add(0x13c)),
    commodityCount160: readU8(row.add(0x160)), commodity0_164: readU32(row.add(0x164)),
    b174: readU8(row.add(0x174)), b175: readU8(row.add(0x175)), field178: readU8(row.add(0x178)),
    field176: readU16(row.add(0x176)), field17c: readU32(row.add(0x17c)),
  }};
}}
function dynamicBaseTable(table) {{
  const countU8 = readU8(table);
  const count = clampCount(countU8, 4);
  const records = [];
  for (let i = 0; i < count; i += 1) records.push(dynamicBaseRecordAt(table, i));
  return {{ address: hex(table), countU8, count, records }};
}}
function findDynamicById(table, id) {{
  if (id === null) return null;
  const count = clampCount(readU8(table), 4);
  for (let i = 0; i < count; i += 1) {{
    const record = dynamicBaseRecordAt(table, i);
    if (record.id === id) return record;
  }}
  return null;
}}

function institutionRecordAt(table, index) {{
  const row = ptr(table).add(4 + index * 0x2378);
  const firstInstitution = row.add(0x08);
  const firstSpot = firstInstitution.add(0x0c);
  const firstSpotCount = clampCount(readU8(firstInstitution.add(8)), 20);
  const spotSamples = [];
  for (let i = 0; i < Math.min(firstSpotCount, SAMPLE_RECORDS); i += 1) {{
    const spot = firstSpot.add(i * 0x0c);
    spotSamples.push({{
      index: i,
      w00: readU16(spot),
      u04: readU32(spot.add(4)),
      w08: readU16(spot.add(8)),
    }});
  }}
  return {{
    index,
    row: hex(row),
    id: readU32(row),
    institutionCount04: readU8(row.add(4)),
    firstInstitution: {{
      w00: readU16(firstInstitution), u04: readU32(firstInstitution.add(4)), spotCount08: readU8(firstInstitution.add(8)),
      firstSpot: {{ w00: readU16(firstSpot), u04: readU32(firstSpot.add(4)), w08: readU16(firstSpot.add(8)) }},
      spotSamples,
    }},
  }};
}}
function institutionTable(table) {{
  const countU8 = readU8(table);
  const count = clampCount(countU8, 4);
  const records = [];
  for (let i = 0; i < count; i += 1) records.push(institutionRecordAt(table, i));
  return {{ address: hex(table), countU8, count, records }};
}}
function findInstitutionById(table, id) {{
  if (id === null) return null;
  const count = clampCount(readU8(table), 4);
  for (let i = 0; i < count; i += 1) {{
    const record = institutionRecordAt(table, i);
    if (record.id === id) return record;
  }}
  return null;
}}
function institutionSpotMatch(record, spotKey) {{
  if (record === null || spotKey === null) return null;
  const spots = record.firstInstitution?.spotSamples ?? [];
  for (const spot of spots) {{
    if (spot.u04 === spotKey) return spot;
  }}
  return null;
}}

function selectedSystemState(staticTableSource, dynamicTableSource) {{
  const activeU8 = readU8(selectedSystemActive);
  const cellS32 = readS32(selectedSystemCell);
  const staticMatch = findStaticByGrid(staticTableSource, cellS32);
  const dynamicMatch = staticMatch === null ? null : findDynamicById(dynamicTableSource, staticMatch.id);
  const nodes = [];
  for (let i = 0; i < 8; i += 1) nodes.push(hex(readPtr(planetNodes.add(i * 4))));
  return {{
    activeU8,
    activeU32: readU32(selectedSystemActive),
    cellS32,
    cellPoint: gridToPoint(cellS32),
    staticMatchByGrid: staticMatch,
    dynamicMatchByStaticId: dynamicMatch,
    planetModelNodes: nodes,
  }};
}}

function playerInfoSlot(slot, index) {{
  return {{
    index,
    row: hex(slot),
    active00: readU8(slot),
    id24: readU32(slot.add(0x24)),
    field28: readU16(slot.add(0x28)),
    field2a: readU8(slot.add(0x2a)),
    field2b: readU8(slot.add(0x2b)),
    field3cFromSource1c: readU32(slot.add(0x3c)),
    spotKey40FromSource20: readU32(slot.add(0x40)),
    spotAux44FromSource24: readU32(slot.add(0x44)),
    field48FromSource28: readU32(slot.add(0x48)),
    resolverCountA1: readU8(slot.add(0xa1)),
    resolverBlock0A4: readU32(slot.add(0xa4)),
    resolverBase120: readU32(slot.add(0x120)),
    resolverBase124: readU32(slot.add(0x124)),
    resolverBlock1_128: readU32(slot.add(0x128)),
    resolverBase1a4: readU32(slot.add(0x1a4)),
    seatCount270: readU8(slot.add(0x270)),
    together2f4: readU8(slot.add(0x2f4)),
  }};
}}

function playerInfoState(mainState, focusId) {{
  const base = mainState.add(0x0c);
  const active = [];
  let focusMatch = null;
  for (let i = 0; i < 592; i += 1) {{
    const slot = base.add(i * 0x370);
    const marker = readU8(slot);
    if (!marker) continue;
    const info = playerInfoSlot(slot, i);
    if (active.length < SAMPLE_RECORDS) active.push(info);
    if (focusMatch === null && info.id24 === focusId) focusMatch = info;
  }}
  const pointer08 = readPtr(mainState.add(8));
  return {{
    base: hex(base),
    pointerAtClientBase08: hex(pointer08),
    currentByPointer08: pointer08.isNull() ? null : playerInfoSlot(pointer08, null),
    activeSample: active,
    focusMatch,
  }};
}}

function characterState(mainState) {{
  const focusId = readU32(mainState.add(0x3584a0));
  const char0 = mainState.add(0x36a8b4);
  const unit0 = mainState.add(0x41a368);
  return {{
    focusChar3584a0: focusId,
    charCount36a5dc: readU32(mainState.add(0x36a5dc)),
    char0: {{
      id00: readU32(char0), power04: readU8(char0.add(4)), camp05: readU8(char0.add(5)),
      returnBase18: readU32(char0.add(0x18)), spot1c: readU32(char0.add(0x1c)),
      spotOwner20: readU32(char0.add(0x20)), flagship24: readU32(char0.add(0x24)),
    }},
    unitTable: {{
      countU16: readU16(mainState.add(0x41a364)),
      unit0: {{
        row: hex(unit0),
        id00: readU32(unit0),
        u08: readU32(unit0.add(0x08)),
        u0c: readU32(unit0.add(0x0c)),
        u10: readU32(unit0.add(0x10)),
        u14: readU32(unit0.add(0x14)),
        u18: readU32(unit0.add(0x18)),
        u40: readU32(unit0.add(0x40)),
        u44: readU32(unit0.add(0x44)),
        u48: readU32(unit0.add(0x48)),
      }},
    }},
    playerInfo: playerInfoState(mainState, focusId),
  }};
}}

function strategyManagerState() {{
  return {{
    address: hex(strategyManager),
    flag31e: readU8(strategyManager.add(0x31e)),
    field320: readU32(strategyManager.add(0x320)),
    field324: readU32(strategyManager.add(0x324)),
    selectedBase358: readU32(strategyManager.add(0x358)),
  }};
}}

function snapshot() {{
  const mainState = clientBase();
  if (mainState.isNull()) return {{ tag: 'endpoint-cache', label: LABEL, t: Date.now(), clientBase: null }};
  const staticSource = mainState.add(0x3f5ae8);
  const dynamicSource = mainState.add(0x3facf4);
  const institutionSource = mainState.add(0x3fb2f8);
  const strategyInstitutionSource = mainState.add(0x2b7078);
  const character = characterState(mainState);
  const selectedSystem = selectedSystemState(staticSource, dynamicSource);
  const selectedBaseId = selectedSystem.staticMatchByGrid?.id ?? null;
  const playerSpotKey = character.playerInfo?.currentByPointer08?.spotKey40FromSource20 ?? null;
  const selectedInstitution = findInstitutionById(strategyInstitutionSource, selectedBaseId);
  return {{
    tag: 'endpoint-cache',
    label: LABEL,
    t: Date.now(),
    moduleBase: hex(moduleBase),
    clientBase: hex(mainState),
    strategyManager: strategyManagerState(),
    character,
    selectedSystem,
    selectedInstitutionResolver: {{
      selectedBaseId,
      playerSpotKey,
      selectedInstitution,
      selectedBaseHasPlayerSpotKey: institutionSpotMatch(selectedInstitution, playerSpotKey),
    }},
    responseStaticInformationBase031d: staticBaseTable(staticSource),
    responseInformationBase031f: dynamicBaseTable(dynamicSource),
    strategyCopyInformationBase031f: dynamicBaseTable(mainState.add(0x2b6a74)),
    responseInformationInstitution0321: institutionTable(institutionSource),
    strategyCopyInformationInstitution0321: institutionTable(strategyInstitutionSource),
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
            script = session.create_script(build_js(label=args.label, sample_records=args.sample_records))
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
    parser.add_argument("--label", default="endpoint-cache")
    parser.add_argument("--sample-records", type=int, default=10)
    parser.add_argument("--wait", type=float, default=0.25)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
