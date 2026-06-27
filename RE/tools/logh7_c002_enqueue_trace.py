#!/usr/bin/env python3
"""C002 종결 진단: enqueue(FUN_00501e30) 호출 추적 + 단일프로세스 클릭 상관.

월드 진입한 실클라에 attach, enqueue 프리미티브 FUN_00501e30을 onEnter 후킹해
매 호출의 {호출자VA(returnAddress), ecx(타깃 위젯), 이벤트코드 후보(edx/스택)}를 기록한다.
동시에 같은 프로세스에서 전략 클릭(SetCursorPos+mouse_event)을 주입해 "클릭 직후 추가된
enqueue"를 분리 → 클릭이 enqueue 경로에 닿는지, 닿으면 어느 호출자/위젯/이벤트인지 확정.
latch(FUN_00507b10) ecx도 캡처해 enqueue 타깃과 대조. 쓰기 없음(read-only).

사용: python -m tools.logh7_c002_enqueue_trace [--seconds 4] [--cx 960 --cy 540]
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
function norm(p){ try { return '0x'+ptr(p).sub(mod.base).add(IMAGE).toString(16); } catch(e){ return '?'; } }
var log = [];
var latchBases = {};
try {
  Interceptor.attach(mod.base.add(ptr('0x501e30').sub(IMAGE)), { onEnter: function(){
    var c = this.context;
    var ev = null, a0 = null;
    try { a0 = c.esp.add(4).readU32(); } catch(e){}
    log.push({ ret: norm(this.returnAddress), ecx: c.ecx.toString(), edx: c.edx.toString(), a0: a0 });
    if (log.length > 4000) log.shift();
  }});
} catch(e){}
try {
  Interceptor.attach(mod.base.add(ptr('0x507b10').sub(IMAGE)), { onEnter: function(){
    latchBases[this.context.ecx.toString()] = (latchBases[this.context.ecx.toString()]||0)+1;
  }});
} catch(e){}
rpc.exports = {
  mark: function(){ log.length = 0; },
  dump: function(){ return { log: log.slice(), latchBases: latchBases }; }
};
"""


def find_pid():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line:
            return int(line.split(",")[1].strip().strip('"'))
    return None


def fg_and_click(cx, cy):
    hwnd = win32gui.FindWindow(None, "은하영웅전설7")
    if not hwnd:
        # fallback: top window of the pid
        return None
    win32gui.ShowWindow(hwnd, 9)
    win32gui.SetForegroundWindow(hwnd)
    sx, sy = win32gui.ClientToScreen(hwnd, (cx, cy))
    win32api.SetCursorPos((sx, sy))
    time.sleep(0.12)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.07)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    return (sx, sy)


def summarize(log):
    by_caller = {}
    for e in log:
        by_caller.setdefault(e["ret"], {"n": 0, "ecx": set(), "a0": set()})
        by_caller[e["ret"]]["n"] += 1
        by_caller[e["ret"]]["ecx"].add(e["ecx"])
        by_caller[e["ret"]]["a0"].add(e["a0"])
    return {k: {"n": v["n"], "ecx": sorted(v["ecx"])[:4], "a0": sorted(str(x) for x in v["a0"])[:8]}
            for k, v in by_caller.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=3.0)
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

    time.sleep(1.0)
    # 1) idle baseline (no click)
    rpc.mark()
    time.sleep(args.seconds)
    idle = rpc.dump()
    # 2) click + capture
    rpc.mark()
    clickpt = fg_and_click(args.cx, args.cy)
    time.sleep(args.seconds)
    clicked = rpc.dump()

    result = {
        "clickScreenPt": clickpt,
        "latchBases": clicked.get("latchBases"),
        "idle_callers": summarize(idle.get("log", [])),
        "click_callers": summarize(clicked.get("log", [])),
    }
    print(json.dumps(result, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
