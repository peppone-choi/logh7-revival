'use strict';

const IMAGE_BASE = ptr('0x400000');
const module = Process.getModuleByName('g7mtclient.exe');
const moduleBase = module.base;

function abs(va) { return moduleBase.add(ptr(va).sub(IMAGE_BASE)); }
function safe(fn, fallback = null) {
  try { return fn(); } catch (_error) { return fallback; }
}
function ptrHex(value) {
  return safe(() => {
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  });
}
function readPtr(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function readU8(address) { return safe(() => ptr(address).readU8()); }
function readU16(address) { return safe(() => ptr(address).readU16()); }
function readU32(address) { return safe(() => ptr(address).readU32()); }
function readU16BE(address) { return safe(() => (readU8(address) << 8) | readU8(ptr(address).add(1))); }
function readU32BE(address) {
  return safe(() => ((readU8(address) << 24) | (readU8(ptr(address).add(1)) << 16)
    | (readU8(ptr(address).add(2)) << 8) | readU8(ptr(address).add(3))) >>> 0);
}
function readS32(address) { return safe(() => ptr(address).readS32()); }
function readF32(address) { return safe(() => ptr(address).readFloat()); }
function readHex(address, length) {
  return safe(() => {
    const bytes = ptr(address).readByteArray(length);
    return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join('');
  });
}

const INPUT_STATE = abs('0x022142a8');
const READ_ABSOLUTE_ORIGIN = new NativeFunction(
  abs('0x00507090'), 'void', ['pointer', 'pointer'], { abi: 'thiscall' },
);

function pointState(value) {
  const address = safe(() => ptr(value), ptr('0x0'));
  if (address.isNull()) return { ptr: null, x: null, y: null };
  return { ptr: ptrHex(address), x: readS32(address), y: readS32(address.add(4)) };
}

function rectState(value) {
  const target = safe(() => ptr(value), ptr('0x0'));
  if (target.isNull()) return { ptr: null, x: null, y: null, width: null, height: null };
  return {
    ptr: ptrHex(target),
    x: readS32(target.add(0x20)),
    y: readS32(target.add(0x24)),
    width: readS32(target.add(0x2c)),
    height: readS32(target.add(0x30)),
  };
}

function pointerEquals(left, right) {
  return safe(() => ptr(left).equals(ptr(right)), false);
}

function absoluteOriginState(target) {
  return safe(() => {
    const output = Memory.alloc(8);
    READ_ABSOLUTE_ORIGIN(ptr(target), output);
    return { ecx: ptrHex(target), output: pointState(output) };
  });
}

function rowState(value) {
  if (!value || ptr(value).isNull()) return { ptr: null };
  const row = ptr(value);
  return {
    ptr: ptrHex(row),
    active08: readU8(row.add(8)),
    latchB00: readU8(row.add(0xb00)),
    latchB01: readU8(row.add(0xb01)),
    gate04: readU8(row.add(4)),
    gate05: readU8(row.add(5)),
    target08: readU8(row.add(8)),
    flag15: readU8(row.add(0x15)),
    eventQueueCount3f4: readU8(row.add(0x3f4)),
    idB04: readU16(row.add(0xb04)),
    state10: readU32(row.add(0x10)),
    state14: readU32(row.add(0x14)),
    state18: readU32(row.add(0x18)),
    state1c: readU32(row.add(0x1c)),
    state154: readU8(row.add(0x154)),
    state155: readU8(row.add(0x155)),
    state158: readU32(row.add(0x158)),
    state15c: readU32(row.add(0x15c)),
    state160: readU32(row.add(0x160)),
    state164: readU32(row.add(0x164)),
    rectX20: readS32(row.add(0x20)),
    rectY24: readS32(row.add(0x24)),
    rectW2c: readS32(row.add(0x2c)),
    rectH30: readS32(row.add(0x30)),
  };
}

const selectionHitState = { calls: 0, accepted: 0, rejected: 0, last: null };
const commandHitState = { calls: 0, accepted: 0, rejected: 0, last: null };
const nativeCallState = {
  factory: { calls: 0, last: null, lastReturn: null },
  commandBuild: { calls: 0, last: null, lastReturn: null },
  taskRunner: { calls: 0, last: null, lastReturn: null },
  taskStep: { calls: 0, last: null, lastReturn: null },
  selectGrid: { calls: 0, last: null },
  sendWarp: { calls: 0, last: null },
  gridMove: { calls: 0, last: null },
  selector: { calls: 0, last: null },
};
const nestedGateState = {
  '0x005025f0': {
    calls: 0, returns: {}, effectiveReturns: {}, forcedCalls: 0, lastByRole: {}, originByRole: {},
  },
  '0x00500820': { calls: 0, returns: {} },
  '0x0050c180': { calls: 0, returns: {}, effectiveReturns: {}, forcedCalls: 0 },
  '0x00501d60': { calls: 0, returns: {} },
  '0x00501ed0': { calls: 0, returns: {} },
  '0x00500870': { calls: 0, returns: {} },
  '0x005008e0': { calls: 0, returns: {} },
};
let activeHit = null;
let selectionLatchForce = false;
let selectionHitReturnForce = false;
let commandHitReturnForce = false;
let commandLatchForce = false;
let geometryForceEnabled = false;
let geometryTargetOnly = false;
let occlusionForceEnabled = false;
let commandTableForceEnabled = false;
let commandTableForceResult = null;
let commandTableApplyResult = null;
let selectGridConfirmForceEnabled = false;
let selectGridConfirmForcePending = false;
let selectGridConfirmForceResult = null;
let selectGridBeforeSendForceEnabled = false;
let selectGridBeforeSendForceResult = null;
let focusCellForceEnabled = false;
let focusCellForceResult = null;
let activeGeometry = null;
let geometryOriginDepth = 0;

function nestedContextState(ecx, hit) {
  const selectionRoot = readPtr(abs('0x00c9eac4'));
  const commandRoot = readPtr(abs('0x00c9e768'));
  const base = clientBase();
  return {
    ecx: ptrHex(ecx),
    inputState: ptrHex(INPUT_STATE),
    controller: hit.controller || null,
    selectionRoot: ptrHex(selectionRoot),
    commandRoot: ptrHex(commandRoot),
    clientBase: ptrHex(base),
    ecxMatchesInputState: pointerEquals(ecx, INPUT_STATE),
    ecxMatchesController: hit.controller ? pointerEquals(ecx, hit.controller) : false,
    ecxMatchesSelectionRoot: pointerEquals(ecx, selectionRoot),
    ecxMatchesCommandRoot: pointerEquals(ecx, commandRoot),
    ecxMatchesClientBase: pointerEquals(ecx, base),
  };
}

function sendWarpContextState(args) {
  return safe(() => {
    const commandObject = safe(() => ptr(args[0]), ptr('0x0'));
    const context = safe(() => ptr(args[1]), ptr('0x0'));
    const commandMode = commandObject.isNull() ? null : readU8(commandObject.add(0x28));
    if (context.isNull()) {
      return {
        ok: false,
        reason: 'null-context',
        commandObject: ptrHex(commandObject),
        commandMode,
      };
    }
    const index = readU32(context.add(0x04));
    const listBegin = readPtr(context.add(0x10));
    const listEnd = readPtr(context.add(0x14));
    const pointerSize = Process.pointerSize || 4;
    const currentNode = !listBegin.isNull() && Number.isInteger(index) && index < 0x100000
      ? readPtr(listBegin.add(index * pointerSize))
      : ptr('0x0');
    const node = currentNode.isNull()
      ? null
      : {
        address: ptrHex(currentNode),
        offset00: readU32(currentNode),
        offset0c: readU32(currentNode.add(0x0c)),
        offset10: readU32(currentNode.add(0x10)),
        offset14: readU32(currentNode.add(0x14)),
        offset18: readU8(currentNode.add(0x18)),
      };
    return {
      ok: true,
      commandObject: ptrHex(commandObject),
      commandMode,
      context: ptrHex(context),
      index,
      listBegin: ptrHex(listBegin),
      listEnd: ptrHex(listEnd),
      currentNode: ptrHex(currentNode),
      node,
    };
  }, { ok: false, reason: 'context-read-failed' });
}

function hookNativeCall(name, address, argCount) {
  Interceptor.attach(abs(address), {
    onEnter(args) {
      const values = [];
      for (let i = 0; i < argCount; i += 1) {
        try { values.push(args[i].toInt32()); } catch (_error) { values.push(null); }
      }
      nativeCallState[name].calls += 1;
      this.nativeCall = { values, t: Date.now() };
      nativeCallState[name].last = this.nativeCall;
      if (name === 'sendWarp') {
        this.nativeCall.context = sendWarpContextState(args);
      }
      if (name === 'sendWarp' && selectGridBeforeSendForceEnabled) {
        const address = abs('0x009d2a3c');
        const before = readU32(address);
        const stateBefore = selectGridState();
        try {
          address.writeU32(2);
          selectGridBeforeSendForceResult = {
            ok: true,
            address: ptrHex(address),
            before,
            after: readU32(address),
            stateBefore,
            stateAfter: selectGridState(),
            sendWarpArgs: values,
            t: Date.now(),
          };
        } catch (error) {
          selectGridBeforeSendForceResult = {
            ok: false,
            address: ptrHex(address),
            before,
            after: readU32(address),
            stateBefore,
            stateAfter: selectGridState(),
            sendWarpArgs: values,
            error: String(error),
            t: Date.now(),
          };
        }
      }
    },
    onLeave(retval) {
      nativeCallState[name].lastReturn = {
        nativeRetval: retval.toInt32(),
        t: Date.now(),
      };
      if (name === 'selectGrid' && selectGridConfirmForcePending) {
        const address = abs('0x009d2a3c');
        const before = readU32(address);
        try {
          address.writeU32(2);
          selectGridConfirmForcePending = false;
          selectGridConfirmForceEnabled = true;
          selectGridConfirmForceResult = {
            ok: true,
            address: ptrHex(address),
            before,
            after: readU32(address),
            t: Date.now(),
          };
        } catch (error) {
          selectGridConfirmForceResult = {
            ok: false,
            address: ptrHex(address),
            before,
            after: readU32(address),
            error: String(error),
            t: Date.now(),
          };
        }
      }
    },
  });
}

function hookNestedGate(address, argCount) {
  Interceptor.attach(abs(address), {
    onEnter(args) {
      if (activeHit === null) return;
      this.hit = { ...activeHit };
      const values = [];
      for (let i = 0; i < argCount; i += 1) {
        try { values.push(args[i].toInt32()); } catch (_error) { values.push(null); }
      }
      this.values = values;
      this.contextState = nestedContextState(this.context.ecx, this.hit);
      if (address === '0x00500820' || address === '0x00500870' || address === '0x005008e0') {
        this.outputPointer = ptr(args[0]);
      }
      if (address === '0x005025f0') {
        const originEntry = nestedGateState[address];
        const role = this.hit.role;
        const origin = originEntry.originByRole[role] || absoluteOriginState(this.context.ecx);
        originEntry.originByRole[role] = origin;
        this.geometry = {
          targetRect: rectState(args[0]),
          input008e0: pointState(args[1]),
          input00870: pointState(args[2]),
          input00820: pointState(args[3]),
          hitOffsetBefore: pointState(args[4]),
          originFunction: origin,
          absoluteRect: null,
        };
        this.hitOffsetPointer = ptr(args[4]);
        this.geometryTarget = ptr(args[0]);
        activeGeometry = this.geometry;
        geometryOriginDepth = 0;
      }
    },
    onLeave(retval) {
      if (!this.hit) return;
      const entry = nestedGateState[address];
      entry.calls += 1;
      const nativeRetval = retval.toInt32();
      let effectiveRetval = nativeRetval;
      let forced = false;
      const geometryTargetMatch = address !== '0x005025f0'
        || !geometryTargetOnly
        || pointerEquals(this.geometryTarget, this.hit.target)
        || pointerEquals(this.geometryTarget.add(0xf18), this.hit.target);
      if (address === '0x005025f0' && geometryForceEnabled && geometryTargetMatch && (nativeRetval & 0xff) === 0) {
        effectiveRetval = (nativeRetval & 0xffffff00) | 1;
        retval.replace(ptr(effectiveRetval >>> 0));
        entry.forcedCalls += 1;
        forced = true;
      }
      if (address === '0x0050c180' && occlusionForceEnabled && nativeRetval !== 0) {
        effectiveRetval = 0;
        retval.replace(ptr('0x0'));
        entry.forcedCalls += 1;
        forced = true;
      }
      const key = String(nativeRetval);
      entry.returns[key] = (entry.returns[key] || 0) + 1;
      if (entry.effectiveReturns) {
        const effectiveKey = String(effectiveRetval);
        entry.effectiveReturns[effectiveKey] = (entry.effectiveReturns[effectiveKey] || 0) + 1;
      }
      let details = null;
      if (this.outputPointer) details = { output: pointState(this.outputPointer) };
      if (this.geometry) {
        this.geometry.hitOffsetAfter = pointState(this.hitOffsetPointer);
        const origin = this.geometry.originFunction && this.geometry.originFunction.output;
        const rect = this.geometry.targetRect;
        if (origin && origin.x !== null && origin.y !== null && rect.x !== null && rect.y !== null) {
          this.geometry.absoluteRect = {
            x: origin.x + rect.x,
            y: origin.y + rect.y,
            width: rect.width,
            height: rect.height,
          };
        }
        details = this.geometry;
        activeGeometry = null;
        geometryOriginDepth = 0;
      }
      const record = {
        role: this.hit.role,
        target: this.hit.target,
        values: this.values,
        context: this.contextState,
        details,
        nativeRetval,
        retval: effectiveRetval,
        nativeLow8: nativeRetval & 0xff,
        retvalLow8: effectiveRetval & 0xff,
        forced,
        t: Date.now(),
      };
      entry.last = record;
      if (entry.lastByRole) entry.lastByRole[this.hit.role] = record;
      if (forced) entry.lastForced = record;
    },
  });
}

hookNativeCall('factory', '0x004f93c0', 4);
hookNativeCall('commandBuild', '0x004f5cb0', 1);
hookNativeCall('taskRunner', '0x004f90d0', 0);
hookNativeCall('taskStep', '0x004f9270', 1);
hookNativeCall('selectGrid', '0x00581c80', 4);
hookNativeCall('sendWarp', '0x005737d0', 3);
hookNativeCall('gridMove', '0x004b48d0', 3);
hookNativeCall('selector', '0x004b78a0', 4);
hookNestedGate('0x005025f0', 5);
hookNestedGate('0x00500820', 4);
hookNestedGate('0x0050c180', 4);
hookNestedGate('0x00501d60', 4);
hookNestedGate('0x00501ed0', 4);
hookNestedGate('0x00500870', 4);
hookNestedGate('0x005008e0', 4);
Interceptor.attach(abs('0x00507090'), {
  onEnter(args) {
    if (activeGeometry === null) return;
    this.capture = true;
    this.depth = geometryOriginDepth;
    geometryOriginDepth += 1;
    this.outputPointer = ptr(args[0]);
    this.ecx = ptrHex(this.context.ecx);
  },
  onLeave() {
    if (!this.capture) return;
    geometryOriginDepth = Math.max(0, geometryOriginDepth - 1);
    if (this.depth === 0 && activeGeometry !== null) {
      activeGeometry.originFunction = { ecx: this.ecx, output: pointState(this.outputPointer) };
    }
  },
});
Interceptor.attach(abs('0x005015f0'), {
  onEnter(args) {
    this.selectionWatch = false;
    this.commandWatch = false;
    try {
      if (args[0].toInt32() !== 2) return;
      const list = abs('0x00c9eac4');
      const count = readS32(list.add(0x188 * 4));
      const target = ptr(args[1]);
      for (let i = 0; i < Math.max(0, Math.min(count || 0, 8)); i += 1) {
        const primary = readPtr(list.add((0x22 + i) * 4));
        const secondary = readPtr(list.add((0x32 + i) * 4));
        if (target.equals(primary) || target.equals(secondary)) {
          this.selectionWatch = true;
          activeHit = { role: 'selection', target: ptrHex(target), controller: ptrHex(this.context.ecx) };
          const latchBefore = readU8(target.add(0xb00));
          if (selectionLatchForce) target.add(0xb00).writeU8(1);
          this.selectionBefore = {
            target: ptrHex(target),
            controller: ptrHex(this.context.ecx),
            controllerGate05: readU8(this.context.ecx.add(5)),
            target08: readU8(target.add(8)),
            flag15: readU8(target.add(0x15)),
            latchB00: latchBefore,
            eventQueueCount3f4: readU8(target.add(0x3f4)),
          };
          break;
        }
      }
      if (!this.selectionWatch) {
        const menu = abs('0x00c9e768');
        const commandCount = readS32(menu.add(0xd4 * 4));
        for (let i = 0; i < Math.max(0, Math.min(commandCount || 0, 8)); i += 1) {
          const row = readPtr(menu.add((0x0c + i) * 4));
          if (!target.equals(row)) continue;
          this.commandWatch = true;
          activeHit = { role: 'command', target: ptrHex(target), controller: ptrHex(this.context.ecx) };
          if (commandLatchForce) target.add(0xb00).writeU8(1);
          this.commandBefore = {
            index: i,
            target: ptrHex(target),
            controller: ptrHex(this.context.ecx),
            controllerGate05: readU8(this.context.ecx.add(5)),
            target08: readU8(target.add(8)),
            flag15: readU8(target.add(0x15)),
            latchB00: readU8(target.add(0xb00)),
          };
          break;
        }
      }
    } catch (_error) {
      this.selectionWatch = false;
    }
  },
  onLeave(retval) {
    if (this.selectionWatch) {
      const nativeRetval = retval.toInt32();
      const forced = selectionHitReturnForce;
      if (forced) {
        retval.replace(ptr('0x1'));
        selectionHitReturnForce = false;
      }
      selectionHitState.calls += 1;
      const accepted = (forced ? 1 : nativeRetval) & 0xff;
      if (accepted) selectionHitState.accepted += 1;
      else selectionHitState.rejected += 1;
      selectionHitState.last = {
        ...this.selectionBefore,
        nativeRetval,
        retval: forced ? 1 : nativeRetval,
        t: Date.now(),
      };
    }
    if (this.commandWatch) {
      const nativeRetval = retval.toInt32();
      const forced = commandHitReturnForce;
      if (forced) {
        retval.replace(ptr('0x1'));
        commandHitReturnForce = false;
      }
      commandHitState.calls += 1;
      if (((forced ? 1 : nativeRetval) & 0xff) !== 0) commandHitState.accepted += 1;
      else commandHitState.rejected += 1;
      commandHitState.last = {
        ...this.commandBefore,
        nativeRetval,
        retval: forced ? 1 : nativeRetval,
        t: Date.now(),
      };
    }
    if (this.selectionWatch || this.commandWatch) activeHit = null;
  },
});

function clientBase() { return readPtr(abs('0x007ccffc')); }
function dataRoot() { return readPtr(abs('0x007cd04c')); }

const HUD_MODE_SET = abs('0x004fd7a0');
const STRATEGY_TICK = abs('0x004fef90');
const HUD_STATE = abs('0x00c9e638');
const INPUT_TICK = abs('0x00500580');
let mode2ForcePending = false;
let mode2ForceResult = null;
let mode2ForceHook = null;
let inputTickPending = false;
let inputTickResult = null;

function invokeHudMode2() {
  const before = snapshot();
  try {
    const call = new NativeFunction(HUD_MODE_SET, 'int', ['pointer', 'int', 'int'], { abi: 'thiscall' });
    const ret = call(HUD_STATE, 2, 1);
    mode2ForceResult = {
      ok: true,
      ret,
      before,
      after: snapshot(),
      t: Date.now(),
    };
  } catch (error) {
    mode2ForceResult = { ok: false, before, after: snapshot(), error: String(error), t: Date.now() };
  }
}

function armHudMode2Force() {
  if (mode2ForceHook === null) {
    mode2ForceHook = Interceptor.attach(STRATEGY_TICK, {
      onEnter() {
        if (mode2ForcePending && mode2ForceResult === null) {
          const list = abs('0x00c9eac4');
          const payload = readPtr(list.add(0x18a * 4));
          const count = readS32(list.add(0x188 * 4));
          const base = clientBase();
          const unitCount = base && !base.isNull() ? readU16(base.add(0x41a364)) : 0;
          const payloadCount = payload && !payload.isNull() ? readS32(payload.add(0x270)) : 0;
          if (count >= 1 && payloadCount >= 1 && unitCount >= 1) {
            mode2ForcePending = false;
            invokeHudMode2();
          }
        }
        if (inputTickPending && inputTickResult === null) {
          inputTickPending = false;
          invokeInputTick();
        }
      },
    });
  }
  mode2ForcePending = true;
  mode2ForceResult = null;
  return { armed: true, listCount: readS32(abs('0x00c9eac4').add(0x188 * 4)), t: Date.now() };
}

function invokeInputTick() {
  const before = rowState(INPUT_STATE);
  try {
    const call = new NativeFunction(INPUT_TICK, 'void', ['pointer'], { abi: 'thiscall' });
    call(INPUT_STATE);
    inputTickResult = {
      ok: true,
      before,
      after: rowState(INPUT_STATE),
      t: Date.now(),
    };
  } catch (error) {
    inputTickResult = { ok: false, before, error: String(error), t: Date.now() };
  }
}

function armInputTick() {
  inputTickPending = true;
  inputTickResult = null;
  return { armed: true, t: Date.now() };
}

function armGeometryForce() {
  geometryForceEnabled = true;
  geometryTargetOnly = false;
  return { armed: true, t: Date.now() };
}

function armGeometryTargetForce() {
  geometryForceEnabled = true;
  geometryTargetOnly = true;
  return { armed: true, targetOnly: true, t: Date.now() };
}

function armOcclusionForce() {
  occlusionForceEnabled = true;
  return { armed: true, t: Date.now() };
}

function armSelectionLatchForce() {
  selectionLatchForce = true;
  return { armed: true, t: Date.now() };
}

function armSelectionHitReturnForce() {
  selectionHitReturnForce = true;
  return { armed: true, t: Date.now() };
}

function armCommandHitReturnForce() {
  commandHitReturnForce = true;
  return { armed: true, t: Date.now() };
}

function armCommandLatchForce() {
  commandLatchForce = true;
  return { armed: true, t: Date.now() };
}

function commandTableState() {
  const base = clientBase();
  const table = base && !base.isNull() ? base.add(0x3416d8) : ptr('0x0');
  return {
    clientBase: ptrHex(base),
    table: ptrHex(table),
    count: table.isNull() ? null : readU8(table.add(0x1e)),
    factories: table.isNull()
      ? []
      : [readU16(table.add(0x20)), readU16(table.add(0x22))],
    raw: table.isNull() ? null : readHex(table.add(0x1e), 8),
  };
}

function armCommandTableForce() {
  const base = clientBase();
  const before = commandTableState();
  try {
    if (!base || base.isNull()) throw new Error('client base is null');
    const table = base.add(0x3416d8);
    table.add(0x1e).writeU8(2);
    table.add(0x20).writeU16(0x002b);
    table.add(0x22).writeU16(0x0041);
    commandTableForceEnabled = true;
    commandTableForceResult = { ok: true, before, after: commandTableState(), t: Date.now() };
  } catch (error) {
    commandTableForceResult = { ok: false, before, after: commandTableState(), error: String(error), t: Date.now() };
  }
  return { armed: commandTableForceEnabled, result: commandTableForceResult };
}

function invokeCommandTableApply() {
  const before = snapshot();
  try {
    const menu = abs('0x00c9e768');
    const call = new NativeFunction(abs('0x004f5cb0'), 'int', ['pointer', 'int'], { abi: 'thiscall' });
    const ret = call(menu, 0);
    commandTableApplyResult = {
      ok: true,
      ret,
      before,
      after: snapshot(),
      t: Date.now(),
    };
  } catch (error) {
    commandTableApplyResult = { ok: false, before, after: snapshot(), error: String(error), t: Date.now() };
  }
  return commandTableApplyResult;
}

function armSelectGridConfirmForce() {
  const address = abs('0x009d2a3c');
  const before = readU32(address);
  selectGridConfirmForcePending = true;
  selectGridConfirmForceResult = { ok: true, pending: true, address: ptrHex(address), before, t: Date.now() };
  return { armed: true, pending: true, result: selectGridConfirmForceResult };
}

function armSelectGridBeforeSendForce() {
  selectGridBeforeSendForceEnabled = true;
  selectGridBeforeSendForceResult = null;
  return {
    armed: true,
    address: ptrHex(abs('0x009d2a3c')),
    state: selectGridState(),
    t: Date.now(),
  };
}

function selectGridState() {
  return {
    base: ptrHex(abs('0x009d2a30')),
    phase: readU32(abs('0x009d2a34')),
    mode: readU32(abs('0x009d2a3c')),
    target: readU32(abs('0x009d2a40')),
    cell: readU32(abs('0x009d2a74')),
    range: readU32(abs('0x009d2a7c')),
  };
}

function forceSelectGridConfirmNow() {
  const address = abs('0x009d2a3c');
  const before = readU32(address);
  try {
    address.writeU32(2);
    selectGridConfirmForceEnabled = true;
    selectGridConfirmForcePending = false;
    selectGridConfirmForceResult = {
      ok: true,
      immediate: true,
      address: ptrHex(address),
      before,
      after: readU32(address),
      state: selectGridState(),
      t: Date.now(),
    };
  } catch (error) {
    selectGridConfirmForceResult = {
      ok: false,
      immediate: true,
      address: ptrHex(address),
      before,
      after: readU32(address),
      state: selectGridState(),
      error: String(error),
      t: Date.now(),
    };
  }
  return selectGridConfirmForceResult;
}

function armFocusCellForce(value = 2588) {
  const root = dataRoot();
  const before = root && !root.isNull() ? readU32(root.add(0x11178)) : null;
  try {
    if (!root || root.isNull()) throw new Error('data root is null');
    root.add(0x11178).writeU32(value >>> 0);
    focusCellForceEnabled = true;
    focusCellForceResult = {
      ok: true,
      root: ptrHex(root),
      address: ptrHex(root.add(0x11178)),
      value: value >>> 0,
      before,
      after: readU32(root.add(0x11178)),
      t: Date.now(),
    };
  } catch (error) {
    focusCellForceResult = {
      ok: false,
      root: ptrHex(root),
      value: value >>> 0,
      before,
      after: before,
      error: String(error),
      t: Date.now(),
    };
  }
  return focusCellForceResult;
}

function commandState() {
  const menu = abs('0x00c9e768');
  const active = readPtr(menu);
  const origin = active && !active.isNull() ? absoluteOriginState(active).output : null;
  const rowCount = readS32(menu.add(0xd4 * 4));
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(rowCount || 0, 8)); i += 1) {
    rows.push({ index: i, ...rowState(readPtr(menu.add((0x0c + i) * 4))) });
  }
  return {
    root: { ...rowState(active), raw: active && !active.isNull() ? readHex(active, 0x40) : null },
    activePtr: ptrHex(active),
    origin,
    activeGate04: readU8(active.add(4)),
    activeGate05: readU8(active.add(5)),
    rowCountD4: rowCount,
    selectedD5: readS32(menu.add(0xd5 * 4)),
    categoryD6: readS32(menu.add(0xd6 * 4)),
    rows,
  };
}

