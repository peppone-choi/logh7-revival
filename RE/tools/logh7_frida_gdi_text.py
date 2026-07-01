"""Capture LOGH VII GDI text output with Ghidra-VA call stacks.

This is a focused runtime probe for the in-world HUD text bug: it hooks the
client's GDI ANSI/UTF-16 text sinks and records the exact bytes the renderer
receives, plus a short backtrace mapped to G7MTClient.exe virtual addresses.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Final, assert_never

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_auth_server_e2e import _capture_window
from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_window_login import _click, find_client_window, login

ROOT: Final = Path(__file__).resolve().parents[1]
CLIENT_DIR: Final = ROOT / ".omo/work/logh7-installed/exe"
CLIENT_EXE: Final = CLIENT_DIR / "G7MTClient.exe"
DEFAULT_OUT: Final = ROOT / ".omo/ui-explorer/gdi-text-capture.json"

DEFAULT_SERVER_ENV: Final[dict[str, str]] = {
    "LOGH_LOBBY_OK_FORMAT": "message32",
    "LOGH_LOBBY_RICH_CHARACTERS": "1",
    "LOGH_SS_FORMAT": "message32",
    "LOGH_KO_NAMES": "1",
    "LOGH_WORLD_PLAYER": "1",
    "LOGH_STRAT_GALAXY": "1",
    "LOGH_GRID_ENTER": "1",
    "LOGH_CONTENT_DB": "1",
    "LOGH_POSTLOAD_RICH_CHARACTER": "1",
}


def build_js(*, sample_limit: int = 240, backtrace_depth: int = 8) -> str:
    return f"""
const SAMPLE_LIMIT = {int(sample_limit)};
const BACKTRACE_DEPTH = {int(backtrace_depth)};
const mod = Process.getModuleByName('G7MTClient.exe');
const BASE = mod.base;
const gh = (addr) => {{
  try {{
    const off = ptr(addr).sub(BASE).toUInt32();
    if (off < mod.size) return '0x' + (0x400000 + off).toString(16);
  }} catch (e) {{}}
  return ptr(addr).toString();
}};
const seen = new Set();
let emitted = 0;

function previewAround(ptrValue, before, after) {{
  try {{
    const start = ptrValue.sub(before);
    const size = before + after;
    const bytes = new Uint8Array(start.readByteArray(size));
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {{
      hex += bytes[i].toString(16).padStart(2, '0');
    }}
    return hex;
  }} catch (e) {{
    return '';
  }}
}}

function previewAnsi(ptrValue, countValue) {{
  let count = Number(countValue);
  if (count < 0 || count > 512) count = 512;
  let text = '';
  let hex = '';
  let nonAscii = false;
  try {{
    for (let i = 0; i < count; i++) {{
      const b = ptrValue.add(i).readU8();
      if (b === 0) break;
      hex += b.toString(16).padStart(2, '0');
      if (b >= 0x80) nonAscii = true;
      text += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
    }}
  }} catch (e) {{
    return {{ text: '?', hex: '', nonAscii: false, pathLike: false, length: 0, encoding: 'ansi', textPtr: ptrValue.toString(), aroundHex: '' }};
  }}
  const pathLike = /(ProgramData|WScript|Windows|Users|\\\\\\\\|\\/|\\.exe|\\.dll|\\.tmp)/.test(text);
  return {{ text, hex, nonAscii, pathLike, length: Math.floor(hex.length / 2), encoding: 'ansi', textPtr: ptrValue.toString(), aroundHex: previewAround(ptrValue, 32, 96) }};
}}

function previewWide(ptrValue, countValue) {{
  let count = Number(countValue);
  if (count < 0 || count > 512) count = 512;
  let text = '';
  let hex = '';
  let nonAscii = false;
  try {{
    for (let i = 0; i < count; i++) {{
      const w = ptrValue.add(i * 2).readU16();
      if (w === 0) break;
      hex += (w & 0xff).toString(16).padStart(2, '0');
      hex += ((w >>> 8) & 0xff).toString(16).padStart(2, '0');
      if (w >= 0x80) nonAscii = true;
      text += (w >= 0x20) ? String.fromCharCode(w) : '.';
    }}
  }} catch (e) {{
    return {{ text: '?', hex: '', nonAscii: false, pathLike: false, length: 0, encoding: 'utf16le', textPtr: ptrValue.toString(), aroundHex: '' }};
  }}
  const pathLike = /(ProgramData|WScript|Windows|Users|\\\\\\\\|\\/|\\.exe|\\.dll|\\.tmp)/.test(text);
  return {{ text, hex, nonAscii, pathLike, length: Math.floor(hex.length / 2), encoding: 'utf16le', textPtr: ptrValue.toString(), aroundHex: previewAround(ptrValue, 64, 192) }};
}}

