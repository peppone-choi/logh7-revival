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

const CONST_MSG_LOOKUP = abs('0x00522010');
const CONST_MSG_LOOKUP_RING_LIMIT = 128;
const constMsgLookupState = { totalMatchedCalls: 0, ring: [] };

// constmsg 실조회만 수집하며 클라이언트 메모리는 변경하지 않는다.
Interceptor.attach(CONST_MSG_LOOKUP, {
  onEnter(args) {
    const group = safe(() => args[0].toInt32());
    const subId = safe(() => args[1].toInt32());
    this.constMsgLookupEntry = null;
    if (group !== 0x62 && group !== 0x67) return;
    const entry = {
      group,
      subId,
      callerVa: safe(() => ptr(this.returnAddress).sub(moduleBase).add(IMAGE_BASE).toString()),
      timestamp: Date.now(),
      returnPtr: null,
      returnRawHex: null,
    };
    constMsgLookupState.totalMatchedCalls += 1;
    constMsgLookupState.ring.push(entry);
    if (constMsgLookupState.ring.length > CONST_MSG_LOOKUP_RING_LIMIT) {
      constMsgLookupState.ring.shift();
    }
    this.constMsgLookupEntry = entry;
  },
  onLeave(retval) {
    const entry = this.constMsgLookupEntry;
    if (entry === null) return;
    entry.returnPtr = ptrHex(retval);
    entry.returnRawHex = readHex(retval, 64);
  },
});

const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([
  0x031d,
  0x031f,
  0x0321,
  0x0f03,
]);
const SYSTEM_DETAIL_RING_LIMIT = 128;
const SYSTEM_DETAIL_STATIC_CAP = 350;
const SYSTEM_DETAIL_STATIC_STRIDE = 0x250;
const SYSTEM_DETAIL_EXPECTED_BASE_ID = 70;
const systemDetailHookCallbacks = new Map();
const systemDetailProtocolState = {
  onrecv: [],
  dispatch: [],
  totalOnRecv: 0,
  totalDispatch: 0,
};
const systemDetailLookupState = {
  base031f: { totalCalls: 0, ring: [] },
  institution0321: { totalCalls: 0, ring: [] },
};
const systemDetailPanelState = { totalCalls: 0, ring: [] };
const systemDetailSelectionIndexState = {
  totalCalls: 0,
  validCalls: 0,
  inRangeCalls: 0,
  selectionChangedCalls: 0,
  infoPanelCandidateCalls: 0,
  infoPanelSelectionChangedCalls: 0,
  ring: [],
};
const SYSTEM_OUTPUT_STAGE_NAMES = [
  'commandCard0305',
  'factoryGrant',
  'factorySelected',
  'factoryHandler',
  'selectDialogCtor',
  'selectDialogTick',
  'genericListRow70',
  'selector',
  'refresh031f',
  'refresh0327',
  'panelDispatch',
  'renderSink',
];
const SYSTEM_OUTPUT_DEPENDENCY_STAGE_NAMES = [
  'wire031f',
  'cache031f',
  'response031f',
  'response0327',
];
const SYSTEM_OUTPUT_ID_STAGE_NAMES = new Set([
  'genericListRow70',
  'selector',
  'refresh031f',
  'refresh0327',
  'response031f',
  'response0327',
  'panelDispatch',
  'renderSink',
]);
const SYSTEM_OUTPUT_PROTOCOL_CODES = new Set([0x0305, 0x031f, 0x0321, 0x0327]);
// 정적 RE로 고정된 유효 factory 3종(핸드오프 2026-07-13). 0x41은 whitelist 밖 — 필수 조건 아님, 관측만.
const SYSTEM_OUTPUT_WHITELIST_FACTORIES = [0x19, 0x2d, 0x43];
const SYSTEM_OUTPUT_WHITELIST_FACTORY_SET = new Set(SYSTEM_OUTPUT_WHITELIST_FACTORIES);
// factory handler 진입 주소(Ghidra 이름 → 이미지 base 상대 VA). 함수 경계 훅 전용.
const SYSTEM_OUTPUT_HANDLER_ADDRESSES = {
  0x19: '0x0058ba40', // FUN_0058ba40, panel kind 5
  0x2d: '0x00582060', // FUN_00582060, panel kind 5, B71 대상(星系グリッド内の惑星間を移動)
  0x43: '0x00585150', // FUN_00585150, panel kind 0x11
};
const SYSTEM_OUTPUT_B71_FACTORY_ID = 0x2d;
const SYSTEM_OUTPUT_TRACE_RING_LIMIT = 128;
const SYSTEM_OUTPUT_STAGE_RING_LIMIT = 16;
const SYSTEM_OUTPUT_SINK_RING_LIMIT = 32;
const SYSTEM_OUTPUT_BACKTRACE_LIMIT = 12;
const SYSTEM_OUTPUT_COMMAND_CATEGORY_CAP = 300;
const SYSTEM_OUTPUT_FACTORY_CAP = 24;
const systemOutputTraceState = {
  counts: {
    wire031f: 0,
    cache031f: 0,
    response031f: 0,
    response0327: 0,
    commandCard0305: 0,
    factoryGrant: 0,
    factorySelected: 0,
    factoryHandler: 0,
    selectDialogCtor: 0,
    selectDialogTick: 0,
    genericListRow70: 0,
    selector: 0,
    refresh031f: 0,
    refresh0327: 0,
    panelDispatch: 0,
    renderSink: 0,
  },
  last: {
    wire031f: null,
    cache031f: null,
    response031f: null,
    response0327: null,
    commandCard0305: null,
    factoryGrant: null,
    factorySelected: null,
    factoryHandler: null,
    selectDialogCtor: null,
    selectDialogTick: null,
    genericListRow70: null,
    selector: null,
    refresh031f: null,
    refresh0327: null,
    panelDispatch: null,
    renderSink: null,
  },
  byStage: {
    wire031f: [],
    cache031f: [],
    response031f: [],
    response0327: [],
    commandCard0305: [],
    factoryGrant: [],
    factorySelected: [],
    factoryHandler: [],
    selectDialogCtor: [],
    selectDialogTick: [],
    genericListRow70: [],
    selector: [],
    refresh031f: [],
    refresh0327: [],
    panelDispatch: [],
    renderSink: [],
  },
  timeline: [],
  sinkTimeline: [],
  sequence: 0,
  // whitelist 밖 0x41 관측 기록(판정 비게이팅). 관측되면 true로만 남긴다.
  observations: {
    factory41InGrant: false,
    factory41Selected: false,
    factory41Handler: false,
  },
  transitions: {
    dispatch0305: { totalCalls: 0, last: null, ring: [] },
    commandCardImport: { totalCalls: 0, last: null, ring: [] },
    commandRowHit: { totalCalls: 0, last: null, ring: [] },
    factoryLaunch: { totalCalls: 0, last: null, ring: [] },
    panelSetter: { totalCalls: 0, last: null, ring: [] },
    kind5Builder: { totalCalls: 0, last: null, ring: [] },
  },
  responses: {
    response0305: { onrecvCalls: 0, dispatchCalls: 0, lastOnRecv: null, lastDispatch: null },
    response031f: { onrecvCalls: 0, dispatchCalls: 0, lastOnRecv: null, lastDispatch: null },
    response0321: { onrecvCalls: 0, dispatchCalls: 0, lastOnRecv: null, lastDispatch: null },
    response0327: { onrecvCalls: 0, dispatchCalls: 0, lastOnRecv: null, lastDispatch: null },
  },
};
let systemOutputLastDialogTickKey = null;

function noteSystemOutputStage(stage, entry) {
  systemOutputTraceState.sequence += 1;
  const sequenced = {
    ...entry,
    stage,
    sequence: systemOutputTraceState.sequence,
  };
  systemOutputTraceState.counts[stage] += 1;
  systemOutputTraceState.last[stage] = sequenced;
  systemOutputTraceState.byStage[stage].push(sequenced);
  if (systemOutputTraceState.byStage[stage].length > SYSTEM_OUTPUT_STAGE_RING_LIMIT) {
    systemOutputTraceState.byStage[stage].shift();
  }
  systemOutputTraceState.timeline.push(sequenced);
  if (systemOutputTraceState.timeline.length > SYSTEM_OUTPUT_TRACE_RING_LIMIT) {
    systemOutputTraceState.timeline.shift();
  }
  if (stage === 'panelDispatch' || stage === 'renderSink') {
    systemOutputTraceState.sinkTimeline.push(sequenced);
    if (systemOutputTraceState.sinkTimeline.length > SYSTEM_OUTPUT_SINK_RING_LIMIT) {
      systemOutputTraceState.sinkTimeline.shift();
    }
  }
  return sequenced;
}

function noteSystemOutputTransition(name, entry) {
  const transition = systemOutputTraceState.transitions[name];
  transition.totalCalls += 1;
  transition.last = entry;
  transition.ring.push(entry);
  if (transition.ring.length > SYSTEM_OUTPUT_SINK_RING_LIMIT) transition.ring.shift();
}

function systemOutputImageVa(address) {
  return safe(() => {
    const value = ptr(address);
    const moduleEnd = moduleBase.add(module.size);
    if (value.compare(moduleBase) < 0 || value.compare(moduleEnd) >= 0) return value.toString();
    return value.sub(moduleBase).add(IMAGE_BASE).toString();
  });
}

function systemOutputBacktrace(context) {
  try {
    return Thread.backtrace(context, Backtracer.ACCURATE)
      .slice(0, SYSTEM_OUTPUT_BACKTRACE_LIMIT)
      .map((address) => systemOutputImageVa(address));
  } catch (_error) {
    return [];
  }
}

function systemOutputResponseState(code) {
  if (code === 0x0305) return systemOutputTraceState.responses.response0305;
  if (code === 0x031f) return systemOutputTraceState.responses.response031f;
  if (code === 0x0321) return systemOutputTraceState.responses.response0321;
  if (code === 0x0327) return systemOutputTraceState.responses.response0327;
  return null;
}

function noteSystemOutputResponse(boundary, code, entry) {
  const state = systemOutputResponseState(code);
  if (!state) return;
  if (boundary === 'onrecv') {
    state.onrecvCalls += 1;
    state.lastOnRecv = entry;
  } else {
    state.dispatchCalls += 1;
    state.lastDispatch = entry;
  }
}

function systemOutputResponseRecord(code, record) {
  if (!record || record.isNull()) return { baseIds: [], baseId: null };
  if (code === 0x0305) return { baseIds: [], baseId: null };
  if (code === 0x031f || code === 0x0321) {
    const count = readU8(record);
    const stride = code === 0x031f ? 0x180 : 0x2378;
    const baseIds = [];
    if (Number.isInteger(count)) {
      for (let index = 0; index < Math.min(count, 4); index += 1) {
        baseIds.push(readU32(record.add(4 + index * stride)));
      }
    }
    return { count, baseIds, baseId: null };
  }
  if (code === 0x0327) {
    const baseId = readU32(record);
    return { baseIds: Number.isInteger(baseId) ? [baseId] : [], baseId };
  }
  return { baseIds: [], baseId: null };
}

