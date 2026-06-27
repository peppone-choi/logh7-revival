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
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-hud-admission-watch.jsonl"
DESCRIPTION: Final = "Attach a Frida watcher for LOGH VII HUD command admission."


def build_js(
    *,
    sample_bytes: int = 64,
    poll_ms: int = 250,
    force_interaction_target_gate: bool = False,
    force_interaction_this_gate: bool = False,
) -> str:
    force_this_gate = force_interaction_this_gate or force_interaction_target_gate
    script = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = __SAMPLE_BYTES__;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = 24000;
let seq = 0;
let lastPollKey = null;

function abs(vaText) { return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }
function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) { if (value === null || value === undefined) return null; return safe(() => { const p = ptr(value); return p.isNull() ? null : p.toString(); }, String(value)); }
function gh(value) { return safe(() => '0x' + ptr(value).sub(moduleBase).add(IMAGE_BASE).toString(16), hex(value)); }
function readPointer(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8(), null); }
function readU16(address) { return safe(() => ptr(address).readU16(), null); }
function readU32(address) { return safe(() => ptr(address).readU32(), null); }
function readS32(address) { return safe(() => ptr(address).readS32(), null); }
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function retaddr(context) { return hex(stackPtr(context, 0)); }
function bytesHex(address, count) {
  return safe(() => {
    const p = ptr(address);
    if (p.isNull()) return null;
    const bytes = p.readByteArray(Math.min(Math.max(count, 0), SAMPLE_BYTES));
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }, null);
}
function backtrace(context) { return safe(() => Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 8).map((f) => gh(f)), []); }
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}

const clientBasePtr = abs('0x007ccffc');
const hud = abs('0x00c9e638');
const selectionList = abs('0x00c9eac4');
const commandMenu = abs('0x00c9e768');

