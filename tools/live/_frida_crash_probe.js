'use strict';
// "초기화 안됨" 크래시 캡처 프로브 — 읽기만, 무변조.
// 근거 앵커(정본 EXE 실바이트):
//   0x4bfe92 push "初期化されてないバグ"(0x770b48)  — not-initialized bug 보고
//   0x4c976e push "ユニット初期化…そんなユニットは無い"(0x771e64) — 유닛없음 보고
//   0x5923a0 로거(printf류, arg0=포맷문자열)
//   0x4ae09b decrypt/verify 에러경로
//   0x4ba2b0 디스패처(인바운드 코드)
// 목적: 어느 동작이 어느 에러를 발화시키고 크래시(프로세스 종료)로 가나. 마지막 송수신 코드.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_LOGGER   = va('0x5923a0');
const SITE_NOINIT = va('0x4bfe92');   // "초기화 안됨 버그"
const SITE_NOUNIT = va('0x4c976e');   // "유닛 없음"
const A_FAIL     = va('0x4ae09b');
const F_DISP     = va('0x4ba2b0');
// 팀리드 확정 계측 앵커(정본 EXE 9c97de2a, ImageBase 0x400000)
const F_LOOKUP   = va('0x4c96c0');    // 유닛 조회: [esp+4]=조회id, retval=eax(0=미스)
const F_CRASHFN  = va('0x4c9a80');    // 크래시 함수: [edi+4]=유닛id, 0x4c9acf null-deref
const REG_TABLE  = va('0x7db3c8');    // 클라 유닛 레지스트리(600×0xb4c, active@+0, id@+4)
const REG_STRIDE = 0xb4c;
const REG_SLOTS  = 600;
const G_CLIENTBASE = va('0x7ccffc');

function cstr(p){ try { return p.readCString(); } catch(e){ try { return p.readUtf8String(); } catch(e2){ return null; } } }
function sjis(p){ // cp932 문자열 안전 읽기 → 헥스로 (agent가 디코드)
  try { const b=p.readByteArray(96); if(!b) return null;
        const u=new Uint8Array(b); let n=u.length; for(let i=0;i<u.length;i++){ if(u[i]===0){n=i;break;} }
        let h=''; for(let i=0;i<n;i++){ h+=(u[i]<16?'0':'')+u[i].toString(16); } return h;
  } catch(e){ return null; }
}

let events = [];
let lastDispCode = null;
let lastOutCode = null;
let outCount = 0;
let loggerMsgs = [];
let loggerCallCount = 0;
// 유닛 조회 추적
let lookups = [];          // {id, ret, missed} 최근 조회 이력
let lookupCount = 0;
let lastLookupId = null;
let lastLookupRet = null;
let crashfnCalls = [];     // FUN_004c9a80 진입 시 [edi+4]
let crashfnCount = 0;
const seenFmt = {};   // fmt 포인터 -> true (중복 억제: 새 문자열만 send)
const hookStatus = {};

function safeAttach(name, addr, cbs){
  try { Interceptor.attach(addr, cbs); hookStatus[name]='ok'; }
  catch(e){ hookStatus[name]='FAIL: '+e.message; send({ev:'hook-fail', name:name, addr:addr.toString(), err:e.message}); }
}

// ---- 로거: 진단 문자열 캡처(새 포맷문자열만 send해 플러드 방지) ----
safeAttach('logger', F_LOGGER, {
  onEnter(args){
    loggerCallCount++;
    // __cdecl 추정: [esp+4]=fmt. context.esp+4.
    let pv=null, fmt=null, hex=null;
    try { const sp=this.context.esp; const p=sp.add(4).readPointer(); pv=p.toString(); fmt=cstr(p); hex=sjis(p); } catch(e){}
    const rec = { ev:'logger', t:Date.now(), fmtAscii:fmt, fmtHex:hex, ptr:pv,
                  ret:this.returnAddress.sub(base).add(PREF).toString(),
                  lastDisp:lastDispCode, lastOut:lastOutCode };
    loggerMsgs.push(rec);
    if (loggerMsgs.length>600) loggerMsgs.shift();
    if (pv && !seenFmt[pv]) { seenFmt[pv]=true; send(rec); }   // 새 문자열만 즉시 통지
  }
});

