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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-click-pulse-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only LOGH VII HUD click pulse watcher."


def build_js(*, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 20000;
let seq = 0;
let lastPollKey = null;
let loopCount = 0;
const updateStats = {};
const lastUpdateKey = {};

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
function uiObjectState(value) {
  const row = ptr(value || 0);
  return {
    ptr: hex(row), kind00: readS32(row), index04: readS32(row.add(4)),
    gate04: readU8(row.add(4)), gate05: readU8(row.add(5)), valid08: readU8(row.add(8)),
    flag15: readU8(row.add(0x15)), visible18: readU8(row.add(0x18)), enabled1b: readU8(row.add(0x1b)),
    gateB00: readU8(row.add(0xb00)), gateB01: readU8(row.add(0xb01)), gateB02: readU8(row.add(0xb02)),
    eventQueueCount3f4: readS32(row.add(0x3f4)),
  };
}
function stateKey(state) {
  return JSON.stringify([
    state.gate04, state.gate05, state.valid08, state.flag15, state.visible18, state.enabled1b,
    state.gateB00, state.gateB01, state.gateB02, state.eventQueueCount3f4,
  ]);
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
function snapshot() {
  return {
    hudModeF4: readS32(hud.add(0xf4)),
    modeTargets: modeTargets().map((candidate) => ({ role: candidate.role, state: uiObjectState(candidate.ptr) })),
  };
}
function roleKey(roles) { return roles.length === 0 ? 'none' : roles.join('+'); }
function shouldSampleUpdate(roles, beforeState, afterState) {
  const role = roleKey(roles);
  updateStats[role] = (updateStats[role] || 0) + 1;
  const key = JSON.stringify([stateKey(beforeState), stateKey(afterState)]);
  const changed = lastUpdateKey[role] !== key;
  lastUpdateKey[role] = key;
  return changed || updateStats[role] <= 3 || updateStats[role] % 60 === 0;
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x00507b10', 'uiUpdateLoop', {
  onEnter() {
    loopCount += 1;
    if (loopCount <= 3 || loopCount % 60 === 0) {
      emit('uiUpdateLoop-enter-00507b10', { loopCount, admission: snapshot() });
    }
  },
});
install('0x00507f20', 'uiObjectUpdate', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    const roles = targetRoles(target);
    this.target = target;
    this.roles = roles;
    this.beforeState = uiObjectState(target);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      target: hex(target), targetRoles: roles, beforeState: this.beforeState,
    };
  },
  onLeave() {
    if (this.roles.length === 0) return;
    const afterState = uiObjectState(this.target);
    if (!shouldSampleUpdate(this.roles, this.beforeState, afterState)) return;
    emit('uiObjectUpdate-mode-00507f20', { ...this.info, updateCountForRole: updateStats[roleKey(this.roles)], afterState });
  },
});
install('0x005024e0', 'flag15Write', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    this.target = target;
    this.roles = targetRoles(target);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), target: hex(target), targetRoles: this.roles,
      value: stackU32(this.context, 2), beforeState: uiObjectState(target),
    };
  },
  onLeave() {
    if (this.roles.length === 0) return;
    emit('flag15Write-mode-005024e0', { ...this.info, afterState: uiObjectState(this.target) });
  },
});
install('0x005025a0', 'clickPulseClear', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    this.target = target;
    this.roles = targetRoles(target);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), target: hex(target), targetRoles: this.roles,
      beforeState: uiObjectState(target),
    };
  },
  onLeave() {
    if (this.roles.length === 0) return;
    emit('clickPulseClear-mode-005025a0', { ...this.info, afterState: uiObjectState(this.target) });
  },
});
install('0x005015f0', 'inputHitTest', {
  onEnter() {
    const target = stackPtr(this.context, 2);
    const roles = targetRoles(target);
    this.target = target;
    this.roles = roles;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      eventKind: stackU32(this.context, 1), target: hex(target), targetRoles: roles,
      beforeState: uiObjectState(target),
    };
  },
  onLeave(retval) {
    if (this.roles.length === 0) return;
    emit('inputHitTest-mode-005015f0', { ...this.info, retvalLow8: retvalLow8(retval), afterState: uiObjectState(this.target) });
  },
});

emit('watch-ready', { pollMs: POLL_MS, admission: snapshot() });
setInterval(function pollAdmission() {
  const state = snapshot();
  const key = JSON.stringify(state.modeTargets.map((candidate) => stateKey(candidate.state)).concat([state.hudModeF4]));
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
