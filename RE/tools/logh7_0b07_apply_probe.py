#!/usr/bin/env python3
"""0x0b07 NotifyMovedGrid 클라 적용 4점 라이브 측정(읽기전용).

검증자 정정(loop-state 2026-06-23)에 따라 "서버 0x0b07 송신이 클라 상태에 실제 적용되는가"를
다단계 게이트별로 분리 측정한다:
 1) 버퍼 도착   : FUN_004ba2b0 case 0xb07 → 정적버퍼 &DAT_00437714 복사(record id 변화)
 2) 적용 게이트 : FUN_004bee20 진입 + `*(u8)(ecx+0x2a58f8)` grid-active 플래그값
 3) 디스패치    : FUN_00517cd0(0xb07) 호출 횟수(게이트 통과)
 4) 씬 이벤트   : FUN_00501e30(0x16) enqueue 횟수(scene event ring 적재)
 + own-cell(DAT_007cd04c+0x11178) A/B.

LOGH_FLEET_MOVE_PROBE=1 세션에서 grid-enter+DELAY 후 서버가 0x0b07 1회 push할 때 어느 게이트까지
도달하는지 캡처. 어디서 막히는지(게이트=0? 디스패치 0? enqueue 0?)를 라이브로 분리한다.

사용: python -m tools.logh7_0b07_apply_probe [--seconds 30]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var st = { armed:false, bee20:0, gateMin:null, gateMax:null,
           dispatch_b07:0, enq_16:0, enq_any:0, bufId0:null, bufId1:null, errs:[] };
function arg(ctx, n){ try { return ctx.esp.add(n*4).readU32(); } catch(e){ return -1; } }

// 1+2) 적용 게이트 FUN_004bee20(this=ecx=&DAT_00437714+off, +0x2a58f8 grid-active)
try { Interceptor.attach(va('0x4bee20'), { onEnter:function(){
  if(!st.armed) return; st.bee20++;
  try {
    var ecx=this.context.ecx;
    var g=ecx.add(0x2a58f8).readU8();
    if(st.gateMin===null||g<st.gateMin) st.gateMin=g;
    if(st.gateMax===null||g>st.gateMax) st.gateMax=g;
    var id=ecx.readU32();
    if(st.bufId0===null) st.bufId0=id; st.bufId1=id;
  } catch(e){ if(st.errs.length<5) st.errs.push('bee20:'+e); }
}});} catch(e){ st.errs.push('hook bee20:'+e); }

// 3) 디스패치 FUN_00517cd0(0xb07,...)
try { Interceptor.attach(va('0x517cd0'), { onEnter:function(){
  if(!st.armed) return;
  if(arg(this.context,1)===0xb07) st.dispatch_b07++;
}});} catch(e){ st.errs.push('hook 517cd0:'+e); }

// 4) enqueue FUN_00501e30(eventCode,...)  — 0x16 = scene ring 적재
try { Interceptor.attach(va('0x501e30'), { onEnter:function(){
  if(!st.armed) return; st.enq_any++;
  if(arg(this.context,1)===0x16) st.enq_16++;
}});} catch(e){ st.errs.push('hook 501e30:'+e); }

rpc.exports = {
  arm:function(){ st.armed=true; },
  owncell:function(){ try{ var b=va('0x7cd04c').readU32(); if(!b) return -1; return ptr(b).add(0x11178).readU32(); }catch(e){ return -2; } },
  snap:function(){ return JSON.stringify(st); }
};
"""

def find_pid():
    out=subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=30.0); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    time.sleep(0.3)
    owncell_a=rpc.owncell()
    rpc.arm()
    t0=time.time(); cells=[[0.0,owncell_a]]
    while time.time()-t0 < a.seconds:
        v=rpc.owncell()
        if cells[-1][1]!=v: cells.append([round(time.time()-t0,1), v])
        time.sleep(0.5)
    owncell_b=rpc.owncell()
    snap=json.loads(rpc.snap())
    result={
        "owncell_A": owncell_a, "owncell_B": owncell_b,
        "owncell_changed": owncell_a!=owncell_b and owncell_a>=0 and owncell_b>=0,
        "owncell_timeline": cells,
        "bufId_before": snap.get("bufId0"), "bufId_after": snap.get("bufId1"),
        "record_arrived": snap.get("bee20",0)>0,
        "apply_gate_FUN_004bee20_calls": snap.get("bee20"),
        "grid_active_gate_2a58f8_min": snap.get("gateMin"), "grid_active_gate_2a58f8_max": snap.get("gateMax"),
        "dispatch_517cd0_b07": snap.get("dispatch_b07"),
        "enqueue_501e30_evt16": snap.get("enq_16"), "enqueue_501e30_total": snap.get("enq_any"),
        "errs": snap.get("errs"),
        "verdict": _verdict(snap, owncell_a, owncell_b),
    }
    print(json.dumps(result, ensure_ascii=False, indent=1))
    try: s.detach()
    except Exception: pass
    return 0

def _verdict(snap, a, b):
    if snap.get("bee20",0)==0: return "0x0b07 apply 핸들러(FUN_004bee20) 미진입 — 0x0b07 미수신 or 미복사(버퍼 도착 실패)"
    if (snap.get("gateMax") or 0)==0: return f"FUN_004bee20 진입했으나 grid-active 게이트(+0x2a58f8)=0 → 적용 차단(디스패치 미발생)"
    if snap.get("dispatch_b07",0)==0: return "게이트 통과로 보이나 FUN_00517cd0(0xb07) 미호출 — 2차 게이트(활성씬) 차단 추정"
    if snap.get("enq_16",0)==0: return "디스패치됐으나 0x16 scene-event enqueue 0 — 활성씬 scene-type 불일치 추정"
    if a==b: return "0x16 enqueue 발생했으나 own-cell 불변 — own-cell은 렌더 read-only(이동은 유닛테이블에 반영, 별도 확인 필요)"
    return "0x0b07 클라 적용 라이브 확정(게이트 통과+디스패치+enqueue, own-cell 변화)"

if __name__=="__main__": raise SystemExit(main())
