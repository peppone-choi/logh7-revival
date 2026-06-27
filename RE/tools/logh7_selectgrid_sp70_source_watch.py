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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-selectgrid-sp70-source-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only Frida watcher for SelectGrid sp70 source tracing."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    script = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 24000;
let seq = 0;
let clickSeq = 0;
let projectionSeq = 0;
let activeClickId = null;
let activeProjectionId = null;
let activeUntilSeq = 0;
let lastGridXWrite = null;
let lastGridYWrite = null;

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
function stackPtr(context, index) { return readPointer(context.esp.add(index * 4)); }
function stackU32(context, index) { return readU32(context.esp.add(index * 4)); }
function samePtr(left, right) { return safe(() => ptr(left).equals(ptr(right)), false); }
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), clickId: activeClickId, projectionId: activeProjectionId, ...(payload || {}) });
}

const selectState = abs('0x009d2a30');
const flags = {
  transient: abs('0x02214bb0'),
  left: abs('0x022142db'),
  right: abs('0x022142dc'),
  mouseX: abs('0x022143dc'),
  mouseY: abs('0x022143e0'),
};

function flagSnapshot() {
  const left = readU8(flags.left);
  const right = readU8(flags.right);
  return { mouseX: readS32(flags.mouseX), mouseY: readS32(flags.mouseY), transient: readU8(flags.transient), left, right, leftHas40: left === null ? null : (left & 0x40) !== 0, rightHas40: right === null ? null : (right & 0x40) !== 0 };
}
function interestingMouseState() {
  const f = flagSnapshot();
  return f.leftHas40 || f.rightHas40;
}
function shouldEmitClickPath() {
  return interestingMouseState() || (activeClickId !== null && seq <= activeUntilSeq);
}
function vectorSnapshot(vector) {
  const p = ptr(vector || 0);
  return { ptr: hex(p), f00: readF32(p), f04: readF32(p.add(4)), f08: readF32(p.add(8)), bytes: bytesHex(p, 16) };
}
function stateSnapshot(statePtr) {
  const p = ptr(statePtr || selectState);
  return {
    state: hex(p), p04Mode: readS32(p.add(0x04)), p0cPhase: readS32(p.add(0x0c)), p10TargetRaw: readS32(p.add(0x10)),
    p20Range: readS32(p.add(0x20)), p24ProjX: readS32(p.add(0x24)), p28ProjY: readS32(p.add(0x28)),
    p2cWorldX: readF32(p.add(0x2c)), p30WorldY: readF32(p.add(0x30)), p34WorldZ: readF32(p.add(0x34)),
  };
}
function registerSnapshot(context) {
  return { eax: hex(context.eax), ebx: hex(context.ebx), ecx: hex(context.ecx), edx: hex(context.edx), esi: hex(context.esi), edi: hex(context.edi), ebp: hex(context.ebp), esp: hex(context.esp) };
}
function stackSlot(context, offset) {
  const address = context.esp.add(offset);
  return { offset: '0x' + offset.toString(16), address: hex(address), u32: readU32(address), s32: readS32(address), ptr: hex(readPointer(address)) };
}
function stackWindow(context) {
  return [0x00, 0x04, 0x08, 0x0c, 0x20, 0x2c, 0x30, 0x34, 0x5c, 0x60, 0x64, 0x68, 0x6c, 0x70, 0x74, 0x78].map((offset) => stackSlot(context, offset));
}
function projectionArgs(context) {
  const xOut = readPointer(context.esp);
  const yOut = readPointer(context.esp.add(4));
  const world = readPointer(context.esp.add(8));
  const sp70Address = context.esp.add(0x70);
  const sp6cAddress = context.esp.add(0x6c);
  return {
    xOutPtr: hex(xOut), yOutPtr: hex(yOut), worldVectorPtr: hex(world), worldVector: vectorSnapshot(world),
    xOutValue: readS32(xOut), yOutValue: readS32(yOut), sp70Address: hex(sp70Address), sp6cAddress: hex(sp6cAddress),
    sp70Value: readS32(sp70Address), sp6cValue: readS32(sp6cAddress),
    xOutPtrEqualsSp70Address: samePtr(xOut, sp70Address), yOutPtrEqualsSp6cAddress: samePtr(yOut, sp6cAddress),
  };
}
function callerSnapshot(context) {
  const statePtr = readPointer(context.esp.add(0x5c));
  return { flags: flagSnapshot(), registers: registerSnapshot(context), stackWindow: stackWindow(context), projectionArgs: projectionArgs(context), statePtr: hex(statePtr), stateAtEbp: stateSnapshot(context.ebp), stateAtStack5c: stateSnapshot(statePtr), lastGridXWrite, lastGridYWrite };
}
function calleeArgs(context) {
  const returnAddress = readPointer(context.esp.add(4));
  const xOut = readPointer(context.esp.add(8));
  const yOut = readPointer(context.esp.add(0x0c));
  const world = readPointer(context.esp.add(0x10));
  return {
    returnAddress: hex(returnAddress),
    returnAddressMatchesSelectGridProjection: samePtr(returnAddress, abs('0x004d7a80')),
    xOutPtr: hex(xOut), yOutPtr: hex(yOut), worldVectorPtr: hex(world),
    xOutValue: readS32(xOut), yOutValue: readS32(yOut), worldVector: vectorSnapshot(world),
    stackWindow: stackWindow(context),
  };
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}
function hookCaller(vaText, name) {
  install(vaText, name, { onEnter() { if (shouldEmitClickPath()) emit(name, callerSnapshot(this.context)); } });
}

