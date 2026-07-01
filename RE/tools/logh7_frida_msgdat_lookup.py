# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_frida_msgdat_lookup.py --scenario first-card --out .omo/ulw-loop/evidence/msgdat-lookup.json
"""Capture LOGH VII MsgDat lookup misses before text reaches GDI.

The in-world HUD can show ``NO DATA`` without that literal reaching the GDI
text sinks. This probe hooks the client MsgDat lookup helpers directly and
records group/sub-id, returned C string, and a G7MTClient VA backtrace.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Final

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_auth_server_e2e import _capture_window
from tools.logh7_frida_gdi_text import (
    _drive_scenario,
    _start_server,
    CLIENT_DIR,
    CLIENT_EXE,
    ROOT,
)
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_window_login import find_client_window

DEFAULT_OUT: Final = ROOT / ".omo/ui-explorer/msgdat-lookup-capture.json"


def build_js(*, sample_limit: int = 240, backtrace_depth: int = 8) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const mod = Process.getModuleByName('G7MTClient.exe');
const moduleBase = mod.base;
const SAMPLE_LIMIT = {int(sample_limit)};
const BACKTRACE_DEPTH = {int(backtrace_depth)};
const MAX_EVENTS = SAMPLE_LIMIT * 8;
let seq = 0;
let emitted = 0;
const seen = new Set();

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{ return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, null); }}
function gh(value) {{ return safe(() => '0x' + ptr(value).sub(moduleBase).add(IMAGE_BASE).toString(16), hex(value)); }}
function stackU32(context, index) {{ return safe(() => context.esp.add(index * 4).readU32(), null); }}
function readCString(address) {{
  const p = ptr(address || 0);
  if (p.isNull()) return {{ text: null, hex: null }};
  return safe(() => {{
    const bytes = [];
    let text = '';
    for (let i = 0; i < 160; i += 1) {{
      const b = p.add(i).readU8();
      if (b === 0) break;
      bytes.push(b.toString(16).padStart(2, '0'));
      text += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
    }}
    return {{ text, hex: bytes.join('') }};
  }}, {{ text: '?', hex: null }});
}}
function backtrace(context) {{
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh), []);
}}
function shouldEmit(name, payload) {{
  const text = payload.resultText || '';
  if (text === 'NO DATA' || text === 'NO TABLE') return true;
  if (payload.group === 0x16 || payload.group === 0x18 || payload.group === 0x76) return true;
  if (emitted < SAMPLE_LIMIT && text.length > 0) return true;
  return name === 'lookup-ready';
}}
function emit(name, payload) {{
  if (seq >= MAX_EVENTS && name !== 'lookup-ready') return;
  const key = name + ':' + JSON.stringify(payload);
  if (seen.has(key)) return;
  seen.add(key);
  if (!shouldEmit(name, payload)) return;
  seq += 1;
  emitted += 1;
  send({{ tag: name, seq, t: Date.now(), moduleBase: hex(moduleBase), ...(payload || {{}}) }});
}}
Interceptor.attach(abs('0x00522010'), {{
  onEnter() {{
    this.group = stackU32(this.context, 1);
    this.subId = stackU32(this.context, 2);
    this.arg3 = stackU32(this.context, 3);
    this.thisEcx = hex(this.context.ecx);
    this.ret = gh(stackU32(this.context, 0));
    this.bt = backtrace(this.context);
  }},
  onLeave(retval) {{
    const result = readCString(retval);
    emit('msgdat-00522010-leave', {{
      group: this.group,
      subId: this.subId,
      arg3: this.arg3,
      thisEcx: this.thisEcx,
      returnVa: this.ret,
      retval: hex(retval),
      resultText: result.text,
      resultHex: result.hex,
      backtrace: this.bt || [],
    }});
  }},
}});
Interceptor.attach(abs('0x005229d0'), {{
  onEnter() {{
    this.index = stackU32(this.context, 1);
    this.thisEcx = hex(this.context.ecx);
    this.ret = gh(stackU32(this.context, 0));
    this.bt = backtrace(this.context);
  }},
  onLeave(retval) {{
    const result = readCString(retval);
    emit('fixed-table-005229d0-leave', {{
      index: this.index,
      thisEcx: this.thisEcx,
      returnVa: this.ret,
      retval: hex(retval),
      resultText: result.text,
      resultHex: result.hex,
      backtrace: this.bt || [],
    }});
  }},
}});
emit('lookup-ready', {{ sampleLimit: SAMPLE_LIMIT, backtraceDepth: BACKTRACE_DEPTH }});
"""


def run(args: argparse.Namespace) -> int:
    import frida  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)

    events: list[dict] = []
    server = None
    session = None
    script = None
    try:
        server = _start_server(args.port, args.env, args.trace_out)

        def on_message(message, _data) -> None:
            payload = message["payload"] if message.get("type") == "send" else {"tag": "ERROR", "raw": str(message)}
            events.append(payload)
            print(json.dumps(payload, ensure_ascii=True))

        pid = frida.spawn([str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
        session = frida.attach(pid)
        script = session.create_script(build_js(sample_limit=args.sample_limit, backtrace_depth=args.backtrace_depth))
        script.on("message", on_message)
        script.load()
        frida.resume(pid)
        hwnd = find_client_window(win32gui, win32process, pid)
        _drive_scenario(args.scenario, hwnd)
        if args.shot_out is not None:
            args.shot_out.parent.mkdir(parents=True, exist_ok=True)
            captured = _capture_window(hwnd, args.shot_out)
            events.append({"tag": "SCREENSHOT", "path": str(args.shot_out), "captured": captured})
    finally:
        if script is not None:
            try:
                script.unload()
            except (RuntimeError, frida.InvalidOperationError) as exc:
                print(f"script unload warning: {exc}")
        if session is not None:
            try:
                session.detach()
            except (RuntimeError, frida.InvalidOperationError) as exc:
                print(f"session detach warning: {exc}")
        if server is not None:
            server.terminate()
            server.wait(timeout=5)
        _kill_game_processes()
        _restore_string_file(CLIENT_DIR)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(events)} events -> {args.out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--scenario", choices=("after-login", "first-card"), default="first-card")
    parser.add_argument("--env", action="append", default=[], help="KEY=VAL server env override")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--trace-out", type=Path, default=None)
    parser.add_argument("--shot-out", type=Path, default=None)
    parser.add_argument("--sample-limit", type=int, default=240)
    parser.add_argument("--backtrace-depth", type=int, default=8)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
