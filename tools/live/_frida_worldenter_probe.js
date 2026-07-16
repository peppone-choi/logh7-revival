'use strict';
// 월드진입 크래시 잔여리스크 계측 — 디스패치 시퀀스 + this+0x126711 플래그(무변조).
// 목적(team-lead 지시): grid-bracket 배선(27aadfaa) 후에도 activeCount=0/크래시면
//   - 클라가 0x0b0a(레지스트리 적재 트리거)에 도달하는가? (디스패치 시퀀스로 판정)
//   - 0x0b0a/0x0b09 수신 시점 this+0x126711 값(0/2=적재 실행, 1=world-mode 선행 필요)
// 근거 앵커(정본 EXE, ImageBase 0x400000):
//   0x4ba2b0 디스패처(인바운드 코드 [esp+4], ecx=대상 객체)
//   0x7db3c8 유닛 레지스트리(600×0xb4c, active@+0, id@+4)
//   this+0x126711 = world-mode 플래그(잔여리스크, RE 미확정 — module base + ecx 둘 다 읽어 보고)

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_DISP    = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8');
const REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const FLAG_OFF = 0x126711;

// 월드진입 관련 코드만 통지(하트비트 0x30 등 플러드 방지)
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1,0x200:1,0x205:1};
let seq = 0;

function u8(p){ try { return p.readU8(); } catch(e){ return null; } }

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}

Interceptor.attach(F_DISP, {
  onEnter(){
    let code=-1, ecx=null;
    try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    try { ecx=this.context.ecx; } catch(e){}
    if (!WE_CODES[code]) return;
    seq++;
    const rec = { ev:'wedisp', seq:seq, code:'0x'+code.toString(16),
                  ecx: ecx?ecx.toString():null, active: activeCount() };
    // this+0x126711: module base 기준과 ecx 기준 둘 다 읽어 어느 게 유효값인지 판별
    try { rec.flagMod = u8(base.add(FLAG_OFF)); } catch(e){}
    if (ecx) { try { rec.flagEcx = u8(ecx.add(FLAG_OFF)); } catch(e){} }
    send(rec);
  }
});

Process.setExceptionHandler(function(ex){
  try {
    const ctx = ex.context || {};
    send({ ev:'EXCEPTION', t:Date.now(), type:ex.type,
           address: ex.address ? ex.address.sub(base).add(PREF).toString() : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           eip: ctx.eip ? ctx.eip.sub(base).add(PREF).toString() : null,
           ecx: ctx.ecx ? ctx.ecx.toString() : null,
           active: activeCount(), flagMod: u8(base.add(FLAG_OFF)) });
  } catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString(), flagOff:'0x'+FLAG_OFF.toString(16) });
rpc.exports = {
  active(){ return activeCount(); },
  flag(){ return { mod: u8(base.add(FLAG_OFF)) }; },
};
