#!/usr/bin/env python3
"""Minimal Frida probe: FSM/picker only, click session/create/settings."""
from __future__ import annotations

import json
import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (  # noqa: E402
    find_client_hwnd,
    foreground,
    client_geometry,
    screenshot,
    do_login,
)

SCRIPT = r"""
'use strict';
const hits = [];
function push(tag, args) {
  const row = { t: Date.now(), tag: tag, args: args };
  hits.push(row);
  // throttle: only send interesting tags immediately
  send(row);
}
const specs = [
  ['FSM', '0x0051a370', 2],
  ['HIT', '0x005015f0', 4],
  ['PREP', '0x00593cf0', 1],
  ['SEL', '0x00593d90', 1],
  ['RENDER', '0x005946d0', 1],
  ['CASE1C', '0x0051aded', 0],
  ['CASE19', '0x0051ad73', 0],
];
for (const [tag, addr, n] of specs) {
  Interceptor.attach(ptr(addr), {
    onEnter(a) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(a[i].toString());
      // suppress pure HIT noise unless arg0 looks like menu op 2 (journal used op=2)
      if (tag === 'HIT') {
        const op = a[0].toInt32();
        // always record; volume is OK without MENU flood
        push(tag, out);
        return;
      }
      push(tag, out);
    }
  });
}
send({ t: Date.now(), tag: 'ready', args: [] });
rpc.exports = {
  dump() { return hits.slice(); }
};
"""


def click(sx: int, sy: int) -> None:
    user32.SetCursorPos(int(sx), int(sy))
    time.sleep(0.1)
    user32.mouse_event(2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(4, 0, 0, 0, 0)
    time.sleep(0.15)


def main() -> int:
    sd = Path("server/data/agent-drive/fsm-probe3")
    sd.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    print(f"hwnd={hwnd:#x} pid={pid.value}", flush=True)

    foreground(hwnd)
    # if already in lobby (1024+), skip login
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(16):
            time.sleep(1)
            if not user32.IsWindow(hwnd):
                print("died settle", i, flush=True)
                return 2
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}", flush=True)
            if cw >= 1000 and i >= 11:
                break
    else:
        print(f"already lobby {cw}x{ch}", flush=True)
        time.sleep(1)

    screenshot(hwnd, sd / "01-settled.png")
    ox, oy, cw, ch = client_geometry(hwnd)
    print(f"geom {cw}x{ch} origin=({ox},{oy})", flush=True)

    def on_message(message, _data):
        if message["type"] == "send":
            events.append(message["payload"])
        elif message["type"] == "error":
            print("frida-error", message, flush=True)

    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.on("message", on_message)
    script.load()
    time.sleep(0.8)
    print("hooks ready, events so far", len(events), flush=True)

    # mark baseline
    base_n = len(events)
    menu = [("SESSION", 429), ("CREATE", 256), ("START", 192), ("SETTINGS", 480)]
    for lab, y in menu:
        print(f"=== CLICK {lab} y={y} ===", flush=True)
        n0 = len(events)
        click(ox + 164, oy + y)
        time.sleep(1.5)
        screenshot(hwnd, sd / f"02-{lab.lower()}.png")
        chunk = events[n0:]
        # summarize tags
        tags = {}
        for e in chunk:
            tags[e.get("tag")] = tags.get(e.get("tag"), 0) + 1
        print(f"  +{len(chunk)} events tags={tags}", flush=True)
        # show non-HIT or first few HIT
        for e in chunk:
            if e.get("tag") != "HIT":
                print(f"  {e.get('tag')} {e.get('args')}", flush=True)
        hits = [e for e in chunk if e.get("tag") == "HIT"]
        if hits:
            print(f"  HIT sample {hits[:5]} ... total {len(hits)}", flush=True)
        if lab == "SETTINGS":
            click(ox + 700, oy + 620)
            time.sleep(0.7)

    try:
        dump = script.exports_sync.dump()
    except Exception as e:
        print("dump failed", e, flush=True)
        dump = events
    (sd / "events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in dump) + "\n",
        encoding="utf-8",
    )
    # summary
    from collections import Counter

    c = Counter(e.get("tag") for e in dump)
    print("TOTAL", dict(c), flush=True)
    print("CASE1C", c.get("CASE1C", 0), "CASE19", c.get("CASE19", 0), "PREP", c.get("PREP", 0), "FSM", c.get("FSM", 0))
    print("alive", bool(user32.IsWindow(hwnd)), flush=True)
    try:
        session.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
