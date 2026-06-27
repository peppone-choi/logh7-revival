#!/usr/bin/env python3
"""C002 정밀 positive-control: 전략 widget[base+0x14]의 +0xb00 강제 → catGate 전이 테스트.

decisive 측정(live16): catGate 전이가 검사하는 전략 widget [StrategySequence+0x14]가 latch loop에
미등록 → +0xb00 영영 미발화 → catGate 0 고정. FUN_004fd100은 FUN_005015f0(2,[esi+0x14])=*(widget+0xb00)
로 event-2를 본다. 그 widget의 +0xb00을 매프레임 1로 강제하면 catGate가 2(SELECT)로 전이하는지 검증.
전이 시 새로 활성화되는 unit-list/명령 widget을 캡처해 다음 단계 주소 확보. (가역, stop 복원.)

사용: python -m tools.logh7_c002_catgate_force [--seconds 8] [--cx 960 --cy 540]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida, win32api, win32con, win32gui

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var force=false, forceN=0, catSeen={};
try {
  Interceptor.attach(va('0x4fef90'), { onEnter: function(){
    if(!force) return;
    try {
      var b = this.context.ecx;
      // 전략 메인 + 서브 widget들의 +0xb00 강제(event-2 hit 위장)
      [0x14,0x18,0x24,0x28].forEach(function(off){
        try { var w = b.add(off).readU32(); if(w){ ptr(w).add(0xb00).writeU8(1); } } catch(_){}
      });
      forceN++;
      try { var cg = b.add(0xf4).readU32(); catSeen[cg]=(catSeen[cg]||0)+1; } catch(_){}
    } catch(e){}
  }});
} catch(e){}
rpc.exports = {
  setForce:function(v){ force=v; },
  snap:function(){
    var o={forceN:forceN, catGate_history:catSeen};
    try {
      var b = ptr(va('0x2215e2c').readU32());
      o.state_4=b.add(0x4).readU32(); o.catGate_f4=b.add(0xf4).readU32();
      o.cmdRowCount_480=b.add(0x480).readU32(); o.sel_624=b.add(0x624).readS32();
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
    if not h: return
    win32gui.ShowWindow(h,9); win32gui.SetForegroundWindow(h)
    sx,sy=win32gui.ClientToScreen(h,(cx,cy)); win32api.SetCursorPos((sx,sy)); time.sleep(0.1)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN,0,0,0,0); time.sleep(0.06)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP,0,0,0,0)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=8.0)
    ap.add_argument("--cx",type=int,default=960); ap.add_argument("--cy",type=int,default=540); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    time.sleep(0.5); before=rpc.snap(); rpc.set_force(True)
    for (x,y) in [(a.cx,a.cy),(a.cx,a.cy-100),(700,400),(1200,400),(900,500)]:
        click(x,y); time.sleep(0.5)
    time.sleep(a.seconds/2); after=rpc.snap(); rpc.set_force(False)
    print(json.dumps({"before":before,"after":after,
        "catGate_transitioned": before.get("catGate_f4")!=after.get("catGate_f4")},ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
