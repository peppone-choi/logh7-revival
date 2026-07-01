# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-selectgrid-state-watch.jsonl"
DESCRIPTION: Final = "Attach a Frida watcher for the LOGH VII SelectGrid click-to-command path."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    script = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 24000;
let seq = 0;
let frameCount = 0;
let lastKey = null;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) {
  if (value === null || value === undefined) return null;
  return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, String(value));
}
function readPtr(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readU16(address) { return safe(() => ptr(address).readU16(), null); }
function readU32(address) { return safe(() => ptr(address).readU32(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function readF32(address) { return safe(() => ptr(address).readFloat(), null); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function retaddr(context) { return hex(stackPtr(context, 0)); }
function backtrace(context) { return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 8).map((f) => hex(f)), []); }
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}

const clientBasePtr = abs('0x007ccffc');
const dataRootPtr = abs('0x007cd04c');
const commandMenu = abs('0x00c9e768');
const selectState = abs('0x009d2a30');
const flags = {
  transient: abs('0x02214bb0'),
  left: abs('0x022142db'),
  right: abs('0x022142dc'),
  mouseX: abs('0x022143dc'),
  mouseY: abs('0x022143e0'),
};
const vtableLabels = { '0x6702b8': 'SelectGrid.root', '0x676b30': 'SelectGrid.targetRoot', '0x676b74': 'TargetGrid.child', '0x676aec': 'SendWarpCommand', '0x676aa8': 'GoReceive', '0x6702c0': 'ReceiveResult' };

function labelForVtable(vtable) { return vtableLabels[hex(vtable)] || null; }
function currentLocation() {
  const root = readPtr(dataRootPtr);
  const raw = root.isNull() ? null : readS32(root.add(0x11178));
  return {
    dataRoot: hex(root),
    raw,
    x: raw === null || raw < 0 ? null : raw % 100,
    y: raw === null || raw < 0 ? null : Math.floor(raw / 100),
    listCount1117c: root.isNull() ? null : readU32(root.add(0x1117c)),
  };
}
function cellAt(x, y) {
  const base = readPtr(clientBasePtr);
  if (base.isNull() || x === null || y === null || x < 0 || y < 0 || x >= 100 || y >= 50) {
    return { x, y, index: null, cellValue: null, object0: null, object1: null, object2: null };
  }
  const index = y * 100 + x;
  const cellValue = readU8(base.add(0x2c03cc + index));
  const object = base.add(0x2c1755 + (cellValue || 0) * 3);
  return { x, y, index, cellValue, object0: readU8(object), object1: readU8(object.add(1)), object2: readU8(object.add(2)) };
}
function stateSnapshot(state) {
  const p = ptr(state || selectState);
  return {
    state: hex(p), p04Mode: readS32(p.add(0x04)), p0cPhase: readS32(p.add(0x0c)),
    p10TargetRaw: readS32(p.add(0x10)), p20Range: readS32(p.add(0x20)),
    p24ProjX: readS32(p.add(0x24)), p28ProjY: readS32(p.add(0x28)),
    p2cWorldX: readF32(p.add(0x2c)), p30WorldY: readF32(p.add(0x30)), p34WorldZ: readF32(p.add(0x34)),
  };
}
function flagSnapshot() {
  const left = readU8(flags.left);
  const right = readU8(flags.right);
  return {
    mouseX: readS32(flags.mouseX),
    mouseY: readS32(flags.mouseY),
    transient: readU8(flags.transient),
    left,
    right,
    leftHas40: left === null ? null : (left & 0x40) !== 0,
    rightHas40: right === null ? null : (right & 0x40) !== 0,
  };
}
function commandState() {
  const active = readPtr(commandMenu);
  const rowCount = readS32(commandMenu.add(0xd4 * 4));
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(rowCount || 0, 4)); i += 1) {
    const row = readPtr(commandMenu.add((0x0c + i) * 4));
    rows.push({ index: i, row: hex(row), idB04: readU16(row.add(0xb04)), x20: readS32(row.add(0x20)), y24: readS32(row.add(0x24)), w2c: readS32(row.add(0x2c)), h30: readS32(row.add(0x30)) });
  }
  return {
    activePtr: hex(active),
    activeGate04: readU8(active.add(4)),
    activeGate05: readU8(active.add(5)),
    rowCountD4: rowCount,
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
    rows,
  };
}
function objectFields(object) {
  if (object === null || object === undefined || ptr(object).isNull()) return null;
  const p = ptr(object);
  const vtable = readPtr(p);
  return {
    object: hex(p), vtable: hex(vtable), vtableLabel: labelForVtable(vtable),
    p04: readU32(p.add(0x04)), p08: readU32(p.add(0x08)), p0c: readU32(p.add(0x0c)), p10: readU32(p.add(0x10)),
    p14: readU32(p.add(0x14)), p18: readU32(p.add(0x18)), p1c: readU32(p.add(0x1c)), p20: readU32(p.add(0x20)),
    p24: readU32(p.add(0x24)), p28: readU32(p.add(0x28)), p2c: readU32(p.add(0x2c)), p30: readU32(p.add(0x30)),
  };
}
function stackWindow(esp) {
  const out = {};
  for (const off of [0x20, 0x24, 0x28, 0x2c, 0x30, 0x34, 0x5c, 0x64, 0x68, 0x6c, 0x70]) out['sp' + off.toString(16)] = readS32(ptr(esp).add(off));
  return out;
}
function globalsSnapshot() {
  return { d2a34: readU32(selectState.add(0x04)), d2a3c: readU32(selectState.add(0x0c)), d2a40: readU32(selectState.add(0x10)), d2a74: readU32(selectState.add(0x44)), d2a7c: readU32(selectState.add(0x4c)) };
}
function selectGridSnapshot() {
  const state = stateSnapshot(selectState);
  return { currentLocation: currentLocation(), selectedCell: cellAt(state.p24ProjX, state.p28ProjY), state, flags: flagSnapshot(), command: commandState(), globals: globalsSnapshot() };
}
function snapshotKey() {
  const s = selectGridSnapshot();
  return JSON.stringify([s.currentLocation.raw, s.state.p0cPhase, s.state.p10TargetRaw, s.state.p24ProjX, s.state.p28ProjY, s.flags.left, s.flags.right, s.command.selectedD5]);
}
function payload(extra) { return { selectGridSnapshot: selectGridSnapshot(), ...(extra || {}) }; }
function dispatchCaseInfo(value) {
  const n = value === null || value === undefined ? null : Number(value);
  const known = {
    0x30: { label: 'case30-observed-info-path', note: 'live C002 clicks correlated with 0x0f08/0x0f09, not 0x0b01' },
    0x3a: { label: 'case3a-non-c002-selector', request: '0x0412', note: 'raw FUN_004b78a0 index: selector 0x3a is not the SelectGrid move route' },
    0x3b: { label: 'case3b-grid-move', request: '0x0b01', response: '0x0b07' },
  };
  const info = n === null ? null : (known[n] || null);
  return {
    dispatchCase: n,
    dispatchCaseHex: n === null ? null : '0x' + n.toString(16),
    dispatchCaseKnown: info,
    isGridMoveCase: n === 0x3b,
  };
}
function isSelectState(value) { return safe(() => ptr(value).equals(selectState), false); }
function interestingClickState() {
  const s = stateSnapshot(selectState);
  const f = flagSnapshot();
  return s.p0cPhase !== 0 || f.leftHas40 || f.rightHas40;
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}
function projectionWriter(context) {
  const esp = context.esp;
  const projectedState = readPtr(esp.add(0x5c));
  return { esp: hex(esp), ebp: hex(context.ebp), ret: retaddr(context), stack: stackWindow(esp), projectedState: hex(projectedState), stateAtEbp: stateSnapshot(context.ebp), stateAtProjectedPtr: stateSnapshot(projectedState) };
}