function systemOutputCommandCardData(rawCategoryCount, readCommandCount, readFactoryId) {
  const emptyWhitelistGranted = () => {
    const granted = {};
    for (const fid of SYSTEM_OUTPUT_WHITELIST_FACTORIES) granted[fid] = false;
    return granted;
  };
  const failure = (reason, details = {}) => ({
    rawCategoryCount,
    categories: [],
    factoryIds: [],
    whitelistGranted: emptyWhitelistGranted(),
    factory2dGranted: false,
    factory41Observed: false,
    reason,
    ...details,
  });
  if (!Number.isInteger(rawCategoryCount)) return failure('category-count-unreadable');
  if (rawCategoryCount < 0 || rawCategoryCount > SYSTEM_OUTPUT_COMMAND_CATEGORY_CAP) {
    return failure('category-count-exceeds-cap');
  }

  const categories = [];
  const factoryIds = [];
  for (let category = 0; category < rawCategoryCount; category += 1) {
    const rawCount = readCommandCount(category);
    if (!Number.isInteger(rawCount)) {
      return failure('factory-count-unreadable', { invalidCategory: category });
    }
    if (rawCount < 0 || rawCount > SYSTEM_OUTPUT_FACTORY_CAP) {
      return failure('factory-count-exceeds-cap', {
        invalidCategory: category,
        invalidFactoryCount: rawCount,
      });
    }

    const factories = [];
    for (let index = 0; index < rawCount; index += 1) {
      const factoryId = readFactoryId(category, index);
      if (!Number.isInteger(factoryId)) {
        return failure('factory-id-unreadable', {
          invalidCategory: category,
          invalidFactoryIndex: index,
        });
      }
      factories.push(factoryId);
      if (!factoryIds.includes(factoryId)) factoryIds.push(factoryId);
    }
    categories.push({
      category,
      rawCount,
      boundedCount: rawCount,
      truncated: false,
      factoryIds: factories,
    });
  }
  const whitelistGranted = {};
  for (const fid of SYSTEM_OUTPUT_WHITELIST_FACTORIES) whitelistGranted[fid] = factoryIds.includes(fid);
  return {
    rawCategoryCount,
    categories,
    factoryIds,
    whitelistGranted,
    factory2dGranted: factoryIds.includes(SYSTEM_OUTPUT_B71_FACTORY_ID),
    factory41Observed: factoryIds.includes(0x41),
    reason: null,
  };
}

function systemOutputCommandCardSnapshot() {
  const base = clientBase();
  if (!base || base.isNull()) {
    return {
      clientBase: null,
      table: null,
      rawCategoryCount: null,
      categories: [],
      factoryIds: [],
      whitelistGranted: (() => {
        const granted = {};
        for (const fid of SYSTEM_OUTPUT_WHITELIST_FACTORIES) granted[fid] = false;
        return granted;
      })(),
      factory2dGranted: false,
      factory41Observed: false,
      reason: 'client-base-unavailable',
    };
  }
  const table = base.add(0x3416d8);
  const rawCategoryCount = readU32(table.add(8));
  const data = systemOutputCommandCardData(
    rawCategoryCount,
    (category) => readU8(table.add(category * 0x46 + 0x1e)),
    (category, index) => readU16(table.add(category * 0x46 + 0x20 + index * 2)),
  );
  return {
    clientBase: ptrHex(base),
    table: ptrHex(table),
    guard00: readU8(table),
    ...data,
  };
}

function systemOutputSelectionRecord(list, index) {
  if (!list || list.isNull() || !Number.isInteger(index) || index < 0) return ptr('0x0');
  const itemCount = readS32(list.add(0x8e4));
  if (!Number.isInteger(itemCount) || index >= itemCount) return ptr('0x0');
  const sentinel = readPtr(list.add(0x8e0));
  if (sentinel.isNull()) return ptr('0x0');
  let node = readPtr(sentinel);
  for (let current = 0; current < Math.min(itemCount, SYSTEM_OUTPUT_TRACE_RING_LIMIT); current += 1) {
    if (node.isNull() || node.equals(sentinel)) return ptr('0x0');
    if (current === index) return node.add(8);
    node = readPtr(node);
  }
  return ptr('0x0');
}

function systemOutputLastLookup(state, baseId) {
  for (let index = state.ring.length - 1; index >= 0; index -= 1) {
    const entry = state.ring[index];
    if (entry.arg0 === baseId) return entry;
  }
  return null;
}

function systemOutputCacheJoin(baseId) {
  const base = clientBase();
  const baseAvailable = Boolean(base && !base.isNull());
  const source031f = boundedIdTableSnapshot(base, 0x3facf4, 0x3facf8, 0x180, 4);
  const source0321 = boundedIdTableSnapshot(base, 0x3fb2f8, 0x3fb2fc, 0x2378, 4);
  const warehouse0327BaseId = baseAvailable ? readU32(base.add(0x3e098c)) : null;
  const baseLookup = systemOutputLastLookup(systemDetailLookupState.base031f, baseId);
  const institutionLookup = systemOutputLastLookup(systemDetailLookupState.institution0321, baseId);
  return {
    directDependencies: {
      response031f: {
        cacheContainsId: source031f.ids.includes(baseId),
        lookupObserved: Boolean(baseLookup),
        lookupFound: baseLookup ? baseLookup.found === true : null,
      },
      response0327: {
        warehouseBaseId: warehouse0327BaseId,
        cacheMatchesId: warehouse0327BaseId === baseId,
      },
    },
    parallelDependency: {
      response0321: {
        cacheContainsId: source0321.ids.includes(baseId),
        lookupObserved: Boolean(institutionLookup),
        lookupFound: institutionLookup ? institutionLookup.found === true : null,
      },
    },
    lookupCausality: 'observational-only-idle-lookups-not-click-causal',
  };
}

function systemOutputStageMatches(stage, entry) {
  if (SYSTEM_OUTPUT_ID_STAGE_NAMES.has(stage)) {
    return entry.baseId === SYSTEM_DETAIL_EXPECTED_BASE_ID;
  }
  if (stage === 'factoryGrant'
      || stage === 'factorySelected'
      || stage === 'factoryHandler') {
    return SYSTEM_OUTPUT_WHITELIST_FACTORY_SET.has(entry.factoryId);
  }
  return true;
}

function systemOutputCorrelation() {
  const ordered = [];
  const orderedByStage = {};
  let previousSequence = 0;
  let previousTimestamp = 0;
  let firstMissingStage = null;
  for (const stage of SYSTEM_OUTPUT_STAGE_NAMES) {
    const candidate = systemOutputTraceState.byStage[stage].find((entry) => (
      entry.sequence > previousSequence
      && entry.timestamp >= previousTimestamp
      && systemOutputStageMatches(stage, entry)
    ));
    if (!candidate) {
      firstMissingStage = stage;
      break;
    }
    ordered.push(candidate);
    orderedByStage[stage] = candidate;
    previousSequence = candidate.sequence;
    previousTimestamp = candidate.timestamp;
  }
  const responseDispatchTimeline = [];
  for (const [requestStage, responseStage] of [
    ['refresh031f', 'response031f'],
    ['refresh0327', 'response0327'],
  ]) {
    const requestEntry = orderedByStage[requestStage];
    const responseEntry = requestEntry
      ? systemOutputTraceState.byStage[responseStage].find((entry) => (
        entry.sequence > requestEntry.sequence && systemOutputStageMatches(responseStage, entry)
      ))
      : null;
    if (responseEntry) responseDispatchTimeline.push(responseEntry);
    if (firstMissingStage === null && !responseEntry) firstMissingStage = responseStage;
  }
  const missingStages = SYSTEM_OUTPUT_STAGE_NAMES.filter(
    (stage) => systemOutputTraceState.counts[stage] === 0,
  );
  for (const responseStage of ['response031f', 'response0327']) {
    if (!responseDispatchTimeline.some((entry) => entry.stage === responseStage)) {
      missingStages.push(responseStage);
    }
  }
  const completeTimeline = [...ordered, ...responseDispatchTimeline]
    .sort((left, right) => left.sequence - right.sequence);
  return {
    orderedId70Complete: firstMissingStage === null,
    firstMissingStage,
    missingStages,
    orderedStages: completeTimeline.map((entry) => entry.stage),
    orderedTimeline: completeTimeline,
    responseDispatchTimeline,
  };
}

// B71 자연 출력 판정: Captain kind 59 → factory 0x2d → handler FUN_00582060 → kind 5 →
// selected +8 == base 70 → phase0(031e/031f) → phase1(0326/0327) → renderer(0057aa90).
function systemOutputB71Verdict() {
  const grantEntries = systemOutputTraceState.byStage.factoryGrant;
  const handlerEntries = systemOutputTraceState.byStage.factoryHandler;
  const selectedEntries = systemOutputTraceState.byStage.factorySelected;
  const factory2dGranted = grantEntries.some((entry) => entry.factoryId === SYSTEM_OUTPUT_B71_FACTORY_ID);
  const factory2dSelected = selectedEntries.some((entry) => entry.factoryId === SYSTEM_OUTPUT_B71_FACTORY_ID);
  const handler2dEntered = handlerEntries.some((entry) => entry.factoryId === SYSTEM_OUTPUT_B71_FACTORY_ID);
  // panel kind 5: renderSink 또는 panelDispatch 어느 쪽이든 kind 5 관측.
  const panelKind5 = systemOutputTraceState.byStage.renderSink.some((entry) => entry.panelKind === 5)
    || systemOutputTraceState.byStage.panelDispatch.some((entry) => entry.panelKind === 5);
  const renderLast = systemOutputTraceState.last.renderSink;
  const selectedBaseId = renderLast && Number.isInteger(renderLast.baseId) ? renderLast.baseId : null;
  const phase0Seen = systemOutputTraceState.counts.refresh031f > 0
    && systemOutputTraceState.counts.response031f > 0;
  const phase1Seen = systemOutputTraceState.counts.refresh0327 > 0
    && systemOutputTraceState.counts.response0327 > 0;
  const rendererCalled = systemOutputTraceState.counts.renderSink > 0;
  const pass = factory2dGranted
    && handler2dEntered
    && panelKind5
    && selectedBaseId === SYSTEM_DETAIL_EXPECTED_BASE_ID
    && phase0Seen
    && phase1Seen
    && rendererCalled;
  return {
    targetFactoryId: SYSTEM_OUTPUT_B71_FACTORY_ID,
    targetBaseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
    factory2dGranted,
    factory2dSelected,
    handler2dEntered,
    panelKind5,
    selectedBaseId,
    phase0Seen,
    phase1Seen,
    rendererCalled,
    pass,
    factory41Observations: systemOutputTraceState.observations,
  };
}

