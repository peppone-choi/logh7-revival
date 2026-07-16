'use strict';
// 0x0325 스테이징 게이트 실값 확정 — FUN_00419ca0(0x0325 유닛로더, world-only) 내부.
// 0x419cd7 mov ax,[edi]; 0x419cda cmp ax,0x258(600); 0x419cde jbe 스테이징 / else 에러(스테이징 거부).
// 0x419cda onEnter 에서 ax(=*(edi))·edi·주변바이트 실측 → 우리 서버 0x0325가 >600 만드는지.
// FUN_00419ca0 은 0x0325 전용(world-only)이라 로그인 keysetup 미영향 → 중간훅 안전.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ try { return p.sub(base).add(PREF).toString(); } catch(e){ return null; } }

const F_ATTACH  = va('0x6103e0');
const F_HANDLER = va('0x419ca0');   // 0x0325 유닛로더 진입
const F_PREGATE = va('0x419cd2');   // call [eax+0x20] — pre-swap 바이트(타이브레이커)
const F_GATE    = va('0x419cda');   // cmp ax,0x258
const F_STAGER  = va('0x4c2a80');   // re-analyst 스테이저(게이트통과 후 실행?)
const F_JOIN    = va('0x4c2c80');   // re-analyst 조인
const F_ONRECV  = va('0x4ae0d0');
const F_DISP    = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }
function hexwin(p, before, n){ try { const b=[]; const s=p.sub(before); for(let i=0;i<n;i++) b.push(('0'+s.add(i).readU8().toString(16)).slice(-2)); return b.join(' '); } catch(e){ return null; } }
// msg32 헤더 [00 00 00 00 03 25] 패턴을 edi 주변에서 찾아 레코드시작 오프셋 역산(ax≠25 폴백용)
function findMsg32(p){ try { for(let off=-64; off<=8; off++){ const q=p.add(off);
  if(q.readU32()===0 && (q.add(4).readU8()===3) && (q.add(5).readU8()===0x25)) return off; } } catch(e){} return null; }

const lastCode = {};

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1;
    try { const buf=this.context.esp.add(4).readPointer(); if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    lastCode[this.threadId] = code;
  }
});

Interceptor.attach(F_HANDLER, {
  onEnter(){
    let a0=null,a1=null;
    try { a0=this.context.esp.add(4).readPointer(); a1=this.context.esp.add(8).readPointer(); } catch(e){}
    send({ ev:'handler_enter', code:'0x'+(lastCode[this.threadId]||0).toString(16),
           arg0:a0?a0.toString():null, arg1:a1?a1.toString():null, active:activeCount() });
  }
});

Interceptor.attach(F_GATE, {
  onEnter(){
    const ax = this.context.eax.toUInt32() & 0xffff;
    const edi = this.context.edi;
    const esi = this.context.esi;
    // msg32 레코드시작 오프셋 역산: edi 기준, 없으면 esi(스트림) 기준
    let recOff = edi ? findMsg32(edi) : null;
    send({ ev:'gate600', code:'0x'+(lastCode[this.threadId]||0).toString(16),
           ax:ax, ax_hex:'0x'+ax.toString(16), pass:(ax<=0x258), gt600:(ax>0x258),
           edi: edi?edi.toString():null,
           edi_win: edi?hexwin(edi,8,56):null,           // edi-8 .. edi+47
           esi: esi?esi.toString():null,
           esi_win: esi?hexwin(esi,0,16):null,
           msg32_off: recOff,                             // edi - 레코드시작(헤더6B 포함)
           active:activeCount() });
  }
});

// pre-swap 타이브레이커: [eax+0x20] 호출 직전 edi 바이트 = 클라 수신 원본(서버 실송신 확정)
Interceptor.attach(F_PREGATE, {
  onEnter(){
    const edi = this.context.edi;
    send({ ev:'pregate', code:'0x'+(lastCode[this.threadId]||0).toString(16),
           edi: edi?edi.toString():null, pre_bytes: edi?hexwin(edi,0,8):null });
  }
});

// 스테이저/조인 훅은 격리를 위해 비활성(0x4046c2 크래시가 이 훅 아티팩트인지 판별).
// 필요시 재활성: Interceptor.attach(F_STAGER/F_JOIN, ...)

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
    function r(x){ return x ? x.toString() : null; }
    send({ ev:'EXCEPTION', t:Date.now(), type:ex.type,
           eip: ctx.eip ? rel(ctx.eip) : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           eax:r(ctx.eax), ecx:r(ctx.ecx), edx:r(ctx.edx),
           esi:r(ctx.esi), edi:r(ctx.edi), ebx:r(ctx.ebx),
           active: activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString() });
rpc.exports = { active(){ return activeCount(); } };
