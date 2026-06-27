#!/usr/bin/env python3
"""C002 catGate A/B read-only probe — 60+ 사이클 미측정 layer.

StrategySequence base = DAT_02215e2c(값). +0x4=state, +0xf4=catGate(1 idle/2 SELECT),
+0x130=명령메뉴 객체(+0x130+0x350=+0x480=rowCount). 전략맵 메인 widget[base+0x14] 좌클릭(event-2)이
catGate를 1→2 전이시키는지 A/B(idle 스냅 → 클릭 → 스냅). 쓰기 없음.

사용: python -m tools.logh7_c002_catgate_probe [--cx 960 --cy 540]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida, win32api, win32con, win32gui

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = { snap: function(){
  var o={};
  try {
    var bptr = va('0x2215e2c').readU32();
    if(!bptr){ return {note:'DAT_02215e2c null'}; }
    var b = ptr(bptr); o.base = b.toString();
    o.state_4 = b.add(0x4).readU32();
    o.catGate_f4 = b.add(0xf4).readU32();
    o.cmdRowCount_480 = b.add(0x480).readU32();      // +0x130 cmdmenu + 0x350 rowCount
    o.cmdSelD5_484 = b.add(0x484).readS32();         // +0x130 + 0x354 selectedD5
    o.sel_624 = b.add(0x624).readS32();
    // widget 자식 슬롯: base+0x14(전략메인), +0x18, +0x24, +0x28
    o.w14 = b.add(0x14).readU32(); o.w28 = b.add(0x28).readU32();
  } catch(e){ o.err=String(e); }
  return o;
}};
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
    time.sleep(1.0)
    idle=rpc.snap()
    pts=[(a.cx,a.cy),(a.cx,a.cy-100),(a.cx-200,a.cy),(a.cx+200,a.cy),(700,400),(1200,400)]
    for (x,y) in pts: click(x,y); time.sleep(0.4)
    time.sleep(0.5)
    after=rpc.snap()
    out={"idle":idle,"after_clicks":after}
    out["catGate_changed"] = idle.get("catGate_f4")!=after.get("catGate_f4")
    out["verdict"] = (f"catGate {idle.get('catGate_f4')}→{after.get('catGate_f4')}, "
        f"state {idle.get('state_4')}→{after.get('state_4')}, cmdRowCount {idle.get('cmdRowCount_480')}→{after.get('cmdRowCount_480')}, sel {idle.get('sel_624')}→{after.get('sel_624')}")
    print(json.dumps(out,ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
