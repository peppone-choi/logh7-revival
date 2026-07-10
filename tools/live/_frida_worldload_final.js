'use strict';
// M3 최종 검증 프로브 — 진단 전용(게임 로직/메모리 변조 없음).
// clientBase = ECX(this) @ FUN_004c2a80 entry(__thiscall). 그 base 로:
//   mode  bp+0x126711 (u8)
//   ring  bp+0x357ec0 (u32)
//   sel   bp+0x3584a0 (u32)  선택 char id
//   ccnt  bp+0x36a5dc (u32)  char 수
//   objTb bp+0xc      (u32)  오브젝트 테이블 포인터 (NOW LOADING 해제 = non-NULL)
//   char  bp+0x36a8b4 stride 0x2d4 : id@+0x00, flagship@+0x24
//   unit  bp+0x41a368 stride 0x58  : id@+0x00, count u16@bp+0x41a364
// 링크 성립(char.flagship == unit.id) → FUN_004c2c80(param_2) 호출 → objTable 빌드.
// 추가 훅: FUN_004c2c80(0x4c2c80) 호출 여부·param_2 — 플레이어 오브젝트 생성 신호.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_LOAD  = va('0x4c2a80');
const F_BUILD = va('0x4c2c80');

const OFF_MODE=0x126711, OFF_RING=0x357ec0, OFF_SEL=0x3584a0,
      OFF_CCNT=0x36a5dc, OFF_CARR=0x36a8b4, CSTRIDE=0x2d4,
      OFF_UCNT=0x41a364, OFF_UARR=0x41a368, USTRIDE=0x58,
      OFF_FLAG=0x24, OFF_OBJ=0xc;

function u8(p){try{return p.readU8();}catch(e){return -1;}}
function u16(p){try{return p.readU16();}catch(e){return -1;}}
function u32(p){try{return p.readU32()>>>0;}catch(e){return -1;}}
function be32(p){try{const a=new Uint8Array(p.readByteArray(4));return ((a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3])>>>0;}catch(e){return -1;}}
function hx(p,n){try{return hexdump(p,{length:n,header:false,ansi:false});}catch(e){return 'unreadable';}}

let g_base = null;         // 마지막 load 진입 시 clientBase
let g_c2c80 = 0;           // FUN_004c2c80 호출 누계
let g_c2c80_modes = [];    // 호출별 param_2

function readWorld(bp){
  const o = {
    base: bp.toString(),
    mode: u8(bp.add(OFF_MODE)),
    ring: u32(bp.add(OFF_RING)),
    selLE: u32(bp.add(OFF_SEL)), selBE: be32(bp.add(OFF_SEL)),
    ccnt: u32(bp.add(OFF_CCNT)),
    ucnt: u16(bp.add(OFF_UCNT)),
    objTable: '0x'+u32(bp.add(OFF_OBJ)).toString(16),
  };
  // char 배열
  o.chars = [];
  const cn = (o.ccnt>=1 && o.ccnt<=8) ? o.ccnt : 3;
  for(let i=0;i<cn;i++){
    const e = bp.add(OFF_CARR + i*CSTRIDE);
    o.chars.push({ i:i,
      idLE:u32(e), idBE:be32(e),
      flagLE:u32(e.add(OFF_FLAG)), flagBE:be32(e.add(OFF_FLAG)),
      hex:hx(e,0x40) });
  }
  // unit 배열 (stride 0x58)
  o.units = [];
  const un = (o.ucnt>=1 && o.ucnt<=16) ? o.ucnt : 4;
  for(let i=0;i<un;i++){
    const e = bp.add(OFF_UARR + i*USTRIDE);
    o.units.push({ i:i, idLE:u32(e), idBE:be32(e), hex:hx(e,0x18) });
  }
  // 링크 판정: 선택 char의 flagship 이 어떤 unit id 와 일치하는가
  const selChar = o.chars.find(c => c.idLE===o.selLE || c.idBE===o.selBE) || o.chars[0];
  o.selFlagLE = selChar ? selChar.flagLE : -1;
  o.selFlagBE = selChar ? selChar.flagBE : -1;
  o.linkMatch = false;
  for(const u of o.units){
    if(u.idLE!==0 && (u.idLE===o.selFlagLE || u.idBE===o.selFlagBE || u.idBE===o.selFlagLE || u.idLE===o.selFlagBE)){
      o.linkMatch = true; o.matchUnit = u.i; break;
    }
  }
  return o;
}

Interceptor.attach(F_LOAD, {
  onEnter(a){
    const bp = this.context.ecx;
    g_base = bp;
    let arg0=-1; try{arg0=a[0].toInt32();}catch(e){}
    const o = readWorld(bp);
    o.ev='load-enter'; o.arg0=arg0; o.c2c80_before=g_c2c80;
    send(o);
    this.bp = bp;
  },
  onLeave(r){
    let ret=-1; try{ret=r.toInt32();}catch(e){}
    const objAfter = this.bp ? u32(this.bp.add(OFF_OBJ)) : -1;
    send({ ev:'load-leave', ret:ret,
           objTableAfter:'0x'+(objAfter>>>0).toString(16),
           c2c80_after:g_c2c80, c2c80_modes:g_c2c80_modes.slice() });
  }
});

// FUN_004c2c80 — 플레이어/함대 오브젝트 빌더. 호출되면 링크 성공 신호.
Interceptor.attach(F_BUILD, {
  onEnter(a){
    g_c2c80++;
    let m=-1; try{m=a[0].toInt32();}catch(e){}
    g_c2c80_modes.push(m);
    if(g_c2c80<=40){
      send({ ev:'c2c80', n:g_c2c80, param2:m,
             ecx:this.context.ecx.toString(),
             objTable: g_base ? '0x'+u32(g_base.add(OFF_OBJ)).toString(16) : '?' });
    }
  }
});

send({ ev:'ready', base:base.toString(), fLoad:F_LOAD.toString(), fBuild:F_BUILD.toString() });

rpc.exports = {
  snap(){
    if(!g_base){
      return { gamemode:-1, ring:-1, sel:-1, charCount:-1,
               objTable:'none', c2c80:g_c2c80 };
    }
    const w = readWorld(g_base);
    return { gamemode:w.mode, ring:w.ring, sel:w.selLE, charCount:w.ccnt,
             objTable:w.objTable, c2c80:g_c2c80, linkMatch:w.linkMatch,
             selFlagLE:w.selFlagLE, ucnt:w.ucnt };
  },
  dispcount(){ return g_c2c80; },
  c2c80count(){ return g_c2c80; }
};
