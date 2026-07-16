'use strict';
// 0x0325 크기축 A/B 판정 — 함수경계 훅만(중간훅 금지, 로그인 keysetup 크래시 교훈).
// OnRecv(0x4ae0d0) + 디스패처(0x4ba2b0) 에서 0x0325 도달 여부만 관측.
//   런 A(env off, body 52804B, len>32767): 0x0325 디스패치 X 기대(베이스라인).
//   런 B(env LOGH_DIAG_SHORT_0325=1, body 92B, len<32767): 0x0325 디스패치 O 이면 크기의존 확정.
// 근거(정본 EXE, ImageBase 0x400000): 0x4ae0d0 OnRecv([esp+4]=code), 0x4ba2b0 디스패처([esp+4]=code),
//   0x7db3c8 유닛 레지스트리 activeCount(600×0xb4c, active@+0).

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_ONRECV = va('0x4ae0d0');
const F_DISP   = va('0x4ba2b0');
const F_ATTACH = va('0x6103e0');   // 검증용: 0x0325 클라 수신 body 길이(토글 실효 확인)
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}

function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let code=-1, len=0;
    try { const buf=this.context.esp.add(4).readPointer(); len=this.context.esp.add(8).readU32()>>>0;
          if(buf && !buf.isNull()) code=beU16(buf.add(4)); } catch(e){}
    if (WE_CODES[code]) send({ ev:'attach', t:Date.now(), code:'0x'+code.toString(16), len:len });
  }
});

Interceptor.attach(F_ONRECV, {
  onEnter(){
    let code=-1; try { code=this.context.esp.add(4).readU32()&0xffff; } catch(e){}
    if (WE_CODES[code]) send({ ev:'onrecv', t:Date.now(), code:'0x'+code.toString(16), active:activeCount() });
  }
});

let seq=0;
Interceptor.attach(F_DISP, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    if (!WE_CODES[code]) return;
    seq++; send({ ev:'disp', t:Date.now(), seq:seq, code:'0x'+code.toString(16), active:activeCount() });
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

send({ ev:'ready', base:base.toString() });
rpc.exports = { active(){ return activeCount(); } };
