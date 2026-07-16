'use strict';
// 0x0325 리더 attach_len 실값 이분 — team-lead GO(길이 VALUE 정합, signedness 아님). 무변조.
// re-analyst: 메시지 리더 FUN_006126b0 이 attach 길이를 [edi+8]로 읽어 -6 후 unsigned jbe 분기.
//   attach_len 이 52810 아니라 작으면 (len-6)<=0/underflow 로 조기탈출·오독 → 0x0325 소실.
// 실디스어셈(FUN_006126b0 @0x6126b0):
//   0x6126b0 push esi; 0x6126b3 push edi; 0x6126b4 mov edi,[esp+0xc](=arg0=메시지객체)
//   0x6126ce mov eax,[edi+8](=attach_len); 0x6126d1 add eax,-6; 0x6126d9 jbe(조기탈출); ... call 0x610420(body read)
//   ∴ true onEnter(push esi 전) 에서 arg0 = [esp+4], attach_len = [arg0+8]. 프롤로그 훅(안전).
// 계측: 리더 진입여부 + attach_len 실값 0x0325 vs 0x0323. + OnRecv/디스패치/activeCount.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_ATTACH = va('0x6103e0');
const F_READER = va('0x6126b0');
const F_ONRECV = va('0x4ae0d0');
const F_DISP   = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }

const lastCode = {}, lastAttachLen = {};

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1, len=0;
    try {
      const buf=this.context.esp.add(4).readPointer();
      len=this.context.esp.add(8).readU32()>>>0;
      if(buf && !buf.isNull()) code=beU16(buf.add(4));
    } catch(e){}
    lastCode[this.threadId] = code;
    lastAttachLen[this.threadId] = len;
  }
});

Interceptor.attach(F_READER, {
  onEnter(){
    const code = lastCode[this.threadId];
    if (!WE_CODES[code]) return;
    let arg0=null, alen=null, bufptr=null;
    try {
      arg0 = this.context.esp.add(4).readPointer();   // [esp+4] = arg0(메시지객체)
      alen = arg0.add(8).readU32()>>>0;               // [arg0+8] = attach_len (리더가 읽는 값)
      bufptr = arg0.add(4).readPointer();             // [arg0+4] = buf
    } catch(e){}
    send({ ev:'reader', code:'0x'+code.toString(16),
           attach_len: alen, attach_len_hex: alen===null?null:'0x'+alen.toString(16),
           attach_from_006103e0: lastAttachLen[this.threadId],
           bufptr: bufptr?bufptr.toString():null, active:activeCount() });
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
           eip: ctx.eip ? ctx.eip.sub(base).add(PREF).toString() : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           active: activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString(), reader:F_READER.sub(base).add(PREF).toString() });
rpc.exports = { active(){ return activeCount(); } };