function shouldEmit(apiName, sample) {{
  if (sample.length === 0) return false;
  const key = apiName + ':' + sample.hex;
  if (seen.has(key)) return false;
  if (sample.text.indexOf('NO DATA') !== -1) return true;
  if (sample.pathLike || sample.nonAscii) return true;
  if (emitted < SAMPLE_LIMIT && sample.text.length >= 2) return true;
  return false;
}}

function hookGdiText(apiName, textArg, countArg, preview) {{
  let addr = null;
  try {{ addr = Process.getModuleByName('gdi32.dll').getExportByName(apiName); }}
  catch (e) {{
    try {{ addr = Module.getGlobalExportByName(apiName); }}
    catch (err) {{ send({{ fn: 'HOOK_FAIL', api: apiName, error: '' + err }}); return; }}
  }}
  Interceptor.attach(addr, {{
    onEnter(args) {{
      const sample = preview(args[textArg], args[countArg].toInt32());
      if (!shouldEmit(apiName, sample)) return;
      seen.add(apiName + ':' + sample.hex);
      emitted += 1;
      let bt = [];
      try {{ bt = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh); }} catch (e) {{}}
      send({{
        fn: apiName,
        text: sample.text,
        hex: sample.hex,
        length: sample.length,
        encoding: sample.encoding,
        textPtr: sample.textPtr,
        aroundHex: sample.aroundHex,
        nonAscii: sample.nonAscii,
        pathLike: sample.pathLike,
        backtrace: bt
      }});
    }}
  }});
}}

hookGdiText('ExtTextOutA', 5, 6, previewAnsi);
hookGdiText('TextOutA', 3, 4, previewAnsi);
hookGdiText('DrawTextA', 1, 2, previewAnsi);
hookGdiText('GetTextExtentPoint32A', 1, 2, previewAnsi);
hookGdiText('ExtTextOutW', 5, 6, previewWide);
hookGdiText('TextOutW', 3, 4, previewWide);
hookGdiText('DrawTextW', 1, 2, previewWide);
hookGdiText('GetTextExtentPoint32W', 1, 2, previewWide);

function hookClientWideCopy() {{
  const addr = BASE.add(0x004ea8b0 - 0x00400000);
  const tableBase = BASE.add(0x00bc3fa8 - 0x00400000);
  Interceptor.attach(addr, {{
    onEnter(args) {{
      const sample = previewWide(args[1], args[2].toInt32());
      if (!shouldEmit('FUN_004ea8b0', sample)) return;
      seen.add('FUN_004ea8b0:' + sample.hex);
      emitted += 1;
      let bt = [];
      try {{ bt = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh); }} catch (e) {{}}
      let tableOffset = null;
      try {{ tableOffset = ptr(args[0]).sub(tableBase).toInt32(); }} catch (e) {{}}
      send({{
        fn: 'FUN_004ea8b0',
        text: sample.text,
        hex: sample.hex,
        length: sample.length,
        encoding: sample.encoding,
        targetPtr: args[0].toString(),
        targetTableOffset: tableOffset,
        textPtr: sample.textPtr,
        aroundHex: sample.aroundHex,
        nonAscii: sample.nonAscii,
        pathLike: sample.pathLike,
        backtrace: bt
      }});
    }}
  }});
}}

hookClientWideCopy();

function hookClientAnsiToWide() {{
  const addr = BASE.add(0x004eac60 - 0x00400000);
  Interceptor.attach(addr, {{
    onEnter(args) {{
      const sample = previewAnsi(args[0], 96);
      if (!shouldEmit('FUN_004eac60', sample)) return;
      seen.add('FUN_004eac60:' + sample.hex);
      emitted += 1;
      let bt = [];
      try {{ bt = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh); }} catch (e) {{}}
      send({{
        fn: 'FUN_004eac60',
        text: sample.text,
        hex: sample.hex,
        length: sample.length,
        encoding: sample.encoding,
        sourcePtr: args[0].toString(),
        aroundHex: sample.aroundHex,
        nonAscii: sample.nonAscii,
        pathLike: sample.pathLike,
        backtrace: bt
      }});
    }}
  }});
}}

hookClientAnsiToWide();

function hookChatLabelPointer() {{
  const addr = BASE.add(0x00516038 - 0x00400000);
  Interceptor.attach(addr, {{
    onEnter(args) {{
      const esp = this.context.esp;
      let bt = [];
      try {{ bt = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh); }} catch (e) {{}}
      let arrayPtr = NULL;
      let entryPtr = NULL;
      let entrySample = {{ text: '', hex: '', length: 0, encoding: 'ansi', textPtr: '', aroundHex: '' }};
      try {{
        arrayPtr = esp.add(0x10).readPointer();
        entryPtr = arrayPtr.readPointer();
        entrySample = previewAnsi(entryPtr, 64);
      }} catch (e) {{}}
      const stackObjects = [];
      for (const off of [0x30, 0x34, 0x38]) {{
        try {{
          const objPtr = esp.add(off).readPointer();
          stackObjects.push({{
            off,
            ptr: objPtr.toString(),
            sample: previewAnsi(objPtr, 64)
          }});
        }} catch (e) {{
          stackObjects.push({{ off, error: '' + e }});
        }}
      }}
      send({{
        fn: 'FUN_00516038_label_ptr',
        esp: esp.toString(),
        arraySlot: esp.add(0x10).toString(),
        arrayPtr: arrayPtr.toString(),
        entryPtr: entryPtr.toString(),
        entryText: entrySample.text,
        entryHex: entrySample.hex,
        entryAroundHex: entrySample.aroundHex,
        stackObjects,
        backtrace: bt
      }});
    }}
  }});
}}