function siteHook(addr, tag){
  safeAttach(tag, addr, {
    onEnter(){
      const rec = { ev:'errsite', tag:tag, t:Date.now(),
                    ret:this.returnAddress.sub(base).add(PREF).toString(),
                    lastDisp:lastDispCode, lastOut:lastOutCode };
      events.push(rec); send(rec);
    }
  });
}
siteHook(SITE_NOINIT, 'NOINIT_초기화안됨');
siteHook(SITE_NOUNIT, 'NOUNIT_유닛없음');

safeAttach('decrypt-fail', A_FAIL, { onEnter(){ send({ev:'decrypt-fail', t:Date.now(), lastDisp:lastDispCode}); } });

const dispCounts = {};   // 디스패치 코드별 카운트(0x325/0x315 처리 여부 결정적 판별)
safeAttach('dispatch', F_DISP, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    const k='0x'+code.toString(16);
    lastDispCode=k;
    dispCounts[k]=(dispCounts[k]||0)+1;
  }
});


// ---- 예외 핸들러: 실제 액세스 위반(팅김) 캡처 ----
Process.setExceptionHandler(function(ex){
  try {
    const ctx = ex.context || {};
    send({ ev:'EXCEPTION', t:Date.now(), type:ex.type,
           address: ex.address ? ex.address.sub(base).add(PREF).toString() : null,
           memOp: ex.memory ? ex.memory.operation : null,
           memAddr: ex.memory && ex.memory.address ? ex.memory.address.toString() : null,
           eip: ctx.eip ? ctx.eip.sub(base).add(PREF).toString() : null,
           edi: ctx.edi ? ctx.edi.toString() : null,
           eax: ctx.eax ? ctx.eax.toString() : null,
           ecx: ctx.ecx ? ctx.ecx.toString() : null,
           lastDisp:lastDispCode, lastOut:lastOutCode });
  } catch(e){}
  return false;   // 처리 안 함 → 원래대로 크래시(사용자가 보는 그 팅김 유지)
});

// ---- 유닛 조회 FUN_004c96c0: 인자 [esp+4]=조회id, retval eax(0=미스) ----
safeAttach('lookup', F_LOOKUP, {
  onEnter(args){
    lookupCount++;
    let id=null; try { id=this.context.esp.add(4).readU32()>>>0; } catch(e){}
    this._lkid = id; lastLookupId = id;
  },
  onLeave(retval){
    const ret = retval.toUInt32 ? retval.toUInt32() : (retval>>>0);
    lastLookupRet = ret;
    const rec = { ev:'lookup', t:Date.now(), id:this._lkid, ret:'0x'+ret.toString(16),
                  missed: ret===0, lastDisp:lastDispCode };
    lookups.push(rec); if (lookups.length>800) lookups.shift();
    // 미스(크래시 유발 후보)만 즉시 통지해 플러드 방지
    if (ret===0) send(rec);
  }
});

// ---- 크래시 함수 FUN_004c9a80: onEnter [edi+4]=유닛id (0x4c9acf에서 null-deref) ----
safeAttach('crashfn', F_CRASHFN, {
  onEnter(args){
    crashfnCount++;
    let uid=null, edi=null;
    try { edi=this.context.edi; uid=edi.add(4).readU32()>>>0; } catch(e){}
    const rec = { ev:'crashfn', t:Date.now(), unitId:uid, edi: edi?edi.toString():null,
                  lastLookupId:lastLookupId, lastLookupRet:lastLookupRet==null?null:('0x'+lastLookupRet.toString(16)),
                  lastDisp:lastDispCode };
    crashfnCalls.push(rec); if (crashfnCalls.length>400) crashfnCalls.shift();
    send(rec);   // 크래시 직전 함수 진입 — 항상 통지(마지막 진입이 크래시 원인)
  }
});

