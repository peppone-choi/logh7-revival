#!/usr/bin/env python3
"""fleet-render case0 진단 probe (읽기전용) — own-fleet 마커 미렌더 근본 확정.

own_cell(DAT_007cd04c+0x11178)이 라이브에서 set돼 있어도(2588) 함대 마커가 안 보이는 이유를 분리:
 1) 전략 FSM FUN_004fef90 진입 횟수 + 상태(*(ecx+4))  — case0(상태0)을 도는가, 상태1 고정인가
 2) case0 own-fleet 렌더 FUN_0058d140 진입 횟수 + 그 시점 own_cell  — 1회성이 own_cell 0일 때 지나갔나
 3) turn-ready FUN_004b8950 반환값  — FSM 게이트가 닫혀 있나
 4) own_cell 타임라인

해석: case0 hit>0 & 그때 own_cell!=0 이면 렌더돼야 함(다른 문제). case0 hit=0 이면 FSM이 상태0 안 도는 게 근본.
own_cell이 case0 시점 0이면 1회성 타이밍(스폰서 set 패치 필요).

사용: python -m tools.logh7_fleetrender_probe [--seconds 30]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
function owncell(){ try{ var b=va('0x7cd04c').readU32(); if(!b) return -1; return ptr(b).add(0x11178).readU32(); }catch(e){ return -2; } }
var st = { fsm:0, fsmStates:{}, case0:0, case0_owncell:[], turnReady_true:0, turnReady_false:0, errs:[] };

try { Interceptor.attach(va('0x4fef90'), { onEnter:function(){
  st.fsm++;
  try { var s=this.context.ecx.add(4).readU32(); st.fsmStates[s]=(st.fsmStates[s]||0)+1; }
  catch(e){ if(st.errs.length<5) st.errs.push('fsm:'+e); }
}});} catch(e){ st.errs.push('hook fsm:'+e); }

try { Interceptor.attach(va('0x58d140'), { onEnter:function(){
  st.case0++;
  if(st.case0_owncell.length<10) st.case0_owncell.push(owncell());
}});} catch(e){ st.errs.push('hook case0:'+e); }

try { Interceptor.attach(va('0x4b8950'), { onLeave:function(r){
  if(r.toInt32()!==0) st.turnReady_true++; else st.turnReady_false++;
}});} catch(e){ st.errs.push('hook turnready:'+e); }

rpc.exports = {
  owncell: owncell,
  snap: function(){ return JSON.stringify(st); }
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
    cells=[]; t0=time.time()
    while time.time()-t0 < a.seconds:
        v=rpc.owncell()
        if not cells or cells[-1][1]!=v: cells.append([round(time.time()-t0,1), v])
        time.sleep(0.5)
    snap=json.loads(rpc.snap())
    snap["owncell_timeline"]=cells
    snap["verdict"]=_verdict(snap)
    print(json.dumps(snap, ensure_ascii=False, indent=1))
    try: s.detach()
    except Exception: pass
    return 0

def _verdict(s):
    if s.get("fsm",0)==0: return "전략 FSM FUN_004fef90 미진입 — 전략맵 시퀀스 자체가 안 돔(상위 게이트)"
    if s.get("turnReady_false",0)>0 and s.get("turnReady_true",0)==0:
        return "turn-ready FUN_004b8950 항상 false — FSM 게이트 닫힘(어떤 함대도 렌더 안 됨)"
    if s.get("case0",0)==0:
        return f"case0(FUN_0058d140) 미진입(FSM 상태분포={s.get('fsmStates')}) — FSM이 상태0 안 돔=마커 미렌더 근본"
    oc=[c for c in s.get("case0_owncell",[]) if c>=0]
    if oc and all(c==0 for c in oc): return "case0 진입했으나 그 시점 own_cell=0 — 1회성 타이밍(스폰서 own_cell set 패치 필요)"
    if oc: return f"case0 진입+own_cell={oc} (≠0) — 렌더 데이터 충족, 마커 미표시면 별도 렌더/스프라이트 문제"
    return "case0 진입했으나 own_cell 미측정"

if __name__=="__main__": raise SystemExit(main())
