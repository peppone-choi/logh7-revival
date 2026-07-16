'use strict';
// 0x0325 msg32 리더 진입/OnRecv 이분 — team-lead 3점 훅(안전판). 무변조.
// 교훈: 0x612357(call [edx+8]) 등 함수 중간 인라인 훅은 로그인 keysetup 경로를 손상시켜 크래시.
//   → 중간 훅 금지. 리더 실주소를 정적 객체 vtable 로 확정하고 함수 프롤로그로만 훅한다.
// 근거(실디스어셈): 펌프 FUN_006122c0 에서 piVar3=FUN_00612510()=0x53247e0(월드진입 핸들러, static),
//   0x61234e mov edx,[edi](=*piVar3=vtable), 0x612357 call [edx+8] = vtable[2] = msg32 리더.
//   ∴ reader = *(*(0x53247e0) + 8). 프로브 로드시 라이브 메모리에서 읽어 그 함수를 프롤로그 훅.
// 계측:
//   FUN_006103e0(0x6103e0) onEnter: 현재 code=ntohs([esp+4]+4) 태깅(스레드별).
//   reader(동적확정 주소) onEnter/onLeave: code 태그로 0x0325 진입/반환.
//   OnRecv(0x4ae0d0) onEnter: code — 리더 통과 후 0x0325 OnRecv 도달여부.
//   디스패처(0x4ba2b0), activeCount(0x7db3c8).

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_READER = va('0x402e30');       // msg32 리더 실함수(정적 코드주소, 이전 run [edx+8] 관측)
const F_ATTACH = va('0x6103e0');
const F_ONRECV = va('0x4ae0d0');
const F_DISP   = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }

const lastCode = {};
let readerReported = false;

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1;
    try { const buf=this.context.esp.add(4).readPointer(); if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    lastCode[this.threadId] = code;
  }
});

// msg32 리더 함수(0x402e30) 프롤로그 훅 — 정적 코드주소, 안전. 0x0325 진입/반환 확인.
Interceptor.attach(F_READER, {
  onEnter(){ this.code = lastCode[this.threadId];
             if (WE_CODES[this.code]) send({ ev:'reader_enter', code:'0x'+this.code.toString(16), active:activeCount() }); },
  onLeave(retval){ if (WE_CODES[this.code])
             send({ ev:'reader_leave', code:'0x'+this.code.toString(16), retval:retval.toString(), active:activeCount() }); }
});

Interceptor.attach(F_ONRECV, {
  onEnter(){
    let code=-1; try { code=this.context.esp.add(4).readU32()&0xffff; } catch(e){}
    if (WE_CODES[code]) send({ ev:'onrecv', code:'0x'+code.toString(16), active:activeCount() });
  }
});

let seq=0;
Interceptor.attach(F_DISP, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    if (!WE_CODES[code]) return;
    seq++; send({ ev:'disp', seq:seq, code:'0x'+code.toString(16), active:activeCount() });
  }
});

Process.setExceptionHandler(function(ex){
  try {
    if (ex.type !== 'access-violation') return false;
    const ctx = ex.context || {};
    send({ ev:'EXCEPTION', t:Date.now(), type:ex.type,
           eip: ctx.eip ? ctx.eip.sub(base).add(PREF).toString() : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           active: activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString(), reader: F_READER.sub(base).add(PREF).toString() });
rpc.exports = { active(){ return activeCount(); } };
