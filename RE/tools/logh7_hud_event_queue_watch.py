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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-event-queue-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only LOGH VII HUD event queue watcher."


def build_js(*, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 18000;
let seq = 0;
let lastPollKey = null;
let lastQueueGateKey = null;
let queueGlobalGateSamples = 0;

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
const selectionList = abs('0x00c9eac4');
const commandMenu = abs('0x00c9e768');
const INTERESTING_EVENT_CODES = [1, 2, 4, 5, 0xe, 0xf, 0x10, 0x11, 0x16, 0x17, 0x18];
const RETURN_SITES = {
  '0x4fd492': 'hudMode2Primary',
  '0x4fd4c0': 'hudMode4Primary',
  '0x4fd4ee': 'hudMode2Fallback',
  '0x4fd525': 'hudMode6Fallback',
};

function eventQueueKeys(row) {
  const count = readS32(row.add(0x3f4));
  const keys = [];
  if (typeof count === 'number' && count > 0) {
    const n = count > 0x1c ? 0x1c : count;
    for (let i = 0; i < n; i += 1) keys.push(readS32(row.add(0x470 + i * 4)));
  }
  return keys;
}
function uiObjectState(value) {
  const row = ptr(value || 0);
  const eventKeys = eventQueueKeys(row);
  return {
    ptr: hex(row), gate04: readU8(row.add(4)), gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)), flag15: readU8(row.add(0x15)),
    gateB00: readU8(row.add(0xb00)), eventQueueCount3f4: readS32(row.add(0x3f4)),
    eventKeys470: eventKeys, hasMode2Event: eventKeys.indexOf(2) !== -1,
  };
}
function samePtr(left, right) { return safe(() => ptr(left).equals(ptr(right)), false); }
function modeTargets() {
  return [
    { role: 'hudMode2Primary', ptr: readPtr(hud.add(0x14)) }, { role: 'hudMode4Primary', ptr: readPtr(hud.add(0x18)) },
    { role: 'hudMode6Fallback', ptr: readPtr(hud.add(0x24)) }, { role: 'hudMode2Fallback', ptr: readPtr(hud.add(0x28)) },
  ];
}
function targetRoles(target) {
  const roles = [];
  for (const candidate of modeTargets()) {
    if (!candidate.ptr.isNull() && samePtr(target, candidate.ptr)) roles.push(candidate.role);
  }
  return roles;
}
function returnSiteName(returnAddress) { return RETURN_SITES[gh(returnAddress)] || null; }
function isInterestingEvent(eventCode, target) {
  return INTERESTING_EVENT_CODES.indexOf(eventCode) !== -1 ||
    targetRoles(target).length > 0 ||
    samePtr(target, readPtr(selectionList)) ||
    samePtr(target, readPtr(commandMenu));
}
function isModeTarget(target) { return targetRoles(target).length > 0; }
function snapshot() {
  return {
    hudModeF4: readS32(hud.add(0xf4)),
    modeTargets: modeTargets().map((candidate) => ({ role: candidate.role, state: uiObjectState(candidate.ptr) })),
    selectionOwner: uiObjectState(readPtr(selectionList)),
    selectionSelected189: readS32(selectionList.add(0x189 * 4)), commandOwner: uiObjectState(readPtr(commandMenu)),
    commandSelectedD5: readS32(commandMenu.add(0xd5 * 4)), commandCategoryD6: readS32(commandMenu.add(0xd6 * 4)),
  };
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x00501e30', 'eventQueueEnqueue', {
  onEnter() {
    const target = stackPtr(this.context, 2);
    const eventCode = stackU32(this.context, 1);
    this.target = target;
    this.interesting = isInterestingEvent(eventCode, target);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), eventCode, target: hex(target),
      targetRoles: targetRoles(target), payload: hex(stackPtr(this.context, 3)),
      beforeState: uiObjectState(target),
      admissionBefore: snapshot(),
    };
    if (this.interesting) emit('eventQueueEnqueue-enter-00501e30', this.info);
  },
  onLeave() {
    if (!this.interesting) return;
    emit('eventQueueEnqueue-leave-00501e30', { ...this.info, afterState: uiObjectState(this.target), admissionAfter: snapshot() });
  },
});
install('0x00501ed0', 'eventQueueDequeue', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    const eventCode = stackU32(this.context, 2);
    this.target = target;
    this.interesting = isModeTarget(target);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), eventCode, target: hex(target),
      targetRoles: targetRoles(target), outInfo: hex(stackPtr(this.context, 3)), consumeFlag: stackU32(this.context, 4),
      beforeState: uiObjectState(target),
      admissionBefore: snapshot(),
    };
    if (this.interesting) emit('eventQueueDequeue-enter-00501ed0', this.info);
  },
  onLeave(retval) {
    if (!this.interesting) return;
    emit('eventQueueDequeue-leave-00501ed0', { ...this.info, retvalLow8: retvalLow8(retval), afterState: uiObjectState(this.target), admissionAfter: snapshot() });
  },
});
install('0x00502780', 'uiObjectLookup', {
  onEnter() {
    this.info = {
      thisEcx: hex(this.context.ecx), lookupKind: stackU32(this.context, 1),
      lookupIndex: stackU32(this.context, 2), returnVa: gh(stackPtr(this.context, 0)),
    };
  },
  onLeave(retval) {
    const result = ptr(retval);
    const roles = targetRoles(result);
    if (roles.length === 0) return;
    emit('uiObjectLookup-leave-00502780', { ...this.info, result: hex(result), resultRoles: roles, resultState: uiObjectState(result) });
  },
});
install('0x00502770', 'queueGlobalGate', {
  onLeave(retval) {
    const root = ptr(retval);
    const gate34 = readU8(root.add(0x34));
    const key = JSON.stringify([hex(root), gate34]);
    if (queueGlobalGateSamples >= 16 && key === lastQueueGateKey) return;
    queueGlobalGateSamples += 1;
    lastQueueGateKey = key;
    emit('queueGlobalGate-leave-00502770', { result: hex(root), gate34, state: uiObjectState(root) });
  },
});
install('0x005025c0', 'targetGate15', {
  onEnter() {
    this.target = stackPtr(this.context, 1);
    this.roles = targetRoles(this.target);
  },
  onLeave(retval) {
    if (this.roles.length === 0) return;
    emit('targetGate15-leave-005025c0', { target: hex(this.target), targetRoles: this.roles, retvalLow8: retvalLow8(retval), targetState: uiObjectState(this.target) });
  },
});
install('0x005015f0', 'inputHitTest', {
  onEnter() {
    const target = stackPtr(this.context, 2);
    const eventKind = stackU32(this.context, 1);
    const roles = targetRoles(target);
    this.interesting = roles.length > 0 || returnSiteName(stackPtr(this.context, 0)) !== null;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)),
      returnSiteName: returnSiteName(stackPtr(this.context, 0)),
      thisEcx: hex(this.context.ecx),
      eventKind,
      target: hex(target),
      targetRoles: roles,
      targetState: uiObjectState(target),
    };
  },
  onLeave(retval) {
    if (!this.interesting) return;
    emit('inputHitTest-leave-005015f0', { ...this.info, retvalLow8: retvalLow8(retval), admissionAfter: snapshot() });
  },
});

emit('watch-ready', { pollMs: POLL_MS, admission: snapshot() });
setInterval(function pollAdmission() {
  const state = snapshot();
  const key = JSON.stringify([state.hudModeF4, state.selectionSelected189, state.commandSelectedD5, state.commandCategoryD6]);
  if (key !== lastPollKey) {
    emit('admission-poll-change', { previousKey: lastPollKey, admission: state });
    lastPollKey = key;
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
