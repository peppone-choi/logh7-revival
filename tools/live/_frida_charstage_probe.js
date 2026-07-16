'use strict';
// 0x0323 char 스테이징 진단 — 함수경계 프롤로그 훅만(중간훅 금지).
// team-lead 3문항:
//  1. 0x0323 핸들러 FUN_00417390(0x417390) 진입? 진입시 char 레코드 @0x00(id)/@0x24(gridUnitId) = 우리값?
//  2. char 테이블(count@clientBase+0x36a5dc, arr@+0x36a8b4 stride0x2d4)이 스테이저/조인 시점에 채워짐?
//  3. 순서: 0x0b09→0x0323→0x0b0a 에서 0x0323이 0x0b0a 前 처리?
// clientBase = ECX@FUN_004c2a80(스테이저) entry. char/unit 테이블은 clientBase 상대 오프셋.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
function rel(p){ try { return p.sub(base).add(PREF).toString(); } catch(e){ return null; } }

const F_CHARH  = va('0x417390');   // 0x0323 핸들러(프롤로그)
const F_UNITH  = va('0x419ca0');
const F_INFO_UNIT = va('0x4bb110');
const F_INFO_CHAR = va('0x4ba560');
const F_ACTION = va('0x4c0400');
const F_STAGER = va('0x4c2a80');   // 스테이저 — ECX=clientBase
const F_JOIN   = va('0x4c2c80');   // 조인
const F_DISP   = va('0x4ba2b0');
const F_ONRECV = va('0x4ae0d0');
const F_ATTACH = va('0x6103e0');
const F_HUD_GATE = va('0x58d110');
const G_UI_ROOT = va('0x2215e2c');
const OFF_CCNT=0x36a5dc, OFF_CARR=0x36a8b4, CSTRIDE=0x2d4;
const OFF_UCNT=0x41a364, OFF_UARR=0x41a368, USTRIDE=0x58;
const WE_CODES = {0x204:1,0x206:1,0x323:1,0x325:1,0x356:1,0xb09:1,0xb0a:1,0x313:1,0x315:1,0xf03:1};

function u32(p){ try{ return p.readU32()>>>0; }catch(e){ return null; } }
function at(p,off){ try{ return p.add(off).readU32()>>>0; }catch(e){ return null; } }

// ── focus 조회 확증(RE §5): clientBase=*(0x7ccffc) 전역, 오브젝트 테이블 clientBase+0xc(600×0x370) ──
// 함수 중간 훅 없이 전역/메모리 read만. focusObj null이면 null 기록.
const G_CLIENTBASE = va('0x7ccffc');   // clientBase 포인터 전역
const G_HUD        = va('0x7c24e8');   // HUD 전역
const OFF_SELFID   = 0x3584a0;         // self-id 전역(cb 상대) — 0x0204 핸들러가 무스왑 raw 복사
function u8(p){ try{ return p.readU8()>>>0; }catch(e){ return null; } }
function readUiState(){
  const out = { mode:null, selector:null, moveLatch:null, strategyLatch:null, uiRoot:null, widgetTable:null, hudWidget:null };
  try {
    const cb = G_CLIENTBASE.readPointer();
    if(cb && !cb.isNull()){
      out.mode = u8(cb.add(0x126711));
      out.selector = u8(cb.add(0x35f35a));
      out.moveLatch = at(cb, 0x126718);
      out.strategyLatch = at(cb, 0x2a58f8);
    }
  } catch(e){}
  try {
    const root = G_UI_ROOT.readPointer();
    out.uiRoot = root && !root.isNull() ? root.toString() : null;
    if(root && !root.isNull()){
      const table = root.add(0xc).readPointer();
      out.widgetTable = table && !table.isNull() ? table.toString() : null;
      if(table && !table.isNull()){
        const slot = table.add(0x6b * 4 + 4).readPointer();
        out.hudWidget = slot && !slot.isNull() ? slot.toString() : null;
      }
    }
  } catch(e){}
  return out;
}
function readFocus(){
  const out = { clientBase:null, selfId:null, focusObj:null, focusId:null, playerInfo:null, outfitRegistry:null, hud:null, slot0_occ:null, slot0_id:null, ui:null, err:null };
  try {
    const cb = G_CLIENTBASE.readPointer();
    out.clientBase = cb.isNull()?null:cb.toString();
    try { out.hud = G_HUD.readPointer().toString(); } catch(e){}
    if(cb && !cb.isNull()){
      out.selfId = at(cb, OFF_SELFID);           // self-id 전역 (기대 1)
      out.slot0_occ = u8(cb.add(0xc));           // slot0 점유 바이트 @0x00
      out.slot0_id  = at(cb.add(0xc), 0x24);     // slot0 등록 char id @0x24 (기대 1)
      const fo = cb.add(8).readPointer();
      out.focusObj = fo.isNull()?null:fo.toString();
      if(fo && !fo.isNull()) {
        out.focusId = at(fo, 0x24);
        out.playerInfo = {
          type:u8(fo),
          id:at(fo,0x24),
          officerCount:u8(fo.add(0x270)),
          seat0Lo:at(fo,0x274),
          seat0Hi:at(fo,0x278),
          together:u8(fo.add(0x2f4)),
        };
      }
      const registry = cb.add(0x811fc);
      const entries = [];
      for(let i=0;i<4;i++) {
        const row = registry.add(i*0x20);
        entries.push({occupied:u8(row), id:at(row,4), raw:dump(row,0x20)});
      }
      out.outfitRegistry = { first:entries };
    }
    out.ui = readUiState();
  } catch(e){ out.err = String(e); }
  return out;
}
function dump(p,n){ try{ if(!p||p.isNull())return null; const b=[]; for(let i=0;i<n;i++) b.push(('0'+p.add(i).readU8().toString(16)).slice(-2)); return b.join(' '); }catch(e){ return null; } }

