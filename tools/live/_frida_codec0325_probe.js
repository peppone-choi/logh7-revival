'use strict';
// 0x0325 도착 이분 계측 — team-lead 갱신 스펙(크기 가설 반증됨, codec+0x1c=61454 여유).
// 질문: 0x0325 가 클라 수신계층(OnRecv)에 도착하는가?
//   도착 O → 상류(트랜스포트/코덱/레코드) 정상, 드롭은 하류(RecvQue 만원/디스패처 상태게이트).
//   도착 X → 상류 소실(코덱/체크섬/프레임길이).
// 계측점(정본 EXE, ImageBase 0x400000):
//   0x4ae0d0  OnRecv     — onEnter [esp+4]=inner code (도착 이분의 핵심)
//   0x4ba2b0  디스패처   — onEnter [esp+4]=code (하류 발화 여부)
//   0x6130a0  프레임코덱 — 프롤로그 훅, 성공 시 outbuf(codec+0x18)[4] BE=inner code (상류 복호통과 시각)
//   0x7db3c8  유닛 레지스트리 activeCount
// 각 이벤트에 t:Date.now() 부착 → 서버 0x0325 송신 ts 와 대조(송신 타이밍 후보 a).
// ※ 예외핸들러는 access-violation 만 통지(이전 run 의 system 1차예외 홍수 방지).

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_ONRECV = va('0x4ae0d0');
const F_DISP   = va('0x4ba2b0');
const F_CODEC  = va('0x6130a0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1,0x200:1,0x205:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }

// per-code 폭주 방지 카운터(0x0325 는 절대 누락 안 하도록 예외)
const seen = {};
function throttle(tag, code){
  if (code === 0x325) return true;
  const k = tag+':'+code; seen[k] = (seen[k]||0)+1;
  return seen[k] <= 8;   // 코드당 8건까지만
}

let nOnrecv = 0, nOnrecv325 = 0;
Interceptor.attach(F_ONRECV, {
  onEnter(){
    let code=-1, raw=0;
    try { raw=this.context.esp.add(4).readU32()>>>0; code=raw&0xffff; } catch(e){}
    nOnrecv++; if (code===0x325) nOnrecv325++;
    if (throttle('onrecv', code))
      send({ ev:'onrecv', t:Date.now(), code:'0x'+code.toString(16), raw:'0x'+raw.toString(16), active:activeCount() });
  }
});

let seq = 0;
Interceptor.attach(F_DISP, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    if (!WE_CODES[code]) return;
    seq++; send({ ev:'disp', t:Date.now(), seq:seq, code:'0x'+code.toString(16), active:activeCount() });
  }
});

// 코덱 복호통과 시각(상류 OK 재확인) — 성공(retval≠0)한 WE 프레임만
Interceptor.attach(F_CODEC, {
  onEnter(){
    try { this.outbuf = this.context.esp.add(8).readPointer().add(0x18).readPointer(); }
    catch(e){ this.outbuf = null; }
  },
  onLeave(retval){
    if (retval.toInt32() === 0 || !this.outbuf) return;   // 빈폴링/드롭 무시
    const inner = beU16(this.outbuf.add(4));
    if (inner !== null && WE_CODES[inner])
      send({ ev:'codec', t:Date.now(), inner:'0x'+inner.toString(16), active:activeCount() });
  }
});

Process.setExceptionHandler(function(ex){
  try {
    if (ex.type !== 'access-violation') return false;   // 1차예외 홍수 차단
    const ctx = ex.context || {};
    send({ ev:'EXCEPTION', t:Date.now(), type:ex.type,
           eip: ctx.eip ? ctx.eip.sub(base).add(PREF).toString() : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           active: activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString(),
       onrecv: F_ONRECV.sub(base).add(PREF).toString(),
       disp: F_DISP.sub(base).add(PREF).toString() });
rpc.exports = {
  active(){ return activeCount(); },
  stats(){ return { nOnrecv:nOnrecv, nOnrecv325:nOnrecv325 }; }
};
