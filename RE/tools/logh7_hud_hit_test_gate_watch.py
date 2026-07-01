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


def build_js(*, poll_ms: int = 250, max_events: int = 30000, lifecycle_only: bool = False) -> str:
    return (
        r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = __POLL_MS__;
const MAX_EVENTS = __MAX_EVENTS__;
const INCLUDE_HIT_TESTS = __INCLUDE_HIT_TESTS__;
const INCLUDE_LATCH = __INCLUDE_LATCH__;
let seq = 0;
let hitSeq = 0;
let gateWriteSamples = 0;
let activeWriteSamples = 0;
let targetGateWriteSamples = 0;
let latchLoopSamples = 0;
let layoutUpdateSamples = 0;
let eventQueueEnqueueSamples = 0;
let lastHudFrameConsumerKey = null;
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
function readBytesHex(address, length) {
  return safe(() => {
    const bytes = ptr(address).readByteArray(length);
    if (bytes === null) return null;
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }, null);
}
function stackU32(context, index) { return safe(() => context.esp.add(index * 4).readU32(), null); }
function stackPtr(context, index) { return safe(() => context.esp.add(index * 4).readPointer(), ptr('0x0')); }
function retvalLow8(retval) { return safe(() => retval.toInt32() & 0xff, null); }
function emit(tag, payload) {
  if (seq >= MAX_EVENTS) return;
  seq += 1;
  send({ tag, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {}) });
}
function eventQueueKeys(row) {
  const count = readS32(row.add(0x3f4));
  const keys = [];
  if (typeof count === 'number' && count > 0) {
    const n = Math.min(count, 0x1c);
    for (let i = 0; i < n; i += 1) keys.push(readS32(row.add(0x470 + i * 4)));
  }
  return keys;
}