function systemOutputTraceSnapshot() {
  const correlation = systemOutputCorrelation();
  const response0305 = systemOutputTraceState.responses.response0305;
  const response031f = systemOutputTraceState.responses.response031f;
  const response0321 = systemOutputTraceState.responses.response0321;
  const response0327 = systemOutputTraceState.responses.response0327;
  return {
    expectedBaseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
    whitelistFactories: SYSTEM_OUTPUT_WHITELIST_FACTORIES,
    b71Verdict: systemOutputB71Verdict(),
    stageOrder: SYSTEM_OUTPUT_STAGE_NAMES,
    dependencyStages: SYSTEM_OUTPUT_DEPENDENCY_STAGE_NAMES,
    sequence: systemOutputTraceState.sequence,
    counts: systemOutputTraceState.counts,
    last: systemOutputTraceState.last,
    byStage: systemOutputTraceState.byStage,
    timeline: systemOutputTraceState.timeline,
    sinkTimeline: systemOutputTraceState.sinkTimeline,
    transitions: systemOutputTraceState.transitions,
    correlation,
    commandCard0305: {
      response: response0305,
      runtime: systemOutputCommandCardSnapshot(),
    },
    directDependencies: {
      response031f,
      response0327,
    },
    parallelDependency: {
      response0321,
    },
    missingRequiredResponse0327: !correlation.responseDispatchTimeline.some(
      (entry) => entry.stage === 'response0327',
    ),
    panelStateMachineWaitsFor0327Ack: false,
  };
}

function pushSystemDetailRing(ring, entry) {
  ring.push(entry);
  if (ring.length > SYSTEM_DETAIL_RING_LIMIT) ring.shift();
}

function systemDetailCodeHex(code) {
  return `0x${code.toString(16).padStart(4, '0')}`;
}

function systemDetailCallerVa(returnAddress) {
  return safe(() => ptr(returnAddress).sub(moduleBase).add(IMAGE_BASE).toString());
}

function attachSystemDetailHook(va, callbacks) {
  const existingCallbacks = systemDetailHookCallbacks.get(va);
  if (existingCallbacks) {
    existingCallbacks.push(callbacks);
    return true;
  }
  const callbackGroup = [callbacks];
  systemDetailHookCallbacks.set(va, callbackGroup);
  Interceptor.attach(abs(va), {
    onEnter(args) {
      this.systemDetailCallbackStates = callbackGroup.map((callback) => {
        const state = {
          context: this.context,
          returnAddress: this.returnAddress,
        };
        if (callback.onEnter) callback.onEnter.call(state, args);
        return { callback, state };
      });
    },
    onLeave(retval) {
      for (const item of this.systemDetailCallbackStates || []) {
        if (!item.callback.onLeave) continue;
        item.state.context = this.context;
        item.state.returnAddress = this.returnAddress;
        item.callback.onLeave.call(item.state, retval);
      }
    },
  });
  return true;
}

attachSystemDetailHook('0x004ae0d0', {
  onEnter(args) {
    const code = safe(() => args[0].toInt32() & 0xffff);
    if (!SYSTEM_DETAIL_PROTOCOL_CODES.has(code) && !SYSTEM_OUTPUT_PROTOCOL_CODES.has(code)) return;
    const entry = {
      code,
      codeHex: systemDetailCodeHex(code),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      client: ptrHex(this.context.ecx),
      payload: ptrHex(args[2]),
    };
    if (SYSTEM_DETAIL_PROTOCOL_CODES.has(code)) {
      systemDetailProtocolState.totalOnRecv += 1;
      pushSystemDetailRing(systemDetailProtocolState.onrecv, entry);
    }
    if (SYSTEM_OUTPUT_PROTOCOL_CODES.has(code)) {
      noteSystemOutputResponse('onrecv', code, entry);
    }
  },
});

attachSystemDetailHook('0x004ba2b0', {
  onEnter(args) {
    const code = safe(() => args[0].toInt32() & 0xffff);
    if (!SYSTEM_DETAIL_PROTOCOL_CODES.has(code) && !SYSTEM_OUTPUT_PROTOCOL_CODES.has(code)) return;
    const client = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const record = safe(() => ptr(args[1]), ptr('0x0'));
    const recordData = systemOutputResponseRecord(code, record);
    const entry = {
      code,
      codeHex: systemDetailCodeHex(code),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      client: ptrHex(client),
      record: ptrHex(record),
      recordData,
    };
    if (SYSTEM_DETAIL_PROTOCOL_CODES.has(code)) {
      systemDetailProtocolState.totalDispatch += 1;
      pushSystemDetailRing(systemDetailProtocolState.dispatch, entry);
    }
    if (SYSTEM_OUTPUT_PROTOCOL_CODES.has(code)) {
      noteSystemOutputResponse('dispatch', code, entry);
    }
    if (code === 0x0305) {
      const commandCardEntry = {
        ...entry,
        direction: 'response',
        boundary: 'dispatcher-entry',
        runtimeBeforeImport: systemOutputCommandCardSnapshot(),
      };
      noteSystemOutputTransition('dispatch0305', commandCardEntry);
      noteSystemOutputStage('commandCard0305', commandCardEntry);
    }
    if (code === 0x031f && recordData.baseIds.includes(SYSTEM_DETAIL_EXPECTED_BASE_ID)) {
      const responseEntry = {
        ...entry,
        baseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
        direction: 'response',
      };
      noteSystemOutputStage('wire031f', responseEntry);
      noteSystemOutputStage('response031f', responseEntry);
    }
    if (code === 0x0327 && recordData.baseIds.includes(SYSTEM_DETAIL_EXPECTED_BASE_ID)) {
      noteSystemOutputStage('response0327', {
        ...entry,
        baseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
        direction: 'response',
      });
    }
    this.systemOutputDispatchCode = code;
    this.systemOutputDispatchClient = client;
  },
  onLeave() {
    if (this.systemOutputDispatchCode !== 0x031f) return;
    const client = this.systemOutputDispatchClient;
    const cache = boundedIdTableSnapshot(client, 0x3facf4, 0x3facf8, 0x180, 4);
    if (!cache.ids.includes(SYSTEM_DETAIL_EXPECTED_BASE_ID)) return;
    noteSystemOutputStage('cache031f', {
      timestamp: Date.now(),
      baseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
      client: ptrHex(client),
      cache,
    });
  },
});

function boundedIdTableSnapshot(base, countOffset, idsOffset, stride, cap) {
  const countAddress = base && !base.isNull() ? base.add(countOffset) : ptr('0x0');
  const idsAddress = base && !base.isNull() ? base.add(idsOffset) : ptr('0x0');
  if (countAddress.isNull() || idsAddress.isNull()) {
    return {
      countAddress: null,
      idsAddress: null,
      rawCount: null,
      boundedCount: 0,
      cap,
      stride,
      truncated: false,
      ids: [],
      reason: 'client-base-unavailable',
    };
  }
  const rawCount = readU8(countAddress);
  if (!Number.isInteger(rawCount)) {
    return {
      countAddress: ptrHex(countAddress),
      idsAddress: ptrHex(idsAddress),
      rawCount: null,
      boundedCount: 0,
      cap,
      stride,
      truncated: false,
      ids: [],
      reason: 'count-unreadable',
    };
  }
  const boundedCount = Math.min(rawCount, cap);
  const ids = [];
  let reason = rawCount > cap ? 'count-exceeds-cap' : null;
  for (let index = 0; index < boundedCount; index += 1) {
    const id = readU32(idsAddress.add(index * stride));
    ids.push(id);
    if (id === null && reason === null) reason = 'id-unreadable';
  }
  return {
    countAddress: ptrHex(countAddress),
    idsAddress: ptrHex(idsAddress),
    rawCount,
    boundedCount,
    cap,
    stride,
    truncated: rawCount > cap,
    ids,
    reason,
  };
}

function staticBaseCacheSnapshot(base) {
  if (!base || base.isNull()) {
    return {
      idsAddress: null,
      tableAddress: null,
      cap: SYSTEM_DETAIL_STATIC_CAP,
      stride: SYSTEM_DETAIL_STATIC_STRIDE,
      importedIds: [],
      activeIds: [],
      entries: [],
      reason: 'client-base-unavailable',
    };
  }
  const idsAddress = base.add(0x2eb288);
  const tableAddress = base.add(0x2eb800);
  const importedIds = [];
  const activeIds = [];
  const entries = [];
  let reason = null;
  for (let index = 0; index < SYSTEM_DETAIL_STATIC_CAP; index += 1) {
    const id = readU32(idsAddress.add(index * 4));
    const active = readU8(tableAddress.add(index * SYSTEM_DETAIL_STATIC_STRIDE));
    if (id === null || active === null) {
      reason = 'entry-unreadable';
      break;
    }
    if (id !== 0) importedIds.push(id);
    if (active !== 0 && id !== 0) activeIds.push(id);
    if (id !== 0 || active !== 0) entries.push({ index, id, active });
  }
  return {
    idsAddress: ptrHex(idsAddress),
    tableAddress: ptrHex(tableAddress),
    cap: SYSTEM_DETAIL_STATIC_CAP,
    stride: SYSTEM_DETAIL_STATIC_STRIDE,
    importedIds,
    activeIds,
    entries,
    reason,
  };
}

function attachSystemDetailLookup(va, state) {
  attachSystemDetailHook(va, {
    onEnter(args) {
      const entry = {
        arg0: safe(() => args[0].toInt32()),
        callerVa: systemDetailCallerVa(this.returnAddress),
        timestamp: Date.now(),
        client: ptrHex(this.context.ecx),
        retval: null,
      };
      state.totalCalls += 1;
      pushSystemDetailRing(state.ring, entry);
      this.systemDetailLookupEntry = entry;
    },
    onLeave(retval) {
      const entry = this.systemDetailLookupEntry;
      if (!entry) return;
      entry.retval = ptrHex(retval);
      entry.found = !retval.isNull();
    },
  });
}

attachSystemDetailLookup('0x004c5470', systemDetailLookupState.base031f);
attachSystemDetailLookup('0x004c54d0', systemDetailLookupState.institution0321);

attachSystemDetailHook('0x004c4a10', {
  onEnter() {
    this.systemOutputCommandCardBefore = systemOutputCommandCardSnapshot();
  },
  onLeave() {
    const after = systemOutputCommandCardSnapshot();
    const entry = {
      timestamp: Date.now(),
      before: this.systemOutputCommandCardBefore,
      after,
    };
    noteSystemOutputTransition('commandCardImport', entry);
    if (after.reason === null) {
      for (const factoryId of SYSTEM_OUTPUT_WHITELIST_FACTORIES) {
        if (after.whitelistGranted[factoryId]) {
          noteSystemOutputStage('factoryGrant', { ...entry, factoryId });
        }
      }
      if (after.factory41Observed) {
        systemOutputTraceState.observations.factory41InGrant = true;
      }
    }
  },
});

