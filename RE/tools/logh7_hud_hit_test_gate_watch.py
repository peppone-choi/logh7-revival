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

DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-hit-test-gate-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only LOGH VII HUD hit-test gate watcher."


def build_js(*, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 30000;
let seq = 0;
let hitSeq = 0;
let gateWriteSamples = 0;
let lastPollKey = null;
const hitStack = [];
const knownControllers = {};

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) { return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, null); }
function gh(value) { return safe(() => '0x' + ptr(value).sub(moduleBase).add(IMAGE_BASE).toString(16), hex(value)); }
function readPtr(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function retvalLow8(retval) { return safe(() => retval.toInt32() & 0xff, null); }
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}

const hud = abs('0x00c9e638');
const DAT = {
  DAT_022142b0: abs('0x022142b0'), DAT_022142b4: abs('0x022142b4'),
  DAT_022142c0: abs('0x022142c0'), DAT_022142c4: abs('0x022142c4'),
  DAT_022142d0: abs('0x022142d0'), DAT_022142d4: abs('0x022142d4'),
  DAT_022142d8: abs('0x022142d8'), DAT_022142d9: abs('0x022142d9'),
  DAT_022143e4: abs('0x022143e4'), DAT_022143e8: abs('0x022143e8'),
  DAT_022143ec: abs('0x022143ec'), DAT_022143f0: abs('0x022143f0'),
  DAT_022143f4: abs('0x022143f4'), DAT_022143f8: abs('0x022143f8'),
  DAT_02214418: abs('0x02214418'), DAT_0221441c: abs('0x0221441c'),
  DAT_02214649: abs('0x02214649'),
};
function inputGlobals() {
  return {
    DAT_022142b0: readS32(DAT.DAT_022142b0), DAT_022142b4: readS32(DAT.DAT_022142b4),
    DAT_022142c0: readS32(DAT.DAT_022142c0), DAT_022142c4: readS32(DAT.DAT_022142c4),
    DAT_022142d0: readS32(DAT.DAT_022142d0), DAT_022142d4: readS32(DAT.DAT_022142d4),
    DAT_022142d8: readU8(DAT.DAT_022142d8), DAT_022142d9: readU8(DAT.DAT_022142d9),
    DAT_022143e4: readS32(DAT.DAT_022143e4), DAT_022143e8: readS32(DAT.DAT_022143e8),
    DAT_022143ec: readS32(DAT.DAT_022143ec), DAT_022143f0: readS32(DAT.DAT_022143f0),
    DAT_022143f4: readS32(DAT.DAT_022143f4), DAT_022143f8: readS32(DAT.DAT_022143f8),
    DAT_02214418: readS32(DAT.DAT_02214418), DAT_0221441c: readS32(DAT.DAT_0221441c),
    DAT_02214649: readU8(DAT.DAT_02214649),
  };
}
function point(value) {
  const p = ptr(value || 0);
  return p.isNull() ? null : { ptr: hex(p), x: readS32(p), y: readS32(p.add(4)) };
}
function uiObjectState(value) {
  const row = ptr(value || 0);
  return {
    ptr: hex(row), gate04: readU8(row.add(4)), gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)), flag15: readU8(row.add(0x15)),
    visible18: readU8(row.add(0x18)), enabled1b: readU8(row.add(0x1b)),
    gateB00: readU8(row.add(0xb00)), gateB01: readU8(row.add(0xb01)), gateB02: readU8(row.add(0xb02)),
  };
}
function controllerState(value) {
  const row = ptr(value || 0);
  return {
    ptr: hex(row), controllerGate05: readU8(row.add(5)),
    mouseNow134: point(row.add(0x134)), leftPoint158: point(row.add(0x158)),
    rightPoint160: point(row.add(0x160)), leftFlag154: readU8(row.add(0x154)),
    rightFlag155: readU8(row.add(0x155)),
  };
}
function samePtr(left, right) { return safe(() => ptr(left).equals(ptr(right)), false); }
function modeTargets() {
  return [
    { role: 'hudMode2Primary', ptr: readPtr(hud.add(0x14)) },
    { role: 'hudMode4Primary', ptr: readPtr(hud.add(0x18)) },
    { role: 'hudMode6Fallback', ptr: readPtr(hud.add(0x24)) },
    { role: 'hudMode2Fallback', ptr: readPtr(hud.add(0x28)) },
  ];
}
function targetRoles(target) {
  const roles = [];
  for (const candidate of modeTargets()) {
    if (!candidate.ptr.isNull() && samePtr(target, candidate.ptr)) roles.push(candidate.role);
  }
  return roles;
}
function currentHit() { return hitStack.length === 0 ? null : hitStack[hitStack.length - 1]; }
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x005015f0', 'inputHitTest', {
  onEnter() {
    const target = stackPtr(this.context, 2);
    const roles = targetRoles(target);
    this.active = roles.length > 0;
    if (!this.active) return;
    hitSeq += 1;
    const controller = this.context.ecx;
    knownControllers[hex(controller)] = true;
    this.hit = {
      hitId: hitSeq, returnVa: gh(stackPtr(this.context, 0)), eventKind: stackU32(this.context, 1),
      target: hex(target), targetRoles: roles, param5: stackU32(this.context, 4),
      controller: hex(controller), controllerBefore: controllerState(controller),
      targetBefore: uiObjectState(target), globalsBefore: inputGlobals(),
    };
    hitStack.push(this.hit);
  },
  onLeave(retval) {
    if (!this.active) return;
    const top = hitStack.pop();
    emit('inputHitTest-gate-005015f0', { ...this.hit, stackMatched: top && top.hitId === this.hit.hitId, retvalLow8: retvalLow8(retval), controllerAfter: controllerState(this.context.ecx), globalsAfter: inputGlobals() });
  },
});
install('0x005025f0', 'pointRectHit', {
  onEnter() {
    const hit = currentHit();
    if (!hit) return;
    this.hit = hit;
    this.target = stackPtr(this.context, 1);
    this.outPoint = stackPtr(this.context, 5);
    this.info = {
      hitId: hit.hitId, eventKind: hit.eventKind, hitTargetRoles: hit.targetRoles,
      rectTarget: hex(this.target), rectTargetRoles: targetRoles(this.target),
      rectTargetState: uiObjectState(this.target), param2Point: point(stackPtr(this.context, 2)),
      param3Point: point(stackPtr(this.context, 3)), param4Point: point(stackPtr(this.context, 4)),
      outPointBefore: point(this.outPoint),
    };
  },
  onLeave(retval) {
    if (!this.hit) return;
    emit('pointRectHit-gate-005025f0', { ...this.info, retvalLow8: retvalLow8(retval), outPointAfter: point(this.outPoint) });
  },
});
install('0x0050c180', 'occlusionPrimary', {
  onEnter() {
    const hit = currentHit();
    if (!hit) return;
    this.info = { hitId: hit.hitId, eventKind: hit.eventKind, hitTargetRoles: hit.targetRoles, thisEcx: hex(this.context.ecx), arg1: hex(stackPtr(this.context, 1)), arg2Point: point(stackPtr(this.context, 2)), arg3Point: point(stackPtr(this.context, 3)), arg4Point: point(stackPtr(this.context, 4)) };
  },
  onLeave(retval) {
    if (!this.info) return;
    emit('occlusionPrimary-gate-0050c180', { ...this.info, retvalLow8: retvalLow8(retval) });
  },
});
install('0x00501d60', 'occlusionPeer', {
  onEnter() {
    const hit = currentHit();
    if (!hit) return;
    this.info = { hitId: hit.hitId, eventKind: hit.eventKind, hitTargetRoles: hit.targetRoles, target: hex(stackPtr(this.context, 1)), arg2Point: point(stackPtr(this.context, 2)), arg3Point: point(stackPtr(this.context, 3)), arg4Point: point(stackPtr(this.context, 4)) };
  },
  onLeave(retval) {
    if (!this.info) return;
    emit('occlusionPeer-gate-00501d60', { ...this.info, retvalLow8: retvalLow8(retval) });
  },
});
install('0x005024b0', 'controllerGateWrite', {
  onEnter() {
    const target = this.context.ecx;
    const targetHex = hex(target);
    const roles = targetRoles(target);
    const interesting = roles.length > 0 || knownControllers[targetHex] || gateWriteSamples < 64;
    if (!interesting) return;
    gateWriteSamples += 1;
    emit('controllerGateWrite-005024b0', { returnVa: gh(stackPtr(this.context, 0)), target: targetHex, targetRoles: roles, value: stackU32(this.context, 1), beforeState: controllerState(target), gateWriteSamples });
  },
});

