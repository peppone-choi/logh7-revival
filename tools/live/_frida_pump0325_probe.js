'use strict';
// 0x0325 코덱-소비 펌프 탈락점 이분 — team-lead GO. 무변조.
// 펌프 FUN_006122c0(L295247~264): 코덱 반환 메시지마다
//   L295248 FUN_006103e0(outbuf,len)  = mtStreamInputBuffer::attach (버퍼 부착, 드롭로직 없음)
//   L295251 piVar3 = FUN_00612510(CONCAT22((short)((outbuf+len)>>16), channel))  ← 핸들러/상태 룩업(vcall)
//   L295253 if(piVar3==0) 드롭경로(FUN_00614bb0+FUN_00612290)  ← 유일 드롭 지점
// 가설: 0x0325 len=52810 이 outbuf+len 을 64KB 경계 넘겨 룩업 상위16비트 키가 바뀜 → 룩업 null → 드롭.
// 계측(정본 EXE, ImageBase 0x400000):
//   0x6103e0 FUN_006103e0(buf,len) __thiscall: onEnter [esp+4]=outbuf, [esp+8]=len. code=ntohs(outbuf+4).
//   0x612510 FUN_00612510(arg)     __thiscall: onEnter [esp+4]=CONCAT22 arg. onLeave EAX=piVar3(0=null=드롭).
//   0x4ba2b0 디스패처, 0x7db3c8 레지스트리 activeCount.

const PREF = ptr('0x400000');
const mod  = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_ATTACH = va('0x6103e0');
const F_LOOKUP = va('0x612510');
const F_DISP   = va('0x4ba2b0');
const REG_TABLE = va('0x7db3c8'), REG_STRIDE = 0xb4c, REG_SLOTS = 600;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function activeCount(){
  let a=0; try { for(let i=0;i<REG_SLOTS;i++){ if((REG_TABLE.add(i*REG_STRIDE).readU32()>>>0)!==0) a++; } } catch(e){}
  return a;
}
function beU16(p){ try { return ((p.readU8()<<8)|p.add(1).readU8())>>>0; } catch(e){ return null; } }

const lastCode = {};   // tid -> 직전 attach 의 code (룩업 상관용)

Interceptor.attach(F_ATTACH, {
  onEnter(){
    let outbuf=null, len=0, code=-1;
    try {
      outbuf = this.context.esp.add(4).readPointer();
      len    = this.context.esp.add(8).readU32()>>>0;
      if (outbuf && !outbuf.isNull()) code = beU16(outbuf.add(4));
    } catch(e){}
    lastCode[this.threadId] = code;
    if (WE_CODES[code])
      send({ ev:'attach', t:Date.now(), code:'0x'+code.toString(16), len:len,
             outbuf: outbuf?outbuf.toString():null,
             sumHi: outbuf ? '0x'+(outbuf.add(len).shr(16).toUInt32()>>>0).toString(16) : null,
             active:activeCount() });
  }
});

Interceptor.attach(F_LOOKUP, {
  onEnter(){
    this.code = lastCode[this.threadId];
    try { this.arg = this.context.esp.add(4).readU32()>>>0; } catch(e){ this.arg = null; }
  },
  onLeave(retval){
    if (!WE_CODES[this.code]) return;
    const rv = retval.toUInt32()>>>0;
    send({ ev:'lookup', t:Date.now(), code:'0x'+this.code.toString(16),
           arg: this.arg===null?null:'0x'+this.arg.toString(16),
           ret:'0x'+rv.toString(16), isNull:(rv===0), active:activeCount() });
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

send({ ev:'ready', base:base.toString(),
       attach:F_ATTACH.sub(base).add(PREF).toString(), lookup:F_LOOKUP.sub(base).add(PREF).toString() });
rpc.exports = { active(){ return activeCount(); } };
