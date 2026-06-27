#!/usr/bin/env python3
"""C002 R1-lite: selector/mode/own_cell 상태를 시간축으로 polling — 자연경로 closure 판별.

mode-dispatcher RE(docs/logh7-mode-dispatcher-re-2026-06-26.md) 결론:
  latch selector [base+0x35f35a]의 정적 writer가 18k 함수에 0건 → 기본 0 유지 → 항상 mode2.
  ★열린 질문 = "real-login(char-select 시퀀스 경유) 흐름에서 selector가 0→non-zero로 바뀌는가?"
  바뀌면 그 시퀀스가 자연 라이터 → C002 자연경로 closure 후보. 안 바뀌면 selector는 진짜 미설정
  (정밀 write-watchpoint도 moot) → 다른 접근 필요.

이 스크립트는 **읽기 전용 polling**(write 없음)으로 base=*(0x7ccffc) 기준:
  selector(+0x35f35a U8/U32), mode_byte(+0x126711), mode0/2 active, own_cell(*(0x7cd04c)+0x11178)
를 주기적으로 읽어 **변화 타임라인**을 캡처. 라이브 절차: real-login(autologin 금지)으로 월드 진입
중/직후 이 스크립트를 붙여 캐릭-셀렉트 시퀀스 구간의 selector 변화를 본다.

사용: python -m tools.logh7_c002_r1_poll [--seconds 40] [--interval 0.3]
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
rpc.exports = {
  snap: function(){
    var out = {};
    try {
      var h = va('0x7ccffc').readU32();
      if (!h) { out.base = 0; return out; }
      var b = ptr(h);
      out.base = b.toString();
      out.selector_u8  = b.add(0x35f35a).readU8();
      out.selector_u32 = b.add(0x35f35a).readU32();
      out.mode_byte    = b.add(0x126711).readU8();
      out.mode0_active = b.add(0x126718).readU32();
      out.mode2_active = b.add(0x2a58f8).readU32();
    } catch(e){ out.err_b = String(e); }
    try {
      var h2 = va('0x7cd04c').readU32();
      out.owncell = h2 ? ptr(h2).add(0x11178).readU32() : -1;
    } catch(e){ out.err_o = String(e); }
    return out;
  }
};
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
    ap.add_argument("--seconds", type=float, default=40.0)
    ap.add_argument("--interval", type=float, default=0.3)
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid (G7MTClient not running)"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    rpc = sc.exports_sync
    timeline = []
    t0 = time.time()
    last_key = None
    while time.time() - t0 < args.seconds:
        s = rpc.snap()
        # 상태 키: base + selector + mode_byte (변화만 기록)
        key = (s.get("base"), s.get("selector_u32"), s.get("mode_byte"),
               s.get("mode0_active"), s.get("owncell"))
        if key != last_key:
            timeline.append({"t": round(time.time() - t0, 2), **s})
            last_key = key
        time.sleep(args.interval)
    sel_vals = sorted({e.get("selector_u32") for e in timeline if e.get("base") not in (0, None)})
    mode_vals = sorted({e.get("mode_byte") for e in timeline if e.get("base") not in (0, None)})
    verdict = {
        "selector_values_seen": sel_vals,
        "selector_ever_nonzero": any(v not in (0, None) for v in sel_vals),
        "mode_byte_values_seen": mode_vals,
        "note": ("selector가 non-zero로 바뀜 → 자연 라이터 존재(다음=정밀 write-watchpoint로 라이터 PC 캡처)"
                 if any(v not in (0, None) for v in sel_vals)
                 else "selector 0 고정 → 이 흐름에 selector 라이터 없음(real-login도 미설정이면 C002 다른 접근)"),
    }
    print(json.dumps({"timeline": timeline, "verdict": verdict}, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