hookChatLabelPointer();
send({{ fn: '__ready__', base: BASE.toString(), sampleLimit: SAMPLE_LIMIT }});
"""


def _server_env(extra: list[str]) -> dict[str, str]:
    env = dict(os.environ)
    env.update(DEFAULT_SERVER_ENV)
    for pair in extra:
        key, sep, value = pair.partition("=")
        if sep:
            env[key] = value
    return env


def _start_server(port: int, extra_env: list[str], trace_out: Path | None) -> subprocess.Popen[str]:
    command = ["node", "src/server/logh7-server.mjs", "serve-auth", "--host", "127.0.0.1", "--port", str(port)]
    if trace_out is not None:
        trace_out.parent.mkdir(parents=True, exist_ok=True)
        command.extend(["--trace", str(trace_out)])
    server = subprocess.Popen(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=_server_env(extra_env),
    )
    deadline = time.time() + 10
    while time.time() < deadline:
        line = server.stdout.readline() if server.stdout else ""
        if "listening" in line:
            return server
        if server.poll() is not None:
            raise RuntimeError(f"server exited early with code {server.returncode}")
    raise TimeoutError("server did not become ready within 10s")


def _drive_scenario(scenario: str, hwnd: int) -> None:
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]

    login(win32api, win32con, win32gui, hwnd)
    match scenario:
        case "after-login":
            time.sleep(3.0)
        case "first-card":
            time.sleep(12.0)
            try:
                win32gui.SetForegroundWindow(hwnd)
            except OSError:
                pass
            _click(win32api, win32con, win32gui, hwnd, 128, 197)
            time.sleep(3.5)
            try:
                win32gui.SetForegroundWindow(hwnd)
            except OSError:
                pass
            _click(win32api, win32con, win32gui, hwnd, 650, 315)
            time.sleep(10.0)
        case unreachable:
            assert_never(unreachable)


def run(args: argparse.Namespace) -> int:
    import frida  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)
    exe_backup = CLIENT_DIR / "G7MTClient.exe.gditextbak"
    if args.patched_exe is not None:
        shutil.copy2(CLIENT_EXE, exe_backup)
        shutil.copy2(args.patched_exe, CLIENT_EXE)

    events: list[dict[str, str | int | bool | None | list[str]]] = []
    server: subprocess.Popen[str] | None = None
    session = None
    script = None
    try:
        server = _start_server(args.port, args.env, args.trace_out)

        def on_message(message, _data) -> None:
            if message.get("type") == "send":
                payload = message["payload"]
                events.append(payload)
                print(json.dumps(payload, ensure_ascii=True))
            else:
                error = {"fn": "ERROR", "raw": str(message)}
                events.append(error)
                print(json.dumps(error, ensure_ascii=True))

        pid = frida.spawn([str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
        session = frida.attach(pid)
        script = session.create_script(build_js(sample_limit=args.sample_limit, backtrace_depth=args.backtrace_depth))
        script.on("message", on_message)
        script.load()
        frida.resume(pid)
        import win32gui  # type: ignore[import-not-found]

        try:
            hwnd = find_client_window(win32gui, win32process, pid)
            time.sleep(2.5)
            _drive_scenario(args.scenario, hwnd)
            if args.shot_out is not None:
                args.shot_out.parent.mkdir(parents=True, exist_ok=True)
                captured = _capture_window(hwnd, args.shot_out)
                events.append({"fn": "SCREENSHOT", "path": str(args.shot_out), "captured": captured})
            time.sleep(args.seconds)
        except Exception as exc:  # noqa: BLE001 - diagnostic capture must survive dead HWND/client exits.
            error = {"fn": "DRIVE_ERROR", "error": repr(exc)}
            events.append(error)
            print(json.dumps(error, ensure_ascii=True))
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
        if exe_backup.exists():
            shutil.copy2(exe_backup, CLIENT_EXE)
            exe_backup.unlink()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(events)} events -> {args.out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=47900)
    parser.add_argument("--seconds", type=float, default=2.0)
    parser.add_argument("--scenario", choices=("after-login", "first-card"), default="first-card")
    parser.add_argument("--patched-exe", type=Path, default=None)
    parser.add_argument("--env", action="append", default=[], help="KEY=VAL server env override")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--trace-out", type=Path, default=None)
    parser.add_argument("--shot-out", type=Path, default=None)
    parser.add_argument("--sample-limit", type=int, default=240)
    parser.add_argument("--backtrace-depth", type=int, default=8)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