const hud = abs('0x00c9e638');
const selectionList = abs('0x00c9eac4');
const commandMenu = abs('0x00c9e768');
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
  const eventKeys = eventQueueKeys(row);
  return {
    ptr: hex(row), gate04: readU8(row.add(4)), gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)), flag15: readU8(row.add(0x15)),
    visible18: readU8(row.add(0x18)), enabled1b: readU8(row.add(0x1b)),
    gateB00: readU8(row.add(0xb00)), gateB01: readU8(row.add(0xb01)), gateB02: readU8(row.add(0xb02)),
    eventQueueCount3f4: readS32(row.add(0x3f4)), eventKeys470: eventKeys,
    hasEvent2: eventKeys.indexOf(2) !== -1, hasEvent9: eventKeys.indexOf(9) !== -1,
    hasEvent0b: eventKeys.indexOf(0x0b) !== -1,
    rectX20: readS32(row.add(0x20)), rectY24: readS32(row.add(0x24)),
    rectW2c: readS32(row.add(0x2c)), rectH30: readS32(row.add(0x30)),
  };
}
function playerInfoState(value) {
  const payload = ptr(value || 0);
  return {
    ptr: hex(payload),
    count270S32: readS32(payload.add(0x270)),
    count270U8: readU8(payload.add(0x270)),
    seatKind254U8: readU8(payload.add(0x254)),
    seatChar254S32: readS32(payload.add(0x254)),
    seatRole258S32: readS32(payload.add(0x258)),
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
  const selectionRoot = readPtr(selectionList);
  if (!selectionRoot.isNull() && samePtr(target, selectionRoot)) roles.push('selection-root');
  for (const candidate of modeTargets()) {
    if (!candidate.ptr.isNull() && samePtr(target, candidate.ptr)) roles.push(candidate.role);
  }
  const selectionCount = Math.max(0, Math.min(readS32(selectionList.add(0x188 * 4)) || 0, 8));
  for (let i = 0; i < selectionCount; i += 1) {
    const primary = readPtr(selectionList.add((0x22 + i) * 4));
    const secondary = readPtr(selectionList.add((0x32 + i) * 4));
    if (!primary.isNull() && samePtr(target, primary)) roles.push('selection-primary-' + i);
    if (!secondary.isNull() && samePtr(target, secondary)) roles.push('selection-secondary-' + i);
  }
  const activeCommandRoot = readPtr(commandMenu);
  if (!activeCommandRoot.isNull() && samePtr(target, activeCommandRoot)) roles.push('command-root');
  const commandCount = Math.max(0, Math.min(readS32(commandMenu.add(0xd4 * 4)) || 0, 24));
  for (let i = 0; i < commandCount; i += 1) {
    const row = readPtr(commandMenu.add((0x0c + i) * 4));
    if (!row.isNull() && samePtr(target, row)) roles.push('command-row-' + i);
  }
  return roles;
}
function isWatchedTarget(target) {
  return targetRoles(target).length > 0;
}
function isInterestingEnqueue(eventCode, target) {
  const roles = targetRoles(target);
  return roles.length > 0 || [2, 9, 0x0b, 0x16, 0x17, 0x18, 0x22].indexOf(eventCode) !== -1;
}
function modeTargetSummary() {
  return {
    hudModeF4: readS32(hud.add(0xf4)),
    modeTargets: modeTargets().map((candidate) => ({
      role: candidate.role,
      state: uiObjectState(candidate.ptr),
    })),
  };
}
function selectionSummary() {
  const root = readPtr(selectionList);
  return {
    root: hex(root),
    rootState: uiObjectState(root),
    currentTab187: readS32(selectionList.add(0x187 * 4)),
    listCount188: readS32(selectionList.add(0x188 * 4)),
    listSelected189: readS32(selectionList.add(0x189 * 4)),
    payload: hex(readPtr(selectionList.add(0x18a * 4))),
  };
}
function commandSummary() {
  const root = readPtr(commandMenu);
  return {
    activePtr: hex(root), activeGate04: readU8(root.add(4)),
    activeGate05: readU8(root.add(5)),
    currentTabD3: readS32(commandMenu.add(0xd3 * 4)),
    rowCountD4: readS32(commandMenu.add(0xd4 * 4)),
    selectedD5: readS32(commandMenu.add(0xd5 * 4)),
    categoryD6: readS32(commandMenu.add(0xd6 * 4)),
  };
}
function currentHit() { return hitStack.length === 0 ? null : hitStack[hitStack.length - 1]; }
function install(vaText, name, callbacks) {
  try { Interceptor.attach(abs(vaText), callbacks); emit('hook-installed', { name, va: vaText }); }
  catch (error) { emit('hook-failed', { name, va: vaText, error: String(error) }); }
}

install('0x00501e30', 'eventQueueEnqueue', {
  onEnter() {
    const target = stackPtr(this.context, 2);
    const eventCode = stackU32(this.context, 1);
    const payload = stackPtr(this.context, 3);
    const roles = targetRoles(target);
    this.target = target;
    this.interesting = isInterestingEnqueue(eventCode, target) || eventQueueEnqueueSamples < 64;
    if (!this.interesting) return;
    eventQueueEnqueueSamples += 1;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)),
      eventCode,
      target: hex(target),
      targetRoles: roles,
      payload: hex(payload),
      payloadBytes34: readBytesHex(payload, 0x34),
      beforeState: uiObjectState(target),
      modeBefore: modeTargetSummary(),
      selectionBefore: selectionSummary(),
      commandBefore: commandSummary(),
      eventQueueEnqueueSamples,
    };
    emit('eventQueueEnqueue-enter-00501e30', this.info);
  },
  onLeave() {
    if (!this.info) return;
    emit('eventQueueEnqueue-leave-00501e30', {
      ...this.info,
      afterState: uiObjectState(this.target),
      modeAfter: modeTargetSummary(),
      selectionAfter: selectionSummary(),
      commandAfter: commandSummary(),
    });
  },
});
if (INCLUDE_HIT_TESTS) {
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
      targetBefore: uiObjectState(target), selectionBefore: selectionSummary(),
      commandBefore: commandSummary(), globalsBefore: inputGlobals(),
    };
    hitStack.push(this.hit);
  },
  onLeave(retval) {
    if (!this.active) return;
    const top = hitStack.pop();
    emit('inputHitTest-gate-005015f0', { ...this.hit, stackMatched: top && top.hitId === this.hit.hitId, retvalLow8: retvalLow8(retval), controllerAfter: controllerState(this.context.ecx), selectionAfter: selectionSummary(), commandAfter: commandSummary(), globalsAfter: inputGlobals() });
  },
});
install('0x00501ed0', 'eventQueueDequeue', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    const roles = targetRoles(target);
    this.target = target;
    this.interesting = roles.length > 0;
    if (!this.interesting) return;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)),
      eventCode: stackU32(this.context, 2),
      target: hex(target),
      targetRoles: roles,
      outInfo: hex(stackPtr(this.context, 3)),
      consumeFlag: stackU32(this.context, 4),
      beforeState: uiObjectState(target),
      modeBefore: modeTargetSummary(),
      selectionBefore: selectionSummary(),
      commandBefore: commandSummary(),
    };
    emit('eventQueueDequeue-enter-00501ed0', this.info);
  },
  onLeave(retval) {
    if (!this.info) return;
    emit('eventQueueDequeue-leave-00501ed0', {
      ...this.info,
      retvalLow8: retvalLow8(retval),
      afterState: uiObjectState(this.target),
      modeAfter: modeTargetSummary(),
      selectionAfter: selectionSummary(),
      commandAfter: commandSummary(),
    });
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
}
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
install('0x004fc4a0', 'hudInformationRefresh', {
  onEnter() {
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
    emit('hudInformationRefresh-enter-004fc4a0', this.info);
  },
  onLeave(retval) {
    emit('hudInformationRefresh-leave-004fc4a0', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection: selectionSummary(), afterCommand: commandSummary() });
  },
});
install('0x004f68f0', 'selectionImportApply', {
  onEnter() {
    this.selection = this.context.ecx;
    const payload = stackPtr(this.context, 1);
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.selection),
      payloadArg: hex(payload), payloadArgState: playerInfoState(payload),
      oldTab187: readS32(this.selection.add(0x187 * 4)),
      oldListCount188: readS32(this.selection.add(0x188 * 4)),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
    emit('selectionImportApply-enter-004f68f0', this.info);
  },
  onLeave(retval) {
    emit('selectionImportApply-leave-004f68f0', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection: selectionSummary(), afterCommand: commandSummary() });
  },
});
install('0x004f6680', 'selectionTabApply', {
  onEnter() {
    this.selection = this.context.ecx;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.selection),
      requestedTab: stackU32(this.context, 1),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
    emit('selectionTabApply-enter-004f6680', this.info);
  },
  onLeave(retval) {
    emit('selectionTabApply-leave-004f6680', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection: selectionSummary(), afterCommand: commandSummary() });
  },
});
install('0x004f59e0', 'commandTabApply', {
  onEnter() {
    this.command = this.context.ecx;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.command),
      requestedTab: stackU32(this.context, 1),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
    emit('commandTabApply-enter-004f59e0', this.info);
  },
  onLeave(retval) {
    emit('commandTabApply-leave-004f59e0', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection: selectionSummary(), afterCommand: commandSummary() });
  },
});
install('0x004fd7a0', 'hudModeSet', {
  onEnter() {
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      requestedMode: stackU32(this.context, 1), pushHistory: stackU32(this.context, 2),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
    emit('hudModeSet-enter-004fd7a0', this.info);
  },
  onLeave(retval) {
    emit('hudModeSet-leave-004fd7a0', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection: selectionSummary(), afterCommand: commandSummary() });
  },
});
install('0x004fd100', 'hudFrameConsumer', {
  onEnter() {
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      beforeSelection: selectionSummary(), beforeCommand: commandSummary(),
    };
  },
  onLeave(retval) {
    const afterSelection = selectionSummary();
    const afterCommand = commandSummary();
    const state = {
      selectionTab: afterSelection.currentTab187,
      selectionCount: afterSelection.listCount188,
      selectionSelected: afterSelection.listSelected189,
      selectionGate04: afterSelection.rootState && afterSelection.rootState.gate04,
      selectionGate05: afterSelection.rootState && afterSelection.rootState.gate05,
      commandGate04: afterCommand.activeGate04,
      commandGate05: afterCommand.activeGate05,
      commandCount: afterCommand.rowCountD4,
      commandSelected: afterCommand.selectedD5,
      commandCategory: afterCommand.categoryD6,
    };
    const key = JSON.stringify(state);
    if (key === lastHudFrameConsumerKey) return;
    lastHudFrameConsumerKey = key;
    emit('hudFrameConsumer-change-004fd100', { ...this.info, retvalLow8: retvalLow8(retval), afterSelection, afterCommand, state });
  },
});
install('0x00502ea0', 'activeGateWrite', {
  onEnter() {
    const target = this.context.ecx;
    const roles = targetRoles(target);
    const interesting = roles.length > 0 || activeWriteSamples < 96;
    if (!interesting) return;
    activeWriteSamples += 1;
    this.target = target;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), target: hex(target), targetRoles: roles,
      value: stackU32(this.context, 1), beforeState: uiObjectState(target),
      selectionBefore: selectionSummary(), commandBefore: commandSummary(),
      activeWriteSamples,
    };
    emit('activeGateWrite-enter-00502ea0', this.info);
  },
  onLeave() {
    if (!this.info) return;
    emit('activeGateWrite-leave-00502ea0', { ...this.info, afterState: uiObjectState(this.target), selectionAfter: selectionSummary(), commandAfter: commandSummary() });
  },
});
install('0x005024e0', 'targetGate15Write', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    const roles = targetRoles(target);
    const interesting = isWatchedTarget(target) || targetGateWriteSamples < 96;
    if (!interesting) return;
    targetGateWriteSamples += 1;
    this.target = target;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), target: hex(target), targetRoles: roles,
      value: stackU32(this.context, 2), beforeState: uiObjectState(target),
      selectionBefore: selectionSummary(), commandBefore: commandSummary(),
      targetGateWriteSamples,
    };
    emit('targetGate15Write-enter-005024e0', this.info);
  },
  onLeave() {
    if (!this.info) return;
    emit('targetGate15Write-leave-005024e0', { ...this.info, afterState: uiObjectState(this.target), selectionAfter: selectionSummary(), commandAfter: commandSummary() });
  },
});
install('0x00506280', 'layoutOpenUpdate', {
  onEnter() {
    const target = this.context.ecx;
    const roles = targetRoles(target);
    const interesting = roles.length > 0 || layoutUpdateSamples < 128;
    if (!interesting) return;
    layoutUpdateSamples += 1;
    this.target = target;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(target),
      targetRoles: roles, beforeState: uiObjectState(target),
      selectionBefore: selectionSummary(), commandBefore: commandSummary(),
      layoutUpdateSamples,
    };
    emit('layoutOpenUpdate-enter-00506280', this.info);
  },
  onLeave(retval) {
    if (!this.info) return;
    emit('layoutOpenUpdate-leave-00506280', { ...this.info, retvalLow8: retvalLow8(retval), afterState: uiObjectState(this.target), selectionAfter: selectionSummary(), commandAfter: commandSummary() });
  },
});
if (INCLUDE_LATCH) {
install('0x00507f20', 'interactionLatchLoop', {
  onEnter() {
    const target = stackPtr(this.context, 1);
    const roles = targetRoles(target);
    const interesting = roles.length > 0 || latchLoopSamples < 256;
    if (!interesting) return;
    latchLoopSamples += 1;
    this.target = target;
    this.info = {
      returnVa: gh(stackPtr(this.context, 0)), thisEcx: hex(this.context.ecx),
      controllerBefore: controllerState(this.context.ecx),
      target: hex(target), targetRoles: roles, targetBefore: uiObjectState(target),
      selectionBefore: selectionSummary(), commandBefore: commandSummary(),
      globalsBefore: inputGlobals(), latchLoopSamples,
    };
    emit('interactionLatchLoop-enter-00507f20', this.info);
  },
  onLeave() {
    if (!this.info) return;
    emit('interactionLatchLoop-leave-00507f20', { ...this.info, controllerAfter: controllerState(this.context.ecx), targetAfter: uiObjectState(this.target), selectionAfter: selectionSummary(), commandAfter: commandSummary(), globalsAfter: inputGlobals() });
  },
});
}

const readyMode = modeTargetSummary();
emit('watch-ready', {
  pollMs: POLL_MS,
  globals: inputGlobals(),
  mode: readyMode,
  modeTargets: readyMode.modeTargets,
  selection: selectionSummary(),
  command: commandSummary(),
});
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
        .replace("__MAX_EVENTS__", str(max(1, int(max_events))))
        .replace("__INCLUDE_HIT_TESTS__", "false" if lifecycle_only else "true")
        .replace("__INCLUDE_LATCH__", "false" if lifecycle_only else "true")
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
            script = session.create_script(
                build_js(poll_ms=args.poll_ms, max_events=args.max_events, lifecycle_only=args.lifecycle_only)
            )
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
    parser.add_argument("--max-events", type=int, default=30000)
    parser.add_argument(
        "--lifecycle-only",
        action="store_true",
        help="skip noisy hit-test/latch hooks; keep import/tab/root writer hooks for long early attaches",
    )
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
