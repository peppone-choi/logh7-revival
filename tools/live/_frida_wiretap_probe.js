'use strict';
// 인바운드 와이어 탭 — 진단 전용(무변조).
// 목적: 서버가 바이트 정확히 write한 0x0315 응답 프레임(~5016B)이 클라 소켓에 도착하는지,
//       도착하면 클라 디스패처(FUN_004ba2b0)가 0x315를 디스패치하는지 한 런에서 교차 측정.
// 와이어 프레임(근거 logh7-envelope-0030.mjs):
//   [u16BE len][u16BE code=0x0030][암호화 body]   (총 wire바이트 = 2 + len)
//   len = 2(코드워드) + enc.length. inner code(0x0315)는 암호화돼 소켓레벨 비가시 → 크기로 판정.
// 훅: ws2_32!recv, ws2_32!WSARecv (수신 raw), + 디스패처 FUN_004ba2b0 param_1.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const F_DISP = va('0x4ba2b0');
const F_ENQ  = va('0x4b8850');   // recv-큐 enqueue (수신적재). 여기 도달=코드 알려짐→적재
const A_FAIL = va('0x4ae08a');   // decrypt/verify 게이트 실패 직후(call [edx+0x1c] 반환 al=0). 드롭 지점.

const ws2 = Process.getModuleByName('ws2_32.dll');
function exp(name){ try { return ws2.getExportByName(name); } catch(e){ return null; } }
const p_recv = exp('recv');
const p_wsarecv = exp('WSARecv');

// ---- 프레임 재조립 (소켓 핸들별) ----
function BQ(){ this.parts=[]; this.len=0; this.desync=false; }
BQ.prototype.push=function(u8){ this.parts.push(u8); this.len+=u8.length; };
BQ.prototype._flat=function(){
  if(this.parts.length>1){ const b=new Uint8Array(this.len); let o=0;
    for(const p of this.parts){ b.set(p,o); o+=p.length; } this.parts=[b]; }
  return this.parts[0]||new Uint8Array(0);
};
BQ.prototype.take=function(n){ const b=this._flat(); const f=b.subarray(0,n);
  this.parts=[b.slice(n)]; this.len-=n; return f; };

const queues = {};              // sockKey -> BQ
let frames = [];                // {sock,i,total,lenField,code,hdr,ts}
let frameCount = 0;
let recvCalls = 0;
let totalInbound = 0;
const sizeHist = {};            // total-size -> count

function u16be(b,o){ return ((b[o]<<8)|b[o+1])>>>0; }
function hexOf(b,n){ let s=''; const m=Math.min(n,b.length);
  for(let i=0;i<m;i++){ s += (b[i]<0x10?'0':'')+b[i].toString(16); } return s; }

function emitFrame(sk, frame){
  frameCount++;
  const total = frame.length;
  const lenField = frame.length>=2 ? u16be(frame,0) : -1;
  const code = frame.length>=4 ? u16be(frame,2) : -1;   // 봉투 코드(0x0030 기대)
  sizeHist[total] = (sizeHist[total]||0)+1;
  const rec = { sock:sk, i:frameCount, total:total, lenField:lenField,
                code:'0x'+code.toString(16), hdr:hexOf(frame,16) };
  if (frames.length < 4000) frames.push(rec);
  // 대형/후보 프레임은 즉시 스트리밍(런처 크래시 대비)
  if (total >= 3000 || code !== 0x30) {
    send({ ev:'frame', sock:sk, i:frameCount, total:total, lenField:lenField,
           code:rec.code, hdr:hexOf(frame,32) });
  }
}

function feed(sockPtr, u8){
  if (!u8 || u8.length===0) return;
  const sk = sockPtr.toString();
  totalInbound += u8.length;
  let q = queues[sk]; if(!q){ q=new BQ(); queues[sk]=q; }
  q.push(u8);
  // 파싱: [u16BE len][그 len 바이트] = 한 프레임. total = 2 + len.
  let guard = 0;
  while (q.len >= 2 && guard++ < 100000){
    const b = q._flat();
    const lenField = u16be(b,0);
    const total = 2 + lenField;
    if (lenField < 2 || total > 0x40000){ q.desync = true; break; }  // 미정렬/이상
    if (q.len < total) break;                                        // 프레임 미완
    const frame = q.take(total);
    emitFrame(sk, frame);
  }
}

// ---- recv ----
if (p_recv){
  Interceptor.attach(p_recv, {
    onEnter(a){ this.sock=a[0]; this.buf=a[1]; this.len=a[2].toInt32(); },
    onLeave(r){
      recvCalls++;
      const n = r.toInt32();
      if (n>0 && this.buf && !this.buf.isNull()){
        try { feed(this.sock, new Uint8Array(this.buf.readByteArray(n))); } catch(e){}
      }
    }
  });
}