function uiObjectState(value) {
  const row = ptr(value || 0);
  return {
    ptr: hex(row), gate04: readU8(row.add(4)), gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)), flag0a: readU8(row.add(10)),
    offset0c: readS32(row.add(0x0c)), offset10: readS32(row.add(0x10)),
    flag14: readU8(row.add(0x14)), flag15: readU8(row.add(0x15)),
    flag18: readU8(row.add(0x18)), flag1b: readU8(row.add(0x1b)),
    eventQueueCount3f4: readS32(row.add(0x3f4)), firstEvent470: readS32(row.add(0x470)),
    idB04: readU16(row.add(0xb04)), rectX20: readS32(row.add(0x20)),
    rectY24: readS32(row.add(0x24)), rectW2c: readS32(row.add(0x2c)),
    rectH30: readS32(row.add(0x30)),
  };
}
function selectionRows() {
  const count = Math.max(0, Math.min(readS32(selectionList.add(0x188 * 4)) || 0, 8));
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      index: i,
      primary: uiObjectState(readPointer(selectionList.add((0x22 + i) * 4))),
      secondary: uiObjectState(readPointer(selectionList.add((0x32 + i) * 4))),
    });
  }
  return rows;
}
function commandRows() {
  const count = Math.max(0, Math.min(readS32(commandMenu.add(0xd4 * 4)) || 0, 8));
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const row = readPointer(commandMenu.add((0x0c + i) * 4));
    const state = uiObjectState(row);
    state.index = i;
    rows.push(state);
  }
  return rows;
}
function samePtr(left, right) {
  return safe(() => ptr(left).equals(ptr(right)), false);
}
function modeHitTargets() {
  return [
    { role: 'hudTarget14-mode2-primary', ptr: readPointer(hud.add(0x14)) },
    { role: 'hudTarget18-mode4-primary', ptr: readPointer(hud.add(0x18)) },
    { role: 'hudTarget24-mode6-fallback', ptr: readPointer(hud.add(0x24)) },
    { role: 'hudTarget28-mode2-fallback', ptr: readPointer(hud.add(0x28)) },
  ];
}
function classifyHitTarget(target) {
  const t = ptr(target || 0);
  const roles = [];
  for (const item of modeHitTargets()) {
    if (!item.ptr.isNull() && samePtr(t, item.ptr)) roles.push(item.role);
  }
  if (samePtr(t, readPointer(commandMenu))) roles.push('command-root');
  const commandCount = Math.max(0, Math.min(readS32(commandMenu.add(0xd4 * 4)) || 0, 24));
  for (let i = 0; i < commandCount; i += 1) {
    const row = readPointer(commandMenu.add((0x0c + i) * 4));
    if (!row.isNull() && samePtr(t, row)) roles.push('command-row-' + i);
  }
  const selectionCount = Math.max(0, Math.min(readS32(selectionList.add(0x188 * 4)) || 0, 8));
  for (let i = 0; i < selectionCount; i += 1) {
    const primary = readPointer(selectionList.add((0x22 + i) * 4));
    const secondary = readPointer(selectionList.add((0x32 + i) * 4));
    if (!primary.isNull() && samePtr(t, primary)) roles.push('selection-primary-' + i);
    if (!secondary.isNull() && samePtr(t, secondary)) roles.push('selection-secondary-' + i);
  }
  return roles;
}
__FORCE_GATE_HELPER__
function modeTargetStates() {
  return modeHitTargets().map((target) => ({ role: target.role, state: uiObjectState(target.ptr) }));
}
function selectionState() {
  const payload = readPointer(selectionList.add(0x18a * 4));
  return {
    listCount188: readS32(selectionList.add(0x188 * 4)),
    listSelected189: readS32(selectionList.add(0x189 * 4)),
    payload: hex(payload),
    payloadCount270: readS32(payload.add(0x270)),
    payloadWord26c: readU16(payload.add(0x26c)),
    payloadWord274: readU16(payload.add(0x274)),
    payloadBytes260: bytesHex(payload.add(0x260), 64),
    rows: selectionRows(),
  };
}
function commandState() {
  return {
    activePtr: hex(readPointer(commandMenu)),
    activeGate04: readU8(readPointer(commandMenu).add(4)),
    activeGate05: readU8(readPointer(commandMenu).add(5)),
    rowCountD4: readS32(commandMenu.add(0xd4 * 4)),
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
    rows: commandRows(),
  };
}
function runtimeCommandTable() {
  const base = readPointer(clientBasePtr);
  if (base.isNull()) return { clientBase: null };
  const table305 = base.add(0x3416d8);
  const table307 = base.add(0x3468ea);
  return {
    clientBase: hex(base),
    table305: { guard00: readU8(table305), commandCount14: readU8(table305.add(0x14)), firstFactory16: readU16(table305.add(0x16)), bytes: bytesHex(table305, 48) },
    table307: { guard00: readU8(table307), commandCount14: readU8(table307.add(0x14)), firstFactory16: readU16(table307.add(0x16)), bytes: bytesHex(table307, 48) },
  };
}
function admissionState() {
  return {
    hud: { hudModeF4: readS32(hud.add(0xf4)), hudAb0: readS32(hud.add(0xab0)), hudState14e0: readS32(hud.add(0x14e0)) },
    modeTargets: modeTargetStates(),
    selection: selectionState(),
    command: commandState(),
    runtimeCommandTable: runtimeCommandTable(),
  };
}
function pollKey() {
  const state = admissionState();
  return JSON.stringify([
    state.hud.hudModeF4, state.hud.hudAb0, state.selection.listCount188,
    state.selection.listSelected189, state.selection.payloadCount270,
    state.command.rowCountD4, state.command.selectedD5, state.command.categoryD6,
  ]);
}
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}
function functionHook(vaText, name, enterTag, leaveTag, enterExtra) {
  install(vaText, name, {
    onEnter() {
      this.before = admissionState();
      this.extra = enterExtra ? enterExtra(this.context) : {};
      emit(enterTag, { ...this.extra, admission: this.before, ret: retaddr(this.context) });
    },
    onLeave(retval) {
      emit(leaveTag, { ...this.extra, retval: retval.toInt32(), before: this.before, admission: admissionState() });
    },
  });
}

