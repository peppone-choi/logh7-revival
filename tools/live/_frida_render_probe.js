'use strict';
// M3 렌더 검증 프로브 — _frida_worldload_final.js 확장(진단 전용, 무변조).
// 추가 관측: 로딩 페이드 clientBase+0x357e88 (float, 1.0=NOW LOADING 해제),
//           대기 응답 코드 clientBase+0x357ec8 (u32, 0=워크 안 막힘).
// clientBase = ECX(this) @ FUN_004c2a80 entry.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_LOAD  = va('0x4c2a80');
const F_BUILD = va('0x4c2c80');

const OFF_MODE=0x126711, OFF_RING=0x357ec0, OFF_SEL=0x3584a0,
      OFF_CCNT=0x36a5dc, OFF_CARR=0x36a8b4, CSTRIDE=0x2d4,
      OFF_UCNT=0x41a364, OFF_UARR=0x41a368, USTRIDE=0x58,
      OFF_FLAG=0x24, OFF_OBJ=0xc,
      OFF_FADE=0x357e88, OFF_WAIT=0x357ec8;

function u8(p){try{return p.readU8();}catch(e){return -1;}}
function u16(p){try{return p.readU16();}catch(e){return -1;}}
function u32(p){try{return p.readU32()>>>0;}catch(e){return -1;}}
function f32(p){try{return p.readFloat();}catch(e){return NaN;}}
function be32(p){try{const a=new Uint8Array(p.readByteArray(4));return ((a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3])>>>0;}catch(e){return -1;}}

let g_base = null;
let g_c2c80 = 0;
let g_c2c80_modes = [];

function readWorld(bp){
  const o = {
    base: bp.toString(),
    mode: u8(bp.add(OFF_MODE)),
    ring: u32(bp.add(OFF_RING)),
    selLE: u32(bp.add(OFF_SEL)),
    ccnt: u32(bp.add(OFF_CCNT)),
    ucnt: u16(bp.add(OFF_UCNT)),
    objTable: '0x'+u32(bp.add(OFF_OBJ)).toString(16),
    fade: f32(bp.add(OFF_FADE)),
    waitCode: '0x'+u32(bp.add(OFF_WAIT)).toString(16),
  };
  o.chars = [];
  const cn = (o.ccnt>=1 && o.ccnt<=8) ? o.ccnt : 3;
  for(let i=0;i<cn;i++){
    const e = bp.add(OFF_CARR + i*CSTRIDE);
    o.chars.push({ i:i, idLE:u32(e), flagLE:u32(e.add(OFF_FLAG)) });
  }
  o.units = [];
  const un = (o.ucnt>=1 && o.ucnt<=16) ? o.ucnt : 4;
  for(let i=0;i<un;i++){
    const e = bp.add(OFF_UARR + i*USTRIDE);
    o.units.push({ i:i, idLE:u32(e) });
  }
  return o;
}

Interceptor.attach(F_LOAD, {
  onEnter(a){
    const bp = this.context.ecx;
    g_base = bp;
    let arg0=-1; try{arg0=a[0].toInt32();}catch(e){}
    const o = readWorld(bp);
    o.ev='load-enter'; o.arg0=arg0;
    send(o);
    this.bp = bp;
  },
  onLeave(r){
    let ret=-1; try{ret=r.toInt32();}catch(e){}
    const objAfter = this.bp ? u32(this.bp.add(OFF_OBJ)) : -1;
    const fadeAfter = this.bp ? f32(this.bp.add(OFF_FADE)) : NaN;
    send({ ev:'load-leave', ret:ret,
           objTableAfter:'0x'+(objAfter>>>0).toString(16),
           fadeAfter:fadeAfter, c2c80_after:g_c2c80 });
  }
});

Interceptor.attach(F_BUILD, {
  onEnter(a){
    g_c2c80++;
    let m=-1; try{m=a[0].toInt32();}catch(e){}
    g_c2c80_modes.push(m);
    if(g_c2c80<=40){
      send({ ev:'c2c80', n:g_c2c80, param2:m,
             objTable: g_base ? '0x'+u32(g_base.add(OFF_OBJ)).toString(16) : '?' });
    }
  }
});

send({ ev:'ready', base:base.toString(), fLoad:F_LOAD.toString(), fBuild:F_BUILD.toString() });

rpc.exports = {
  snap(){
    if(!g_base){
      return { gamemode:-1, ring:-1, sel:-1, charCount:-1,
               objTable:'none', fade:NaN, waitCode:'none', c2c80:g_c2c80 };
    }
    const w = readWorld(g_base);
    return { gamemode:w.mode, ring:w.ring, sel:w.selLE, charCount:w.ccnt,
             objTable:w.objTable, fade:w.fade, waitCode:w.waitCode,
             ucnt:w.ucnt, c2c80:g_c2c80 };
  },
  dispcount(){ return g_c2c80; },
  c2c80count(){ return g_c2c80; }
};
