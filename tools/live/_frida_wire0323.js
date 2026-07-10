'use strict';
// M3 와이어 0x0323 실측 프로브 — 진단 전용(게임/메모리 변조 없음).
// 목적: 서버가 body+0x24(LE)에 쓴 gridUnitId 가 클라 수신·저장 경로의 어느
//       오프셋에 도착하는지 확정한다.
//
// 훅 1) 디스패처 FUN_004ba2b0(0x4ba2b0) case 0x323 — param_3 = 수신(디코드 후)
//       레코드 포인터. *param_3 = id. 여기서 raw body 첫 0x40B hexdump.
//       calling-convention 불명이라 ecx/args[0..2] 를 스캔해 값 0x323 을 가진
//       슬롯을 msgcode 로 간주하고 그 다음 슬롯을 record 로 덤프(자동 판별).
// 훅 2) FUN_004c2a80(0x4c2a80) — 링크 판정 시점. char 배열/unit 배열 전 엔트리
//       (id@+0x00, +0x20, flagship@+0x24, +0x28) 덤프. (기존 final.js 와 동일 로직)
// 훅 3) FUN_004c2c80(0x4c2c80) — 오브젝트 빌더 호출 신호.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_DISP  = va('0x4ba2b0');
const F_LOAD  = va('0x4c2a80');
const F_BUILD = va('0x4c2c80');

const OFF_CCNT=0x36a5dc, OFF_CARR=0x36a8b4, CSTRIDE=0x2d4,
      OFF_UCNT=0x41a364, OFF_UARR=0x41a368, USTRIDE=0x58,
      OFF_SEL=0x3584a0, OFF_FLAG=0x24;

function u8(p){try{return p.readU8();}catch(e){return -1;}}
function u16(p){try{return p.readU16();}catch(e){return -1;}}
function u32(p){try{return p.readU32()>>>0;}catch(e){return -1;}}
function be32(p){try{const a=new Uint8Array(p.readByteArray(4));return ((a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3])>>>0;}catch(e){return -1;}}
function hx(p,n){try{return hexdump(p,{length:n,header:false,ansi:false});}catch(e){return 'unreadable';}}
function isPtr(p){ try{ if(p.isNull())return false; const v=p.toUInt32? p.toUInt32():parseInt(p.toString(),16); return v>0x10000; }catch(e){ return false; } }

let g_base = null;
let g_disp323 = 0;   // 0x323 디스패치 횟수
let g_dispAny = 0;   // 총 디스패치 횟수

// ── 훅 1: 디스패처 raw wire ────────────────────────────────────────────────
Interceptor.attach(F_DISP, {
  onEnter(a){
    g_dispAny++;
    // 후보 슬롯: ecx(this) + 스택 args[0..3]
    let ecx=-1; try{ecx=this.context.ecx.toUInt32()>>>0;}catch(e){}
    const slots = [];
    slots.push({name:'ecx', val:ecx, ptr:this.context.ecx});
    for(let i=0;i<4;i++){
      let v=-1, p=null;
      try{ p=a[i]; v=p.toUInt32()>>>0; }catch(e){}
      slots.push({name:'arg'+i, val:v, ptr:p});
    }
    // 값이 0x323 인 슬롯 = msgcode
    let mi=-1;
    for(let i=0;i<slots.length;i++){ if(slots[i].val===0x323){ mi=i; break; } }
    if(mi<0) return; // 이 호출은 0x323 아님
    g_disp323++;
    if(g_disp323>8) return; // 폭주 방지 (최초 8회만 덤프)
    // record 후보 = msgcode 다음 슬롯들 중 첫 유효 포인터
    const cands = [];
    for(let i=mi+1;i<slots.length;i++){
      const s=slots[i];
      if(s.ptr && isPtr(s.ptr)){
        cands.push({ slot:s.name,
          off00:u32(s.ptr), off00be:be32(s.ptr),
          off04:u32(s.ptr.add(4)),
          off1c:u32(s.ptr.add(0x1c)),
          off20:u32(s.ptr.add(0x20)), off20be:be32(s.ptr.add(0x20)),
          off24:u32(s.ptr.add(0x24)), off24be:be32(s.ptr.add(0x24)),
          off28:u32(s.ptr.add(0x28)), off28be:be32(s.ptr.add(0x28)),
          // face=0x12345678@서버body0xf4 등 sentinel 포함하도록 0x120B
          hex:hx(s.ptr,0x120),
          // EBX-8 pre-context: msg32 헤더/prefix 가 앞에 있는지 확인
          hexPre:hx(s.ptr.sub(8),0x48) });
      }
    }
    send({ ev:'disp0323', n:g_disp323,
      msgcodeSlot:slots[mi].name,
      ecx:'0x'+(ecx>>>0).toString(16),
      argVals:slots.slice(1).map(s=>'0x'+(s.val>>>0).toString(16)),
      records:cands });
  }
});