install('0x004d6b70', 'renderStrategicWorld-004d6b70', { onEnter() {
  if (!isSelectState(this.context.ecx)) return;
  frameCount += 1;
  const f = flagSnapshot();
  const s = stateSnapshot(selectState);
  if (s.p0cPhase !== 0 || f.leftHas40 || f.rightHas40 || frameCount % 30 === 1) emit('worldFrame-enter-004d6b70', payload({ frameCount, ecx: hex(this.context.ecx), ret: retaddr(this.context) }));
}});
for (const [vaText, name] of [
  ['0x004d7a7b', 'projection-call-before-004d7a7b'], ['0x004d7a80', 'projection-call-after-004d7a80'],
  ['0x004d7a8c', 'projection-write-x-before-004d7a8c'], ['0x004d7a9c', 'projection-write-y-before-004d7a9c'],
  ['0x004d7aa9', 'projection-written-after-004d7aa9'],
]) install(vaText, name, { onEnter() { if (interestingClickState()) emit(name, payload({ projectionWriter: projectionWriter(this.context) })); } });
for (const [vaText, name] of [
  ['0x004d7acc', 'writerBranch-state-check-004d7acc'], ['0x004d7afc', 'writerBranch-left-flag-004d7afc'],
  ['0x004d7b13', 'writerBranch-validator-call-004d7b13'], ['0x004d7b18', 'writerBranch-validator-return-004d7b18'],
  ['0x004d7b1c', 'writerBranch-validator-passed-004d7b1c'], ['0x004d7b36', 'writerTargetRaw-before-004d7b36'],
  ['0x004d7b39', 'writerPhase2-before-004d7b39'],
]) install(vaText, name, { onEnter() {
  if (isSelectState(this.context.ebp) && (interestingClickState() || name.indexOf('validator') >= 0 || name.indexOf('writerTargetRaw') >= 0 || name.indexOf('writerPhase2') >= 0)) emit(name, payload({ ebp: hex(this.context.ebp), eax: this.context.eax.toInt32(), ecx: hex(this.context.ecx), edx: this.context.edx.toInt32(), ret: retaddr(this.context) }));
}});
install('0x004d6310', 'targetValidator-004d6310', {
  onEnter() { this.enabled = isSelectState(this.context.ecx); if (!this.enabled) return; this.args = { x: stackU32(this.context, 1), y: stackU32(this.context, 2), range: stackU32(this.context, 3), ret: retaddr(this.context) }; },
  onLeave(retval) { if (!this.enabled) return; emit('targetValidator-leave-004d6310', payload({ args: this.args, targetCell: cellAt(this.args.x, this.args.y), retval: retval.toInt32() })); },
});
install('0x00570a10', 'targetRootSlot2-00570a10', {
  onEnter() { this.ecx = this.context.ecx; emit('targetRootSlot2-enter-00570a10', payload({ ecx: hex(this.ecx), state: objectFields(this.ecx), ret: retaddr(this.context), stack: backtrace(this.context) })); },
  onLeave(retval) { emit('targetRootSlot2-leave-00570a10', payload({ ecx: hex(this.ecx), retval: retval.toInt32() })); },
});
for (const [vaText, name] of [
  ['0x00573cd0', 'targetChildSlot3-00573cd0'], ['0x005737d0', 'sendWarpSlot2-005737d0'],
  ['0x004b48d0', 'sendGridMove-004b48d0'], ['0x004b78a0', 'sendCorrelator-004b78a0'],
]) install(vaText, name, {
  onEnter() {
    this.ecx = this.context.ecx;
    const arg2 = stackU32(this.context, 2);
    emit(name + '-enter', payload({ ecx: hex(this.ecx), state: objectFields(this.ecx), arg1: stackU32(this.context, 1), arg2, arg3: stackU32(this.context, 3), dispatch: dispatchCaseInfo(arg2), ret: retaddr(this.context), stack: backtrace(this.context) }));
  },
  onLeave(retval) { emit(name + '-leave', payload({ ecx: hex(this.ecx), retval: retval.toInt32() })); },
});
emit('watch-ready', payload({ sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS }));
setInterval(function pollSelectGrid() {
  const key = snapshotKey();
  if (lastKey !== key) { emit('poll-change', payload({ previousKey: lastKey })); lastKey = key; }
}, POLL_MS);
"""
    return script.replace("__SAMPLE_BYTES__", str(int(sample_bytes))).replace("__POLL_MS__", str(int(poll_ms)))


def _session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}: {pid}")
    return pid


def run(args: argparse.Namespace) -> int:
    import frida  # type: ignore[import-not-found]

    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    session = None
    script = None
    with args.out.open("a", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(
                json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False)
                + "\n"
            )
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(build_js(sample_bytes=args.sample_bytes, poll_ms=args.poll_ms))
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
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
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=250)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
