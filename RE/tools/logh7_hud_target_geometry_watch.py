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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-target-geometry-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only LOGH VII HUD target geometry watcher."


def build_js(*, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 20000;
let seq = 0;
let hitSeq = 0;
let lastPollKey = null;
const hitStack = [];
const rectStack = [];

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
function samePtr(left, right) { return safe(() => ptr(left).equals(ptr(right)), false); }
function modeTargets() {
  return [{ role: 'hudMode2Primary', ptr: readPtr(hud.add(0x14)) }, { role: 'hudMode4Primary', ptr: readPtr(hud.add(0x18)) }, { role: 'hudMode6Fallback', ptr: readPtr(hud.add(0x24)) }, { role: 'hudMode2Fallback', ptr: readPtr(hud.add(0x28)) }];
}
function targetRoles(target) {
  const roles = [];
  for (const candidate of modeTargets()) {
    if (!candidate.ptr.isNull() && samePtr(target, candidate.ptr)) roles.push(candidate.role);
  }
  return roles;
}
function pointFromPointer(value) {
  const p = ptr(value || 0);
  return p.isNull() ? null : { ptr: hex(p), x: readS32(p), y: readS32(p.add(4)) };
}
function rectFromParts(left, top, width, height) {
  if (typeof left !== 'number' || typeof top !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  return { left, top, right: left + width, bottom: top + height, width, height, centerX: left + Math.floor(width / 2), centerY: top + Math.floor(height / 2) };
}
function computedRect(target, viewportBase) {
  const row = ptr(target || 0);
  if (row.isNull()) return null;
  const rawX = readS32(row.add(0x20));
  const rawY = readS32(row.add(0x24));
  const width = readS32(row.add(0x2c));
  const height = readS32(row.add(0x30));
  const offsetEnabled = readU8(row.add(10)) !== 0 && readU8(row.add(0x14)) !== 0;
  const offsetX = offsetEnabled ? readS32(row.add(0x0c)) : 0;
  const offsetY = offsetEnabled ? readS32(row.add(0x10)) : 0;
  const baseX = viewportBase && typeof viewportBase.x === 'number' ? viewportBase.x : null;
  const baseY = viewportBase && typeof viewportBase.y === 'number' ? viewportBase.y : null;
  const localRect = rectFromParts(rawX + offsetX, rawY + offsetY, width, height);
  const screenRect = baseX === null || baseY === null ? null : rectFromParts(rawX + offsetX + baseX, rawY + offsetY + baseY, width, height);
  return { rawRect: { x: rawX, y: rawY, width, height }, offset: { applied: offsetEnabled, x: offsetX, y: offsetY }, localRect, screenRect };
}
function targetGeometry(target, viewportBase) {
  const row = ptr(target || 0);
  return { ptr: hex(row), roles: targetRoles(row), geometryPtr: row.isNull() ? null : hex(row.add(0x20)), valid08: readU8(row.add(8)), flag0a: readU8(row.add(10)), flag14: readU8(row.add(0x14)), flag15: readU8(row.add(0x15)), visible18: readU8(row.add(0x18)), enabled1b: readU8(row.add(0x1b)), gateB00: readU8(row.add(0xb00)), viewportBase, computedRect: computedRect(row, viewportBase) };
}
function currentHit() { return hitStack.length === 0 ? null : hitStack[hitStack.length - 1]; }
function currentRectFrame() { return rectStack.length === 0 ? null : rectStack[rectStack.length - 1]; }
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
    this.hit = { hitId: hitSeq, returnVa: gh(stackPtr(this.context, 0)), eventKind: stackU32(this.context, 1), target: hex(target), targetRoles: roles, controller: hex(this.context.ecx), targetBefore: targetGeometry(target, null) };
    hitStack.push(this.hit);
  },
  onLeave(retval) {
    if (!this.active) return;
    const top = hitStack.pop();
    emit('inputHitTest-geometry-005015f0', { ...this.hit, stackMatched: top && top.hitId === this.hit.hitId, retvalLow8: retvalLow8(retval), targetAfter: targetGeometry(ptr(this.hit.target || 0), null) });
  },
});
install('0x005025f0', 'pointRectHit', {
  onEnter() {
    const hit = currentHit();
    if (!hit) return;
    this.active = true;
    this.target = stackPtr(this.context, 1);
    this.outPoint = stackPtr(this.context, 5);
    this.frame = { hitId: hit.hitId, viewportBaseSamples: [], geometryPointerSamples: [] };
    rectStack.push(this.frame);
    this.info = { hitId: hit.hitId, eventKind: hit.eventKind, hitTargetRoles: hit.targetRoles, rectTarget: hex(this.target), rectTargetRoles: targetRoles(this.target), targetBefore: targetGeometry(this.target, null), param2Point: pointFromPointer(stackPtr(this.context, 2)), param3Point: pointFromPointer(stackPtr(this.context, 3)), param4Point: pointFromPointer(stackPtr(this.context, 4)), outPointBefore: pointFromPointer(this.outPoint) };
  },
  onLeave(retval) {
    if (!this.active) return;
    const frame = rectStack.pop();
    const viewportBaseSamples = frame ? frame.viewportBaseSamples : [];
    const geometryPointerSamples = frame ? frame.geometryPointerSamples : [];
    const lastBaseSample = viewportBaseSamples.length === 0 ? null : viewportBaseSamples[viewportBaseSamples.length - 1].returnedPoint;
    emit('pointRectHit-geometry-005025f0', { ...this.info, retvalLow8: retvalLow8(retval), viewportBaseSamples, geometryPointerSamples, targetAfter: targetGeometry(this.target, lastBaseSample), outPointAfter: pointFromPointer(this.outPoint) });
  },
});
install('0x00502980', 'geometryPointer', {
  onEnter() { this.target = stackPtr(this.context, 1); },
  onLeave(retval) {
    const frame = currentRectFrame();
    if (!frame) return;
    frame.geometryPointerSamples.push({ tag: 'geometryPointer-00502980', target: hex(this.target), targetRoles: targetRoles(this.target), retval: hex(retval), returnedPoint: pointFromPointer(retval) });
  },
});
install('0x00507090', 'viewportBase', {
  onEnter() {
    this.ecx = this.context.ecx;
    this.arg1 = stackPtr(this.context, 1);
  },
  onLeave(retval) {
    const frame = currentRectFrame();
    if (!frame) return;
    frame.viewportBaseSamples.push({ tag: 'viewportBase-00507090', thisEcx: hex(this.ecx), arg1: hex(this.arg1), retval: hex(retval), returnedPoint: pointFromPointer(retval), ecxPoint: pointFromPointer(this.ecx), arg1Point: pointFromPointer(this.arg1) });
  },
});

function snapshot() {
  return { hudModeF4: readS32(hud.add(0xf4)), modeTargets: modeTargets().map((candidate) => ({ role: candidate.role, geometry: targetGeometry(candidate.ptr, null) })) };
}
emit('watch-ready', { pollMs: POLL_MS, admission: snapshot() });
setInterval(function pollGeometry() {
  const state = snapshot();
  const key = JSON.stringify(state);
  if (key !== lastPollKey) { emit('geometry-poll-change', { previousKey: lastPollKey, admission: state }); lastPollKey = key; }
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