function selectionState() {
  const list = abs('0x00c9eac4');
  const root = readPtr(list);
  const origin = root && !root.isNull() ? absoluteOriginState(root).output : null;
  const payload = readPtr(list.add(0x18a * 4));
  const hud = abs('0x00c9e638');
  const count = readS32(list.add(0x188 * 4));
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(count || 0, 8)); i += 1) {
    rows.push({
      index: i,
      primary: rowState(readPtr(list.add((0x22 + i) * 4))),
      secondary: rowState(readPtr(list.add((0x32 + i) * 4))),
    });
  }
  return {
    root: { ...rowState(root), raw: root && !root.isNull() ? readHex(root, 0x40) : null },
    origin,
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    listCount188: count,
    listSelected189: readS32(list.add(0x189 * 4)),
    listPayload18a: ptrHex(payload),
    payloadCount270: readS32(payload.add(0x270)),
    payloadCount270U8: readU8(payload.add(0x270)),
    payloadWord26c: readU16(payload.add(0x26c)),
    payloadWord274: readU16(payload.add(0x274)),
    rows,
  };
}

function runtimeTables(base) {
  if (!base || base.isNull()) return { clientBase: null };
  const table305 = base.add(0x3416d8);
  const table307 = base.add(0x3468ea);
  const staging305 = base.add(0x3e0c8c);
  const staging307 = base.add(0x3e5e96);
  return {
    clientBase: ptrHex(base),
    table305: {
      address: ptrHex(table305),
      guard00: readU8(table305),
      category0CommandCount1e: readU8(table305.add(0x1e)),
      category0FirstFactory20: readU16(table305.add(0x20)),
      category1CommandCount64: readU8(table305.add(0x64)),
      commandCount14: readU8(table305.add(0x14)),
      firstFactory16: readU16(table305.add(0x16)),
      raw08: readHex(table305.add(0x08), 0x46),
      stagingAddress: ptrHex(staging305),
      stagingCount00: readU16(staging305),
      stagingCardId02: readU16(staging305.add(0x02)),
      stagingCommandCount16: readU8(staging305.add(0x16)),
      stagingFirstFactory18: readU16(staging305.add(0x18)),
      stagingRaw08: readHex(staging305, 0x46),
    },
    table307: {
      address: ptrHex(table307),
      guard00: readU8(table307),
      recordCount00: readU16(table307),
      firstRecordId02: readU16(table307.add(0x02)),
      secondRecordCount04: readU8(table307.add(0x04)),
      commandCount02: readU8(table307.add(0x02)),
      firstDescriptor04: readU16(table307.add(0x04)),
      raw00: readHex(table307, 0x20),
      stagingAddress: ptrHex(staging307),
      stagingCount00: readU16(staging307),
      stagingFirstRecordId02: readU16(staging307.add(0x02)),
      stagingSecondRecordCount04: readU8(staging307.add(0x04)),
      stagingRaw00: readHex(staging307, 0x20),
    },
  };
}

