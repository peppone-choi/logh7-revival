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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-selectgrid-click-correlation-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only Frida watcher for one-click SelectGrid correlation."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    script = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 24000;
let seq = 0;
let clickSeq = 0;
let activeClickId = null;
let projectionSerial = 0;
let activeProjectionSerial = null;
let activeUntilSeq = 0;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) { if (value === null || value === undefined) return null; return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, String(value)); }
function boundedSampleBytes(length) { return Math.max(0, Math.min(length, SAMPLE_BYTES)); }
function bytesHex(address, length) { return safe(() => { const p = ptr(address); if (p.isNull()) return null; const bytes = p.readByteArray(boundedSampleBytes(length)); if (bytes === null) return null; return Array.prototype.map.call(new Uint8Array(bytes), (b) => ('0' + b.toString(16)).slice(-2)).join(''); }, null); }
function readPointer(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readU32(address) { return safe(() => ptr(address).readU32(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function readF32(address) { return safe(() => ptr(address).readFloat(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function retaddr(context) { return hex(stackPtr(context, 0)); }
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

function flagSnapshot() {
  const left = readU8(flags.left); const right = readU8(flags.right);
  return { mouseX: readS32(flags.mouseX), mouseY: readS32(flags.mouseY), transient: readU8(flags.transient), left, right, leftHas40: left === null ? null : (left & 0x40) !== 0, rightHas40: right === null ? null : (right & 0x40) !== 0 };
}
function interestingMouseState() {
  const f = flagSnapshot();
  return f.leftHas40 || f.rightHas40;
}
function shouldEmitClickPath() { return interestingMouseState() || (activeClickId !== null && seq <= activeUntilSeq); }
function vectorSnapshot(vector) {
  const p = ptr(vector || 0);
  return { ptr: hex(p), f00: readF32(p), f04: readF32(p.add(4)), f08: readF32(p.add(8)), bytes: bytesHex(p, 16) };
}
function currentLocation() {
  const root = readPointer(dataRootPtr); const raw = root.isNull() ? null : readS32(root.add(0x11178));
  return { dataRoot: hex(root), raw, x: raw === null || raw < 0 ? null : raw % 100, y: raw === null || raw < 0 ? null : Math.floor(raw / 100), listCount1117c: root.isNull() ? null : readU32(root.add(0x1117c)) };
}
function cellAt(x, y) {
  const base = readPointer(clientBasePtr);
  if (base.isNull() || x === null || y === null || x < 0 || y < 0 || x >= 100 || y >= 50) {
    return { x, y, index: null, cellValue: null, object0: null, object1: null, object2: null };
  }
  const index = y * 100 + x;
  const cellValue = readU8(base.add(0x2c03cc + index));
  const object = base.add(0x2c1755 + (cellValue || 0) * 3);
  return { x, y, index, cellValue, object0: readU8(object), object1: readU8(object.add(1)), object2: readU8(object.add(2)) };
}
function selectStateSnapshot() {
  const p = selectState;
  return {
    p04Mode: readS32(p.add(0x04)), p0cPhase: readS32(p.add(0x0c)), p10TargetRaw: readS32(p.add(0x10)),
    p20Range: readS32(p.add(0x20)), p24ProjX: readS32(p.add(0x24)), p28ProjY: readS32(p.add(0x28)),
    p2cWorldX: readF32(p.add(0x2c)), p30WorldY: readF32(p.add(0x30)), p34WorldZ: readF32(p.add(0x34)),
  };
}
function commandState() {
  const active = readPointer(commandMenu); const rowCount = readS32(commandMenu.add(0xd4 * 4));
  return { activePtr: hex(active), activeGate04: readU8(active.add(4)), activeGate05: readU8(active.add(5)), rowCountD4: rowCount, selectedD5: readS32(commandMenu.add(0xd5 * 4)), categoryD6: readS32(commandMenu.add(0xd6 * 4)) };
}
function snapshot() {
  const state = selectStateSnapshot();
  return { flags: flagSnapshot(), currentLocation: currentLocation(), selectState: state, selectedCell: cellAt(state.p24ProjX, state.p28ProjY), commandState: commandState() };
}
function eventContext(extra) {
  return { clickId: activeClickId, projectionSerial: activeProjectionSerial, ...snapshot(), ...(extra || {}) };
}
function projectorWriteArgs(context) {
  const esp = context.esp;
  const ret = readPointer(esp.add(4));
  return { esp: hex(esp), ret: hex(ret), returnAddressMatchesSelectGridProjection: safe(() => ret.equals(abs('0x004d7a80')), false), arg1: hex(readPointer(esp.add(8))), arg2: hex(readPointer(esp.add(12))), arg3: hex(readPointer(esp.add(16))), eax: context.eax.toInt32(), ecx: hex(context.ecx), edx: hex(context.edx) };
}
function projectionStack(context) {
  const esp = context.esp; return { esp: hex(esp), statePtr: hex(readPointer(esp.add(0x5c))), sp20: readU32(esp.add(0x20)), sp2c: readU32(esp.add(0x2c)), sp30: readU32(esp.add(0x30)), sp34: readU32(esp.add(0x34)), sp5c: readU32(esp.add(0x5c)), sp6c: readU32(esp.add(0x6c)), sp70: readU32(esp.add(0x70)) };
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x004b25a0', 'worldProjector-004b25a0', {
  onEnter() {
    this.enabled = interestingMouseState();
    if (!this.enabled) return;
    clickSeq += 1;
    activeClickId = clickSeq;
    activeUntilSeq = seq + 80;
    this.clickId = activeClickId;
    this.outVec = stackPtr(this.context, 4);
    emit('click-start', eventContext({
      arg2MouseX: stackU32(this.context, 2),
      arg3MouseY: stackU32(this.context, 3),
      arg4OutVector: hex(this.outVec),
      ret: retaddr(this.context),
    }));
  },
  onLeave(retval) {
    if (!this.enabled) return;
    emit('worldProjector-leave-004b25a0', eventContext({
      clickId: this.clickId,
      retval: retval.toInt32(),
      outVec: hex(this.outVec),
      outVecAfter: vectorSnapshot(this.outVec),
    }));
  },
});
install('0x004d3581', 'projection-callee-entry-004d3581', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    const args = projectorWriteArgs(this.context);
    if (!args.returnAddressMatchesSelectGridProjection) return;
    projectionSerial += 1;
    activeProjectionSerial = projectionSerial;
    emit('projection-callee-entry-004d3581', eventContext({ projectorWriteArgs: args }));
  },
});
install('0x004d359c', 'gridProjector-write-x-004d359c', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    emit('gridProjector-write-x-004d359c', eventContext({
      targetPtr: hex(this.context.ecx),
      value: this.context.eax.toInt32(),
      targetBefore: readS32(this.context.ecx),
      projectorWriteArgs: projectorWriteArgs(this.context),
    }));
  },
});
install('0x004d35a6', 'gridProjector-write-y-prep-004d35a6', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    const target = stackPtr(this.context, 3);
    emit('gridProjector-write-y-prep-004d35a6', eventContext({
      targetPtr: hex(target),
      value: this.context.eax.toInt32(),
      targetBefore: readS32(target),
      projectorWriteArgs: projectorWriteArgs(this.context),
    }));
  },
});
install('0x004d7a80', 'projection-call-after-004d7a80', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    emit('projection-call-after-004d7a80', eventContext({ ret: retaddr(this.context), projectionStack: projectionStack(this.context) }));
  },
});
install('0x004d7aa9', 'projection-state-written-after-004d7aa9', {
  onEnter() { if (shouldEmitClickPath()) emit('projection-state-written-after-004d7aa9', eventContext({ ret: retaddr(this.context), projectionStack: projectionStack(this.context) })); },
});
emit('watch-ready', eventContext({ sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS }));
setInterval(function heartbeat() {
  emit('watch-heartbeat', eventContext({ pollMs: POLL_MS }));
}, POLL_MS);
"""
    return script.replace("__SAMPLE_BYTES__", str(max(0, int(sample_bytes)))).replace(
        "__POLL_MS__",
        str(max(1, int(poll_ms))),
    )


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
