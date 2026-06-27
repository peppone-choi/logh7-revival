#!/usr/bin/env python3
"""C002 돌파 — case0 렌더 FSM(FUN_004fef90) param_1 + case latch(+4) 라이브 캡처/재트리거.

발견(gate_probe): case0 6-AND 게이트(own_cell/slot0/char ptr) 전부 통과 = own-fleet 렌더 데이터 준비됨.
미렌더 원인 = case0(*(param_1+4)==0, 1회성)가 데이터 준비 전 실행→+4=1 잠금(타이밍).
이 도구: FUN_004fef90 진입을 Interceptor로 잡아 param_1(ecx/arg0) + *(param_1+4)를 캡처.
--retrigger: 잠긴 FSM의 +4를 **1회만 0으로** 리셋해 case0 재실행 유도(own-fleet 렌더 깨우기). 그 외 read-only.

사용: python -m tools.logh7_c002_fsm_probe [--seconds 3] [--retrigger]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import time
import frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var seen = {};
var hits = [];
var RETRIG = false;
var didReset = false;
rpc.exports = {
  setRetrig: function(v){ RETRIG = v; },
  dump: function(){ return { hits: hits, didReset: didReset }; }
};
Interceptor.attach(va('0x4fef90'), {
  onEnter: function(args){
    var ecx = this.context.ecx;
    var a0 = args[0];
    // 후보 param_1 = ecx(thiscall) 우선, arg0 보조
    var p1 = ecx;
    var key = p1.toString();
    if(!seen[key]){
      seen[key] = true;
      var rec = { ecx: ecx.toString(), arg0: a0.toString() };
      try { rec.ecx_plus4 = ecx.add(4).readU32(); } catch(e){ rec.ecx_plus4 = -1; }
      try { rec.arg0_plus4 = a0.add(4).readU32(); } catch(e){ rec.arg0_plus4 = -1; }
      hits.push(rec);
    }
    if (RETRIG && !didReset) {
      // case latch +4가 0이 아니면 0으로 1회 리셋 → case0 재실행
      try {
        var v = ecx.add(4).readU32();
        if (v !== 0) { ecx.add(4).writeU32(0); didReset = true; }
      } catch(e){}
    }
  }
});
"""


def find_pid():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line:
            return int(line.split(",")[1].strip().strip('"'))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--retrigger", action="store_true")
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    if args.retrigger:
        sc.exports_sync.set_retrig(True)
    time.sleep(args.seconds)
    out = sc.exports_sync.dump()
    out["retrigger_requested"] = bool(args.retrigger)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
