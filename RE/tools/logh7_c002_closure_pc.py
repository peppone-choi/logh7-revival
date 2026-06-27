#!/usr/bin/env python3
"""C002 종결 positive-control: StrategySequence case0 부트스트랩 + 전략 클릭 → 0x0b01 라이브 검증.

월드 진입한 실클라에서:
  - FUN_004fef90(StrategySequence) onEnter마다 *(ecx+4)=0 강제(=case0 진입) + DAT_00c9e2e0=0(task seed 재arm)
    → case0가 FUN_004f9030(task seed)+FUN_004f96d0(0x0b01 task)+FUN_00501e30(event-9 enqueue) 실행
  - 동시에 전략 셀 클릭 주입(단일프로세스 SetCursorPos+mouse_event) → 이동 타깃 제공
  - FUN_00501e30(enqueue)/FUN_004f96d0(task seed) 호출 카운트 캡처
  - 종료 후 세션 trace.jsonl에서 0x0b01 발생 확인(메인이 grep)

가역(쓰기는 +4/c9e2e0 토글뿐, stop으로 클라 복원). verifier NO-GO한 mode-byte(+0x126711) 토글은 안 함.

사용: python -m tools.logh7_c002_closure_pc [--seconds 6] [--cx 960 --cy 540]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import time
import frida
import win32api
import win32con
import win32gui

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var st = { force: false, forceN: 0, enqN: 0, taskN: 0, enqEvents: {} };
try {
  Interceptor.attach(va('0x4fef90'), { onEnter: function(){
    if (!st.force) return;
    try {
      var ecx = this.context.ecx;
      ecx.add(4).writeU32(0);              // state=0 → case0
      va('0xc9e2e0').writeU32(0);          // task seed one-shot re-arm
      st.forceN++;
    } catch(e){}
  }});
} catch(e){}
try {
  Interceptor.attach(va('0x501e30'), { onEnter: function(){
    st.enqN++;
    try { var ev = this.context.esp.add(4).readU32(); st.enqEvents[ev] = (st.enqEvents[ev]||0)+1; } catch(e){}
  }});
} catch(e){}
try {
  Interceptor.attach(va('0x4f96d0'), { onEnter: function(){ st.taskN++; }});
} catch(e){}
rpc.exports = {
  setForce: function(v){ st.force = v; },
  snap: function(){ return { forceN: st.forceN, enqN: st.enqN, taskN: st.taskN, enqEvents: st.enqEvents }; }
};
"""


def find_pid():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line:
            return int(line.split(",")[1].strip().strip('"'))
    return None


def click(cx, cy):
    h = win32gui.FindWindow(None, "은하영웅전설7")
    if not h:
        return None
    win32gui.ShowWindow(h, 9); win32gui.SetForegroundWindow(h)
    sx, sy = win32gui.ClientToScreen(h, (cx, cy))
    win32api.SetCursorPos((sx, sy)); time.sleep(0.12)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); time.sleep(0.07)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    return (sx, sy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=6.0)
    ap.add_argument("--cx", type=int, default=960)
    ap.add_argument("--cy", type=int, default=540)
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    rpc = sc.exports_sync
    time.sleep(0.5)
    rpc.set_force(True)                 # case0 강제 시작
    time.sleep(args.seconds / 2)
    pt = click(args.cx, args.cy)        # 전략 클릭(이동 타깃)
    time.sleep(0.3)
    click(args.cx + 80, args.cy)        # 인접 셀 클릭(이동 목적지 후보)
    time.sleep(args.seconds / 2)
    snap = rpc.snap()
    rpc.set_force(False)
    snap["clickPt"] = pt
    print(json.dumps(snap, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
