#!/usr/bin/env python3
"""Read-only live probe for server-pushed NotifyMovedGrid (0x0b07).

The goal is to separate four questions before claiming that authoritative
movement works in the real client:

1. Did the 0x0b07 dispatcher reach FUN_004bee20?
2. Was the world/grid-active gate at client +0x2a58f8 open?
3. Did the record reach FUN_00517cd0(0x0b07)?
4. Did the client enqueue the scene event FUN_00501e30(0x16)?

Use this in a standard ui_explorer session with LOGH_FLEET_MOVE_PROBE=1 after
world/grid entry. This script only reads process memory and installs hooks; it
does not write to the game process.
"""

from __future__ import annotations

import argparse
import csv
import importlib
import io
import json
import subprocess
import time
from pathlib import Path
from typing import Any


JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var st = { armed:false, bee20:0, gateMin:null, gateMax:null,
           dispatch_b07:0, enq_16:0, enq_any:0, bufId0:null, bufId1:null, errs:[] };
function arg(ctx, n){ try { return ctx.esp.add(n*4).readU32(); } catch(e){ return -1; } }

try { Interceptor.attach(va('0x4bee20'), { onEnter:function(){
  if(!st.armed) return; st.bee20++;
  try {
    var ecx=this.context.ecx;
    var g=ecx.add(0x2a58f8).readU8();
    if(st.gateMin===null||g<st.gateMin) st.gateMin=g;
    if(st.gateMax===null||g>st.gateMax) st.gateMax=g;
    var id=ecx.readU32();
    if(st.bufId0===null) st.bufId0=id; st.bufId1=id;
  } catch(e){ if(st.errs.length<5) st.errs.push('bee20:'+e); }
}});} catch(e){ st.errs.push('hook bee20:'+e); }

try { Interceptor.attach(va('0x517cd0'), { onEnter:function(){
  if(!st.armed) return;
  if(arg(this.context,1)===0xb07) st.dispatch_b07++;
}});} catch(e){ st.errs.push('hook 517cd0:'+e); }

try { Interceptor.attach(va('0x501e30'), { onEnter:function(){
  if(!st.armed) return; st.enq_any++;
  if(arg(this.context,1)===0x16) st.enq_16++;
}});} catch(e){ st.errs.push('hook 501e30:'+e); }

rpc.exports = {
  arm:function(){ st.armed=true; },
  owncell:function(){
    try{
      var b=va('0x7cd04c').readU32();
      if(!b) return -1;
      return ptr(b).add(0x11178).readU32();
    }catch(e){ return -2; }
  },
  snap:function(){ return JSON.stringify(st); }
};
"""


VERDICT_MESSAGES = {
    "record-missing": "No FUN_004bee20 hit: the client did not observe an applied 0x0b07 record during the probe window.",
    "grid-gate-closed": "FUN_004bee20 ran, but client+0x2a58f8 stayed 0; the world/grid-active gate blocked dispatch.",
    "dispatch-missing": "The apply gate opened, but FUN_00517cd0(0x0b07) did not fire.",
    "enqueue-missing": "FUN_00517cd0(0x0b07) fired, but FUN_00501e30(0x16) did not enqueue a scene event.",
    "applied-no-owncell-change": "0x0b07 reached the scene event queue, but the watched own-cell value did not change.",
    "applied-owncell-changed": "0x0b07 reached apply/dispatch/enqueue and the watched own-cell value changed.",
}


def build_js() -> str:
    return JS


def find_pid(image_name: str = "G7MTClient.exe") -> int | None:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    ).stdout
    for row in csv.reader(io.StringIO(out)):
        if len(row) >= 2 and image_name.lower() in row[0].lower():
            return int(row[1])
    return None


def classify_probe_result(snap: dict[str, Any], owncell_before: int, owncell_after: int) -> dict[str, Any]:
    bee20 = int(snap.get("bee20") or 0)
    gate_max = snap.get("gateMax")
    gate_open = gate_max is not None and int(gate_max) != 0
    dispatch_b07 = int(snap.get("dispatch_b07") or 0)
    enqueue_16 = int(snap.get("enq_16") or 0)
    owncell_changed = owncell_before != owncell_after and owncell_before >= 0 and owncell_after >= 0

    if bee20 == 0:
        code = "record-missing"
    elif not gate_open:
        code = "grid-gate-closed"
    elif dispatch_b07 == 0:
        code = "dispatch-missing"
    elif enqueue_16 == 0:
        code = "enqueue-missing"
    elif owncell_changed:
        code = "applied-owncell-changed"
    else:
        code = "applied-no-owncell-change"

    return {
        "verdictCode": code,
        "verdict": VERDICT_MESSAGES[code],
        "recordArrived": bee20 > 0,
        "gridActiveGateOpen": gate_open,
        "dispatchB07Observed": dispatch_b07 > 0,
        "enqueue16Observed": enqueue_16 > 0,
        "owncellChanged": owncell_changed,
    }


def run_probe(pid: int, seconds: float) -> dict[str, Any]:
    frida = importlib.import_module("frida")
    session = frida.attach(pid)
    script = session.create_script(build_js())
    script.load()
    rpc = script.exports_sync
    try:
        time.sleep(0.3)
        owncell_before = rpc.owncell()
        rpc.arm()
        started = time.time()
        cells = [[0.0, owncell_before]]
        while time.time() - started < seconds:
            cell = rpc.owncell()
            if cells[-1][1] != cell:
                cells.append([round(time.time() - started, 1), cell])
            time.sleep(0.5)
        owncell_after = rpc.owncell()
        snap = json.loads(rpc.snap())
        classification = classify_probe_result(snap, owncell_before, owncell_after)
        return {
            "pid": pid,
            "seconds": seconds,
            "owncell_A": owncell_before,
            "owncell_B": owncell_after,
            "owncell_changed": classification["owncellChanged"],
            "owncell_timeline": cells,
            "bufId_before": snap.get("bufId0"),
            "bufId_after": snap.get("bufId1"),
            "record_arrived": classification["recordArrived"],
            "apply_gate_FUN_004bee20_calls": snap.get("bee20"),
            "grid_active_gate_2a58f8_min": snap.get("gateMin"),
            "grid_active_gate_2a58f8_max": snap.get("gateMax"),
            "dispatch_517cd0_b07": snap.get("dispatch_b07"),
            "enqueue_501e30_evt16": snap.get("enq_16"),
            "enqueue_501e30_total": snap.get("enq_any"),
            "errs": snap.get("errs"),
            **classification,
        }
    finally:
        try:
            session.detach()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--image-name", default="G7MTClient.exe")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    pid = args.pid if args.pid is not None else find_pid(args.image_name)
    if not pid:
        print(json.dumps({"error": "no pid", "imageName": args.image_name}, indent=1))
        return 1

    result = run_probe(pid, args.seconds)
    encoded = json.dumps(result, ensure_ascii=False, indent=1)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
