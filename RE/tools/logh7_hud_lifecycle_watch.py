# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools.logh7_hud_admission_watch import _best_effort_cleanup, _session_pid

DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-lifecycle-watch.jsonl"


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 16000;
let seq = 0;
let lastKey = null;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) {
  if (value === null || value === undefined) return null;
  return safe(() => {
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  }, String(value));
}
function gh(value) { return safe(() => '0x' + ptr(value).sub(moduleBase).add(IMAGE_BASE).toString(16), hex(value)); }
function readPointer(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function bytesHex(address, count) {
  return safe(() => {
    const p = ptr(address);
    if (p.isNull()) return null;
    const bytes = p.readByteArray(Math.min(Math.max(count, 0), SAMPLE_BYTES));
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }, null);
}
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}

const hud = abs('0x00c9e638');
const selectionList = abs('0x00c9eac4');
const commandMenu = abs('0x00c9e768');
const modeTable = abs('0x006703c0');

function samePtr(left, right) {
  return safe(() => ptr(left).equals(ptr(right)), false);
}
function uiObjectState(value) {
  const row = ptr(value || 0);
  return {
    ptr: hex(row),
    gate04: readU8(row.add(4)),
    gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)),
    flag0a: readU8(row.add(10)),
    offset0c: readS32(row.add(0x0c)),
    offset10: readS32(row.add(0x10)),
    flag14: readU8(row.add(0x14)),
    flag15: readU8(row.add(0x15)),
    flag18: readU8(row.add(0x18)),
    flag1b: readU8(row.add(0x1b)),
    rectX20: readS32(row.add(0x20)),
    rectY24: readS32(row.add(0x24)),
    rectW2c: readS32(row.add(0x2c)),
    rectH30: readS32(row.add(0x30)),
    eventQueueCount3f4: readS32(row.add(0x3f4)),
    firstEvent470: readS32(row.add(0x470)),
  };
}
function modeTargetEntries() {
  return [
    { role: 'hudMode2Primary', slot: 4, ptr: readPointer(hud.add(0x14)) },
    { role: 'hudMode4Primary', slot: 5, ptr: readPointer(hud.add(0x18)) },
    { role: 'hudMode6Fallback', slot: 8, ptr: readPointer(hud.add(0x24)) },
    { role: 'hudMode2Fallback', slot: 9, ptr: readPointer(hud.add(0x28)) },
  ];
}
function objectRoles(objectPtr) {
  const roles = [];
  const obj = ptr(objectPtr || 0);
  for (const entry of modeTargetEntries()) {
    if (!entry.ptr.isNull() && samePtr(obj, entry.ptr)) roles.push(entry.role);
  }
  if (samePtr(obj, readPointer(selectionList))) roles.push('selectionListOwner');
  if (samePtr(obj, readPointer(commandMenu))) roles.push('commandMenuOwner');
  return roles;
}
function modeRows(mode) {
  const rows = [];
  if (mode === null || mode === undefined) return rows;
  for (let index = 0; index < 10; index += 1) {
    const row = modeTable.add(((mode * 10) + index) * 8);
    const action = readS32(row);
    const targetSlot = readS32(row.add(4));
    if (action === -1) break;
    rows.push({
      index,
      action,
      targetSlot,
      object: uiObjectState(readPointer(hud.add(4 + targetSlot * 4))),
    });
  }
  return rows;
}
function snapshot() {
  const currentMode = readS32(hud.add(0xf4));
  return {
    hudModeF4: currentMode,
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    modeTargets: modeTargetEntries().map((entry) => ({
      role: entry.role,
      slot: entry.slot,
      state: uiObjectState(entry.ptr),
    })),
    currentModeRows: modeRows(currentMode),
    selectionListOwner: uiObjectState(readPointer(selectionList)),
    selectionCount188: readS32(selectionList.add(0x188 * 4)),
    selectionSelected189: readS32(selectionList.add(0x189 * 4)),
    commandOwner: uiObjectState(readPointer(commandMenu)),
    commandRowCountD4: readS32(commandMenu.add(0xd4 * 4)),
    commandSelectedD5: readS32(commandMenu.add(0xd5 * 4)),
    commandCategoryD6: readS32(commandMenu.add(0xd6 * 4)),
  };
}
function pollKey() {
  const state = snapshot();
  return JSON.stringify([
    state.hudModeF4,
    state.hudAb0,
    state.selectionSelected189,
    state.commandSelectedD5,
    state.commandCategoryD6,
    state.modeTargets.map((entry) => [entry.role, entry.state.gate05, entry.state.flag15]),
  ]);
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}
function lifecycleHook(vaText, name, enterTag, leaveTag, extra) {
  install(vaText, name, {
    onEnter() {
      this.extra = extra ? extra(this.context) : {};
      this.before = snapshot();
      emit(enterTag, { ...this.extra, admission: this.before, ret: hex(stackPtr(this.context, 0)) });
    },
    onLeave(retval) {
      emit(leaveTag, { ...this.extra, retval: retval.toInt32(), before: this.before, admission: snapshot() });
    },
  });
}