attachSystemDetailHook('0x004f58c0', {
  onEnter(args) {
    const menu = safe(() => ptr(this.context.ecx), ptr('0x0'));
    noteSystemOutputTransition('commandRowHit', {
      timestamp: Date.now(),
      menu: ptrHex(menu),
      resultFlag: ptrHex(args[0]),
      selectedRow: menu.isNull() ? null : readS32(menu.add(0x354)),
      rowCount: menu.isNull() ? null : readS32(menu.add(0x350)),
      category: menu.isNull() ? null : readS32(menu.add(0x358)),
    });
  },
});

// 유효 factory 3종 handler 진입 훅(함수 경계). 진입 시 factoryId·타임스탬프 기록.
function attachFactoryHandler(va, factoryId) {
  attachSystemDetailHook(va, {
    onEnter() {
      noteSystemOutputStage('factoryHandler', {
        timestamp: Date.now(),
        factoryId,
        callerVa: systemDetailCallerVa(this.returnAddress),
      });
    },
  });
}
for (const [factoryId, handlerVa] of Object.entries(SYSTEM_OUTPUT_HANDLER_ADDRESSES)) {
  attachFactoryHandler(handlerVa, Number(factoryId));
}

// 0x41 handler(FUN_00584c90)은 whitelist 밖 — 관측만 기록, 판정에 쓰지 않음.
attachSystemDetailHook('0x00584c90', {
  onEnter() {
    systemOutputTraceState.observations.factory41Handler = true;
  },
});

