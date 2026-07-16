'use strict';
// 디스패치 스트림 프로브 — 진단 전용(메모리/로직 무변조).
// 타깃: 클라 메시지 디스패처 FUN_004ba2b0 (__thiscall).
//   프롤로그 정적분석 결과:
//     ecx = this (클라 객체)
//     [ebp+8]  = param_1  (진입시 [esp+4]) → &0xffff = 디스패치 메시지 코드
//     [ebp+0xc]= param_2  (데이터 포인터/플래그, 0검사)
//     0x4ba316: mov eax,[ebp+8]; and eax,0xffff; ... jmp [eax*4+0x4bde7c]
//     코드>0x301 은 0x4ba532 의 2차 스위치(jmp [ecx*4+0x4bde98])로 라우팅
//   → 우리 관심 코드 0x304/0x305/0x307/0x314/0x315 전부 이 함수 진입점을 통과한다.
// 목적: 0x0307 디스패치 이후 코드 시퀀스를 잡아 0x315 가 한 번이라도 디스패치되는지 판정.
// 추가: recv 큐(clientBase+0x3552b8, stride0x14, code@+4, size@+0xc)와 self_id(+0x3584a0) rpc 덤프.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }

const F_DISP = va('0x4ba2b0');        // 디스패처
const P_CLIENTBASE = va('0x7ccffc');  // DAT_007ccffc → clientBase 포인터
const OFF_RECV = 0x3552b8;            // recv 큐 시작
const RECV_STRIDE = 0x14;
const RECV_CODE = 0x4;                // entry+0x4 (0x3552bc-0x3552b8)
const RECV_SIZE = 0xc;                // entry+0xc (0x3552c4-0x3552b8)
const OFF_SELF = 0x3584a0;            // self_id (선택 char id)

function u16(p){try{return p.readU16();}catch(e){return -1;}}
function u32(p){try{return p.readU32()>>>0;}catch(e){return -1;}}
function ptrAt(p){try{return p.readPointer();}catch(e){return NULL;}}

const SEQ_CAP = 40000;
let seq = [];            // 모든 디스패치 코드 (순서대로, 캡)
let workSeq = [];        // 워크영역 코드(>=0x300)만 (순서대로) — 시퀀스 판독용
let counts = {};         // code(hex) -> count
let total = 0;
let seen315 = false;
let firstIdxAfter307 = -1;
let lastClientEcx = NULL;

function clientBase(){
  // 우선 DAT_007ccffc 역참조, 실패 시 디스패처가 본 마지막 ecx 사용
  const p = ptrAt(P_CLIENTBASE);
  if (!p.isNull()) return p;
  return lastClientEcx;
}

Interceptor.attach(F_DISP, {
  onEnter(a){
    let code = -1;
    try { code = (this.context.esp.add(4).readU32() & 0xffff) >>> 0; } catch(e){}
    const ecx = this.context.ecx;
    lastClientEcx = ecx;
    total++;
    if (seq.length >= SEQ_CAP) seq.shift();
    seq.push(code);
    const key = '0x'+code.toString(16);
    counts[key] = (counts[key]||0) + 1;
    if (code >= 0x300 && code <= 0x400) {
      if (workSeq.length >= 8000) workSeq.shift();
      workSeq.push(code);
    }
    if (code === 0x307 && firstIdxAfter307 < 0) firstIdxAfter307 = seq.length;
    if (code === 0x315 && !seen315) {
      seen315 = true;
      // 0x315 최초 디스패치 순간: self_id / param2 / recv 상태 스냅샷
      const cb = clientBase();
      let selfId = -1, param2 = -1;
      try { param2 = this.context.esp.add(8).readU32()>>>0; } catch(e){}
      if (!cb.isNull()) selfId = u32(cb.add(OFF_SELF));
      send({ ev:'DISPATCH-0x315', total: total, param2:'0x'+param2.toString(16),
             ecx: ecx.toString(), clientBase: cb.toString(),
             selfId:'0x'+(selfId>>>0).toString(16),
             recentWork: workSeq.slice(-24).map(c=>'0x'+c.toString(16)) });
    }
  }
});

function dumpRecv(n){
  const cb = clientBase();
  const out = { clientBase: cb.toString(), entries: [] };
  if (cb.isNull()) return out;
  out.selfId = '0x'+(u32(cb.add(OFF_SELF))>>>0).toString(16);
  const qbase = cb.add(OFF_RECV);
  for (let i=0;i<n;i++){
    const e = qbase.add(i*RECV_STRIDE);
    out.entries.push({ i:i,
      code:'0x'+(u16(e.add(RECV_CODE))>>>0).toString(16),
      code32:'0x'+(u32(e.add(RECV_CODE))>>>0).toString(16),
      size: u32(e.add(RECV_SIZE)),
      hex: (function(){try{return hexdump(e,{length:RECV_STRIDE,header:false,ansi:false});}catch(x){return '?';}})() });
  }
  return out;
}

send({ ev:'ready', base:base.toString(), disp:F_DISP.toString(),
       clientBasePtr:P_CLIENTBASE.toString() });

rpc.exports = {
  // 디스패치 스트림 요약
  summary(){
    // 0x0307 이후 코드 시퀀스(중복 압축 없이 순서대로, 최대 400개)
    let after307 = [];
    if (firstIdxAfter307 >= 0) after307 = seq.slice(firstIdxAfter307, firstIdxAfter307+400);
    // 워크영역(>=0x300) 코드 유니크 등장 순서
    const workUnique = [];
    const seen = {};
    for (const c of workSeq){ if(!seen[c]){seen[c]=1; workUnique.push('0x'+c.toString(16));} }
    return {
      total: total,
      seen315: seen315,
      count315: counts['0x315']||0,
      count307: counts['0x307']||0,
      count305: counts['0x305']||0,
      count314: counts['0x314']||0,
      workUniqueOrder: workUnique,
      after307: after307.map(c=>'0x'+c.toString(16)),
      workTail: workSeq.slice(-60).map(c=>'0x'+c.toString(16)),
    };
  },
  recv(n){ return dumpRecv(n||32); },
  counts(){ return counts; },
};
