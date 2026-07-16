'use strict';
// 0x0325 판별자 확정 — 리더 0x404210 내부 FUN_00404610 의 0x8000 분기. 무변조, 함수경계 훅.
// 리더 FUN_00404210: 0x40423b call FUN_00404610 → test al,al → jne 0x404292(스트림read·OnRecv 스킵).
// FUN_00404610: 0x40462b edx=[ebp+0xc](arg1=ptr); 0x40462e ax=*(edx); 0x404631 cmp ax,0x8000;
//   0x404643 jne(≠0x8000 정상경로) ; ==0x8000 이면 특수경로 → 0x404666 mov al,1 → 리더가 OnRecv 스킵.
// 가설: 0x0325 의 *(arg1)==0x8000(센티넬) → AL=1 → OnRecv 미도달 드롭. 형제(0x0323)는 ≠0x8000.
// 계측: FUN_00404610(0x404610) onEnter [esp+8]=arg1, val=*(arg1) u16; onLeave AL. code=attach 태그.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ return p.sub(base).add(PREF).toString(); }

const F_ATTACH = va('0x6103e0');
const F_D610   = va('0x404610');
const F_READER = va('0x404210');
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

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1;
    try { const buf=this.context.esp.add(4).readPointer(); if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    lastCode[this.threadId] = code;
  }
});

// 리더 진입 확인(프롤로그)
Interceptor.attach(F_READER, {
  onEnter(){ const c=lastCode[this.threadId];
             if (WE_CODES[c]) send({ ev:'reader_enter', code:'0x'+c.toString(16), active:activeCount() }); }
});

// 판별자 FUN_00404610 — *(arg1) vs 0x8000, 반환 AL
Interceptor.attach(F_D610, {
  onEnter(){
    this.code = lastCode[this.threadId];
    this.val = null;
    try { const a1 = this.context.esp.add(8).readPointer(); this.val = a1.readU16()>>>0; } catch(e){}
  },
  onLeave(retval){
    if (!WE_CODES[this.code]) return;
    const al = retval.toUInt32() & 0xff;
    send({ ev:'d610', code:'0x'+this.code.toString(16),
           val: this.val===null?null:'0x'+this.val.toString(16),
           is8000: this.val===0x8000, al:al, active:activeCount() });
  }
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
           eip: ctx.eip ? rel(ctx.eip) : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           active: activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString() });
rpc.exports = { active(){ return activeCount(); } };
