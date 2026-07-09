'use strict';
// 3차 정밀 — 진짜 clientBase = ECX(this) @ FUN_004c2a80 entry (__thiscall). 그 base 로
// mode/sel/count/char배열(flagship)/unit배열을 정확히 덤프해 ret=0 원인 규명. 진단 전용.
const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_LOAD = va('0x4c2a80');

const OFF_MODE=0x126711, OFF_RING=0x357ec0, OFF_SEL=0x3584a0,
      OFF_CCNT=0x36a5dc, OFF_CARR=0x36a8b4, OFF_UARR=0x41a368, STRIDE=0x2d4;
function u8(p){try{return p.readU8();}catch(e){return -1;}}
function u32(p){try{return p.readU32();}catch(e){return -1;}}
function be32(p){try{const b=p.readByteArray(4);const a=new Uint8Array(b);return (a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3];}catch(e){return -1;}}
function hx(p,n){try{return hexdump(p,{length:n,header:false,ansi:false});}catch(e){return 'unreadable';}}

Interceptor.attach(F_LOAD, {
  onEnter(a){
    const bp = this.context.ecx;         // __thiscall this = 런타임 clientBase
    let arg0=-1; try{arg0=a[0].toInt32();}catch(e){}
    const o = { ev:'load-detail', arg0:arg0, base:bp.toString(),
      mode: u8(bp.add(OFF_MODE)),
      ring: u32(bp.add(OFF_RING)),
      selLE: u32(bp.add(OFF_SEL)), selBE: be32(bp.add(OFF_SEL)),
      count: u32(bp.add(OFF_CCNT)),
      objTable: '0x'+(u32(bp.add(0xc))>>>0).toString(16) };
    // char 배열: count 만큼(최대 6) — id(LE/BE) + flagship 후보(엔트리 hexdump로 확인)
    o.chars=[];
    const cn = (o.count>=1 && o.count<=8)? o.count : 3;
    for(let i=0;i<cn;i++){
      const e = bp.add(OFF_CARR + i*STRIDE);
      o.chars.push({ i:i, idLE:u32(e), idBE:be32(e), hex:hx(e,0x40) });
    }
    // unit 배열: 앞 8개 dword(LE/BE) + hexdump
    o.units=[];
    for(let i=0;i<8;i++){ const e=bp.add(OFF_UARR+i*4); o.units.push({le:u32(e), be:be32(e)}); }
    o.unitHex = hx(bp.add(OFF_UARR), 0x60);
    send(o);
  },
  onLeave(r){ send({ev:'load-leave', ret:r.toInt32()}); }
});
send({ev:'ready', base:base.toString()});
rpc.exports = { ping(){ return 'ok'; } };
