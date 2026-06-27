#!/usr/bin/env python3
"""C002 상태머신 직접 구동 positive-control: FUN_004fd7a0 직접 호출로 catGate=2 강제.

+0xb00 force는 FUN_004fd100 추가게이트([0xc9e2f8]/[+0x128]/FUN_004fc470)에 막힘(live17).
이를 우회: catGate writer FUN_004fd7a0(this=StrategySequence, mode=2, animate=1)을 게임 스레드
(FUN_004fef90 onEnter)에서 NativeFunction으로 직접 1회 호출 → catGate=2 set + 내부 FUN_004f6680
unit-list populate. catGate 전이/unit-list/명령메뉴 rowCount/0x0b01 관측. (가역, stop 복원.)

사용: python -m tools.logh7_c002_drive_pc [--seconds 8]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var fd7a0 = new NativeFunction(va('0x4fd7a0'), 'int', ['pointer','int','int'], 'thiscall');
var armed=false, called=0, lastErr=null, baseStr=null;
try {
  Interceptor.attach(va('0x4fef90'), { onEnter: function(){
    if(!armed || called>=3) return;
    try { var b=this.context.ecx; baseStr=b.toString(); fd7a0(b, 2, 1); called++; }
    catch(e){ lastErr=String(e); armed=false; }
  }});
} catch(e){}
rpc.exports = {
  arm:function(){ armed=true; },
  snap:function(){
    var o={called:called, lastErr:lastErr, base:baseStr};
    try {
      var b=ptr(va('0x2215e2c').readU32());
      o.state_4=b.add(0x4).readU32(); o.catGate_f4=b.add(0xf4).readU32();
      o.cmdRowCount_480=b.add(0x480).readU32(); o.sel_624=b.add(0x624).readS32();
    } catch(e){ o.err2=String(e); }
    return o;
  }
};
"""

def find_pid():
    out=subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=8.0); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    time.sleep(0.5); before=rpc.snap(); rpc.arm()
    time.sleep(a.seconds); after=rpc.snap()
    print(json.dumps({"before":before,"after":after,
        "catGate_transitioned": before.get("catGate_f4")!=after.get("catGate_f4"),
        "client_survived": True},ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
