#!/usr/bin/env python3
"""전술맵 NOW LOADING 완료-게이트 진단 — FUN_004c32a0(WorldIn_TacticsFieldImport) read-only hook.

mode0_breakthrough RE: FUN_004c32a0가 +0x404xxx 소스 테이블에서 전술 유닛을 객체로 풀어 채운다.
이 hook으로:
  - importer가 **호출되는가**(call count). 0이면 로드가 importer 이전 게이트에서 막힘.
  - **반환값(eax)** 및 ecx(this). 유닛수/성공 여부 추정.
  - 인접 sub-호출(FUN_004c45f0 = mode0 유닛 factory, VA 0x4c45f0) 호출수 = 실제 만들어진 유닛수.
무한 NOW LOADING 중 어디서 stall인지 분리. 읽기 전용(force/write 없음).

사용: python -m tools.logh7_c002_tactics_import_probe [--seconds 6]
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
var importCalls = [];
var factoryCount = 0;
Interceptor.attach(va('0x4c32a0'), {
  onEnter: function(args){
    this.ecx = this.context.ecx;
    this.a0 = args[0]; this.a1 = args[1];
  },
  onLeave: function(retval){
    if (importCalls.length < 12) {
      var rec = { ecx: this.ecx.toString(), arg0: this.a0.toString(), ret: retval.toInt32() };
      // ecx 인근 후보 count 읽기(전술 유닛 카운트 추정)
      try { rec.ecx_p4 = this.ecx.add(4).readU32(); } catch(e){}
      importCalls.push(rec);
    }
  }
});
// mode0 유닛 factory(FUN_004c45f0) 호출수 = 실제 생성 유닛수
try {
  Interceptor.attach(va('0x4c45f0'), { onEnter: function(){ factoryCount++; } });
} catch(e){}
// 상류 게이트 localize: FieldMake(0x4b64c0), dispatcher(0x4b68f0) 호출수
var counts = {};
function hookCount(name, addr){ try { Interceptor.attach(va(addr), { onEnter: function(){ counts[name] = (counts[name]||0)+1; } }); } catch(e){ counts[name]='ERR'; } }
hookCount('FieldMake_4b64c0', '0x4b64c0');
hookCount('dispatcher_4b68f0', '0x4b68f0');
hookCount('FieldImport_4c32a0_dup', '0x4c32a0');
rpc.exports = { dump: function(){ return { importCalls: importCalls, importCallCount: importCalls.length, factoryCount: factoryCount, upstreamCounts: counts }; } };
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
    ap.add_argument("--seconds", type=float, default=6.0)
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    time.sleep(args.seconds)
    out = sc.exports_sync.dump()
    out["verdict"] = (
        "importer 미호출 → 로드가 FUN_004c32a0 이전 게이트에서 막힘"
        if out["importCallCount"] == 0 else
        f"importer {out['importCallCount']}회 호출, 유닛 factory {out['factoryCount']}회 = "
        + ("유닛 0개 생성 → 소스(+0x404xxx) 빈 상태(wire 미적재)" if out["factoryCount"] == 0
           else f"유닛 {out['factoryCount']}개 생성 → 적재됨, stall은 하류(FieldMake 등)")
    )
    print(json.dumps(out, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
