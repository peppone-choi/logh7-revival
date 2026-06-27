#!/usr/bin/env python3
"""P0-02 positive-control: prove that seeding the strategic current-source closes 0x0b01.

Per docs/logh7-implementation-specs.md §6: the root current cell *(DAT_007cd04c+0x11178) stays 0 because
the inline source (mainState+0xc -> source+0x320) is never written (dispatcher case 0x325 routes via
mode=1 to mainState+0x80e8c instead). FUN_004c4170 (__fastcall, ecx=mainState, "WorldIn_StrategyFieldImport")
reads source=*(mainState+8), src320=*(source+0x320), calls FUN_004c45f0(src320,2) which sets
mainState+0x126714 and the mode byte +0x126711=2, driving the root assign of DAT_007cd04c (+0x11178).

This watcher (FUNCTION-BOUNDARY hooks only — mid-fn/call-site hooks crashed v26/v57) does a ONE-SHOT
diagnostic write: at FUN_004c4170 onEnter, if src320==0, write source+0x320 = HOME_CELL (row*100+col).
onLeave it reads mainState+0x126714/+0x126711 and the root *(DAT_007cd04c+0x11178). It also onLeave-gates
FUN_004d6310 (the click validator) to log its return value. If after the write +0x11178 == HOME_CELL and
FUN_004d6310 flips to pass on a click, the cell-seeding theory is proven and the camera should also center
on the home cell (same 0x11178 drives the camera FUN_004d4e90 — closing the "always (1,1)" Front 3 issue).

Attach to the running client by PID (from session.json), then drive the UI (move minimap, click) via
ui_explorer while this runs. Read-only except the single src320 positive-control write.

Run: python tools/logh7_p0_02_focus_pc.py --session .omo/ui-explorer/p602b --home-cell 2550 --seconds 90
"""
from __future__ import annotations
import argparse
import importlib
import json
import sys
from pathlib import Path

JS = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const HOME_CELL = __HOME_CELL__;
let seq = 0, wrote = 0;
function abs(va) { return moduleBase.add(ptr(va).sub(IMAGE_BASE)); }
function safe(fn, fb) { try { return fn(); } catch (_) { return fb; } }
function hex(v) { return safe(() => { const p = ptr(v); return p.isNull() ? null : p.toString(); }, String(v)); }
function rU32(a) { return safe(() => ptr(a).readU32(), null); }
function rU8(a) { return safe(() => ptr(a).readU8(), null); }
function rPtr(a) { return safe(() => ptr(a).readPointer(), ptr('0x0')); }
function emit(tag, p) { if (seq >= 20000) return; seq += 1; send({ tag, seq, t: Date.now(), ...(p || {}) }); }
// DAT_007cd04c holds the strategic root pointer; root current cell = *(root + 0x11178).
function rootCell() {
  const root = rPtr(abs('0x007cd04c'));
  return { root: hex(root), cur: root.isNull() ? null : rU32(root.add(0x11178)), listCount: root.isNull() ? null : rU32(root.add(0x1117c)) };
}
function install(va, name, cb) {
  try { Interceptor.attach(abs(va), cb); emit('hook-installed', { name, va }); }
  catch (e) { emit('hook-failed', { name, va, error: String(e) }); }
}

install('0x004c4170', 'StrategyFieldImport-004c4170', {
  onEnter(args) {
    const mainState = this.context.ecx; // __fastcall param_1
    this.mainState = mainState;
    const source = safe(() => mainState.add(8).readPointer(), ptr('0x0'));
    const src320 = source.isNull() ? null : rU32(source.add(0x320));
    let didWrite = false;
    if (!source.isNull() && (src320 === 0 || src320 === null)) {
      safe(() => { source.add(0x320).writeU32(HOME_CELL); didWrite = true; wrote += 1; }, null);
    }
    emit('c4170-enter', { mainState: hex(mainState), source: hex(source), src320, didWrite, homeCell: HOME_CELL, root: rootCell() });
  },
  onLeave() {
    const m = this.mainState;
    emit('c4170-leave', {
      field126714: m ? rU32(m.add(0x126714)) : null,
      mode126711: m ? rU8(m.add(0x126711)) : null,
      strategyCur2b6a70: m ? rU32(m.add(0x2b6a70)) : null,
      root: rootCell(),
    });
  },
});

install('0x004d6310', 'clickValidator-004d6310', {
  onLeave(retval) {
    const r = retval.toInt32();
    // only log non-(-256) returns (the interesting pass/reject transitions)
    emit('d6310-leave', { retval: r, retLow: r & 0xff, pass: r !== -256, root: rootCell() });
  },
});

emit('ready', { moduleBase: hex(moduleBase), homeCell: HOME_CELL });
"""


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--session", default=".omo/ui-explorer/p602b")
    ap.add_argument("--pid", type=int)
    ap.add_argument("--home-cell", type=int, default=2550, help="row*100+col of the player home cell (default 25*100+50)")
    ap.add_argument("--seconds", type=float, default=90.0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    pid = args.pid
    if pid is None:
        sj = Path(args.session) / "session.json"
        info = json.loads(sj.read_text(encoding="utf-8"))
        pid = info.get("clientPid")
    if not pid:
        print(json.dumps({"error": "no client pid"}), file=sys.stderr)
        return 2

    frida = importlib.import_module("frida")
    events = []

    def on_message(message, data):
        if message.get("type") == "send":
            events.append(message["payload"])
        else:
            events.append({"fridaError": message})

    session = frida.attach(pid)
    script = session.create_script(JS.replace("__HOME_CELL__", str(int(args.home_cell))))
    script.on("message", on_message)
    script.load()
    import time
    time.sleep(args.seconds)
    try:
        script.unload()
    except Exception:
        pass

    out = Path(args.out) if args.out else (Path(args.session) / "p0_02_focus_pc.json")
    out.write_text(json.dumps({"pid": pid, "homeCell": args.home_cell, "events": events}, ensure_ascii=False, indent=1), encoding="utf-8")
    # concise stdout summary
    tags = {}
    for e in events:
        tags[e.get("tag")] = tags.get(e.get("tag"), 0) + 1
    wrote = [e for e in events if e.get("didWrite")]
    passes = [e for e in events if e.get("pass") is True]
    nonzero_cur = [e for e in events if (e.get("root") or {}).get("cur") not in (None, 0)]
    print(json.dumps({
        "pid": pid, "events": len(events), "tags": tags,
        "positiveControlWrites": len(wrote),
        "validatorPasses": len(passes),
        "rootCellNonzeroObservations": len(nonzero_cur),
        "sampleNonzeroCur": (nonzero_cur[0].get("root") if nonzero_cur else None),
        "out": str(out),
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
