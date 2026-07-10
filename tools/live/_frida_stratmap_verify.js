'use strict';
// M3 전략맵 최종 검증 프로브 — 진단 전용(게임/서버/메모리 변조 없음).
// wire0323.js(디스패치 raw body + 링크) + worldload_final.js(objTable +0xc + mode)
// 를 한 세션에 통합해 판정 3종을 동시 수집한다:
//   (1) 클라가 0x0323 을 dispatch 하는가(폐기 아님) + char.flagship(struct+0x24)==unit id
//   (2) objTable(clientBase+0xc) 에 유닛 채워짐 + 팬텀 유닛/count 오독 없음
//   (3) mode/ring/objTable 로 NOW LOADING 해제 신호
// clientBase = ECX(this) @ FUN_004c2a80 entry(__thiscall). ImageBase 0x400000, ASLR off.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_DISP  = va('0x4ba2b0');
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
function isPtr(p){ try{ if(p.isNull())return false; const v=p.toUInt32? p.toUInt32():parseInt(p.toString(),16); return v>0x10000; }catch(e){ return false; } }

let g_base=null, g_disp323=0, g_dispAny=0, g_c2c80=0;
const g_c2c80_modes=[];

// ── 훅 1: 디스패처 FUN_004ba2b0 case 0x323 raw wire ─────────────────────────
Interceptor.attach(F_DISP, {
  onEnter(a){
    g_dispAny++;
    let ecx=-1; try{ecx=this.context.ecx.toUInt32()>>>0;}catch(e){}
    const slots=[{name:'ecx',val:ecx,ptr:this.context.ecx}];
    for(let i=0;i<4;i++){ let v=-1,p=null; try{p=a[i];v=p.toUInt32()>>>0;}catch(e){} slots.push({name:'arg'+i,val:v,ptr:p}); }
    let mi=-1; for(let i=0;i<slots.length;i++){ if(slots[i].val===0x323){ mi=i; break; } }
    if(mi<0) return;
    g_disp323++;
    if(g_disp323>8) return;
    const cands=[];
    for(let i=mi+1;i<slots.length;i++){
      const s=slots[i];
      if(s.ptr && isPtr(s.ptr)){
        cands.push({ slot:s.name,
          off00:u32(s.ptr), off00be:be32(s.ptr), off04:u32(s.ptr.add(4)),
          off1c:u32(s.ptr.add(0x1c)),
          off20:u32(s.ptr.add(0x20)), off20be:be32(s.ptr.add(0x20)),
          off24:u32(s.ptr.add(0x24)), off24be:be32(s.ptr.add(0x24)),
          off28:u32(s.ptr.add(0x28)), off28be:be32(s.ptr.add(0x28)),
          hex:hx(s.ptr,0x120) });
      }
    }
    send({ ev:'disp0323', n:g_disp323, msgcodeSlot:slots[mi].name,
      argVals:slots.slice(1).map(s=>'0x'+(s.val>>>0).toString(16)), records:cands });
  }
});

function readWorld(bp){
  const o={ base:bp.toString(), mode:u8(bp.add(OFF_MODE)), ring:u32(bp.add(OFF_RING)),
    selLE:u32(bp.add(OFF_SEL)), selBE:be32(bp.add(OFF_SEL)),
    ccnt:u32(bp.add(OFF_CCNT)), ucnt:u16(bp.add(OFF_UCNT)),
    objTable:'0x'+u32(bp.add(OFF_OBJ)).toString(16) };
  o.chars=[];
  const cn=(o.ccnt>=1&&o.ccnt<=8)?o.ccnt:3;
  for(let i=0;i<cn;i++){ const e=bp.add(OFF_CARR+i*CSTRIDE);
    o.chars.push({ i:i, idLE:u32(e), idBE:be32(e),
      flagLE:u32(e.add(OFF_FLAG)), flagBE:be32(e.add(OFF_FLAG)), hex:hx(e,0x40) }); }
  o.units=[];
  // 팬텀 유닛/count 오독 검사용으로 count 와 무관하게 8엔트리까지 스캔
  const scan=8;
  for(let i=0;i<scan;i++){ const e=bp.add(OFF_UARR+i*USTRIDE);
    o.units.push({ i:i, idLE:u32(e), idBE:be32(e), hex:hx(e,0x18) }); }
  const selChar=o.chars.find(c=>c.idLE===o.selLE||c.idBE===o.selBE)||o.chars[0];
  o.selFlagLE=selChar?selChar.flagLE:-1; o.selFlagBE=selChar?selChar.flagBE:-1;
  o.linkMatch=false;
  for(const u of o.units){
    if(u.idLE!==0 && (u.idLE===o.selFlagLE||u.idBE===o.selFlagBE||u.idBE===o.selFlagLE||u.idLE===o.selFlagBE)){
      o.linkMatch=true; o.matchUnit=u.i; break; }
  }
  return o;
}

Interceptor.attach(F_LOAD, {
  onEnter(a){ const bp=this.context.ecx; g_base=bp;
    let arg0=-1; try{arg0=a[0].toInt32();}catch(e){}
    const o=readWorld(bp); o.ev='load-enter'; o.arg0=arg0; o.c2c80_before=g_c2c80;
    send(o); this.bp=bp; },
  onLeave(r){ let ret=-1; try{ret=r.toInt32();}catch(e){}
    const objAfter=this.bp?u32(this.bp.add(OFF_OBJ)):-1;
    send({ ev:'load-leave', ret:ret, objTableAfter:'0x'+(objAfter>>>0).toString(16),
      c2c80_after:g_c2c80, c2c80_modes:g_c2c80_modes.slice(),
      ucntNow:this.bp?u16(this.bp.add(OFF_UCNT)):-1 }); }
});

Interceptor.attach(F_BUILD, {
  onEnter(a){ g_c2c80++; let m=-1; try{m=a[0].toInt32();}catch(e){} g_c2c80_modes.push(m);
    if(g_c2c80<=40) send({ ev:'c2c80', n:g_c2c80, param2:m,
      objTable:g_base?'0x'+u32(g_base.add(OFF_OBJ)).toString(16):'?' }); }
});

send({ ev:'ready', base:base.toString(), fDisp:F_DISP.toString(),
  fLoad:F_LOAD.toString(), fBuild:F_BUILD.toString() });

rpc.exports = {
  snap(){
    if(!g_base) return { gamemode:-1, ring:-1, sel:-1, charCount:-1, objTable:'none',
      c2c80:g_c2c80, disp323:g_disp323, dispAny:g_dispAny };
    const w=readWorld(g_base);
    return { gamemode:w.mode, ring:w.ring, sel:w.selLE, charCount:w.ccnt, ucnt:w.ucnt,
      objTable:w.objTable, linkMatch:w.linkMatch, matchUnit:w.matchUnit,
      selFlagLE:w.selFlagLE, selFlagBE:w.selFlagBE,
      c2c80:g_c2c80, disp323:g_disp323, dispAny:g_dispAny,
      unit0:w.units[0]?w.units[0].idLE:-1, unit0be:w.units[0]?w.units[0].idBE:-1 };
  },
  dispcount(){ return g_c2c80; },
  disp323count(){ return g_disp323; }
};
