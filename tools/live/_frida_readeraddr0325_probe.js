'use strict';
// 실 월드리더 주소 확정 — team-lead #1 GO. 무변조, 함수경계 훅만.
// 펌프: piVar3 = FUN_00612510(...); 0x61234e mov edx,[piVar3](vtable); 0x612357 call [edx+8].
//   ∴ 실 리더 = *(*(piVar3) + 8). piVar3 = FUN_00612510 반환(EAX). 힙객체라 정적 못 읽음 →
//   FUN_00612510 onLeave(안전경계)에서 EAX 받아 *(EAX)→vtable, *(vtable+8)→리더주소 실측.
// 계측점(정본 EXE, ImageBase 0x400000):
//   0x612510 FUN_00612510 onLeave: retval=핸들러객체. reader=*(*(retval)+8).
//   0x6103e0 attach onEnter: 현재 code 태깅. 0x4ae0d0 OnRecv, 0x4ba2b0 디스패처.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ return p.sub(base).add(PREF).toString(); }

const F_ATTACH = va('0x6103e0');
const F_LOOKUP = va('0x612510');
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
const readerByCode = {};   // code -> reader addr (형제 vs 0x325 리더 동일함수인지 대조)

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1;
    try { const buf=this.context.esp.add(4).readPointer(); if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    lastCode[this.threadId] = code;
  }
});

Interceptor.attach(F_LOOKUP, {
  onLeave(retval){
    const code = lastCode[this.threadId];
    if (!WE_CODES[code]) return;
    const key = '0x'+code.toString(16);
    if (readerByCode[key]) return;   // 코드당 1회
    try {
      const handler = retval;                     // piVar3 = 핸들러 힙객체
      const vtbl = handler.readPointer();          // *(piVar3) = vtable
      const reader = vtbl.add(8).readPointer();     // vtable[2] = 실 리더
      readerByCode[key] = rel(reader);
      send({ ev:'reader_addr', code:key, handler:handler.toString(),
             vtbl:rel(vtbl), reader:rel(reader) });
    } catch(e){ send({ ev:'reader_addr_err', code:key, err:String(e) }); }
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
rpc.exports = { active(){ return activeCount(); }, readers(){ return readerByCode; } };
