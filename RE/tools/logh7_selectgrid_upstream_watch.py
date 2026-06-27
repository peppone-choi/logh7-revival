#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///

# How to run:
# 1. Install uv if needed: https://docs.astral.sh/uv/getting-started/installation/
# 2. Run directly: uv run tools/logh7_selectgrid_upstream_watch.py --help
# 3. Or use the repo Python: python tools/logh7_selectgrid_upstream_watch.py --help

from __future__ import annotations

import argparse
import importlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only Frida watcher for SelectGrid upstream projection inputs."


@dataclass(frozen=True, slots=True)
class InvalidSessionPidError(ValueError):
    session_json: Path
    pid: int

    def __str__(self) -> str:
        return f"invalid clientPid in {self.session_json}: {self.pid}"


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    script = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 24000;
let seq = 0;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) {
  if (value === null || value === undefined) return null;
  return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, String(value));
}
function boundedSampleBytes(length) { return Math.max(0, Math.min(length, SAMPLE_BYTES)); }
function bytesHex(address, length) {
  return safe(() => {
    const p = ptr(address);
    if (p.isNull()) return null;
    const bytes = p.readByteArray(boundedSampleBytes(length));
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }, null);
}
function readPointer(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function readFloat(address) { return safe(() => ptr(address).readFloat(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function retaddr(context) { return hex(stackPtr(context, 0)); }
const flags = {
  left: abs('0x022142db'),
  right: abs('0x022142dc'),
  mouseX: abs('0x022143dc'),
  mouseY: abs('0x022143e0'),
};
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}
function flagSnapshot() {
  const left = readU8(flags.left);
  const right = readU8(flags.right);
  return {
    mouseX: readS32(flags.mouseX),
    mouseY: readS32(flags.mouseY),
    left,
    right,
    leftHas40: left === null ? null : (left & 0x40) !== 0,
    rightHas40: right === null ? null : (right & 0x40) !== 0,
  };
}
function interestingMouseState() {
  const f = flagSnapshot();
  return f.leftHas40 || f.rightHas40;
}
function vectorSnapshot(vector) {
  const p = ptr(vector || 0);
  return { ptr: hex(p), f00: readFloat(p), f04: readFloat(p.add(4)), f08: readFloat(p.add(8)), bytes: bytesHex(p, 16) };
}
function intOutSnapshot(xOut, yOut) {
  const x = ptr(xOut || 0);
  const y = ptr(yOut || 0);
  return { xPtr: hex(x), yPtr: hex(y), x: readS32(x), y: readS32(y) };
}
function registerSnapshot(context) {
  return { eax: hex(context.eax), ebx: hex(context.ebx), ecx: hex(context.ecx), edx: hex(context.edx), esi: hex(context.esi), edi: hex(context.edi), ebp: hex(context.ebp), esp: hex(context.esp) };
}
function stackSnapshot(context) {
  const slots = [];
  for (let i = 0; i < 12; i += 1) {
    const address = context.esp.add(i * 4);
    slots.push({ index: i, address: hex(address), u32: stackU32(context, i), ptr: hex(readPointer(address)) });
  }
  return slots;
}
function callerProjectionSnapshot(context) {
  const xOut = readPointer(context.esp);
  const yOut = readPointer(context.esp.add(4));
  const worldVector = readPointer(context.esp.add(8));
  return {
    ret: retaddr(context),
    registers: registerSnapshot(context),
    stack: stackSnapshot(context),
    callArg1GridXOut: hex(xOut),
    callArg2GridYOut: hex(yOut),
    callArg3WorldVector: hex(worldVector),
    inputVector: vectorSnapshot(worldVector),
    output: intOutSnapshot(xOut, yOut),
  };
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x004b25a0', 'worldProjector-004b25a0', {
  onEnter() {
    this.enabled = interestingMouseState();
    if (!this.enabled) return;
    const cameraVector = stackPtr(this.context, 1);
    const mouseX = stackU32(this.context, 2);
    const mouseY = stackU32(this.context, 3);
    const outVec = stackPtr(this.context, 4);
    this.outVec = outVec;
    emit('worldProjector-enter-004b25a0', {
      ret: retaddr(this.context),
      arg1CameraVector: hex(cameraVector),
      arg2MouseX: mouseX,
      arg3MouseY: mouseY,
      arg4OutVector: hex(outVec),
      outVec: hex(outVec),
      outVecBefore: vectorSnapshot(outVec),
      cameraVector: vectorSnapshot(cameraVector),
      flags: flagSnapshot(),
      registers: registerSnapshot(this.context),
      stack: stackSnapshot(this.context),
    });
  },
  onLeave(retval) {
    if (!this.enabled) return;
    emit('worldProjector-leave-004b25a0', {
      outVec: hex(this.outVec),
      retval: retval.toInt32(),
      outVecAfter: vectorSnapshot(this.outVec),
      flags: flagSnapshot(),
    });
  },
});

install('0x004d359c', 'gridProjector-write-x-004d359c', {
  onEnter() {
    if (!interestingMouseState()) return;
    emit('gridProjector-write-x-004d359c', {
      targetPtr: hex(this.context.ecx),
      value: this.context.eax.toInt32(),
      targetBefore: readS32(this.context.ecx),
      flags: flagSnapshot(),
      registers: registerSnapshot(this.context),
      stack: stackSnapshot(this.context),
    });
  },
});

install('0x004d35a6', 'gridProjector-write-y-prep-004d35a6', {
  onEnter() {
    if (!interestingMouseState()) return;
    const target = stackPtr(this.context, 3);
    emit('gridProjector-write-y-prep-004d35a6', {
      targetPtr: hex(target),
      value: this.context.eax.toInt32(),
      targetBefore: readS32(target),
      flags: flagSnapshot(),
      registers: registerSnapshot(this.context),
      stack: stackSnapshot(this.context),
    });
  },
});

install('0x004d7a7b', 'projection-call-before-004d7a7b', {
  onEnter() { if (interestingMouseState()) emit('projection-call-before-004d7a7b', { flags: flagSnapshot(), ...callerProjectionSnapshot(this.context) }); },
});
install('0x004d7a80', 'projection-call-after-004d7a80', {
  onEnter() { if (interestingMouseState()) emit('projection-call-after-004d7a80', { flags: flagSnapshot(), ...callerProjectionSnapshot(this.context) }); },
});

emit('watch-ready', { sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS });
setInterval(function heartbeat() {
  emit('watch-heartbeat', { pollMs: POLL_MS });
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
        raise InvalidSessionPidError(session_dir / "session.json", pid)
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