function linkageState(base) {
  if (!base || base.isNull()) return { clientBase: null };
  const root = dataRoot();
  const unitCount = readU16(base.add(0x41a364));
  const unitBase = base.add(0x41a368);
  const unitRows = [];
  for (let i = 0; i < Math.max(0, Math.min(unitCount || 0, 32)); i += 1) {
    const row = unitBase.add(i * 0x58);
    unitRows.push({
      index: i,
      idLE: readU32(row),
      idBE: readU32BE(row),
      commanderLE: readU32(row.add(0x08)),
      commanderBE: readU32BE(row.add(0x08)),
      cellLE: readU32(row.add(0x0c)),
      cellBE: readU32BE(row.add(0x0c)),
      raw: readHex(row, 0x18),
    });
  }
  return {
    gridActive126710: readU8(base.add(0x126710)),
    fieldMode126711: readU8(base.add(0x126711)),
    worldActive2a58f8: readU32(base.add(0x2a58f8)),
    focusChar3584a0: readU32(base.add(0x3584a0)),
    currentRaw11178: readS32(root.add(0x11178)),
    currentRaw11178BE: readU32BE(root.add(0x11178)),
    currentRaw1117c: readU32(root.add(0x1117c)),
    unitCount41a364: unitCount,
    unit0Id: readU32(base.add(0x41a368)),
    unit0Cell: readU32(base.add(0x41a368 + 0x0c)),
    unitRawHead: readHex(base.add(0x41a364), 0x80),
    unitRows,
    charCount36a5dc: readU32(base.add(0x36a5dc)),
    char0Id: readU32(base.add(0x36a8b4)),
    char0Flagship: readU32(base.add(0x36a8b4 + 0x24)),
    charRawHead: readHex(base.add(0x36a8b4), 0x30),
  };
}