// ── 훅 2/3: 링크 판정 & 빌더 (final.js 로직 재사용) ─────────────────────────
function readWorld(bp){
  const o = { base: bp.toString(), sel:u32(bp.add(OFF_SEL)), ccnt:u32(bp.add(OFF_CCNT)),
              ucnt:u16(bp.add(OFF_UCNT)) };
  o.chars=[];
  const cn=(o.ccnt>=1&&o.ccnt<=8)?o.ccnt:3;
  for(let i=0;i<cn;i++){
    const e=bp.add(OFF_CARR+i*CSTRIDE);
    o.chars.push({ i:i, idLE:u32(e), idBE:be32(e),
      o20:u32(e.add(0x20)), o20be:be32(e.add(0x20)),
      flagLE:u32(e.add(OFF_FLAG)), flagBE:be32(e.add(OFF_FLAG)),
      o28:u32(e.add(0x28)), o28be:be32(e.add(0x28)),
      // 0x120B: 서버 body 의 distinctive sentinel(face=0x12345678@0xf4, rank=13@0xd6,
      // abilities@0x188 은 범위 밖)까지 포함해 서버 inner 와 offset 교차대조.
      hex:hx(e,0x120) });
  }
  o.units=[];
  const un=(o.ucnt>=1&&o.ucnt<=16)?o.ucnt:4;
  for(let i=0;i<un;i++){
    const e=bp.add(OFF_UARR+i*USTRIDE);
    o.units.push({ i:i, idLE:u32(e), idBE:be32(e), hex:hx(e,0x18) });
  }
  return o;
}

Interceptor.attach(F_LOAD, {
  onEnter(a){
    const bp=this.context.ecx; g_base=bp;
    let arg0=-1; try{arg0=a[0].toInt32();}catch(e){}
    const o=readWorld(bp); o.ev='load-enter'; o.arg0=arg0;
    send(o);
  }
});

let g_c2c80=0;
Interceptor.attach(F_BUILD, {
  onEnter(a){
    g_c2c80++;
    let m=-1; try{m=a[0].toInt32();}catch(e){}
    if(g_c2c80<=20) send({ ev:'c2c80', n:g_c2c80, param2:m });
  }
});

send({ ev:'ready', base:base.toString(), fDisp:F_DISP.toString(),
       fLoad:F_LOAD.toString(), fBuild:F_BUILD.toString() });

rpc.exports = {
  snap(){
    if(!g_base) return { gamemode:-1, ring:-1, sel:-1, charCount:-1,
                          objTable:'none', c2c80:g_c2c80, disp323:g_disp323 };
    const w=readWorld(g_base);
    return { gamemode:0, ring:1, sel:w.sel, charCount:w.ccnt,
             objTable:'?', c2c80:g_c2c80, disp323:g_disp323, dispAny:g_dispAny,
             ucnt:w.ucnt, char0flag:w.chars[0]?w.chars[0].flagLE:-1 };
  },
  dispcount(){ return g_c2c80; },
  disp323count(){ return g_disp323; }
};