let g_base = null;
// clientBase는 오직 스테이저 FUN_004c2a80 진입 ecx에서만 캡처(정본 컨벤션).
// char 핸들러 this는 clientBase 아님 — 여기서 잡으면 테이블 오프셋이 엉뚱한 곳을 읽는다.
function setBaseFromStager(ecx){
  if (g_base) return;
  try { if(ecx && !ecx.isNull()){ ecx.add(OFF_CCNT).readU32(); g_base = ecx; send({ev:'base_captured', base:ecx.toString()}); } } catch(e){}
}
function tableState(tag){
  if(!g_base) return { tag:tag, base:null };
  const ccnt = u32(g_base.add(OFF_CCNT));
  const ucnt = u32(g_base.add(OFF_UCNT));
  const c0 = g_base.add(OFF_CARR);           // char[0]
  const u0 = g_base.add(OFF_UARR);           // unit[0]
  return { tag:tag, ccnt:ccnt, ucnt:ucnt,
           char0_id:at(c0,0x00), char0_flag:at(c0,0x24), char0_win:dump(c0,0x28),
           char0_tail:dump(c0.add(0x240),0x40),
           unit0_d0:at(u0,0x00), unit0_win:dump(u0,0x28) };
}

const lastCode = {};
Interceptor.attach(F_ATTACH, { onEnter(){
  try { const buf=this.context.esp.add(4).readPointer(); if(buf&&!buf.isNull()) lastCode[this.threadId]=((buf.add(4).readU8()<<8)|buf.add(5).readU8())>>>0; }catch(e){}
}});

// ── 0x0323 핸들러 프롤로그: char 레코드 바이트 실측 ──
let charhN = 0;
Interceptor.attach(F_CHARH, {
  onEnter(){
    charhN++;
    // args 스캔: 0x0323 레코드 포인터 후보. ecx + [esp+4..0x10]
    const cands = [];
    cands.push({nm:'ecx', p:this.context.ecx});
    for(let i=1;i<=4;i++){ try{ cands.push({nm:'a'+i, p:this.context.esp.add(i*4).readPointer()}); }catch(e){} }
    const recs = cands.map(c => {
      let id=null, flag=null, win=null;
      try{ if(c.p && !c.p.isNull()){ id=at(c.p,0x00); flag=at(c.p,0x24); win=dump(c.p,0x2c); } }catch(e){}
      return { nm:c.nm, ptr:c.p?c.p.toString():null, id_at0:id, flag_at24:flag, win:win };
    });
    send({ ev:'charh_enter', n:charhN, lastCode:'0x'+(lastCode[this.threadId]||0).toString(16),
           recs:recs, table:tableState('charh'), ebx:this.context.ebx?this.context.ebx.toString():null,
           ebx_win:dump(this.context.ebx,0x40) });
  }
});

let unitHandlerN = 0;
Interceptor.attach(F_INFO_UNIT, {
  onEnter(){
    unitHandlerN++;
    send({ ev:'unit_handler_enter', n:unitHandlerN, ebx:this.context.ebx?this.context.ebx.toString():null,
           ebx_win:dump(this.context.ebx,0x40), lastCode:'0x'+(lastCode[this.threadId]||0).toString(16) });
  }
});

let charHandlerN = 0;
  Interceptor.attach(F_INFO_CHAR, {
  onEnter(){
      charHandlerN++;
      send({ ev:'char_handler_enter', n:charHandlerN, ebx:this.context.ebx?this.context.ebx.toString():null,
             ebx_win:dump(this.context.ebx,0x50),
             ebx_tail:dump(this.context.ebx?this.context.ebx.add(0x240):null,0x40),
             lastCode:'0x'+(lastCode[this.threadId]||0).toString(16) });
  }
});