// ---- 아웃바운드(클라→서버) 캡처: 명령코드 0x0b01/0x0f08 등 ----
const ws2 = Process.getModuleByName('ws2_32.dll');
function exp(n){ try { return ws2.getExportByName(n); } catch(e){ return null; } }
function u16be(u,o){ return ((u[o]<<8)|u[o+1])>>>0; }
function scanOut(bytes){
  if (!bytes || bytes.length<4) return;
  const u=new Uint8Array(bytes);
  outCount++;
  // 프레임 [u16be len][u16be code] 가정(인바운드와 동일). 암호화면 code가 랜덤일 수 있음.
  const len=u16be(u,0), code=u16be(u,2);
  lastOutCode='0x'+code.toString(16);
  let head=''; for(let i=0;i<Math.min(24,u.length);i++){ head+=(u[i]<16?'0':'')+u[i].toString(16); }
  send({ ev:'send', t:Date.now(), n:outCount, len:len, code:lastOutCode, size:u.length, head:head });
}
const p_send=exp('send');
if (p_send) safeAttach('ws-send', p_send,{ onEnter(a){ try{ const n=a[2].toInt32(); if(n>0&&!a[1].isNull()) scanOut(a[1].readByteArray(Math.min(n,64))); }catch(e){} } });
const p_wsasend=exp('WSASend');
if (p_wsasend) safeAttach('ws-wsasend', p_wsasend,{ onEnter(a){ try{ const cnt=a[2].toInt32(); const wb=a[1]; if(cnt>0&&!wb.isNull()){ const blen=wb.readU32(); const bptr=wb.add(4).readPointer(); if(blen>0&&!bptr.isNull()) scanOut(bptr.readByteArray(Math.min(blen,64))); } }catch(e){} } });

// ---- OutputDebugStringA (게임 진단 프린트 캐치, 보너스) ----
const k32 = Process.getModuleByName('kernel32.dll');
function kexp(n){ try { return k32.getExportByName(n); } catch(e){ return null; } }
const seenDbg = {};
const p_ods = kexp('OutputDebugStringA');
if (p_ods) safeAttach('ods', p_ods, { onEnter(a){
  try { const p=a[0]; if(p.isNull()) return; const s=cstr(p); const h=sjis(p);
        const key=p.toString(); loggerCallCount++;
        if (!seenDbg[key]){ seenDbg[key]=true; send({ev:'odstring', t:Date.now(), ascii:s, hex:h, lastDisp:lastDispCode, lastOut:lastOutCode}); }
  } catch(e){}
}});

send({ ev:'ready', base:base.toString(), logger:F_LOGGER.toString(), hookStatus:hookStatus });

// 클라 유닛 레지스트리 테이블 @0x7db3c8 덤프: active!=0 슬롯의 id 집합
function dumpRegistry(){
  const ids = []; let active = 0, scanned = 0, err = null;
  let table = REG_TABLE; let stride = REG_STRIDE; let idOffset = 4;
  try {
    const cb = G_CLIENTBASE.readPointer();
    if (cb && !cb.isNull()) { table = cb.add(0xc); stride = 0x370; idOffset = 0x24; }
  } catch(e) {}
  try {
    for (let i=0; i<REG_SLOTS; i++){
      const ent = table.add(i*stride);
      let a=0, id=0;
      try { a = ent.readU32()>>>0; id = ent.add(idOffset).readU32()>>>0; } catch(e){ continue; }
      scanned++;
      if (a !== 0){ active++; ids.push({ slot:i, id:id, idHex:'0x'+id.toString(16), active:'0x'+a.toString(16) }); }
    }
  } catch(e){ err = e.message; }
  return { table:table.toString(), stride:stride, idOffset:idOffset, slots:REG_SLOTS,
           activeCount:active, scanned:scanned, entries:ids, err:err };
}

rpc.exports = {
  snapshot(){ return { errsites:events.slice(), loggerCount:loggerCallCount, distinctFmt:Object.keys(seenFmt).length,
                       loggerTail:loggerMsgs.slice(-30), lastDisp:lastDispCode, lastOut:lastOutCode, outCount:outCount,
                       lookupCount:lookupCount, lookupMisses:lookups.filter(l=>l.missed).length,
                       lookupTail:lookups.slice(-40), lastLookupId:lastLookupId,
                       lastLookupRet:lastLookupRet==null?null:('0x'+lastLookupRet.toString(16)),
                       crashfnCount:crashfnCount, crashfnTail:crashfnCalls.slice(-20),
                       dispCounts:dispCounts,
                       hookStatus:hookStatus }; },
  dumpregistry(){ return dumpRegistry(); },
  clear(){ events=[]; lookups=[]; crashfnCalls=[]; return true; },
};