function snapshot() {
  const base = clientBase();
  return {
    ev: 'strategy-snapshot',
    t: Date.now(),
    moduleBase: ptrHex(moduleBase),
    command: commandState(),
    selection: selectionState(),
    runtimeTables: runtimeTables(base),
    linkage: linkageState(base),
    selectionHit: selectionHitState,
    commandHit: commandHitState,
    nativeCalls: nativeCallState,
    nestedGates: nestedGateState,
    inputState: { ...rowState(INPUT_STATE), raw: readHex(INPUT_STATE, 0x180) },
    inputTickResult,
    selectGrid: selectGridState(),
    geometryForceEnabled,
    geometryTargetOnly,
    occlusionForceEnabled,
    commandTableForceEnabled,
    commandTableForceResult,
    commandTableApplyResult,
    selectGridConfirmForceEnabled,
    selectGridConfirmForcePending,
    selectGridConfirmForceResult,
    selectGridBeforeSendForceEnabled,
    selectGridBeforeSendForceResult,
    focusCellForceEnabled,
    focusCellForceResult,
  };
}

send({ ev: 'ready', moduleBase: ptrHex(moduleBase) });
rpc.exports = {
  snapshot,
  force() { return armHudMode2Force(); },
  result() { return mode2ForceResult; },
  itick() { return armInputTick(); },
  iresult() { return inputTickResult; },
  geometry() { return armGeometryForce(); },
  geometrytarget() { return armGeometryTargetForce(); },
  occlusion() { return armOcclusionForce(); },
  latch() { return armSelectionLatchForce(); },
  hit() { return armSelectionHitReturnForce(); },
  command() { return armCommandHitReturnForce(); },
  clatch() { return armCommandLatchForce(); },
  commandtable() { return armCommandTableForce(); },
  commandtableapply() { return invokeCommandTableApply(); },
  selectgridconfirm() { return armSelectGridConfirmForce(); },
  selectgridconfirmnow() { return forceSelectGridConfirmNow(); },
  selectgridbeforesend() { return armSelectGridBeforeSendForce(); },
  selectgridbeforesendresult() { return selectGridBeforeSendForceResult; },
  focuscell(value) {
    const cell = Number(value);
    if (!Number.isInteger(cell) || cell < 0 || cell >= 5000) {
      throw new Error('focus cell must be an integer in [0, 4999]');
    }
    return armFocusCellForce(cell);
  },
};