let actionApplyN = 0;
Interceptor.attach(F_ACTION, {
  onEnter() {
    actionApplyN++;
    if (actionApplyN <= 20 || actionApplyN % 100 === 0) {
      let arg = null;
      try { arg = this.context.esp.add(4).readPointer(); } catch(e) {}
      send({ ev:'action_apply_enter', n:actionApplyN, arg:arg?arg.toString():null,
             argId:at(arg,0x04), argSeatCount:u8(arg?arg.add(0x250):null),
             argSeatId:at(arg,0x254), argSeatRole:at(arg,0x258),
             argTogether:u8(arg?arg.add(0x2d4):null), focus:readFocus() });
    }
  },
  onLeave() {
    if (actionApplyN <= 20 || actionApplyN % 100 === 0) {
      send({ ev:'action_apply_leave', n:actionApplyN, focus:readFocus() });
    }
  },
});

let unithN = 0;
Interceptor.attach(F_UNITH, {
  onEnter(){
    unithN++;
    const cands = [];
    cands.push({nm:'ecx', p:this.context.ecx});
    for(let i=1;i<=4;i++){ try{ cands.push({nm:'a'+i, p:this.context.esp.add(i*4).readPointer()}); }catch(e){} }
    const recs = cands.map(c => ({nm:c.nm, ptr:c.p?c.p.toString():null, win:dump(c.p,0x30)}));
    send({ev:'unith_enter', n:unithN, recs:recs});
  }
});

// ── 스테이저 프롤로그: clientBase 캡처 + 테이블 상태 ──
let stagerN = 0;
Interceptor.attach(F_STAGER, {
  onEnter(){
    stagerN++; setBaseFromStager(this.context.ecx);
    this._before = tableState('stager_enter');
    const al = (this.context.eax.toUInt32()>>>0)&0xff;   // al: begin=0/end=1
    let arg0=null; try{ arg0=this.context.esp.add(4).readU32()>>>0; }catch(e){}  // [esp+4] begin(0)/end(1) 인자
    send({ ev:'stager_enter', n:stagerN, al:al, arg0:arg0, lastCode:'0x'+(lastCode[this.threadId]||0).toString(16),
           ecx:this.context.ecx.toString(), table:this._before });
  },
  onLeave(){ send({ ev:'stager_leave', n:stagerN, table:tableState('stager_leave'), focus:readFocus() }); }
});

// ── 조인 프롤로그: 테이블 상태 ──
let joinN = 0;
Interceptor.attach(F_JOIN, {
  onEnter(){ joinN++; send({ ev:'join_enter', n:joinN, lastCode:'0x'+(lastCode[this.threadId]||0).toString(16), table:tableState('join') }); }
});

let hudGateN = 0;
Interceptor.attach(F_HUD_GATE, {
  onEnter(){
    hudGateN++;
    if(hudGateN <= 20 || hudGateN % 100 === 0){
      send({ ev:'hud_gate_enter', n:hudGateN, self:this.context.ecx?this.context.ecx.toString():null,
             self0:at(this.context.ecx,0), ui:readUiState() });
    }
  },
  onLeave(retval){
    if(hudGateN <= 20 || hudGateN % 100 === 0) send({ ev:'hud_gate_leave', n:hudGateN, retval:retval.toInt32() });
  }
});

// ── 디스패치 순서 ──
let seq=0;
Interceptor.attach(F_DISP, { onEnter(){
  let code=-1; try{ code=(this.context.esp.add(4).readU32()&0xffff)>>>0; }catch(e){}
  if(!WE_CODES[code]) return; seq++;
  send({ ev:'disp', seq:seq, code:'0x'+code.toString(16), ccnt:g_base?u32(g_base.add(OFF_CCNT)):null,
         ucnt:g_base?u32(g_base.add(OFF_UCNT)):null });
}});
Interceptor.attach(F_ONRECV, { onEnter(){
  let code=-1; try{ code=this.context.esp.add(4).readU32()&0xffff; }catch(e){}
  if(WE_CODES[code]) send({ ev:'onrecv', code:'0x'+code.toString(16) });
}});

Process.setExceptionHandler(function(ex){
  try { if(ex.type!=='access-violation') return false; const ctx=ex.context||{};
    send({ ev:'EXCEPTION', type:ex.type, eip: ctx.eip?rel(ctx.eip):null,
           memAddr: ex.memory&&ex.memory.address?ex.memory.address.toString():null, focus:readFocus() }); }catch(e){}
  return false;
});

send({ ev:'ready', base:base.toString() });
rpc.exports = {
  table(){ return tableState('rpc'); },
  focus(){ return readFocus(); },
  stats(){ return { charhN:charhN, stagerN:stagerN, joinN:joinN, hudGateN:hudGateN, base:g_base?g_base.toString():null }; },
};