emit('watch-ready', { pollMs: POLL_MS, globals: inputGlobals(), modeTargets: modeTargets().map((candidate) => ({ role: candidate.role, state: uiObjectState(candidate.ptr) })) });
setInterval(function pollKnownControllers() {
  const controllers = Object.keys(knownControllers).map((key) => controllerState(ptr(key)));
  const state = { globals: inputGlobals(), controllers };
  const nextKey = JSON.stringify(state);
  if (nextKey !== lastPollKey) {
    emit('controller-poll-change', { previousKey: lastPollKey, state });
    lastPollKey = nextKey;
  }
}, POLL_MS);
"""
        .replace("__POLL_MS__", str(max(1, int(poll_ms))))
    )


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    admission_watch = importlib.import_module("tools.logh7_hud_admission_watch")
    session_pid = getattr(admission_watch, "_session_pid")
    best_effort_cleanup = getattr(admission_watch, "_best_effort_cleanup")
    pid = args.pid if args.pid is not None else session_pid(args.session)
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
            script = session.create_script(build_js(poll_ms=args.poll_ms))
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
        finally:
            cleanup_errors = best_effort_cleanup(script, session)
    print(json.dumps({"attachedPid": pid, "out": str(args.out), "events": events, "cleanupErrors": cleanup_errors}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None, help="attach to this PID instead of reading session.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--poll-ms", type=int, default=250)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
