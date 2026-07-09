'use strict';
// LOGH VII 월드 로드(NOW LOADING) 진단 훅 — 진단 전용, 게임 로직 변조 금지.
// 측정 대상(loop-state 문서 근거):
//   게임모드  clientBase+0x126711 (U8)  — 0x0b0a 처리 시 0/2/기타 판정
//   send-ring clientBase+0x357ec0 (U32) — 0x0314 후/0x0315 후 pop 여부
//   선택char  clientBase+0x3584a0 (U32) — 0x0204가 세팅
//   char cnt  clientBase+0x36a5dc (U32) — 0x0323이 채움
//   FUN_004c2a80 (VA 0x4c2a80)          — 월드 로드 트리거: 호출·arg0·retval(bVar1)
//   FUN_004ba2b0 (VA 0x4ba2b0)          — 메시지 디스패처: 상태 전이 추적
// ImageBase 0x400000, ASLR off. 그래도 런타임 base로 재계산.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex) { return base.add(ptr(hex).sub(PREF)); }

const A_GAMEMODE = va('0x526711');
const A_RING     = va('0x757ec0');
const A_SELCHAR  = va('0x7584a0');
const A_CHARCNT  = va('0x76a5dc');
const A_CHARARR  = va('0x76a8b4');
const A_UNITARR  = va('0x81a368');
const F_LOAD     = va('0x4c2a80');
const F_DISPATCH = va('0x4ba2b0');

function rd(fn) { try { return fn(); } catch (e) { return -1; } }
function snap(tag) {
  return {
    ev: 'snap', tag: tag, t: Date.now(),
    gamemode: rd(() => A_GAMEMODE.readU8()),
    ring: rd(() => A_RING.readU32()),
    sel: rd(() => A_SELCHAR.readU32()),
    charCount: rd(() => A_CHARCNT.readU32()),
    charArr0: rd(() => A_CHARARR.readU32()),
    unitArr0: rd(() => A_UNITARR.readU32()),
  };
}

send({ ev: 'ready', base: base.toString(),
       gamemode: rd(() => A_GAMEMODE.readU8()),
       ring: rd(() => A_RING.readU32()) });

// ── FUN_004c2a80: 월드 로드 트리거 ──────────────────────────────────────────
// 호출되는가? arg0(0=static walk / 1=NotifyEnterGridEnd)? retval(bVar1: 선택 char 발견/링크 성공)?
Interceptor.attach(F_LOAD, {
  onEnter(a) {
    this.arg0 = rd(() => a[0].toInt32());
    const s = snap('load-enter');
    s.ev = 'load-enter';
    s.arg0 = this.arg0;
    send(s);
  },
  onLeave(r) {
    send({ ev: 'load-leave', t: Date.now(), arg0: this.arg0,
           ret: rd(() => r.toInt32()),
           gamemode: rd(() => A_GAMEMODE.readU8()),
           ring: rd(() => A_RING.readU32()) });
  }
});

// ── FUN_004ba2b0: 디스패처 ───────────────────────────────────────────────────
// 호출 규약 불명 → opcode 후보를 여러 해석으로 캡처. 플러딩 방지: (gamemode,ring)
// 전이가 있을 때만 send + 초기 300건은 무조건 send(개시 시퀀스 포착).
let dispN = 0;
let lastGm = -2, lastRing = -2;
Interceptor.attach(F_DISPATCH, {
  onEnter(a) {
    dispN++;
    const gm = rd(() => A_GAMEMODE.readU8());
    const ring = rd(() => A_RING.readU32());
    const changed = (gm !== lastGm) || (ring !== lastRing);
    if (changed || dispN <= 300) {
      lastGm = gm; lastRing = ring;
      const row = { ev: 'dispatch', n: dispN, t: Date.now(), gm: gm, ring: ring };
      row.a0 = rd(() => a[0].toInt32());
      row.a1 = rd(() => a[1].toInt32());
      row.p0u16 = rd(() => a[0].readU16());   // a0가 버퍼면 opcode 후보
      row.a0u16 = rd(() => a[0].toInt32() & 0xffff);
      send(row);
    }
  }
});

rpc.exports = {
  snap() { return snap('poll'); },
  dispcount() { return dispN; }
};