// ---- WSARecv ----
// int WSARecv(SOCKET s, LPWSABUF lpBuffers, DWORD cnt, LPDWORD lpRecvd, LPDWORD lpFlags, LPWSAOVERLAPPED ov, ...)
// WSABUF { u_long len; char* buf; }  (32bit: 8바이트)
if (p_wsarecv){
  Interceptor.attach(p_wsarecv, {
    onEnter(a){ this.sock=a[0]; this.pbufs=a[1]; this.cnt=a[2].toInt32();
                this.precvd=a[3]; this.ov=a[5]; },
    onLeave(r){
      recvCalls++;
      const ret = r.toInt32();
      const overlapped = this.ov && !this.ov.isNull();
      if (ret===0 && !overlapped && this.precvd && !this.precvd.isNull()){
        let remain=-1; try { remain=this.precvd.readU32(); } catch(e){}
        if (remain>0){
          for (let i=0;i<this.cnt && remain>0;i++){
            const wb = this.pbufs.add(i*8);
            let blen=0, bptr=NULL;
            try { blen=wb.readU32(); bptr=wb.add(4).readPointer(); } catch(e){ break; }
            const take = Math.min(blen, remain);
            if (take>0 && !bptr.isNull()){
              try { feed(this.sock, new Uint8Array(bptr.readByteArray(take))); } catch(e){}
            }
            remain -= take;
          }
        }
      } else if (overlapped){
        send({ ev:'wsarecv-overlapped', sock:this.sock.toString(), ret:ret });
      }
    }
  });
}

// ---- 디스패처 상관 ----
let dispSeq = [];
let dispCounts = {};
let dispTotal = 0;
Interceptor.attach(F_DISP, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    dispTotal++;
    const k='0x'+code.toString(16);
    dispCounts[k]=(dispCounts[k]||0)+1;
    if (code>=0x300 && code<=0x400 && dispSeq.length<2000) dispSeq.push(k);
  }
});

// ---- enqueue(수신적재) 도달 코드 ----
// 호출부: push eax(srcbuf); push edx(code); call 0x4b8850 → 진입시 [esp+4]=code,[esp+8]=srcbuf
let enqCodes = [];
let enqCounts = {};
Interceptor.attach(F_ENQ, {
  onEnter(){
    let code=-1; try { code=(this.context.esp.add(4).readU32()&0xffff)>>>0; } catch(e){}
    const k='0x'+code.toString(16);
    enqCounts[k]=(enqCounts[k]||0)+1;
    if (code>=0x300 && code<=0x400 && enqCodes.length<2000) enqCodes.push(k);
  }
});

// ---- decrypt/verify 게이트 실패(드롭) ----
let failCount = 0;
let failFrames = [];
Interceptor.attach(A_FAIL, {
  onEnter(){
    failCount++;
    const esi = this.context.esi;
    let code6=-1, hx='?';
    try { code6=esi.add(6).readU16(); } catch(e){}
    try { hx=hexOf(new Uint8Array(esi.readByteArray(64)),64); } catch(e){}
    const rec = { n:failCount, envCode:'0x'+(code6>>>0).toString(16), esi:esi.toString(), hex:hx };
    if (failFrames.length<64) failFrames.push(rec);
    send({ ev:'decrypt-fail', n:failCount, envCode:rec.envCode, hex:hx });
  }
});

send({ ev:'ready', base:base.toString(),
       recv:(p_recv?p_recv.toString():'none'),
       wsarecv:(p_wsarecv?p_wsarecv.toString():'none'),
       enq:F_ENQ.toString(), fail:A_FAIL.toString() });

rpc.exports = {
  summary(){
    // 크기 히스토그램 정렬
    const sizes = Object.keys(sizeHist).map(Number).sort((x,y)=>y-x)
                    .map(s=>({size:s,count:sizeHist[s]}));
    // 대형 프레임(>=3000) 목록 순서대로
    const big = frames.filter(f=>f.total>=3000)
                      .map(f=>({i:f.i,total:f.total,code:f.code}));
    return {
      recvCalls: recvCalls, totalInbound: totalInbound, frameCount: frameCount,
      dispTotal: dispTotal,
      count315: dispCounts['0x315']||0, count307: dispCounts['0x307']||0,
      count305: dispCounts['0x305']||0,
      dispWorkSeq: dispSeq.slice(),
      bigFrames: big,
      sizeHistTop: sizes.slice(0,20),
      desyncSockets: Object.keys(queues).filter(k=>queues[k].desync),
      pendingBytes: Object.keys(queues).map(k=>({sock:k,len:queues[k].len})),
      enqCounts: enqCounts,
      enqWorkSeq: enqCodes.slice(),
      failCount: failCount,
      failFrames: failFrames.slice(),
    };
  },
  frames(n){ return frames.slice(-(n||200)); },
  counts(){ return dispCounts; },
};
