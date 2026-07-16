'use strict';
// 0x0325 vs 0x0323 실 핸들러 함수 대조 — 동일함수(내용/상태 분기)인가 다른함수(opcode-keyed)인가. 무변조.
// FUN_00404610(0x404610, __thiscall ecx=this=esi): !=0x8000 경로에서
//   0x40467e lea edi,[esi+0xc]; 0x404682 call [edx+0x14](룩업, esi+0xc에 핸들러객체 채움);
//   al!=0 → 0x4046a5 ecx=*(esi+0xc)=핸들러객체; 0x4046aa eax=*(ecx)=vtable; 0x4046b5 call [eax]=vtable[0]=실 핸들러.
//   ∴ 핸들러함수 = *(*(*(esi+0xc))). onEnter 에서 ecx(=esi) 저장, onLeave 에서 체인 read(안전 경계·메모리read).
//   (성공경로는 esi+0xc 미클리어 → onLeave 에 그 콜의 핸들러 상주. no-handler(AL=0)면 0으로 클리어됨.)

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ try { return p.sub(base).add(PREF).toString(); } catch(e){ return null; } }

const F_ATTACH = va('0x6103e0');
const F_D610   = va('0x404610');
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
const seenHandler = {};

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1;
    try { const buf=this.context.esp.add(4).readPointer(); if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    lastCode[this.threadId] = code;
  }
});

Interceptor.attach(F_D610, {
  onEnter(){ this.code = lastCode[this.threadId]; this.esi = this.context.ecx; },  // ecx=this=esi
  onLeave(retval){
    const code = this.code;
    if (!WE_CODES[code]) return;
    const al = retval.toUInt32() & 0xff;
    let hobj=null, vtbl=null, hfunc=null;
    try {
      hobj = this.esi.add(0xc).readPointer();     // *(esi+0xc) = 핸들러객체
      if (hobj && !hobj.isNull()){
        vtbl = hobj.readPointer();                 // *(hobj) = vtable
        hfunc = vtbl.readPointer();                // vtable[0] = 실 핸들러 함수
      }
    } catch(e){}
    const key = '0x'+code.toString(16);
    if (!seenHandler[key]) {
      seenHandler[key] = hfunc?rel(hfunc):null;
      send({ ev:'handler', code:key, al:al,
             hobj: hobj?hobj.toString():null,
             vtbl: vtbl?rel(vtbl):null,
             hfunc: hfunc?rel(hfunc):null, active:activeCount() });
    }
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
rpc.exports = { active(){ return activeCount(); }, handlers(){ return seenHandler; } };
