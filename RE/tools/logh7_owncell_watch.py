#!/usr/bin/env python3
"""own-fleet 셀(DAT_007cd04c+0x11178) 변화 watch — 서버 0x0b07 이동이 클라 상태에 반영되는지.

LOGH_FLEET_MOVE_PROBE 세션에서 own-cell을 주기적으로 읽어, 서버가 0x0b07 NotifyMovedGrid를
지연 푸시할 때 +0x11178이 dest 셀로 바뀌는지 캡처. 바뀌면 서버 권위적 이동이 클라 상태에 반영됨(⑤).
읽기 전용.

사용: python -m tools.logh7_owncell_watch [--seconds 50]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = { owncell: function(){
  try { var b = va('0x7cd04c').readU32(); if(!b) return -1; return ptr(b).add(0x11178).readU32(); }
  catch(e){ return -2; }
}};
"""

def find_pid():
    out=subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=50.0); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    seen=[]; t0=time.time()
    while time.time()-t0 < a.seconds:
        v=rpc.owncell()
        if not seen or seen[-1][1]!=v: seen.append([round(time.time()-t0,1), v])
        time.sleep(0.5)
    print(json.dumps({"owncell_timeline":seen,
        "changed": len(set(v for _,v in seen if v>=0))>1}, ensure_ascii=False, indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
