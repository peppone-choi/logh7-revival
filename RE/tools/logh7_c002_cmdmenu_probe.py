#!/usr/bin/env python3
"""C002 명령 메뉴 상태 read-only probe — 0x0b01 dispatch 트리거 선결 확인.

6번째 에이전트 확정: 0x0b01 송신 트리거 = 명령 메뉴 ROW 클릭(FUN_004f58c0, this=DAT_00c9e638
= [DAT_02215e2c]+0xc). 게이트: 명령패널 위젯 0x65 활성 + esi+0x350(rowCount)>0 + esi+0x354
(selectedD5)<0 + factory 배열(this+0x1c, 0x61 dword) 주입. 이게 자연 충족되는지 라이브 확인(읽기전용).

사용: python -m tools.logh7_c002_cmdmenu_probe [--seconds 3]
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = {
  snap: function(){
    var o = {};
    try {
      // FUN_004f58c0의 this = DAT_00c9e638 (명령 메뉴 객체)
      var cmd = va('0xc9e638').readU32();
      o.cmd_obj_DAT_00c9e638 = cmd ? ptr(cmd).toString() : 0;
      // 교차확인: [DAT_02215e2c]+0xc
      var scene = va('0x2215e2c').readU32();
      o.scene_DAT_02215e2c = scene ? ptr(scene).toString() : 0;
      if (scene) { try { o.scene_plus_c = ptr(ptr(scene).add(0xc).readU32()).toString(); } catch(e){} }
      if (cmd) {
        var b = ptr(cmd);
        o.rowCount_350 = b.add(0x350).readU32();
        o.selectedD5_354 = b.add(0x354).readS32();
        // factory 배열 this+0x1c, 0x61 dword 중 비-zero 개수
        var nz = 0, first = [];
        for (var i=0;i<0x61;i++){ var v=b.add(0x1c + i*4).readU32(); if(v!==0){ nz++; if(first.length<6) first.push('['+i+']='+ptr(v)); } }
        o.factory_nonzero = nz;
        o.factory_first = first;
      }
      // StrategySequence container DAT_00c9e2e0 + task list count
      var seq = va('0xc9e2e0');
      try { o.taskList_count_c9e2e0_14 = seq.add(0x14).readU32(); } catch(e){}
    } catch(e){ o.err = String(e); }
    return o;
  }
};
"""

def find_pid():
    out = subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--seconds",type=float,default=3.0); a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); time.sleep(a.seconds)
    snap=sc.exports_sync.snap()
    rc=snap.get("rowCount_350"); sd=snap.get("selectedD5_354"); fz=snap.get("factory_nonzero")
    if rc is not None:
        snap["verdict"]=(f"rowCount={rc}, selectedD5={sd}, factory_nonzero={fz}. "
            + ("→ 명령메뉴 활성+row+factory: 명령 row 클릭으로 0x0b01 dispatch 가능"
               if (rc and rc>0 and fz and fz>0) else
               "→ 명령메뉴 미활성/빈 row/factory 미주입: 명령메뉴 출현 선결 필요(함대선택 등)"))
    print(json.dumps(snap,ensure_ascii=False,indent=1))
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