functionHook('0x004f68f0', 'selectionImport', 'selectionImport-enter-004f68f0', 'selectionImport-leave-004f68f0', (ctx) => ({ thisEcx: hex(ctx.ecx), payloadArg: hex(stackPtr(ctx, 1)) }));
functionHook('0x004f6600', 'selectionHitTest', 'selectionHitTest-enter-004f6600', 'selectionHitTest-leave-004f6600', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
functionHook('0x004fd100', 'hudGate', 'hudGate-enter-004fd100', 'hudGate-leave-004fd100', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
functionHook('0x004fd7a0', 'hudModeSet', 'hudModeSet-enter-004fd7a0', 'hudModeSet-leave-004fd7a0', (ctx) => ({ thisEcx: hex(ctx.ecx), requestedMode: stackU32(ctx, 1), pushHistory: stackU32(ctx, 2) }));
functionHook('0x004f6b00', 'categoryResolve', 'categoryResolve-enter-004f6b00', 'categoryResolve-leave-004f6b00', (ctx) => ({ thisEcx: hex(ctx.ecx) }));
functionHook('0x004f5cb0', 'commandBuild', 'commandBuild-enter-004f5cb0', 'commandBuild-leave-004f5cb0', (ctx) => ({ thisEcx: hex(ctx.ecx), categoryArg: stackU32(ctx, 1) }));
functionHook('0x004f58c0', 'commandRowHit', 'commandRowHit-enter-004f58c0', 'commandRowHit-leave-004f58c0', (ctx) => ({ thisEcx: hex(ctx.ecx), outFlag: hex(stackPtr(ctx, 1)) }));
functionHook('0x004f93c0', 'factoryDispatch', 'factoryDispatch-enter-004f93c0', 'factoryDispatch-leave-004f93c0', (ctx) => ({ thisEcx: hex(ctx.ecx), factoryIndex: stackU32(ctx, 1), categoryArg: stackU32(ctx, 2) }));
functionHook('0x00581c80', 'selectGridFactory', 'selectGridFactory-enter-00581c80', 'selectGridFactory-leave-00581c80', null);
install('0x005015f0', 'inputHitTest', {
  onEnter() {
    const eventKind = stackU32(this.context, 1);
    const thisEcx = this.context.ecx;
    const target = stackPtr(this.context, 2);
    const roles = classifyHitTarget(target);
__FORCE_GATE_ON_ENTER__
    this.hitInfo = {
      thisEcx: hex(thisEcx),
      thisState: uiObjectState(thisEcx),
      eventKind,
      target: hex(target),
      targetRoles: roles,
      outInfo: hex(stackPtr(this.context, 3)),
      flags: stackU32(this.context, 4),
      ret: retaddr(this.context),
    };
    this.interesting = eventKind === 2 || roles.length > 0;
  },
  onLeave(retval) {
    if (!this.interesting) return;
    const retvalRaw = retval.toInt32();
    emit('inputHitTest-leave-005015f0', {
      ...this.hitInfo,
      retval: retvalRaw,
      retvalLow8: retvalRaw & 0xff,
      admission: admissionState(),
    });
  },
});

const WATCH_FIELDS = [
  { name: 'hudModeF4', aliases: ['hudModeF4'], address: hud.add(0xf4), size: 4, read: () => readS32(hud.add(0xf4)) },
  { name: 'hudAb0_listSelected189', aliases: ['hudAb0', 'listSelected189'], address: hud.add(0xab0), size: 4, read: () => readS32(hud.add(0xab0)) },
  { name: 'categoryD6', aliases: ['categoryD6'], address: commandMenu.add(0xd6 * 4), size: 4, read: () => readS32(commandMenu.add(0xd6 * 4)) },
];
function fieldFor(address) {
  for (const field of WATCH_FIELDS) {
    const start = field.address;
    const end = start.add(field.size);
    if (ptr(address).compare(start) >= 0 && ptr(address).compare(end) < 0) return field;
  }
  return null;
}
try {
  MemoryAccessMonitor.enable(WATCH_FIELDS.map((field) => ({ base: field.address, size: field.size })), {
    onAccess(details) {
      if (details.operation !== 'write') return;
      const field = fieldFor(details.address);
      emit('field-write', {
        field: field ? field.name : null,
        aliases: field ? field.aliases : [],
        address: hex(details.address),
        from: gh(details.from),
        valueAfter: field ? field.read() : null,
        backtrace: backtrace(details.context),
        admission: admissionState(),
      });
    },
  });
  emit('field-watch-armed', { fields: WATCH_FIELDS.map((field) => ({ name: field.name, aliases: field.aliases, address: hex(field.address), size: field.size })) });
} catch (error) {
  emit('field-watch-failed', { error: String(error), fields: WATCH_FIELDS.map((field) => field.name) });
}

emit('watch-ready', { sampleBytes: SAMPLE_BYTES, pollMs: POLL_MS, admission: admissionState() });
setInterval(function pollAdmission() {
  const key = pollKey();
  if (key !== lastPollKey) {
    emit('admission-poll-change', { previousKey: lastPollKey, admission: admissionState() });
    lastPollKey = key;
  }
}, POLL_MS);
"""
    force_gate_helper = ""
    force_gate_on_enter = ""
    if force_this_gate:
        force_gate_helper = r"""
function forceInteractionThisGate(thisEcx, target, roles, eventKind) {
  const self = ptr(thisEcx || 0);
  if (self.isNull() || (eventKind !== 2 && roles.length === 0)) return;
  const before = uiObjectState(self);
  if (before.gate05 === 1) return;
  safe(() => { self.add(5).writeU8(1); return null; }, null);
  const after = uiObjectState(self);
  emit('force-this-gate05', { thisEcx: hex(self), target: hex(target), targetRoles: roles, eventKind, before, after });
}
"""
        force_gate_on_enter = "    forceInteractionThisGate(thisEcx, target, roles, eventKind);"
    return script.replace("__FORCE_GATE_HELPER__", force_gate_helper).replace(
        "__FORCE_GATE_ON_ENTER__",
        force_gate_on_enter,
    ).replace("__SAMPLE_BYTES__", str(max(0, int(sample_bytes)))).replace(
        "__POLL_MS__",
        str(max(1, int(poll_ms))),
    )


def _session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}: {pid}")
    return pid


def _best_effort_cleanup(script: object | None, session: object | None) -> list[str]:
    errors: list[str] = []
    if script is not None:
        try:
            getattr(script, "unload")()
        except Exception as exc:
            errors.append(f"script.unload: {exc}")
    if session is not None:
        try:
            getattr(session, "detach")()
        except Exception as exc:
            errors.append(f"session.detach: {exc}")
    return errors


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
            out.write(
                json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False)
                + "\n"
            )
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(
                build_js(
                    sample_bytes=args.sample_bytes,
                    poll_ms=args.poll_ms,
                    force_interaction_target_gate=args.force_interaction_target_gate,
                    force_interaction_this_gate=args.force_interaction_this_gate,
                )
            )
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
        finally:
            cleanup_errors = _best_effort_cleanup(script, session)

    print(
        json.dumps(
            {"attachedPid": pid, "out": str(args.out), "events": events, "cleanupErrors": cleanup_errors},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None, help="attach to this PID instead of reading session.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=250)
    parser.add_argument(
        "--force-interaction-target-gate",
        action="store_true",
        help="deprecated alias: debug patch for the FUN_005015f0 this-context +5 gate",
    )
    parser.add_argument(
        "--force-interaction-this-gate",
        action="store_true",
        help="debug patch: set byte +5 on the FUN_005015f0 this context before interesting hit-tests",
    )
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
