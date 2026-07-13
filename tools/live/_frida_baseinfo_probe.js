'use strict';

// LOGH VII 방어적 호환성 디스커버리 프로브(관측 전용).
// 목적: 전략맵 기지 커맨드 메뉴의 어느 항목이 창고 상세 패널(view kind 5/0x11)을
// 렌더시키는지 관측한다. 함수 경계(함수 시작) 훅만 사용 — 인라인/중간 훅 금지.
// 클라이언트 메모리는 변경하지 않으며, 자연 UI 조작만으로 트리거를 찾는다.

const IMAGE_BASE = ptr('0x400000');
const module = Process.getModuleByName('g7mtclient.exe');
const moduleBase = module.base;

function abs(va) { return moduleBase.add(ptr(va).sub(IMAGE_BASE)); }
function safe(fn, fallback = null) {
  try { return fn(); } catch (_error) { return fallback; }
}
function readS32(address) { return safe(() => ptr(address).readS32()); }
function readU8(address) { return safe(() => ptr(address).readU8()); }
function readPtr(address) { return safe(() => ptr(address).readPointer(), ptr('0x0')); }
function ptrHex(value) {
  return safe(() => {
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  });
}

// strategy-ready 게이트용 정적 HUD 모드 읽기(_frida_strategy_snapshot.js selectionState() 와 동일 주소).
// 훅이 아니라 snapshot() 호출 시점의 단순 메모리 리드 — 함수 경계 훅 규칙에 저촉되지 않는다.
function hudModeF4() { return readS32(abs('0x00c9e638').add(0xf4)); }

// FUN_00507090 — 위젯 절대 원점 계산. NativeFunction 호출(훅 아님).
const READ_ABSOLUTE_ORIGIN = new NativeFunction(
  abs('0x00507090'), 'void', ['pointer', 'pointer'], { abi: 'thiscall' },
);
function clientBase() { return readPtr(abs('0x007ccffc')); }

// ===== strategy-ready 게이트 입력 (결함 A) =====
// hudModeF4 단독 게이트는 NOW LOADING 중에도 참이다(실측: hudModeF4=1 인데 화면은 로딩).
// 맵이 실제로 렌더됐다는 증거를 함께 노출한다. 전부 단순 메모리 리드 + 원점 계산 호출.
function strategyReady() {
  const listBase = abs('0x00c9eac4');
  const root = readPtr(listBase);
  const base = clientBase();

  let origin = null;
  if (root && !root.isNull()) {
    origin = safe(() => {
      const out = Memory.alloc(8);
      READ_ABSOLUTE_ORIGIN(root, out);
      return { x: readS32(out), y: readS32(ptr(out).add(4)) };
    }, null);
  }

  // 전략필드 import 완료 플래그(clientBase+0x2a58fa).
  const importFlag = (base && !base.isNull()) ? readU8(base.add(0x2a58fa)) : null;

  // HUD 행 위젯이 실제 rect 기하를 갖는지 — 렌더 레이아웃이 돌았다는 증거.
  const count = readS32(listBase.add(0x188 * 4));
  let rowsWithGeometry = 0;
  const bounded = Number.isInteger(count) ? Math.max(0, Math.min(count, 8)) : 0;
  for (let i = 0; i < bounded; i += 1) {
    const row = readPtr(listBase.add((0x22 + i) * 4));
    if (!row || row.isNull()) continue;
    const w = readS32(row.add(0x2c));
    const h = readS32(row.add(0x30));
    if (Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0) rowsWithGeometry += 1;
  }

  return {
    hudModeF4: hudModeF4(),
    strategyFieldImportComplete: Number.isInteger(importFlag) && importFlag !== 0,
    hudRootPtr: ptrHex(root),
    hudOrigin: origin,
    hudRowsWithGeometry: rowsWithGeometry,
    hudListCount188: count,
  };
}

// ===== 관측 카운터 전역 상태 =====
const state = {
  // FUN_00577e70: 상세 패널 kind setter. __thiscall, args[0]=requestedKind.
  view: { calls: 0, lastKind: null, kinds: [] },
  // FUN_0057aa90: 렌더러. __thiscall, args[0]=p1.
  render: { calls: 0, lastParam: null, nonzeroCalls: 0 },
  // FUN_0057b7b0: 情報 슬롯 텍스트. __thiscall, args[0]=sentinel ptr, args[1]=slot.
  slot: { calls: 0, last: null, slots: [] },
};

// FUN_00577e70 — 모든 requestedKind 기록(필터 없음, kind 5/0x11 아닌 것도).
Interceptor.attach(abs('0x00577e70'), {
  onEnter(args) {
    const requestedKind = safe(() => args[0].toInt32());
    state.view.calls += 1;
    state.view.lastKind = requestedKind;
    if (requestedKind !== null && state.view.kinds.length < 32
        && !state.view.kinds.includes(requestedKind)) {
      state.view.kinds.push(requestedKind);
    }
  },
});

// FUN_0057aa90 — 렌더러.
Interceptor.attach(abs('0x0057aa90'), {
  onEnter(args) {
    const p1 = safe(() => args[0].toInt32());
    state.render.calls += 1;
    state.render.lastParam = p1;
    if (p1 !== null && p1 !== 0) state.render.nonzeroCalls += 1;
  },
});

// FUN_0057b7b0 — 情報 슬롯 텍스트.
Interceptor.attach(abs('0x0057b7b0'), {
  onEnter(args) {
    const p1raw = args[0];
    const sentinel = safe(() => (p1raw.isNull() ? true : (p1raw.toInt32() === 0)));
    const slot = safe(() => args[1].toInt32());
    state.slot.calls += 1;
    state.slot.last = { sentinel, slot };
    if (slot !== null && state.slot.slots.length < 8
        && !state.slot.slots.includes(slot)) {
      state.slot.slots.push(slot);
    }
  },
});

rpc.exports = {
  snapshot() {
    return {
      // 게이트는 이제 strategyReady 논리곱으로 판정한다(_strategy_ready_gate.py).
      // selection.hudModeF4 는 하위호환/증거용으로 남긴다 — 단독 판정 금지.
      strategyReady: strategyReady(),
      selection: { hudModeF4: hudModeF4() },
      view: {
        calls: state.view.calls,
        lastKind: state.view.lastKind,
        kinds: state.view.kinds.slice(),
      },
      render: {
        calls: state.render.calls,
        lastParam: state.render.lastParam,
        nonzeroCalls: state.render.nonzeroCalls,
      },
      slot: {
        calls: state.slot.calls,
        last: state.slot.last ? { sentinel: state.slot.last.sentinel, slot: state.slot.last.slot } : null,
        slots: state.slot.slots.slice(),
      },
    };
  },
};

send({ ev: 'ready' });