lifecycleHook('0x004fc4e0', 'hudInit', 'hudInit-enter-004fc4e0', 'hudInit-leave-004fc4e0', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
lifecycleHook('0x004fc4a0', 'hudRefresh', 'hudRefresh-enter-004fc4a0', 'hudRefresh-leave-004fc4a0', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
lifecycleHook('0x004fd560', 'hudBackHistory', 'hudBackHistory-enter-004fd560', 'hudBackHistory-leave-004fd560', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
lifecycleHook('0x004fd7a0', 'hudModeSet', 'hudModeSet-enter-004fd7a0', 'hudModeSet-leave-004fd7a0', (ctx) => ({
  thisEcx: hex(ctx.ecx),
  requestedMode: stackU32(ctx, 1),
  pushHistory: stackU32(ctx, 2),
  requestedModeRows: modeRows(stackU32(ctx, 1)),
}));
lifecycleHook('0x004f6680', 'selectionModeSet', 'selectionModeSet-enter-004f6680', 'selectionModeSet-leave-004f6680', (ctx) => ({
  thisEcx: hex(ctx.ecx),
  requestedSelectionMode: stackU32(ctx, 1),
}));
install('0x005024b0', 'objectGateSet', {
  onEnter() {
    const objectPtr = this.context.ecx;
    this.info = {
      thisEcx: hex(objectPtr),
      valueArg: stackU32(this.context, 1),
      valueLow8: (stackU32(this.context, 1) || 0) & 0xff,
      returnAddress: hex(stackPtr(this.context, 0)),
      returnVa: gh(stackPtr(this.context, 0)),
      roles: objectRoles(objectPtr),
      beforeObject: uiObjectState(objectPtr),
      admissionBefore: snapshot(),
    };
  },
  onLeave(retval) {
    const afterObject = uiObjectState(ptr(this.info.thisEcx || 0));
    const interesting = this.info.roles.length > 0 || this.info.beforeObject.gate05 !== afterObject.gate05;
    if (!interesting) return;
    emit('objectGateSet-leave-005024b0', {
      ...this.info,
      retval: retval.toInt32(),
      afterObject,
      admissionAfter: snapshot(),
    });
  },
});

emit('watch-ready', { sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS, admission: snapshot(), hudBytes: bytesHex(hud, 64) });
setInterval(function pollAdmission() {
  const key = pollKey();
  if (key !== lastKey) {
    emit('admission-poll-change', { previousKey: lastKey, admission: snapshot() });
    lastKey = key;
  }
}, POLL_MS);
"""
        .replace("__SAMPLE_BYTES__", str(max(0, int(sample_bytes))))
        .replace("__POLL_MS__", str(max(1, int(poll_ms))))
    )


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    cleanup_errors: list[str] = []
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
            script = session.create_script(build_js(sample_bytes=args.sample_bytes, poll_ms=args.poll_ms))
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
        finally:
            cleanup_errors = _best_effort_cleanup(script, session)
    print(json.dumps({"attachedPid": pid, "out": str(args.out), "events": events, "cleanupErrors": cleanup_errors}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Attach a read-only LOGH VII HUD lifecycle watcher.")
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None, help="attach to this PID instead of reading session.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=250)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
