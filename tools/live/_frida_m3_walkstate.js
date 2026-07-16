'use strict';
// LOGH VII M3 워크 정지 실측 — 진단 전용(게임 로직/서버/자산 무변조, 읽기만).
// 대상: 정적정보 워크(FUN_004b76e0)가 0x0314 에서 멈춘 시점에 클라가 정확히
//       무슨 응답 코드를 기다리는지 확정.
//
// 근거(docs/logh7-now-loading-gate-re.md):
//   clientBase = *(DAT_007ccffc)  ← VA 0x007ccffc 전역의 '값'(힙 포인터). 모듈베이스 아님.
//   clientBase+0x357ec0 (u32)  대기 응답 카운트(0 이어야 워크 다음 스텝 진행)
//   clientBase+0x357ec4 (u16)  대기 큐 헤드 send 코드(클라가 뭘 보냈나)  [stride 0xc]
//   clientBase+0x357ec8 (u16)  대기 큐 헤드 기대 응답 코드(클라가 뭘 기다리나) ★
//   clientBase+0x357ecc (u32)  헤드 payload 포인터
//   clientBase+0x357e88 (float) 로딩 페이드(1.0=NOW LOADING 해제)
//   clientBase+0x357e8c (u32)  페이드 phase(0=풀로딩, 2=페이드아웃)
//   clientBase+0x35837f (u8)   워크 완주 플래그(1=완주)
//   DAT_007cd020 @ VA 0x007cd020 (u32)  워크 스텝 카운터(모듈베이스 상대 전역, 0x10=완주직전)
//   FUN_004c2a80 @ VA 0x004c2a80  월드로드 트리거(thiscall) — 진입 ECX = clientBase 후보
// ImageBase 0x400000, ASLR off. 그래도 런타임 base 로 재계산.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex) { return base.add(ptr(hex).sub(PREF)); }

const GLOBAL_CLIENTBASE = va('0x7ccffc'); // 값이 clientBase (힙 포인터)
const GLOBAL_WALKSTEP   = va('0x7cd020'); // DAT_007cd020 워크 스텝(모듈 상대)
const F_LOAD            = va('0x4c2a80');  // FUN_004c2a80 (thiscall, this=ECX=clientBase 후보)

// 오프셋(clientBase 상대)
const O_WAITCNT  = 0x357ec0;
const O_SENDCODE = 0x357ec4;
const O_EXPCODE  = 0x357ec8;
const O_PAYLOAD  = 0x357ecc;
const O_QSTRIDE  = 0xc;      // 큐 엔트리 stride
const O_FADE     = 0x357e88;
const O_PHASE    = 0x357e8c;
const O_WALKDONE = 0x35837f;

let ecxBase = null;   // FUN_004c2a80 진입 ECX (대안 clientBase)
let ecxSeenN = 0;

function rd(fn) { try { return fn(); } catch (e) { return null; } }
function hx(v) { return (v === null) ? null : '0x' + (v >>> 0).toString(16); }

// clientBase 후보로 4개 핵심 필드 + 큐 덤프
function readState(cb) {
  if (cb === null || cb.isNull()) return { base: cb ? cb.toString() : null, readable: false };
  const s = {
    base: cb.toString(),
    readable: true,
    waitCount: rd(() => cb.add(O_WAITCNT).readU32()),
    headSendCode: hx(rd(() => cb.add(O_SENDCODE).readU16())),
    headExpCode:  hx(rd(() => cb.add(O_EXPCODE).readU16())),
    headPayload:  rd(() => cb.add(O_PAYLOAD).readU32()),
    fade:  rd(() => cb.add(O_FADE).readFloat()),
    phase: rd(() => cb.add(O_PHASE).readU32()),
    walkDone: rd(() => cb.add(O_WALKDONE).readU8()),
    queue: [],
  };
  // 대기 큐 전체(최대 8) — 클라가 줄 세워 기다리는 응답들
  const n = (typeof s.waitCount === 'number' && s.waitCount >= 0 && s.waitCount < 32) ? s.waitCount : 0;
  const cap = Math.min(n, 8);
  for (let i = 0; i < cap; i++) {
    const off = O_SENDCODE + i * O_QSTRIDE;
    s.queue.push({
      i,
      send: hx(rd(() => cb.add(off).readU16())),
      exp:  hx(rd(() => cb.add(off + 4).readU16())),
    });
  }
  return s;
}

function snapshot(tag) {
  const cbGlobal = rd(() => GLOBAL_CLIENTBASE.readPointer());
  return {
    ev: 'walk',
    tag: tag,
    t: Date.now(),
    walkStep: hx(rd(() => GLOBAL_WALKSTEP.readU32())),   // DAT_007cd020
    global:  readState(cbGlobal),                         // ★정본: *DAT_007ccffc
    ecx:     readState(ecxBase),                          // 대안: FUN_004c2a80 진입 ECX
    ecxSeen: ecxSeenN,
  };
}

// FUN_004c2a80 진입 ECX 캡처(thiscall this) — 정본 global 과 대조용
Interceptor.attach(F_LOAD, {
  onEnter(args) {
    ecxSeenN++;
    const ecx = this.context.ecx;
    ecxBase = ecx;
    send({ ev: 'load-enter', t: Date.now(), n: ecxSeenN,
           ecx: ecx.toString(), arg0: rd(() => args[0].toInt32()) });
  },
});

send({ ev: 'ready', base: base.toString(), first: snapshot('ready') });

// 0.5초마다 자동 덤프(스트리밍)
setInterval(() => { send(snapshot('tick')); }, 500);

rpc.exports = {
  snap() { return snapshot('poll'); },
};
