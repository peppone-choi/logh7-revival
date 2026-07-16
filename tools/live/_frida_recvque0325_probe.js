'use strict';
// 0x0325 RecvQue 적재/드레인 계측 — team-lead GO(하류 훅). 무변조.
// 질문: 복호 성공한 0x0325 가 RecvQue 적재(FUN_004b8850)에 도달하는가 / 적재되는가 / 드레인되는가?
// 근거(정본 EXE, ImageBase 0x400000, 디컴파일 L36918~):
//   FUN_004b8850(param_1=code, param_2=buf) __thiscall ECX=큐베이스(in_ECX).
//     onEnter [esp+4]=code(u16), [esp+8]=buf. 빈슬롯 찾아 FUN_004b8b00(사이즈룩업)→malloc→복사.
//     성공 return low byte=1(CONCAT31(..,1)); 실패(사이즈룩업0/malloc0/500슬롯만원) return low byte=0.
//     슬롯 i: code@(base+0x3552bc+i*0x14, u16), size@(+0x3552c4), buf/occ@(+0x3552c8, !=0=점유).
//   FUN_004b8950(드레인) ECX=큐베이스, 500슬롯 순회 → 준비된 슬롯 FUN_004ba2b0(code,buf)로 디스패치.
// ∴ (a)0x325 적재함수 도달 O/X (b)도달시 적재성공/거부 (c)큐에 0x325 슬롯 상주(드레인 미발) 여부.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_ENQ   = va('0x4b8850');
const F_DRAIN = va('0x4b8950');
const F_DISP  = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const SLOT_BASE = 0x3552b8, SLOT_STRIDE = 0x14, SLOT_N = 500;
const OFF_CODE = 0x3552bc, OFF_SIZE = 0x3552c4, OFF_OCC = 0x3552c8;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}

// --- 적재 FUN_004b8850 ---
let nEnq=0, nEnq325=0;
Interceptor.attach(F_ENQ, {
  onEnter(){
    let code=-1, buf=null;
    try { code=this.context.esp.add(4).readU32()&0xffff; buf=this.context.esp.add(8).readPointer(); } catch(e){}
    this.code = code;
    nEnq++; if (code===0x325) nEnq325++;
    if (WE_CODES[code])
      send({ ev:'enq_enter', t:Date.now(), code:'0x'+code.toString(16),
             buf: buf?buf.toString():null, active:activeCount() });
  },
  onLeave(retval){
    if (!WE_CODES[this.code]) return;
    const rv = retval.toUInt32()>>>0;
    send({ ev:'enq', t:Date.now(), code:'0x'+this.code.toString(16),
           retval:'0x'+rv.toString(16), ok:((rv&0xff)===1) });
  }
});

// --- 드레인 FUN_004b8950: 큐에 0x325 슬롯 상주 여부 스캔 ---
let nDrain=0;
Interceptor.attach(F_DRAIN, {
  onEnter(){
    nDrain++;
    let ecx=null; try { ecx=this.context.ecx; } catch(e){ return; }
    if (!ecx) return;
    let depth=0, q325=0, codes=[];
    try {
      for (let i=0;i<SLOT_N;i++){
        const occ = ecx.add(OFF_OCC + i*SLOT_STRIDE).readU32()>>>0;
        if (occ===0) continue;
        depth++;
        const c = ecx.add(OFF_CODE + i*SLOT_STRIDE).readU16()>>>0;
        if (c===0x325) q325++;
        if (depth<=24) codes.push('0x'+c.toString(16));
      }
    } catch(e){}
    // 0x325 상주 시 또는 100회마다 1번 큐상태 통지(폭주 방지)
    if (q325>0 || (nDrain % 100)===1)
      send({ ev:'drain', t:Date.now(), n:nDrain, depth:depth, q325:q325, codes:codes, active:activeCount() });
  }
});

// --- 디스패처(발화 확인) ---
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

send({ ev:'ready', base:base.toString(),
       enq:F_ENQ.sub(base).add(PREF).toString(), drain:F_DRAIN.sub(base).add(PREF).toString() });
rpc.exports = {
  active(){ return activeCount(); },
  stats(){ return { nEnq:nEnq, nEnq325:nEnq325, nDrain:nDrain }; }
};
