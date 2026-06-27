#!/usr/bin/env python3
"""C002 읽기전용 base-capture probe (verifier 권고 증거 수집).

월드 진입한 실클라에 attach해 enqueue(FUN_004fef90)·consume(FUN_0050d230)의
this(ecx)를 onEnter에서 캡처하고, DAT_02215e2c(활성씬)·DAT_007ccffc(게임클라) 전역값과
대조한다. 쓰기 없음(perturbation 최소). verifier 주장 "enqueue/consume this=DAT_02215e2c"를
라이브로 확정/반증.

사용: python -m tools.logh7_c002_base_probe [--pid N] [--seconds 5]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import time

import frida

JS = r"""
var mod = Process.enumerateModules()[0];   // 메인 모듈(G7MTClient)
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var cap = {enqEcx:null, conEcx:null, latchEcx:null, enqN:0, conN:0, latchN:0};
try { Interceptor.attach(va('0x4fef90'), { onEnter: function(){ cap.enqEcx = this.context.ecx.toString(); cap.enqN++; }}); } catch(e){}
try { Interceptor.attach(va('0x50d230'), { onEnter: function(){ cap.conEcx = this.context.ecx.toString(); cap.conN++; }}); } catch(e){}
try { Interceptor.attach(va('0x507b10'), { onEnter: function(){ cap.latchEcx = this.context.ecx.toString(); cap.latchN++; }}); } catch(e){}
rpc.exports = {
  snap: function(){
    var d2215=null, d7ccffc=null;
    try { var v=va('0x2215e2c').readU32(); d2215 = v?ptr(v).toString():('0x'+v.toString(16)); } catch(e){ d2215='ERR'; }
    try { var w=va('0x7ccffc').readU32(); d7ccffc = w?ptr(w).toString():('0x'+w.toString(16)); } catch(e){ d7ccffc='ERR'; }
    return {
      modBase: mod.base.toString(),
      enqEcx: cap.enqEcx, conEcx: cap.conEcx, latchEcx: cap.latchEcx,
      enqN: cap.enqN, conN: cap.conN, latchN: cap.latchN,
      DAT_02215e2c_value: d2215, DAT_007ccffc_value: d7ccffc
    };
  }
};
"""


def find_pid() -> int | None:
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                             capture_output=True, text=True, timeout=10).stdout
        for line in out.splitlines():
            if "G7MTClient" in line:
                return int(line.split(",")[1].strip().strip('"'))
    except Exception:
        pass
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pid", type=int)
    ap.add_argument("--seconds", type=float, default=5.0)
    args = ap.parse_args()
    pid = args.pid or find_pid()
    if not pid:
        print(json.dumps({"error": "no G7MTClient pid"})); return 1
    sess = frida.attach(pid)
    script = sess.create_script(JS)
    script.load()
    rpc = script.exports_sync
    time.sleep(args.seconds)   # 월드 프레임 루프가 enqueue/consume를 호출하도록 대기
    snap = rpc.snap()
    # verifier 주장 판정
    enq = snap.get("enqEcx"); d2215 = snap.get("DAT_02215e2c_value"); d7ccffc = snap.get("DAT_007ccffc_value")
    verdict = "no-fire"
    if enq:
        if enq == d2215:
            verdict = "CONFIRMED: enqueue this == DAT_02215e2c (활성씬) — verifier 정합"
        elif enq == d7ccffc:
            verdict = "REFUTED: enqueue this == DAT_007ccffc (게임클라) — verifier 반증"
        else:
            verdict = "enqueue this != 둘 다 (제3 객체)"
    snap["verdict"] = verdict
    print(json.dumps(snap, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