install('0x004b25a0', 'worldProjector-004b25a0', {
  onEnter() {
    this.enabled = interestingMouseState();
    if (!this.enabled) return;
    clickSeq += 1;
    activeClickId = clickSeq;
    activeUntilSeq = seq + 140;
    activeProjectionId = null;
    lastGridXWrite = null;
    lastGridYWrite = null;
    this.outVec = stackPtr(this.context, 4);
    emit('click-start', { flags: flagSnapshot(), mouseXArg: stackU32(this.context, 2), mouseYArg: stackU32(this.context, 3), outVec: hex(this.outVec), outVecBefore: vectorSnapshot(this.outVec) });
  },
  onLeave(retval) {
    if (!this.enabled) return;
    emit('worldProjector-leave-004b25a0', { retval: retval.toInt32(), outVec: hex(this.outVec), outVecAfter: vectorSnapshot(this.outVec), flags: flagSnapshot() });
  },
});
install('0x004d3581', 'projection-callee-entry-004d3581', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    const args = calleeArgs(this.context);
    if (!args.returnAddressMatchesSelectGridProjection) return;
    projectionSeq += 1;
    activeProjectionId = projectionSeq;
    lastGridXWrite = null;
    lastGridYWrite = null;
    emit('projection-callee-entry-004d3581', { flags: flagSnapshot(), registers: registerSnapshot(this.context), calleeArgs: args });
  },
});
for (const [vaText, name] of [
  ['0x004d7a80', 'projection-call-after-004d7a80'],
  ['0x004d7aa9', 'projection-copy-after-004d7aa9'],
]) hookCaller(vaText, name);
install('0x004d359c', 'gridProjector-write-x-004d359c', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    lastGridXWrite = { targetPtr: hex(this.context.ecx), value: this.context.eax.toInt32(), targetBefore: readS32(this.context.ecx), calleeArgs: calleeArgs(this.context) };
    emit('gridProjector-write-x-004d359c', { flags: flagSnapshot(), registers: registerSnapshot(this.context), lastGridXWrite });
  },
});
install('0x004d35a6', 'gridProjector-write-y-prep-004d35a6', {
  onEnter() {
    if (!shouldEmitClickPath()) return;
    const target = readPointer(this.context.esp.add(0x0c));
    lastGridYWrite = { targetPtr: hex(target), value: this.context.eax.toInt32(), targetBefore: readS32(target), calleeArgs: calleeArgs(this.context) };
    emit('gridProjector-write-y-prep-004d35a6', { flags: flagSnapshot(), registers: registerSnapshot(this.context), lastGridYWrite });
  },
});
emit('watch-ready', { sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS });
setInterval(function heartbeat() { emit('watch-heartbeat', { flags: flagSnapshot(), sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS }); }, POLL_MS);
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
            if script is not None:
                try:
                    script.unload()
                except Exception:
                    pass
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
