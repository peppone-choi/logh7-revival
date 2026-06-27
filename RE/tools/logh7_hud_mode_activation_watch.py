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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-mode-activation-watch.jsonl"
DESCRIPTION: Final = "Attach a read-only LOGH VII HUD mode activation watcher."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 12000;
let seq = 0;
let lastKey = null;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) { return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, null); }
function gh(value) { return safe(() => '0x' + ptr(value).sub(moduleBase).add(IMAGE_BASE).toString(16), hex(value)); }
function readPointer(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function retvalS32(retval) { return safe(() => retval.toInt32(), null); }
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
const modeRouteTable = abs('0x006703c0');
const RETURN_SITES = {
  '0x4fd492': 'hudMode2Primary',
  '0x4fd4c0': 'hudMode4Primary',
  '0x4fd4ee': 'hudMode2Fallback',
  '0x4fd525': 'hudMode6Fallback',
};

function returnSiteName(returnAddress) {
  const va = gh(returnAddress);
  return RETURN_SITES[va] || null;
}
// 이벤트 큐 전체 키 덤프(키 배열 @+0x470, count @+0x3f4, cap 0x1c). FUN_00501ed0 dequeue가
// 찾는 event code가 실제로 큐에 들어왔는지 판별한다(2026-06-21 정적 RE: FUN_00501ed0=keyed
// 이벤트 큐 dequeue, FUN_00501e30=enqueue. mode2 활성화는 FUN_005015f0(2,target,…)가 code-2를
// dequeue하거나 fallback 게이트를 통과해야 함 — verifier 확인).
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
    ptr: hex(row),
    gate04: readU8(row.add(4)),
    gate05: readU8(row.add(5)),          // FUN_005024a0: 컨트롤러(param_1)+5 fallback 게이트
    valid08: readU8(row.add(8)),         // FUN_005015f0 top 사전체크 *(target+8)
    flag0a: readU8(row.add(10)),
    offset0c: readS32(row.add(0x0c)),
    offset10: readS32(row.add(0x10)),
    flag14: readU8(row.add(0x14)),
    flag15: readU8(row.add(0x15)),       // FUN_005025c0: *(target+0x15) fallback 게이트
    flag18: readU8(row.add(0x18)),
    flag1b: readU8(row.add(0x1b)),
    gateB00: readU8(row.add(0xb00)),     // FUN_005015f0 switch case2: mode-2 전용 게이트 *(target+0xb00) (verifier 발견)
    rectX20: readS32(row.add(0x20)),
    rectY24: readS32(row.add(0x24)),
    rectW2c: readS32(row.add(0x2c)),
    rectH30: readS32(row.add(0x30)),
    eventQueueCount3f4: readS32(row.add(0x3f4)),
    eventKeys470: eventKeys,             // 큐의 모든 event code
    hasMode2Event: eventKeys.indexOf(2) !== -1, // code-2(=mode2 활성화 트리거) 큐잉 여부
    firstEvent470: readS32(row.add(0x470)),
  };
}
function samePtr(left, right) {
  return safe(() => ptr(left).equals(ptr(right)), false);
}
function modeTargets() {
  return [
    { role: 'hudMode2Primary', ptr: readPointer(hud.add(0x14)) },
    { role: 'hudMode4Primary', ptr: readPointer(hud.add(0x18)) },
    { role: 'hudMode6Fallback', ptr: readPointer(hud.add(0x24)) },
    { role: 'hudMode2Fallback', ptr: readPointer(hud.add(0x28)) },
  ];
}
function targetRoles(target) {
  const roles = [];
  for (const candidate of modeTargets()) {
    if (!candidate.ptr.isNull() && samePtr(target, candidate.ptr)) roles.push(candidate.role);
  }
  return roles;
}
function hudLifecycleState(value) {
  const base = ptr(value || 0);
  return {
    ptr: hex(base),
    modeF4: readS32(base.add(0xf4)),
    historyCount124: readS32(base.add(0x124)),
    historyCursor104: readS32(base.add(0x104)),
    historyCursor114: readS32(base.add(0x114)),
    historyLimit100: readS32(base.add(0x100)),
    historyLimit110: readS32(base.add(0x110)),
    freeze12c: readU8(base.add(300)),
  };
}
function modeRouteEntries(mode) {
  const entries = [];
  if (typeof mode !== 'number' || mode < 0 || mode > 8) return entries;
  for (let index = 0; index < 10; index += 1) {
    const route = modeRouteTable.add((mode * 10 + index) * 8);
    const routeKind = readS32(route);
    const slot = readS32(route.add(4));
    const objectPtr = typeof slot === 'number' && slot >= 0 ? readPointer(hud.add(4 + slot * 4)) : ptr('0x0');
    entries.push({
      index,
      routeKind,
      slot,
      object: {
        ptr: hex(objectPtr),
        roles: targetRoles(objectPtr),
        state: uiObjectState(objectPtr),
      },
    });
    if (routeKind === -1) break;
  }
  return entries;
}
function modeRouteMap() {
  const rows = [];
  for (let mode = 1; mode <= 8; mode += 1) rows.push({ mode, entries: modeRouteEntries(mode) });
  return rows;
}
function activationInteresting(target, requestedActive) {
  return requestedActive === 1 ||
    targetRoles(target).length > 0 ||
    samePtr(target, readPointer(selectionList)) ||
    samePtr(target, readPointer(commandMenu));
}
function snapshot() {
  const payload = readPointer(selectionList.add(0x18a * 4));
  return {
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    hudLifecycle: hudLifecycleState(hud),
    modeTargets: modeTargets().map((candidate) => ({ role: candidate.role, state: uiObjectState(candidate.ptr) })),
    selectionListOwner: uiObjectState(readPointer(selectionList)),
    selectionCount188: readS32(selectionList.add(0x188 * 4)),
    selectionSelected189: readS32(selectionList.add(0x189 * 4)),
    selectionPayload: hex(payload),
    selectionPayloadCount270: readS32(payload.add(0x270)),
    commandActive: uiObjectState(readPointer(commandMenu)),
    commandRowCountD4: readS32(commandMenu.add(0xd4 * 4)),
    commandSelectedD5: readS32(commandMenu.add(0xd5 * 4)),
    commandCategoryD6: readS32(commandMenu.add(0xd6 * 4)),
  };
}
function pollKey() {
  const state = snapshot();
  return JSON.stringify([
    state.hudModeF4, state.hudAb0, state.selectionSelected189,
    state.commandSelectedD5, state.commandCategoryD6,
  ]);
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x004fc4e0', 'hudInitializer', {
  onEnter() {
    this.before = snapshot();
    emit('hudInitializer-enter-004fc4e0', {
      thisEcx: hex(this.context.ecx),
      param2: hex(stackPtr(this.context, 1)),
      hudLifecycleBefore: hudLifecycleState(this.context.ecx),
      admission: this.before,
    });
  },
  onLeave(retval) {
    emit('hudInitializer-leave-004fc4e0', {
      retval: retvalS32(retval),
      before: this.before,
      hudLifecycleAfter: hudLifecycleState(hud),
      modeRouteMap006703c0: modeRouteMap(),
      admission: snapshot(),
    });
  },
});
install('0x004fc4a0', 'hudRestoreMode', {
  onEnter() {
    this.before = snapshot();
    emit('hudRestoreMode-enter-004fc4a0', {
      thisEcx: hex(this.context.ecx),
      hudLifecycleBefore: hudLifecycleState(this.context.ecx),
      restoringMode: readS32(ptr(this.context.ecx).add(0xf4)),
      admission: this.before,
    });
  },
  onLeave(retval) {
    emit('hudRestoreMode-leave-004fc4a0', {
      retval: retvalS32(retval),
      before: this.before,
      hudLifecycleAfter: hudLifecycleState(hud),
      admission: snapshot(),
    });
  },
});
install('0x004fd560', 'hudHistoryPop', {
  onEnter() {
    this.before = snapshot();
    emit('hudHistoryPop-enter-004fd560', {
      thisEcx: hex(this.context.ecx),
      hudLifecycleBefore: hudLifecycleState(this.context.ecx),
      admission: this.before,
    });
  },
  onLeave(retval) {
    emit('hudHistoryPop-leave-004fd560', {
      retval: retvalS32(retval),
      before: this.before,
      hudLifecycleAfter: hudLifecycleState(hud),
      admission: snapshot(),
    });
  },
});
install('0x004fd100', 'hudGate', {
  onEnter() { this.before = snapshot(); emit('hudGate-enter-004fd100', { thisEcx: hex(this.context.ecx), ret: hex(stackPtr(this.context, 0)), admission: this.before }); },
  onLeave(retval) { emit('hudGate-leave-004fd100', { retval: retvalS32(retval), before: this.before, admission: snapshot() }); },
});
install('0x004fd7a0', 'hudModeSet', {
  onEnter() {
    this.requestedMode = stackU32(this.context, 1);
    this.before = snapshot();
    emit('hudModeSet-enter-004fd7a0', {
      thisEcx: hex(this.context.ecx),
      requestedMode: this.requestedMode,
      pushHistory: stackU32(this.context, 2),
      hudLifecycleBefore: hudLifecycleState(this.context.ecx),
      requestedModeRoutes: modeRouteEntries(this.requestedMode),
      admission: this.before,
    });
  },
  onLeave(retval) {
    const currentMode = readS32(hud.add(0xf4));
    emit('hudModeSet-leave-004fd7a0', {
      retval: retvalS32(retval),
      requestedMode: this.requestedMode,
      currentMode,
      before: this.before,
      currentModeRoutes: modeRouteEntries(currentMode),
      hudLifecycleAfter: hudLifecycleState(hud),
      admission: snapshot(),
    });
  },
});
install('0x00502ea0', 'uiAdmitGate', {
  onEnter() {
    const target = ptr(this.context.ecx);
    const requestedActive = stackU32(this.context, 1);
    this.interesting = activationInteresting(target, requestedActive);
    if (!this.interesting) return;
    this.info = {
      thisEcx: hex(target),
      requestedActive,
      targetRoles: targetRoles(target),
      beforeState: uiObjectState(target),
      admissionBefore: snapshot(),
    };
    emit('uiAdmitGate-enter-00502ea0', this.info);
  },
  onLeave() {
    if (!this.interesting) return;
    emit('uiAdmitGate-leave-00502ea0', {
      ...this.info,
      afterState: uiObjectState(ptr(this.info.thisEcx || 0)),
      admissionAfter: snapshot(),
    });
  },
});
install('0x005024b0', 'uiActivationGate', {
  onEnter() {
    const target = ptr(this.context.ecx);
    const requestedActive = stackU32(this.context, 1);
    this.interesting = activationInteresting(target, requestedActive);
    if (!this.interesting) return;
    this.info = {
      thisEcx: hex(target),
      requestedActive,
      targetRoles: targetRoles(target),
      beforeState: uiObjectState(target),
      admissionBefore: snapshot(),
    };
    emit('uiActivationGate-enter-005024b0', this.info);
  },
  onLeave() {
    if (!this.interesting) return;
    emit('uiActivationGate-leave-005024b0', {
      ...this.info,
      afterState: uiObjectState(ptr(this.info.thisEcx || 0)),
      admissionAfter: snapshot(),
    });
  },
});
install('0x005015f0', 'inputHitTest', {
  onEnter() {
    const eventKind = stackU32(this.context, 1);
    const target = stackPtr(this.context, 2);
    const outInfo = stackPtr(this.context, 3);
    const ret = stackPtr(this.context, 0);
    const siteName = returnSiteName(ret);
    const roles = targetRoles(target);
    this.interesting = siteName !== null || roles.length > 0;
    this.info = {
      siteName,
      returnAddress: hex(ret),
      returnVa: gh(ret),
      thisEcx: hex(this.context.ecx),
      thisState: uiObjectState(this.context.ecx),
      eventKind,
      target: hex(target),
      targetRoles: roles,
      targetState: uiObjectState(target),
      outInfo: hex(outInfo),
      outInfoBefore: bytesHex(outInfo, 52),
      flags: stackU32(this.context, 4),
      admissionBefore: snapshot(),
    };
  },
  onLeave(retval) {
    if (!this.interesting) return;
    const retvalRaw = retval.toInt32();
    emit('modeActivationHitTest', {
      ...this.info,
      retval: retvalRaw,
      retvalLow8: retvalRaw & 0xff,
      outInfoBytes: bytesHex(ptr(this.info.outInfo || 0), 52),
      admissionAfter: snapshot(),
    });
  },
});

emit('watch-ready', { sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS, modeRouteMap006703c0: modeRouteMap(), admission: snapshot() });
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
            script = session.create_script(build_js(sample_bytes=args.sample_bytes, poll_ms=args.poll_ms))
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
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=250)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