attachSystemDetailHook('0x00570eb0', {
  onEnter(args) {
    const dialog = safe(() => ptr(this.context.ecx), ptr('0x0'));
    this.systemOutputDialogCtor = {
      dialog,
      requestedKind: safe(() => args[0].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
    };
  },
  onLeave() {
    const captured = this.systemOutputDialogCtor;
    if (!captured || captured.dialog.isNull()) return;
    const entry = {
      timestamp: Date.now(),
      dialog: ptrHex(captured.dialog),
      requestedKind: captured.requestedKind,
      dialogKind: readS32(captured.dialog.add(0x28)),
      dialogController: ptrHex(readPtr(captured.dialog.add(0x50))),
      callerVa: captured.callerVa,
    };
    if (entry.requestedKind !== 5 && entry.requestedKind !== 0x11
        && entry.dialogKind !== 5 && entry.dialogKind !== 0x11) return;
    systemOutputLastDialogTickKey = null;
    noteSystemOutputStage('selectDialogCtor', entry);
  },
});

attachSystemDetailHook('0x00571870', {
  onEnter() {
    const dialog = safe(() => ptr(this.context.ecx), ptr('0x0'));
    if (dialog.isNull()) return;
    const entry = {
      timestamp: Date.now(),
      dialog: ptrHex(dialog),
      dialogKind: readS32(dialog.add(0x28)),
      dialogController: ptrHex(readPtr(dialog.add(0x50))),
      callerVa: systemDetailCallerVa(this.returnAddress),
    };
    if (entry.dialogKind !== 5 && entry.dialogKind !== 0x11) return;
    const tickKey = `${entry.dialog}:${entry.dialogKind}`;
    if (tickKey === systemOutputLastDialogTickKey) return;
    systemOutputLastDialogTickKey = tickKey;
    noteSystemOutputStage('selectDialogTick', entry);
  },
});

attachSystemDetailHook('0x00577e70', {
  onEnter(args) {
    const parent = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const entry = {
      timestamp: Date.now(),
      parent: ptrHex(parent),
      requestedKind: safe(() => args[0].toInt32()),
      requestedRebuild: safe(() => args[1].toInt32() & 0xff),
      panelKindBefore: readS32(parent.add(0x234)),
      panelStateBefore: readS32(parent.add(0x238)),
      callerVa: systemDetailCallerVa(this.returnAddress),
      backtrace: systemOutputBacktrace(this.context),
    };
    if (entry.requestedKind !== 5 && entry.requestedKind !== 0x11
        && entry.panelKindBefore !== 5 && entry.panelKindBefore !== 0x11) return;
    this.systemOutputPanelSetter = { parent, entry };
  },
  onLeave() {
    const captured = this.systemOutputPanelSetter;
    if (!captured || captured.parent.isNull()) return;
    const entry = captured.entry;
    entry.panelKindAfter = readS32(captured.parent.add(0x234));
    entry.panelStateAfter = readS32(captured.parent.add(0x238));
    entry.timestampAfter = Date.now();
    noteSystemOutputTransition('panelSetter', entry);
  },
});

attachSystemDetailHook('0x0057bbc0', {
  onEnter() {
    const parent = safe(() => ptr(this.context.ecx), ptr('0x0'));
    noteSystemOutputTransition('kind5Builder', {
      timestamp: Date.now(),
      parent: ptrHex(parent),
      panelKind: parent.isNull() ? null : readS32(parent.add(0x234)),
      panelState: parent.isNull() ? null : readS32(parent.add(0x238)),
      callerVa: systemDetailCallerVa(this.returnAddress),
    });
  },
});

attachSystemDetailHook('0x00577050', {
  onEnter(args) {
    const rowBaseId = safe(() => args[1].toInt32());
    if (rowBaseId !== SYSTEM_DETAIL_EXPECTED_BASE_ID) return;
    const list = safe(() => ptr(this.context.ecx), ptr('0x0'));
    this.systemOutputGenericRow = {
      timestamp: Date.now(),
      list,
      baseId: rowBaseId,
      rowCountBefore: list.isNull() ? null : readS32(list.add(0x8e4)),
      callerVa: systemDetailCallerVa(this.returnAddress),
    };
  },
  onLeave(retval) {
    const entry = this.systemOutputGenericRow;
    if (!entry) return;
    noteSystemOutputStage('genericListRow70', {
      ...entry,
      list: ptrHex(entry.list),
      rowCountAfter: entry.list.isNull() ? null : readS32(entry.list.add(0x8e4)),
      retval: safe(() => retval.toInt32()),
    });
  },
});

attachSystemDetailHook('0x0057aa90', {
  onEnter(args) {
    const argument = safe(() => ptr(args[0]), ptr('0x0'));
    const parent = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const selectedRecord = argument;
    const entry = {
      arg0: ptrHex(argument),
      selectedBaseId: argument.isNull() ? null : readU32(argument.add(8)),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
    };
    systemDetailPanelState.totalCalls += 1;
    pushSystemDetailRing(systemDetailPanelState.ring, entry);
    const panelKind = parent.isNull() ? null : readS32(parent.add(0x234));
    if (panelKind !== 5 && panelKind !== 0x11) return;
    noteSystemOutputStage('renderSink', {
      ...entry,
      parent: ptrHex(parent),
      panelKind,
      panelState: readS32(parent.add(0x238)),
      selectedIndex: readS32(parent.add(0xb2c)),
      selectedRecord: ptrHex(selectedRecord),
      baseId: entry.selectedBaseId,
      cacheJoin: Number.isInteger(entry.selectedBaseId)
        ? systemOutputCacheJoin(entry.selectedBaseId)
        : null,
      backtrace: systemOutputBacktrace(this.context),
    });
  },
});

attachSystemDetailHook('0x00576d40', {
  onEnter(args) {
    systemDetailSelectionIndexState.totalCalls += 1;
    const index = safe(() => args[0].toInt32());
    const list = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const parent = list.isNull() ? ptr('0x0') : list.sub(0x244);
    const panelKind = parent.isNull() ? null : readS32(parent.add(0x234));
    this.systemOutputSelector = {
      timestamp: Date.now(),
      list,
      parent,
      requestedIndex: index,
      panelKind,
      panelState: parent.isNull() ? null : readS32(parent.add(0x238)),
      selectedBefore: list.isNull() ? null : readS32(list.add(0x8e8)),
      callerVa: systemDetailCallerVa(this.returnAddress),
    };
    if (!Number.isInteger(index) || index === -1 || index < 0) return;
    // 00579d60/00579e60은 generic-info parent+0x244를 list ECX로 넘긴다.
    const itemCount = list.isNull() ? null : readS32(list.add(0x8e4));
    const inRange = Number.isInteger(itemCount) && index < itemCount;
    const entry = {
      list: ptrHex(list),
      parent: ptrHex(parent),
      index,
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      itemCount,
      inRange,
      selectedBefore: list.isNull() ? null : readS32(list.add(0x8e8)),
      panelKind,
      panelState: parent.isNull() ? null : readS32(parent.add(0x238)),
      infoSelectedIndex: parent.isNull() ? null : readS32(parent.add(0xb2c)),
      retval: null,
      selectedAfter: null,
      infoSelectedIndexAfter: null,
      selectionChanged: false,
    };
    systemDetailSelectionIndexState.validCalls += 1;
    if (inRange) {
      systemDetailSelectionIndexState.inRangeCalls += 1;
      if (panelKind === 5 || panelKind === 0x11) {
        systemDetailSelectionIndexState.infoPanelCandidateCalls += 1;
      }
    }
    pushSystemDetailRing(systemDetailSelectionIndexState.ring, entry);
    this.systemDetailSelectionIndexEntry = entry;
    this.systemDetailSelectionIndexList = list;
    this.systemDetailSelectionIndexParent = parent;
  },
  onLeave(retval) {
    const outputEntry = this.systemOutputSelector;
    if (outputEntry && !outputEntry.list.isNull() && !outputEntry.parent.isNull()
        && (outputEntry.panelKind === 5 || outputEntry.panelKind === 0x11)) {
      const selectedIndex = readS32(outputEntry.list.add(0x8e8));
      const selectedRecord = systemOutputSelectionRecord(outputEntry.list, selectedIndex);
      const baseId = selectedRecord.isNull() ? null : readU32(selectedRecord.add(8));
      noteSystemOutputStage('selector', {
        ...outputEntry,
        timestampAfter: Date.now(),
        list: ptrHex(outputEntry.list),
        parent: ptrHex(outputEntry.parent),
        selectedIndex,
        selectedRecord: ptrHex(selectedRecord),
        baseId,
        retval: safe(() => retval.toInt32()),
      });
    }
    const entry = this.systemDetailSelectionIndexEntry;
    const list = this.systemDetailSelectionIndexList;
    const parent = this.systemDetailSelectionIndexParent;
    if (!entry || !list || list.isNull() || !parent || parent.isNull()) return;
    entry.retval = safe(() => retval.toInt32());
    entry.selectedAfter = readS32(list.add(0x8e8));
    entry.infoSelectedIndexAfter = readS32(parent.add(0xb2c));
    entry.selectionChanged = (
      entry.inRange === true
      && Number.isInteger(entry.selectedBefore)
      && Number.isInteger(entry.selectedAfter)
      && entry.selectedAfter === entry.index
      && entry.selectedAfter !== entry.selectedBefore
    );
    if (entry.selectionChanged) {
      systemDetailSelectionIndexState.selectionChangedCalls += 1;
      if (entry.panelKind === 5 || entry.panelKind === 0x11) {
        systemDetailSelectionIndexState.infoPanelSelectionChangedCalls += 1;
      }
    }
  },
});

attachSystemDetailHook('0x00579fd0', {
  onEnter(args) {
    const parent = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const record = safe(() => ptr(args[0]), ptr('0x0'));
    if (parent.isNull()) return;
    const panelKind = readS32(parent.add(0x234));
    if (panelKind !== 5 && panelKind !== 0x11) return;
    const phase = readS32(parent.add(0x1584));
    if (phase !== 0 && phase !== 1) return;
    const baseId = record.isNull() ? null : readU32(record.add(8));
    const stage = phase === 0 ? 'refresh031f' : 'refresh0327';
    const requestCode = phase === 0 ? 0x031e : 0x0326;
    const responseCode = phase === 0 ? 0x031f : 0x0327;
    noteSystemOutputStage(stage, {
      timestamp: Date.now(),
      direction: 'request',
      requestCode,
      requestCodeHex: systemDetailCodeHex(requestCode),
      responseCode,
      responseCodeHex: systemDetailCodeHex(responseCode),
      parent: ptrHex(parent),
      record: ptrHex(record),
      panelKind,
      panelState: readS32(parent.add(0x238)),
      phase,
      baseId,
      callerVa: systemDetailCallerVa(this.returnAddress),
    });
  },
});

attachSystemDetailHook('0x00579e60', {
  onEnter() {
    const parent = safe(() => ptr(this.context.ecx), ptr('0x0'));
    if (parent.isNull()) return;
    const panelKind = readS32(parent.add(0x234));
    if (panelKind !== 5 && panelKind !== 0x11) return;
    const list = parent.add(0x244);
    const entry = {
      timestamp: Date.now(),
      parent: ptrHex(parent),
      panelKind,
      panelState: readS32(parent.add(0x238)),
      selectedIndex: readS32(parent.add(0xb2c)),
      callerVa: systemDetailCallerVa(this.returnAddress),
      backtrace: systemOutputBacktrace(this.context),
    };
    const selectedRecord = systemOutputSelectionRecord(list, entry.selectedIndex);
    const baseId = selectedRecord.isNull() ? null : readU32(selectedRecord.add(8));
    noteSystemOutputStage('panelDispatch', {
      ...entry,
      list: ptrHex(list),
      selectedRecord: ptrHex(selectedRecord),
      baseId,
      cacheJoin: Number.isInteger(baseId) ? systemOutputCacheJoin(baseId) : null,
    });
  },
});

const SELECTION_ADMISSION_RING_LIMIT = 128;
const selectionAdmissionState = {
  counts: {
    writer: 0,
    latch: 0,
    event2Enqueue: 0,
    event2Dequeue: 0,
    admission: 0,
    admissionAccepted: 0,
    modeApply: 0,
    layoutOpen: 0,
    hudModeSet: 0,
    hudFrameTransition: 0,
  },
  last: {
    writer: null,
    latch: null,
    event2Enqueue: null,
    event2Dequeue: null,
    admission: null,
    modeApply: null,
    layoutOpen: null,
    hudModeSet: null,
    hudFrameTransition: null,
  },
  sequence: 0,
  selectionList: null,
  ring: [],
};
const selectionAdmissionRoleCache = {
  selectionListBase: ptrHex(abs('0x00c9eac4')),
  selectionRoot: null,
  listCount188: null,
  listSelected189: null,
  byPointer: {},
};

function selectionAdmissionEventKeys(target) {
  const count = readS32(ptr(target).add(0x3f4));
  const keys = [];
  if (!Number.isInteger(count) || count <= 0) return keys;
  const boundedCount = Math.min(count, 0x1c);
  for (let index = 0; index < boundedCount; index += 1) {
    keys.push(readS32(ptr(target).add(0x470 + index * 4)));
  }
  return keys;
}

function selectionAdmissionTargetState(target) {
  const row = safe(() => ptr(target), ptr('0x0'));
  if (row.isNull()) {
    return {
      gate04: null,
      gate05: null,
      valid08: null,
      flag15: null,
      latchB00: null,
      latchB01: null,
      latchB02: null,
      eventQueueCount3f4: null,
    };
  }
  return {
    gate04: readU8(row.add(4)),
    gate05: readU8(row.add(5)),
    valid08: readU8(row.add(8)),
    flag15: readU8(row.add(0x15)),
    latchB00: readU8(row.add(0xb00)),
    latchB01: readU8(row.add(0xb01)),
    latchB02: readU8(row.add(0xb02)),
    eventQueueCount3f4: readS32(row.add(0x3f4)),
  };
}

function selectionAdmissionEventState(target) {
  return {
    ...selectionAdmissionTargetState(target),
    eventKeys470: selectionAdmissionEventKeys(target),
  };
}

function selectionAdmissionListState() {
  const list = abs('0x00c9eac4');
  return {
    base: ptrHex(list),
    selectionRoot: ptrHex(readPtr(list)),
    listCount188: readS32(list.add(0x188 * 4)),
    listSelected189: readS32(list.add(0x189 * 4)),
  };
}

function refreshSelectionAdmissionRoleCache() {
  const list = abs('0x00c9eac4');
  const listState = selectionAdmissionListState();
  const byPointer = {};
  const selectionRoot = readPtr(list);
  const rootKey = ptrHex(selectionRoot);
  if (rootKey !== null) {
    byPointer[rootKey] = { role: 'selection-root', index: null };
  }
  const count = listState.listCount188;
  const boundedCount = Number.isInteger(count) ? Math.max(0, Math.min(count, 8)) : 0;
  for (let index = 0; index < boundedCount; index += 1) {
    const slot22Key = ptrHex(readPtr(list.add((0x22 + index) * 4)));
    const slot32Key = ptrHex(readPtr(list.add((0x32 + index) * 4)));
    if (slot22Key !== null && byPointer[slot22Key] === undefined) {
      byPointer[slot22Key] = { role: `slot22-${index}`, index };
    }
    if (slot32Key !== null && byPointer[slot32Key] === undefined) {
      byPointer[slot32Key] = { role: `slot32-${index}`, index };
    }
  }
  selectionAdmissionRoleCache.selectionRoot = listState.selectionRoot;
  selectionAdmissionRoleCache.listCount188 = listState.listCount188;
  selectionAdmissionRoleCache.listSelected189 = listState.listSelected189;
  selectionAdmissionRoleCache.byPointer = byPointer;
  return listState;
}

function selectionAdmissionPointersEqual(left, right) {
  const leftPointer = safe(() => ptr(left), ptr('0x0'));
  const rightPointer = safe(() => ptr(right), ptr('0x0'));
  return !leftPointer.isNull() && !rightPointer.isNull()
    && pointerEquals(leftPointer, rightPointer);
}

function selectionAdmissionCachedIdentity(controller, target) {
  const list = abs('0x00c9eac4');
  selectionAdmissionRoleCache.listSelected189 = readS32(list.add(0x189 * 4));
  const selectionRoot = safe(
    () => ptr(selectionAdmissionRoleCache.selectionRoot),
    ptr('0x0'),
  );
  const targetKey = ptrHex(target);
  const cachedTarget = targetKey === null
    ? null
    : selectionAdmissionRoleCache.byPointer[targetKey] || null;
  return {
    selectionRoot: ptrHex(selectionRoot),
    controller: ptrHex(controller),
    controllerMatchesSelectionRoot: selectionAdmissionPointersEqual(controller, selectionRoot),
    target: ptrHex(target),
    targetMatchesSelectionRoot: selectionAdmissionPointersEqual(target, selectionRoot),
    targetRole: cachedTarget ? cachedTarget.role : null,
    targetSlotIndex: cachedTarget ? cachedTarget.index : null,
    selectedTargetRole: (
      cachedTarget !== null
      && Number.isInteger(cachedTarget.index)
      && cachedTarget.index === selectionAdmissionRoleCache.listSelected189
    ) ? cachedTarget.role : null,
  };
}

function selectionAdmissionRelated(identity) {
  return identity.controllerMatchesSelectionRoot
    || identity.targetMatchesSelectionRoot
    || identity.targetRole !== null;
}

function selectionAdmissionObjectChanged(before, after) {
  if (!before || !after) return false;
  return before.gate04 !== after.gate04
    || before.gate05 !== after.gate05
    || before.valid08 !== after.valid08
    || before.flag15 !== after.flag15
    || before.latchB00 !== after.latchB00
    || before.latchB01 !== after.latchB01
    || before.latchB02 !== after.latchB02
    || before.eventQueueCount3f4 !== after.eventQueueCount3f4;
}

function selectionAdmissionListChanged(before, after) {
  if (!before || !after) return false;
  return before.selectionRoot !== after.selectionRoot
    || before.listCount188 !== after.listCount188
    || before.listSelected189 !== after.listSelected189;
}

function noteSelectionAdmission(stage, entry) {
  selectionAdmissionState.counts[stage] += 1;
  selectionAdmissionState.last[stage] = entry;
}

function pushSelectionAdmissionTimeline(entry) {
  selectionAdmissionState.sequence += 1;
  entry.sequence = selectionAdmissionState.sequence;
  selectionAdmissionState.ring.push(entry);
  if (selectionAdmissionState.ring.length > SELECTION_ADMISSION_RING_LIMIT) {
    selectionAdmissionState.ring.shift();
  }
}

function pushSelectionAdmissionEvent2(stage, entry) {
  noteSelectionAdmission(stage, entry);
  pushSelectionAdmissionTimeline(entry);
}

refreshSelectionAdmissionRoleCache();

attachSystemDetailHook('0x005024b0', {
  onEnter(args) {
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(controller, controller);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'writer',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      requestedGate05: safe(() => args[0].toInt32() & 0xff),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      before: selectionAdmissionTargetState(controller),
      selectionListBefore: selectionAdmissionListState(),
      after: null,
      selectionListAfter: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionTarget = controller;
    noteSelectionAdmission('writer', entry);
  },
  onLeave() {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.after = selectionAdmissionTargetState(this.selectionAdmissionTarget);
    entry.selectionListAfter = selectionAdmissionListState();
    if (selectionAdmissionObjectChanged(entry.before, entry.after)
      || selectionAdmissionListChanged(entry.selectionListBefore, entry.selectionListAfter)) {
      pushSelectionAdmissionTimeline(entry);
    }
  },
});

attachSystemDetailHook('0x00507f20', {
  onEnter(args) {
    const target = safe(() => ptr(args[0]), ptr('0x0'));
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(controller, target);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'latch',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      controllerBefore: selectionAdmissionTargetState(controller),
      targetBefore: selectionAdmissionTargetState(target),
      selectionListBefore: selectionAdmissionListState(),
      controllerAfter: null,
      targetAfter: null,
      selectionListAfter: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionController = controller;
    this.selectionAdmissionTarget = target;
    noteSelectionAdmission('latch', entry);
  },
  onLeave() {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.controllerAfter = selectionAdmissionTargetState(
      this.selectionAdmissionController,
    );
    entry.targetAfter = selectionAdmissionTargetState(
      this.selectionAdmissionTarget,
    );
    entry.selectionListAfter = selectionAdmissionListState();
    if (selectionAdmissionObjectChanged(entry.controllerBefore, entry.controllerAfter)
      || selectionAdmissionObjectChanged(entry.targetBefore, entry.targetAfter)
      || selectionAdmissionListChanged(entry.selectionListBefore, entry.selectionListAfter)) {
      pushSelectionAdmissionTimeline(entry);
    }
  },
});

attachSystemDetailHook('0x00501e30', {
  onEnter(args) {
    const eventKind = safe(() => args[0].toInt32());
    if (eventKind !== 2) return;
    const target = safe(() => ptr(args[1]), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(ptr('0x0'), target);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'event2Enqueue',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      eventKind,
      payload: ptrHex(args[2]),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      targetBefore: selectionAdmissionEventState(target),
      targetAfter: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionTarget = target;
    pushSelectionAdmissionEvent2('event2Enqueue', entry);
  },
  onLeave() {
    if (!this.selectionAdmissionEntry) return;
    this.selectionAdmissionEntry.targetAfter = selectionAdmissionEventState(
      this.selectionAdmissionTarget,
    );
  },
});

attachSystemDetailHook('0x00501ed0', {
  onEnter(args) {
    const eventKind = safe(() => args[1].toInt32());
    if (eventKind !== 2) return;
    const target = safe(() => ptr(args[0]), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(ptr('0x0'), target);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'event2Dequeue',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      eventKind,
      output: ptrHex(args[2]),
      consume: safe(() => args[3].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      targetBefore: selectionAdmissionEventState(target),
      targetAfter: null,
      retvalLow8: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionTarget = target;
    pushSelectionAdmissionEvent2('event2Dequeue', entry);
  },
  onLeave(retval) {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.targetAfter = selectionAdmissionEventState(this.selectionAdmissionTarget);
    entry.retvalLow8 = safe(() => retval.toInt32() & 0xff);
  },
});

attachSystemDetailHook('0x005015f0', {
  onEnter(args) {
    const eventKind = safe(() => args[0].toInt32());
    if (eventKind !== 2) return;
    const target = safe(() => ptr(args[1]), ptr('0x0'));
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(controller, target);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'admission',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      eventKind,
      output: ptrHex(args[2]),
      param4: safe(() => args[3].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      controllerBefore: selectionAdmissionTargetState(controller),
      targetBefore: selectionAdmissionTargetState(target),
      selectionListBefore: selectionAdmissionListState(),
      controllerAfter: null,
      targetAfter: null,
      selectionListAfter: null,
      selectedTargetRoleAfter: null,
      retvalLow8: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionController = controller;
    this.selectionAdmissionTarget = target;
    noteSelectionAdmission('admission', entry);
  },
  onLeave(retval) {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.controllerAfter = selectionAdmissionTargetState(this.selectionAdmissionController);
    entry.targetAfter = selectionAdmissionTargetState(this.selectionAdmissionTarget);
    entry.selectionListAfter = selectionAdmissionListState();
    entry.retvalLow8 = safe(() => retval.toInt32() & 0xff);
    entry.selectedTargetRoleAfter = (
      Number.isInteger(entry.targetSlotIndex)
      && entry.targetSlotIndex === entry.selectionListAfter.listSelected189
    ) ? entry.targetRole : null;
    if (entry.retvalLow8 !== 0 && entry.retvalLow8 !== null) {
      selectionAdmissionState.counts.admissionAccepted += 1;
    }
    if (entry.retvalLow8 !== 0
      || selectionAdmissionObjectChanged(entry.controllerBefore, entry.controllerAfter)
      || selectionAdmissionObjectChanged(entry.targetBefore, entry.targetAfter)
      || selectionAdmissionListChanged(entry.selectionListBefore, entry.selectionListAfter)) {
      pushSelectionAdmissionTimeline(entry);
    }
  },
});

attachSystemDetailHook('0x004f6680', {
  onEnter(args) {
    const selectionListBefore = refreshSelectionAdmissionRoleCache();
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const target = readPtr(abs('0x00c9eac4'));
    const identity = selectionAdmissionCachedIdentity(controller, target);
    const entry = {
      stage: 'modeApply',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      requestedMode: safe(() => args[0].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      rootBefore: selectionAdmissionTargetState(target),
      selectionListBefore,
      rootAfter: null,
      selectionListAfter: null,
      retvalLow8: null,
    };
    this.selectionAdmissionEntry = entry;
    noteSelectionAdmission('modeApply', entry);
  },
  onLeave(retval) {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.rootAfter = selectionAdmissionTargetState(readPtr(abs('0x00c9eac4')));
    entry.selectionListAfter = refreshSelectionAdmissionRoleCache();
    entry.retvalLow8 = safe(() => retval.toInt32() & 0xff);
    pushSelectionAdmissionTimeline(entry);
  },
});

attachSystemDetailHook('0x00506280', {
  onEnter(args) {
    const selectionListBefore = refreshSelectionAdmissionRoleCache();
    const target = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const identity = selectionAdmissionCachedIdentity(target, target);
    if (!selectionAdmissionRelated(identity)) return;
    const entry = {
      stage: 'layoutOpen',
      ...identity,
      registerEcx: ptrHex(this.context.ecx),
      arg0: safe(() => args[0].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      before: selectionAdmissionTargetState(target),
      selectionListBefore,
      after: null,
      selectionListAfter: null,
      retvalLow8: null,
    };
    this.selectionAdmissionEntry = entry;
    this.selectionAdmissionTarget = target;
    noteSelectionAdmission('layoutOpen', entry);
  },
  onLeave(retval) {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.after = selectionAdmissionTargetState(this.selectionAdmissionTarget);
    entry.selectionListAfter = refreshSelectionAdmissionRoleCache();
    entry.retvalLow8 = safe(() => retval.toInt32() & 0xff);
    pushSelectionAdmissionTimeline(entry);
  },
});

attachSystemDetailHook('0x004fd7a0', {
  onEnter(args) {
    const selectionListBefore = refreshSelectionAdmissionRoleCache();
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const target = readPtr(abs('0x00c9eac4'));
    const entry = {
      stage: 'hudModeSet',
      ...selectionAdmissionCachedIdentity(controller, target),
      registerEcx: ptrHex(this.context.ecx),
      requestedHudMode: safe(() => args[0].toInt32()),
      pushHistory: safe(() => args[1].toInt32()),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      hudModeBefore: readS32(abs('0x00c9e638').add(0xf4)),
      rootBefore: selectionAdmissionTargetState(target),
      selectionListBefore,
      hudModeAfter: null,
      rootAfter: null,
      selectionListAfter: null,
      retvalLow8: null,
    };
    this.selectionAdmissionEntry = entry;
    noteSelectionAdmission('hudModeSet', entry);
  },
  onLeave(retval) {
    const entry = this.selectionAdmissionEntry;
    if (!entry) return;
    entry.hudModeAfter = readS32(abs('0x00c9e638').add(0xf4));
    entry.rootAfter = selectionAdmissionTargetState(readPtr(abs('0x00c9eac4')));
    entry.selectionListAfter = refreshSelectionAdmissionRoleCache();
    entry.retvalLow8 = safe(() => retval.toInt32() & 0xff);
    if (entry.hudModeBefore !== entry.hudModeAfter
      || selectionAdmissionObjectChanged(entry.rootBefore, entry.rootAfter)
      || selectionAdmissionListChanged(entry.selectionListBefore, entry.selectionListAfter)) {
      pushSelectionAdmissionTimeline(entry);
    }
  },
});

attachSystemDetailHook('0x004fd100', {
  onEnter() {
    const selectionListBefore = selectionAdmissionListState();
    if (selectionAdmissionListChanged(selectionAdmissionRoleCache, selectionListBefore)) {
      refreshSelectionAdmissionRoleCache();
    }
    const controller = safe(() => ptr(this.context.ecx), ptr('0x0'));
    const target = readPtr(abs('0x00c9eac4'));
    this.selectionAdmissionFrame = {
      stage: 'hudFrameTransition',
      ...selectionAdmissionCachedIdentity(controller, target),
      registerEcx: ptrHex(this.context.ecx),
      callerVa: systemDetailCallerVa(this.returnAddress),
      timestamp: Date.now(),
      hudModeBefore: readS32(abs('0x00c9e638').add(0xf4)),
      rootBefore: selectionAdmissionTargetState(target),
      selectionListBefore,
      hudModeAfter: null,
      rootAfter: null,
      selectionListAfter: null,
    };
  },
  onLeave() {
    const entry = this.selectionAdmissionFrame;
    if (!entry) return;
    entry.hudModeAfter = readS32(abs('0x00c9e638').add(0xf4));
    entry.rootAfter = selectionAdmissionTargetState(readPtr(abs('0x00c9eac4')));
    entry.selectionListAfter = selectionAdmissionListState();
    if (entry.hudModeBefore === entry.hudModeAfter
      && !selectionAdmissionObjectChanged(entry.rootBefore, entry.rootAfter)
      && !selectionAdmissionListChanged(entry.selectionListBefore, entry.selectionListAfter)) return;
    refreshSelectionAdmissionRoleCache();
    noteSelectionAdmission('hudFrameTransition', entry);
    pushSelectionAdmissionTimeline(entry);
  },
});

function systemDetailJoinFor(baseId, caches, worldActive, strategyFieldImportFlag2a58fa) {
  if (!Number.isInteger(baseId) || baseId <= 0) return null;
  const staticImported = caches.staticBase.importedIds.includes(baseId);
  const staticActive = caches.staticBase.activeIds.includes(baseId);
  const source031f = caches.source031f.ids.includes(baseId);
  const source0321 = caches.source0321.ids.includes(baseId);
  const live031f = caches.live031f.ids.includes(baseId);
  const live0321 = caches.live0321.ids.includes(baseId);
  const base031fJoinComplete = staticImported && staticActive && source031f && live031f;
  const base0321JoinComplete = staticImported && staticActive && source0321 && live0321;
  const membershipJoinComplete = base031fJoinComplete && base0321JoinComplete;
  const worldConsumerActive = Number.isInteger(worldActive) && worldActive !== 0;
  const strategyFieldImportComplete = (
    Number.isInteger(strategyFieldImportFlag2a58fa) && strategyFieldImportFlag2a58fa !== 0
  );
  const cacheSnapshotsHealthy = (
    caches.staticBase.reason === null
    && caches.source031f.reason === null
    && caches.source031f.truncated === false
    && caches.source0321.reason === null
    && caches.source0321.truncated === false
    && caches.live031f.reason === null
    && caches.live031f.truncated === false
    && caches.live0321.reason === null
    && caches.live0321.truncated === false
  );
  const cacheJoinComplete = (
    membershipJoinComplete
    && worldConsumerActive
    && strategyFieldImportComplete
    && cacheSnapshotsHealthy
  );
  return {
    baseId,
    staticImported,
    staticActive,
    source031f,
    source0321,
    live031f,
    live0321,
    base031fJoinComplete,
    base0321JoinComplete,
    membershipJoinComplete,
    worldConsumerActive,
    strategyFieldImportComplete,
    cacheSnapshotsHealthy,
    cacheJoinComplete,
  };
}

function systemDetailProtocolSummary() {
  const observed = (ring, code) => ring.some((entry) => entry.code === code);
  const onrecv = {};
  const dispatch = {};
  for (const code of SYSTEM_DETAIL_PROTOCOL_CODES) {
    const key = systemDetailCodeHex(code);
    onrecv[key] = observed(systemDetailProtocolState.onrecv, code);
    dispatch[key] = observed(systemDetailProtocolState.dispatch, code);
  }
  return {
    onrecv,
    dispatch,
    allOnRecv: Object.values(onrecv).every((value) => value === true),
    allDispatch: Object.values(dispatch).every((value) => value === true),
  };
}

function systemDetailState(base) {
  selectionAdmissionState.selectionList = selectionAdmissionListState();
  const baseAvailable = Boolean(base && !base.isNull());
  const clientSpotResolverBase = baseAvailable ? readU32(base.add(0x358)) : null;
  let clientSpotResolverBaseReason = baseAvailable ? null : 'client-base-unavailable';
  if (baseAvailable && clientSpotResolverBase === null) {
    clientSpotResolverBaseReason = 'client-spot-resolver-base-unreadable';
  }

  const worldActive = baseAvailable ? readU8(base.add(0x2a58f8)) : null;
  const strategyFieldImportFlag2a58fa = baseAvailable ? readU8(base.add(0x2a58fa)) : null;
  const unitCount = baseAvailable ? readU16(base.add(0x41a364)) : null;
  let unit0SpotResolverBase = null;
  let unit0SpotResolverBaseReason = null;
  if (!baseAvailable) {
    unit0SpotResolverBaseReason = 'client-base-unavailable';
  } else if (!Number.isInteger(worldActive)) {
    unit0SpotResolverBaseReason = 'world-cache-flag-unreadable';
  } else if (worldActive === 0) {
    unit0SpotResolverBaseReason = 'world-cache-inactive';
  } else if (!Number.isInteger(unitCount)) {
    unit0SpotResolverBaseReason = 'unit-count-unreadable';
  } else if (unitCount < 1) {
    unit0SpotResolverBaseReason = 'unit-table-empty';
  } else {
    unit0SpotResolverBase = readU32(base.add(0x41a368 + 0x40));
    if (unit0SpotResolverBase === null) unit0SpotResolverBaseReason = 'unit0-spot-base-unreadable';
  }

  const caches = {
    staticBase: staticBaseCacheSnapshot(base),
    source031f: boundedIdTableSnapshot(base, 0x3facf4, 0x3facf8, 0x180, 4),
    source0321: boundedIdTableSnapshot(base, 0x3fb2f8, 0x3fb2fc, 0x2378, 4),
    live031f: boundedIdTableSnapshot(base, 0x2b6a74, 0x2b6a78, 0x180, 4),
    live0321: boundedIdTableSnapshot(base, 0x2b7078, 0x2b707c, 0x2378, 4),
  };
  const panelLast = systemDetailPanelState.ring.length > 0
    ? systemDetailPanelState.ring[systemDetailPanelState.ring.length - 1]
    : null;
  const protocolSummary = systemDetailProtocolSummary();
  const expectedJoin = systemDetailJoinFor(
    SYSTEM_DETAIL_EXPECTED_BASE_ID,
    caches,
    worldActive,
    strategyFieldImportFlag2a58fa,
  );
  return {
    available: baseAvailable,
    reason: baseAvailable ? null : 'client-base-unavailable',
    clientSpotResolverBase,
    clientSpotResolverBaseReason,
    unit0SpotResolverBase,
    unit0SpotResolverBaseReason,
    unitCount,
    importFlags: {
      worldActive2a58f8: worldActive,
      strategyFieldImportFlag2a58fa,
    },
    protocol: {
      onrecv: systemDetailProtocolState.onrecv,
      dispatch: systemDetailProtocolState.dispatch,
      totalOnRecv: systemDetailProtocolState.totalOnRecv,
      totalDispatch: systemDetailProtocolState.totalDispatch,
      summary: protocolSummary,
    },
    caches,
    lookups: systemDetailLookupState,
    panel: systemDetailPanelState,
    selectionIndex: systemDetailSelectionIndexState,
    selectionAdmission: selectionAdmissionState,
    systemOutputTrace: systemOutputTraceSnapshot(),
    joins: {
      expectedBaseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
      expected: expectedJoin,
      clientSpotResolver: systemDetailJoinFor(
        clientSpotResolverBase,
        caches,
        worldActive,
        strategyFieldImportFlag2a58fa,
      ),
      unit0SpotResolver: systemDetailJoinFor(
        unit0SpotResolverBase,
        caches,
        worldActive,
        strategyFieldImportFlag2a58fa,
      ),
      panelSelected: systemDetailJoinFor(
        panelLast ? panelLast.selectedBaseId : null,
        caches,
        worldActive,
        strategyFieldImportFlag2a58fa,
      ),
    },
    summary: {
      expectedBaseId: SYSTEM_DETAIL_EXPECTED_BASE_ID,
      protocolAllOnRecv: protocolSummary.allOnRecv,
      protocolAllDispatch: protocolSummary.allDispatch,
      expectedBase031fJoin: expectedJoin ? expectedJoin.base031fJoinComplete : false,
      expectedBase0321Join: expectedJoin ? expectedJoin.base0321JoinComplete : false,
      cacheJoinComplete: expectedJoin ? expectedJoin.cacheJoinComplete : false,
    },
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
      if (name === 'factory') {
        const factoryId = values[0];
        const entry = {
          timestamp: this.nativeCall.t,
          factoryId,
          category: values[1],
          manager: ptrHex(this.context.ecx),
        };
        noteSystemOutputTransition('factoryLaunch', entry);
        if (SYSTEM_OUTPUT_WHITELIST_FACTORY_SET.has(factoryId)) {
          noteSystemOutputStage('factorySelected', entry);
        } else if (factoryId === 0x41) {
          systemOutputTraceState.observations.factory41Selected = true;
        }
      }
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
          const payloadCount = payload && !payload.isNull() ? readU8(payload.add(0x270)) : 0;
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
    // QA 전용 강제 주입: 런타임 명령표의 자연 선택 범주 0·1만 최소 채운다.
    for (const category of [0, 1]) {
      const record = table.add(category * 0x46);
      record.add(0x1e).writeU8(2);
      record.add(0x20).writeU16(0x002b);
      record.add(0x22).writeU16(0x0041);
    }
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

const SELECTION_CARD_KIND_CAP = 8;

function selectionState() {
  const list = abs('0x00c9eac4');
  const root = readPtr(list);
  const origin = root && !root.isNull() ? absoluteOriginState(root).output : null;
  const payload = readPtr(list.add(0x18a * 4));
  const hud = abs('0x00c9e638');
  const count = readS32(list.add(0x188 * 4));
  const payloadCount = payload.isNull() ? 0 : readU8(payload.add(0x270));
  const boundedPayloadCount = Number.isInteger(payloadCount)
    ? Math.min(payloadCount, SELECTION_CARD_KIND_CAP)
    : 0;
  const cardKinds = [];
  for (let index = 0; index < boundedPayloadCount; index += 1) {
    cardKinds.push(readU16(payload.add(0x274 + index * 8)));
  }
  const rows = [];
  for (let i = 0; i < Math.max(0, Math.min(count || 0, 8)); i += 1) {
    rows.push({
      index: i,
      primary: rowState(readPtr(list.add((0x22 + i) * 4))),
      secondary: rowState(readPtr(list.add((0x32 + i) * 4))),
    });
  }
  return {
    listBase: ptrHex(list),
    root: { ...rowState(root), raw: root && !root.isNull() ? readHex(root, 0x40) : null },
    origin,
    hudModeF4: readS32(hud.add(0xf4)),
    hudAb0: readS32(hud.add(0xab0)),
    hudState14e0: readS32(hud.add(0x14e0)),
    listCount188: count,
    listSelected189: readS32(list.add(0x189 * 4)),
    listPayload18a: ptrHex(payload),
    payloadCount270: payloadCount,
    cardKinds,
    cardKindsTruncated: Number.isInteger(payloadCount)
      && payloadCount > SELECTION_CARD_KIND_CAP,
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
      stagingCategory1CommandCount5c: readU8(staging305.add(0x5c)),
      stagingCategory1FirstFactory5e: readU16(staging305.add(0x5e)),
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
      firstRecordCommandCount04: readU8(table307.add(0x04)),
      firstRecordFirstDescriptor06: readU16(table307.add(0x06)),
      secondRecordIdC6: readU16(table307.add(0xc6)),
      secondRecordCommandCountC8: readU8(table307.add(0xc8)),
      secondRecordFirstDescriptorCa: readU16(table307.add(0xca)),
      raw00: readHex(table307, 0x20),
      stagingAddress: ptrHex(staging307),
      stagingCount00: readU16(staging307),
      stagingFirstRecordId02: readU16(staging307.add(0x02)),
      stagingSecondRecordCount04: readU8(staging307.add(0x04)),
      stagingFirstRecordCommandCount04: readU8(staging307.add(0x04)),
      stagingFirstRecordFirstDescriptor06: readU16(staging307.add(0x06)),
      stagingSecondRecordIdC6: readU16(staging307.add(0xc6)),
      stagingSecondRecordCommandCountC8: readU8(staging307.add(0xc8)),
      stagingSecondRecordFirstDescriptorCa: readU16(staging307.add(0xca)),
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

// 拠点(base destination) SelectDialog 좌측 목록 위젯 노출.
// row-add=FUN_00577050(정본 EXE sha256 9c97… VA 0x577050 실바이트 검증: 64a1.. 6aff 68 d86a6600 = push &LAB_00666ad8).
// 위젯 객체=0x00ca3954(정적), 부모 정보패널=0x00ca3710.
// 확정 구조(FUN_00577050/FUN_00576ec0/FUN_00577d20 정적):
//   list+0x8e0 = 연결리스트 sentinel(readPtr)  · list+0x8e4 = itemCount(readS32)
//   list+0x8e8 = 선택 index               · list+0xc   = columnCount · list+0x20 = 컬럼-셀 위젯 배열(ptr[col])
//   행 노드: +0 next / +4 prev / +8 payload.  payload+0x08 = baseId(=70/0x46).
// 화면 rect는 행 노드에 {x,y,w,h}로 저장되지 않음(0x502/0x503 GPU 그리드 렌더 계열이 draw 시점에 계산).
// 따라서 (1) 위젯/컬럼셀 절대 원점(FUN_00507090) + (2) list/셀/행 raw 덤프를 노출해 라이브 스크린 클릭좌표와 대조한다.
const SPOT_DIALOG_LIST = abs('0x00ca3954');
const SPOT_DIALOG_PARENT = abs('0x00ca3710');
const SPOT_DIALOG_ROW_CAP = 12;
const SPOT_DIALOG_COL_CAP = 12;

// 화면 좌표로 인정할 상한. 원점 자리에서 포인터값(0x1337xxxx 등)이 읽히는 사고를
// 프로세스 안에서 즉시 걸러낸다 — B74 는 원점 (322313472, 322290148) 을 그대로 믿고
// 화면 밖 (322313510, 322290155) 을 클릭해 런 전체를 날렸다.
const SPOT_MAX_SCREEN_COORD = 4096;

function spotIsPlausibleXY(x, y) {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && x <= SPOT_MAX_SCREEN_COORD
    && y >= 0 && y <= SPOT_MAX_SCREEN_COORD;
}

// dword 영역을 s32/f32/hex 3중 해석으로 덤프(원점·geometry 필드가 int인지 float인지 라이브에서 판정용).
function spotDwordView(address, dwordCount) {
  return safe(() => {
    const rows = [];
    for (let i = 0; i < dwordCount; i += 1) {
      const a = ptr(address).add(i * 4);
      rows.push({ off: `0x${(i * 4).toString(16)}`, s32: readS32(a), f32: readF32(a), hex: readHex(a, 4) });
    }
    return rows;
  }, null);
}

// 위젯 포인터가 그럴듯하면(vtable 존재) 절대 원점을 읽음. AV 위험 최소화 위해 vtable 널체크 후 safe 호출.
// vtable 후보가 포인터 대역이 아니면(예: list+0 == 56) 위젯이 아니므로 호출하지 않는다.
function spotTryOrigin(target) {
  return safe(() => {
    const p = ptr(target);
    if (p.isNull()) return null;
    const vtable = readPtr(p);
    if (vtable.isNull()) return null;
    if (vtable.compare(ptr('0x10000')) < 0) return null;
    return absoluteOriginState(p).output;
  }, null);
}

// 원점 후보를 여러 파생 경로로 만들고 각각을 프로세스 안에서 검증해 plausible 플래그를 붙인다.
// 드라이버는 plausible 한 첫 후보만 쓰고, 하나도 없으면 fail-closed 한다(좌표 추측 금지).
//
// 정적 RE 확정(2026-07-14): 이 후보들은 구조적으로 실패한다 — READ_ABSOLUTE_ORIGIN
// (FUN_00507090)은 위치 위젯 전용(this+0xC=local x, this+0x10=local y, this+0x8=부모 핸들)인데,
// list/parent 는 위치 위젯이 아닌 논리 모델이다(list+0xC=컬럼수, list+0x10=선택수). 따라서
// listStatic/listDeref 는 vtable 부재로 null, parent* 는 비좌표 필드를 x/y 로 읽어 쓰레기,
// column0(=그리드 모델 포인터)도 셀 위젯이 아니라 null 이 정상이다. 진짜 원점은 정적 필드가
// 아니라 엔진이 draw time 에 계산하므로, 이 경로로는 확정 불가. 확정은 라이브 FUN_005015f0
// 경계 훅(경로 A) 또는 인덱스 선택 FUN_00576d40(경로 B)로 한다. 관측 유지 목적상 후보는
// 그대로 두되(전부 plausible:false 로 보고), 좌표원으로 신뢰하지 않는다.
function spotOriginCandidates(list, parent, columns) {
  const out = [];
  const push = (name, source, origin) => {
    if (!origin) { out.push({ name, source, x: null, y: null, plausible: false }); return; }
    out.push({ name, source, x: origin.x, y: origin.y, plausible: spotIsPlausibleXY(origin.x, origin.y) });
  };
  push('listStatic', ptrHex(list), spotTryOrigin(list));
  push('listDeref', ptrHex(readPtr(list)), spotTryOrigin(readPtr(list)));
  push('parentStatic', ptrHex(parent), spotTryOrigin(parent));
  push('parentDeref', ptrHex(readPtr(parent)), spotTryOrigin(readPtr(parent)));
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    if (!col || !col.ptr) continue;
    push(`column${i}`, col.ptr, col.origin);
  }
  return out;
}

function spotDialogListState() {
  const list = SPOT_DIALOG_LIST;
  const parent = SPOT_DIALOG_PARENT;
  const itemCount = readS32(list.add(0x8e4));
  const columnCount = readS32(list.add(0xc));
  const sentinel = readPtr(list.add(0x8e0));

  const meta = {
    listBase: ptrHex(list),
    parentBase: ptrHex(parent),
    itemCount8e4: itemCount,
    selectedIndex8e8: readS32(list.add(0x8e8)),
    columnCount0c: columnCount,
    mode8d4: readS32(list.add(0x8d4)),
    state8d8: readS32(list.add(0x8d8)),
    sentinel8e0: ptrHex(sentinel),
    gridArray20: ptrHex(readPtr(list.add(0x20))),
  };

  const listOrigin = spotTryOrigin(list);
  const parentOrigin = spotTryOrigin(parent);

  // list 위젯 헤드 raw + s32/f32 (원점/geometry 필드 탐색용 폴백).
  const widgetHead = { raw: readHex(list, 0x40), dwords: spotDwordView(list, 0x10) };

  // 컬럼-셀 위젯 배열(list+0x20 + col*4). 각 셀은 실제 화면 위젯이므로 원점/rect(+0x20/0x24/0x2c/0x30) 후보 노출.
  const cols = Number.isInteger(columnCount) && columnCount > 0
    ? Math.min(columnCount, SPOT_DIALOG_COL_CAP) : 1;
  const columns = [];
  for (let c = 0; c < cols; c += 1) {
    const cell = readPtr(list.add(0x20 + c * 4));
    if (cell.isNull()) { columns.push({ col: c, ptr: null }); continue; }
    columns.push({
      col: c,
      ptr: ptrHex(cell),
      origin: spotTryOrigin(cell),
      rectAt20: rectState(cell),
      head: spotDwordView(cell, 0x10),
    });
  }

  // 행 연결리스트 순회. payload=node+8, payload dword[2](off 0x08)=baseId(70 확인 지점).
  const rows = [];
  if (!sentinel.isNull()) {
    let node = readPtr(sentinel);
    const cap = Number.isInteger(itemCount) ? Math.max(0, Math.min(itemCount, SPOT_DIALOG_ROW_CAP)) : 0;
    for (let r = 0; r < cap; r += 1) {
      if (node.isNull() || node.equals(sentinel)) break;
      const payload = node.add(8);
      rows.push({
        index: r,
        nodePtr: ptrHex(node),
        baseIdAt08: readS32(payload.add(8)),
        payload: spotDwordView(payload, 0x0a),
        payloadHex: readHex(payload, 0x40),
      });
      node = readPtr(node);
    }
  }

  // 검증된 원점 후보 집합. plausible=false 인 값은 드라이버가 절대 클릭에 쓰지 않는다.
  const originCandidates = spotOriginCandidates(list, parent, columns);

  // 부모(정보패널) 위젯 raw 덤프 — 지금까지 한 번도 안 떴다. 목록 다이얼로그의 진짜
  // 절대 원점이 어느 필드에 있는지 다음 라이브 런에서 확정하기 위한 관측 데이터.
  const parentHead = { raw: readHex(parent, 0x40), dwords: spotDwordView(parent, 0x10) };
  const parentRect = rectState(parent);

  // 행 기하. 행 rect 는 메모리에 {x,y,w,h} 로 저장되지 않는다 — 정적 RE 확정(2026-07-14,
  // docs/logh7-spot-select-dialog-row-re-2026-07-14.md). 리스트 위젯(parent+0x244)과
  // 그리드(list+0x20)는 논리 모델(행 연결리스트 + 셀 상태 플래그)만 들고, 화면 좌표는
  // 입력/렌더 엔진 FUN_005015f0(0x005015f0) 계열이 draw/hit-test 시점에 전역 입력·레이아웃
  // 상태(0x022142a8/0x022143e4 등)로부터 계산한다. 따라서 stored origin/rowHeight 는 없다 —
  // rowHeight/rowTop 는 null 로 두고 드라이버가 fail-closed 한다. 확정 경로는 라이브에서
  // FUN_005015f0 경계 훅으로 out-struct 좌표 캡처(경로 A) 또는 FUN_00576d40(index) 인덱스
  // 선택(경로 B). 이전 cellRect/rowWidth(232/374)는 그리드 모델 포인터를 셀 위젯으로 오인해
  // +0x20/+0x24/+0x2c/+0x30 을 rect 로 읽은 값이라 신뢰 불가 → 좌표원으로 쓰지 않는다.
  const cell0 = columns.length > 0 ? columns[0] : null;
  const rowGeometry = {
    rowHeight: null,
    rowTop: null,
    rowWidth: null,
    // ctor FUN_004fa350 리터럴 상수(정본 EXE 바이트 확인: mov [esi+4],0x1388 / mov [esi+8],0x19).
    // 좌표·행높이 아님. "25=행높이" 가설 grade a 로 기각.
    ctorConst04_notGeometry: readS32(list.add(0x4)),
    ctorConst08_notGeometry: readS32(list.add(0x8)),
    // 신뢰 불가 관측(그리드 모델 포인터를 rect 로 오독한 잔재). 좌표 계산에 쓰지 말 것.
    unreliableCellRectObservation: cell0 && cell0.rectAt20 ? cell0.rectAt20 : null,
    itemCount,
  };

  // 그리드 셀 모델(list+0x20) 관측. 컬럼 c 블록 base = grid + 0x7c24 + c*0x3f50.
  // 픽셀 rect 는 없으나, 셀이 실제로 그려지는지(플래그) 및 draw 좌표 후보영역(grid+0x20 5-dword)을
  // 다음 라이브 런에서 확정하기 위한 관측 데이터. grade c(값 미상, 구조만 확정).
  const grid = readPtr(list.add(0x20));
  const gridObservation = grid.isNull() ? { ptr: null } : {
    ptr: ptrHex(grid),
    col0BlockBase: ptrHex(grid.add(0x7c24)),
    col0RowCount9330: readS32(grid.add(0x7c24 + 0x9330)),
    col0Flag0At90d0: readU8(grid.add(0x7c24 + 0x90d0)),
    coordRegion20: spotDwordView(grid.add(0x20), 5),
  };

  // 렌더 가드 관측(Q4). itemCount 가 있어도 이 가드들이 미충족이면 셀이 안 그려질 수 있다.
  const renderGuards = {
    listId00: readS32(list),
    childGate18: readS32(list.add(0x18)),
    drawnFlag8f8: readU8(list.add(0x8f8)),
  };

  return {
    ...meta, listOrigin, parentOrigin, originCandidates,
    widgetHead, parentHead, parentRect, rowGeometry, gridObservation, renderGuards, columns, rows,
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
    systemDetail: systemDetailState(base),
    selectionHit: selectionHitState,
    commandHit: commandHitState,
    constMsgLookups: constMsgLookupState,
    nativeCalls: nativeCallState,
    nestedGates: nestedGateState,
    inputState: { ...rowState(INPUT_STATE), raw: readHex(INPUT_STATE, 0x180) },
    inputTickResult,
    selectGrid: selectGridState(),
    spotDialogList: spotDialogListState(),
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
