#!/usr/bin/env python3
"""C002 decisive widget probe — 전략 메인 widget이 latch loop에서 처리되는가.

latch consumer FUN_00507f20(param_2=widget)이 매프레임 처리하는 widget 집합을 캡처하고,
StrategySequence(DAT_02215e2c)+0x14(전략 메인 widget, catGate 전이가 검사) + +0x18/+0x24/+0x28을
그 집합과 대조. + 클릭 시 각 widget의 +0xb00(selection latch) set 여부 캡처.
→ catGate 전이가 검사하는 widget이 latch loop에 등록돼 있고 +0xb00을 받는지 결판. 쓰기 없음.

사용: python -m tools.logh7_c002_widget_probe [--cx 960 --cy 540]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida, win32api, win32con, win32gui

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var seen = {};      // widget addr -> {n, b00max, b01max, b02max, hit9}
var track = false;
try {
  Interceptor.attach(va('0x507f20'), { onEnter: function(args){
    if (!track) return;
    try {
      var w = args[0]; if (w.isNull()) return;
      var k = w.toString();
      var e = seen[k] || {n:0,b00:0,b01:0,b02:0};
      e.n++;
      try { e.b00 = Math.max(e.b00, w.add(0xb00).readU8()); } catch(_){}
      try { e.b01 = Math.max(e.b01, w.add(0xb01).readU8()); } catch(_){}
      try { e.b02 = Math.max(e.b02, w.add(0xb02).readU8()); } catch(_){}
      seen[k] = e;
    } catch(e){}
  }});
} catch(e){}
rpc.exports = {
  start: function(){ track=true; seen={}; },
  snap: function(){
    var o = { widgets: seen };
    try {
      var b = ptr(va('0x2215e2c').readU32());
      o.strat_base = b.toString();
      o.w14 = ptr(b.add(0x14).readU32()).toString();
      o.w18 = ptr(b.add(0x18).readU32()).toString();
      o.w24 = ptr(b.add(0x24).readU32()).toString();
      o.w28 = ptr(b.add(0x28).readU32()).toString();
    } catch(e){ o.err=String(e); }
    return o;
  }
};
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
    ap=argparse.ArgumentParser(); ap.add_argument("--cx",type=int,default=960); ap.add_argument("--cy",type=int,default=540); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    time.sleep(0.5); rpc.start()
    pts=[(a.cx,a.cy),(a.cx,a.cy-100),(a.cx-200,a.cy),(a.cx+200,a.cy),(700,400),(1200,650)]
    for (x,y) in pts: click(x,y); time.sleep(0.5)
    time.sleep(1.0)
    snap=rpc.snap()
    widgets=snap.get("widgets",{})
    strat_widgets={k:snap.get(k) for k in ["w14","w18","w24","w28"]}
    # 대조: strat widget이 latch loop 처리 집합에 있는가
    in_loop={}
    for name,addr in strat_widgets.items():
        in_loop[name] = {"addr":addr, "in_latch_loop": addr in widgets, "stats": widgets.get(addr)}
    out={"strat_base":snap.get("strat_base"),"latch_widget_count":len(widgets),
         "strat_widgets_vs_loop":in_loop,
         "any_b00_set": any(w.get("b00") for w in widgets.values()),
         "latch_widgets_sample": dict(list(widgets.items())[:10])}
    print(json.dumps(out,ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
