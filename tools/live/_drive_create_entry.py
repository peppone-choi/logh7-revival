#!/usr/bin/env python3
"""Try to enter character-create screen (FUN_00594f20 cluster).

Strategy:
1. Login + settle
2. Hook FUN_00594f20 / FUN_005983c0 / FUN_00595ce0 / 0x1008 send path
3. Force scene states and call candidate open functions
4. Screenshot any UI change away from notice/picker/quality-dropdown
"""
from __future__ import annotations

import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import find_client_hwnd, foreground, client_geometry, screenshot, do_login

SCRIPT = r"""
'use strict';
const hits = [];
function note(tag, extra) {
  const row = { t: Date.now(), tag: tag, extra: extra || {} };
  hits.push(row);
  send(row);
}

// hooks
const hookList = [
  ['MGR_594f20', '0x00594f20'],
  ['ORIG_5983c0', '0x005983c0'],
  ['EXT_595ce0', '0x00595ce0'],
  ['EVT_595d30', '0x00595d30'],
  ['PAINT_597ea0', '0x00597ea0'],
  ['FSM_51a370', '0x0051a370'],
];
for (const [tag, addr] of hookList) {
  try {
    Interceptor.attach(ptr(addr), {
      onEnter(args) {
        note(tag, { a0: args[0].toString(), a1: args[1] ? args[1].toString() : null });
      }
    });
    note('hooked', { tag: tag });
  } catch (e) {
    note('hook-fail', { tag: tag, err: String(e) });
  }
}

rpc.exports = {
  scene() {
    const p = ptr('0x02215e2c').readPointer();
    return { p: p.toString(), state: p.add(4).readU32() };
  },
  setState(v) {
    const p = ptr('0x02215e2c').readPointer();
    p.add(4).writeU32(v >>> 0);
    return p.add(4).readU32();
  },
  // call character-management tick with scene object as thiscall-ish
  callMgr() {
    const p = ptr('0x02215e2c').readPointer();
    // try cdecl with scene ptr
    const f = new NativeFunction(ptr('0x00594f20'), 'void', ['pointer']);
    try { f(p); return { ok: true, p: p.toString() }; }
    catch (e) { return { ok: false, err: String(e) }; }
  },
  callMgr0() {
    const f = new NativeFunction(ptr('0x00594f20'), 'void', []);
    try { f(); return { ok: true }; }
    catch (e) { return { ok: false, err: String(e) }; }
  },
  // try thiscall: ECX = scene
  callMgrThis() {
    const p = ptr('0x02215e2c').readPointer();
    const f = new NativeFunction(ptr('0x00594f20'), 'void', ['pointer'], { abi: 'mscdecl' });
    // manual thiscall via NativeCallback trampoline is messy; use Interceptor.replace once
    // Instead write state 0x40 and invoke FSM which may dispatch
    p.add(4).writeU32(0x40);
    const fsm = new NativeFunction(ptr('0x0051a370'), 'int', ['int', 'int']);
    try {
      const r = fsm(1, 0);
      return { ok: true, r: r, state: p.add(4).readU32() };
    } catch (e) {
      return { ok: false, err: String(e), state: p.add(4).readU32() };
    }
  },
  dumpHits() { return hits.slice(-200); },
  clearHits() { hits.length = 0; return true; },
};
"""


def click(sx: int, sy: int) -> None:
    user32.SetCursorPos(int(sx), int(sy))
    time.sleep(0.1)
    user32.mouse_event(2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(4, 0, 0, 0, 0)
    time.sleep(0.12)


def main() -> int:
    sd = Path("server/data/agent-drive/create-entry")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    print(f"hwnd={hwnd:#x} pid={pid.value}", flush=True)
    foreground(hwnd)

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(16):
            time.sleep(1)
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}", flush=True)
            if cw >= 1000 and i >= 11:
                break

    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch}", flush=True)
    screenshot(hwnd, sd / "01-settled.png")

    events = []

    def on_msg(message, _data):
        if message["type"] == "send":
            events.append(message["payload"])
            p = message["payload"]
            if p.get("tag") not in ("hooked",):
                print(f"  {p.get('tag')} {p.get('extra')}", flush=True)

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.on("message", on_msg)
    script.load()
    time.sleep(0.5)
    print("scene", script.exports_sync.scene(), flush=True)

    # 1) click create menu while logging hooks
    print("=== click CREATE ===", flush=True)
    script.exports_sync.clear_hits()
    n0 = len(events)
    click(ox + 164, oy + 256)
    time.sleep(1.5)
    screenshot(hwnd, sd / "02-after-create-click.png")
    print("scene", script.exports_sync.scene(), flush=True)
    print("hits after create click", [e for e in events[n0:] if e.get("tag") not in ("hooked",)][:20], flush=True)

    # 2) force picker then create click
    print("=== force 0x20 + create click ===", flush=True)
    script.exports_sync.set_state(0x20)
    time.sleep(0.8)
    screenshot(hwnd, sd / "03-picker.png")
    click(ox + 164, oy + 256)
    time.sleep(1.0)
    print("scene", script.exports_sync.scene(), flush=True)
    screenshot(hwnd, sd / "04-picker-create.png")

    # 3) call character manager
    print("=== callMgr ===", flush=True)
    try:
        print(script.exports_sync.call_mgr(), flush=True)
    except Exception as e:
        print("callMgr err", e, flush=True)
    time.sleep(0.8)
    screenshot(hwnd, sd / "05-call-mgr.png")
    print("scene", script.exports_sync.scene(), flush=True)

    print("=== callMgr0 ===", flush=True)
    try:
        print(script.exports_sync.call_mgr0(), flush=True)
    except Exception as e:
        print("callMgr0 err", e, flush=True)
    time.sleep(0.8)
    screenshot(hwnd, sd / "06-call-mgr0.png")

    print("=== callMgrThis / FSM ===", flush=True)
    try:
        print(script.exports_sync.call_mgr_this(), flush=True)
    except Exception as e:
        print("callMgrThis err", e, flush=True)
    time.sleep(0.8)
    screenshot(hwnd, sd / "07-call-mgr-this.png")
    print("scene", script.exports_sync.scene(), flush=True)

    # 4) set 0x40 and tick FSM repeatedly
    print("=== set 0x40 + FSM ticks ===", flush=True)
    script.exports_sync.set_state(0x40)
    for i in range(10):
        try:
            script.exports_sync.call_mgr_this()
        except Exception:
            pass
        time.sleep(0.2)
    print("scene", script.exports_sync.scene(), flush=True)
    screenshot(hwnd, sd / "08-state40-ticks.png")

    # 5) set 0x46 (original charge loop)
    script.exports_sync.set_state(0x46)
    time.sleep(1.0)
    print("scene 46", script.exports_sync.scene(), flush=True)
    screenshot(hwnd, sd / "09-state46.png")

    hits = script.exports_sync.dump_hits()
    from collections import Counter
    c = Counter(h.get("tag") for h in hits)
    print("TOTAL hits", dict(c), flush=True)
    for tag in ("MGR_594f20", "ORIG_5983c0", "EXT_595ce0", "EVT_595d30", "PAINT_597ea0"):
        print(f"  {tag}: {c.get(tag, 0)}", flush=True)

    session.detach()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
