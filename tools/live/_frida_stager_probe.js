'use strict';
// 유닛 스테이저/조인 진단 — 함수경계 프롤로그 훅만(중간훅 금지, 로그인 keysetup 크래시 회피).
// team-lead 앵커:
//   FUN_004c2a80(0x4c2a80) 스테이저 — 0x0b0a에서 char×unit 조인. thiscall this=ECX=clientBase.
//   FUN_004c2c80(0x4c2c80) 조인(추정) — args=char/unit 레코드.
//   조인키: char.dword9(@+0x24) == unit.dword0(@+0). 불일치면 "unit not found"(문자열 0x770f9c) 스킵.
// 목적(3): (1)스테이저 진입 O/X (2)조인 성공/실패(activeCount 변화) (3)조인키 실값.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ try { return p.sub(base).add(PREF).toString(); } catch(e){ return null; } }

const F_HANDLER = va('0x419ca0');   // 0x0325 유닛로더 진입(프롤로그)
const F_STAGER  = va('0x4c2a80');   // 스테이저 진입(프롤로그, thiscall this=ECX)
const F_JOIN    = va('0x4c2c80');   // 조인 진입(프롤로그)
const F_DISP    = va('0x4ba2b0');
const F_ONRECV  = va('0x4ae0d0');
const F_ATTACH  = va('0x6103e0');
const STR_NOUNIT = va('0x770f9c');   // "自分の艦隊が見つからない" 참조(주소만, 훅 아님)
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }
// 포인터 p에서 n바이트 헥스(안전)
function dump(p,n){ try { if(!p||p.isNull()) return null; const b=[]; for(let i=0;i<n;i++) b.push(('0'+p.add(i).readU8().toString(16)).slice(-2)); return b.join(' '); } catch(e){ return null; } }
function u32(p,off){ try { return p.add(off).readU32()>>>0; } catch(e){ return null; } }
function ptrAt(p,off){ try { const q=p.add(off).readPointer(); return (q&&!q.isNull())?q:null; } catch(e){ return null; } }

const lastCode = {};
Interceptor.attach(F_ATTACH, { onEnter(){
  try { const buf=this.context.esp.add(4).readPointer(); if(buf&&!buf.isNull()) lastCode[this.threadId]=beU16(buf.add(4)); } catch(e){}
}});

// ── 스테이저 프롤로그: 진입 여부 + this(clientBase) + args + 전후 activeCount ──
let stagerN = 0;
Interceptor.attach(F_STAGER, {
  onEnter(){
    stagerN++;
    const ecx = this.context.ecx;
    const a = [];
    for(let i=1;i<=5;i++){ try{ a.push(this.context.esp.add(i*4).readU32()>>>0); }catch(e){ a.push(null); } }
    this._acBefore = activeCount();
    // this(ecx) 및 첫 args가 가리키는 레코드의 조인키 후보 덤프
    send({ ev:'stager_enter', n:stagerN, lastCode:'0x'+(lastCode[this.threadId]||0).toString(16),
           ecx: ecx?ecx.toString():null, args:a.map(x=>x==null?null:'0x'+x.toString(16)),
           ecx_win: dump(ecx, 0x2c), acBefore:this._acBefore });
  },
  onLeave(){
    const acAfter = activeCount();
    send({ ev:'stager_leave', n:stagerN, acBefore:this._acBefore, acAfter:acAfter,
           staged:(acAfter>(this._acBefore||0)) });
  }
});

// ── 조인 프롤로그: args = char/unit 레코드 후보. 조인키 char.dword9(@0x24) vs unit.dword0 ──
let joinN = 0;
Interceptor.attach(F_JOIN, {
  onEnter(){
    joinN++;
    const ecx = this.context.ecx, edx = this.context.edx;
    const a1 = ptrAt(this.context.esp, 4), a2 = ptrAt(this.context.esp, 8), a3 = ptrAt(this.context.esp, 12);
    // 후보 레코드들의 +0x24(char.dword9)와 +0x00(unit.dword0) 읽어 비교
    function keys(p){ return p? { at0:u32(p,0), at24:u32(p,0x24), win:dump(p,0x28) } : null; }
    send({ ev:'join_enter', n:joinN, lastCode:'0x'+(lastCode[this.threadId]||0).toString(16),
           ecx: ecx?ecx.toString():null, edx: edx?edx.toString():null,
           ecxKeys:keys(ecx), edxKeys:keys(edx),
           a1:a1?a1.toString():null, a1Keys:keys(a1),
           a2:a2?a2.toString():null, a2Keys:keys(a2),
           a3:a3?a3.toString():null, a3Keys:keys(a3) });
  }
});

// ── 유닛로더 진입(프롤로그): 0x0325 처리 진입 확인 ──
Interceptor.attach(F_HANDLER, { onEnter(){
  send({ ev:'handler_enter', lastCode:'0x'+(lastCode[this.threadId]||0).toString(16), active:activeCount() });
}});

// ── 디스패치/수신 컨텍스트(프롤로그) ──
let seq=0;
Interceptor.attach(F_DISP, { onEnter(){
  let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; }catch(e){}
  if(!WE_CODES[code]) return; seq++;
  send({ ev:'disp', seq:seq, code:'0x'+code.toString(16), active:activeCount() });
}});
Interceptor.attach(F_ONRECV, { onEnter(){
  let code=-1; try { code=this.context.esp.add(4).readU32()&0xffff; }catch(e){}
  if(WE_CODES[code]) send({ ev:'onrecv', code:'0x'+code.toString(16), active:activeCount() });
}});

Process.setExceptionHandler(function(ex){
  try {
    if(ex.type!=='access-violation') return false;
    const ctx=ex.context||{};
    send({ ev:'EXCEPTION', type:ex.type, eip: ctx.eip?rel(ctx.eip):null,
           memAddr: ex.memory&&ex.memory.address?ex.memory.address.toString():null,
           ecx: ctx.ecx?ctx.ecx.toString():null, edi: ctx.edi?ctx.edi.toString():null,
           active:activeCount() });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString(), strNoUnit:STR_NOUNIT.toString() });
rpc.exports = {
  active(){ return activeCount(); },
  stats(){ return { stagerN:stagerN, joinN:joinN, active:activeCount() }; },
};
