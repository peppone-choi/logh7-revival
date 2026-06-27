#!/usr/bin/env python3
"""C002 합성 브리지 positive-control: latch 위젯 +0xb01 강제 → +0xb02 → SendWarpCommand → 0x0b01.

6번째 에이전트 제안: latch consumer FUN_00507f20(this=latch mgr, param_2=widget)에서
클릭 다운 프레임에 *(param_2+0xb01)=1을 쓰면 다음 프레임 edge-stable 경로(0x507fec)에서
(param_2+0xb02)=1 자연 set → 명령확정 → SendWarpCommand(FUN_005737d0) → FUN_004b78a0 0x0b01.
+ 전략 클릭 주입(타깃). FUN_005737d0/FUN_004b78a0 호출 카운트 + trace 0x0b01 확인.
가역(stop 복원). mode-byte 미변경.

사용: python -m tools.logh7_c002_bridge_pc [--seconds 8] [--cx 960 --cy 540]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida, win32api, win32con, win32gui

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var st = { force:false, forceN:0, sendWarpN:0, b78aN:0, b78aOps:{} };
try {
  Interceptor.attach(va('0x507f20'), { onEnter: function(args){
    if (!st.force) return;
    try { var w = args[0]; if (!w.isNull()) { w.add(0xb01).writeU8(1); st.forceN++; } } catch(e){}
  }});
} catch(e){}
try { Interceptor.attach(va('0x5737d0'), { onEnter: function(){ st.sendWarpN++; }}); } catch(e){}
try {
  Interceptor.attach(va('0x4b78a0'), { onEnter: function(){
    st.b78aN++;
    try { var op = this.context.esp.add(8).readU32() & 0xffff; st.b78aOps[op]=(st.b78aOps[op]||0)+1; } catch(e){}
  }});
} catch(e){}
rpc.exports = { setForce:function(v){ st.force=v; }, snap:function(){ return st; } };
"""

def find_pid():
    out=subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def click(cx,cy):
    h=win32gui.FindWindow(None,"은하영웅전설7")
    if not h: return None
    win32gui.ShowWindow(h,9); win32gui.SetForegroundWindow(h)
    sx,sy=win32gui.ClientToScreen(h,(cx,cy)); win32api.SetCursorPos((sx,sy)); time.sleep(0.12)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN,0,0,0,0); time.sleep(0.07)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP,0,0,0,0); return (sx,sy)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=8.0)
    ap.add_argument("--cx",type=int,default=960); ap.add_argument("--cy",type=int,default=540); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    time.sleep(0.5); rpc.set_force(True)
    # 클릭 sweep(타깃 후보 + 명령 row 후보)
    pts=[(a.cx,a.cy),(a.cx+80,a.cy),(a.cx,a.cy-40),(960,300),(960,650),(500,650),(1400,650)]
    for (x,y) in pts: click(x,y); time.sleep(0.5)
    time.sleep(a.seconds/2)
    snap=rpc.snap(); rpc.set_force(False)
    print(json.dumps(snap,ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
