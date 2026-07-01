# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
"""Read-only GDI font/text watcher for the real LOGH VII client.

Attach this to an already running canonical-playable `G7MTClient.exe` session.
It does not patch the process. It records CreateFontA/IndirectA arguments,
selected HFONTs, and the currently selected GDI face observed during text output.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools.logh7_client_exe import CLIENT_DIR, INSTALLED_CLIENT_EXE, PLAYABLE_CLIENT_SHA256, verify_client_sha
from tools.logh7_hud_admission_watch import _best_effort_cleanup, _session_pid
from tools.logh7_ui_explorer import _register_pretendard_fonts

DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"


def build_js(*, sample_limit: int = 320, backtrace_depth: int = 8) -> str:
    return (
        r"""
const SAMPLE_LIMIT = __SAMPLE_LIMIT__;
const BACKTRACE_DEPTH = __BACKTRACE_DEPTH__;
const OBJ_FONT = 6;
const mod = Process.getModuleByName('G7MTClient.exe');
const BASE = mod.base;
let seq = 0;
let textEvents = 0;
const fonts = {};
const hdcFonts = {};

function safe(fn, fallback) { try { return fn(); } catch (_error) { return fallback; } }
function hex(value) { return safe(() => ptr(value).toString(), String(value)); }
function gh(value) {
  return safe(() => {
    const off = ptr(value).sub(BASE);
    if (off.compare(ptr(mod.size)) < 0 && off.compare(ptr(0)) >= 0) {
      return '0x' + off.add(ptr('0x400000')).toString(16);
    }
    return ptr(value).toString();
  }, hex(value));
}
function bt(context) {
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, BACKTRACE_DEPTH).map(gh), []);
}
function cstr(p, maxLen) {
  return safe(() => {
    if (ptr(p).isNull()) return '';
    const limit = maxLen || 96;
    let s = '';
    for (let i = 0; i < limit; i += 1) {
      const b = ptr(p).add(i).readU8();
      if (b === 0) break;
      s += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
    }
    return s;
  }, '');
}
function bytesHex(p, maxLen) {
  return safe(() => {
    if (ptr(p).isNull()) return '';
    const limit = maxLen || 96;
    let out = '';
    for (let i = 0; i < limit; i += 1) {
      const b = ptr(p).add(i).readU8();
      out += b.toString(16).padStart(2, '0');
      if (b === 0) break;
    }
    return out;
  }, '');
}
function previewAnsi(p, countValue) {
  let count = Number(countValue);
  if (count < 0 || count > 256) count = 256;
  let text = '';
  let hexBytes = '';
  return safe(() => {
    for (let i = 0; i < count; i += 1) {
      const b = ptr(p).add(i).readU8();
      if (b === 0) break;
      hexBytes += b.toString(16).padStart(2, '0');
      text += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
    }
    return { text, hex: hexBytes, length: Math.floor(hexBytes.length / 2) };
  }, { text: '?', hex: '', length: 0 });
}
function logfonta(p) {
  const base = ptr(p);
  return safe(() => ({
    height: base.add(0x00).readS32(),
    width: base.add(0x04).readS32(),
    escapement: base.add(0x08).readS32(),
    orientation: base.add(0x0c).readS32(),
    weight: base.add(0x10).readS32(),
    italic: base.add(0x14).readU8(),
    underline: base.add(0x15).readU8(),
    strikeOut: base.add(0x16).readU8(),
    charset: base.add(0x17).readU8(),
    outPrecision: base.add(0x18).readU8(),
    clipPrecision: base.add(0x19).readU8(),
    quality: base.add(0x1a).readU8(),
    pitchAndFamily: base.add(0x1b).readU8(),
    face: cstr(base.add(0x1c), 32),
  }), { error: 'logfont-read-failed', ptr: hex(p) });
}
function emit(tag, payload) {
  seq += 1;
  send({ tag, seq, t: Date.now(), ...(payload || {}) });
}
function exportPtr(moduleName, apiName) {
  try { return Process.getModuleByName(moduleName).getExportByName(apiName); }
  catch (_error) {
    try { return Module.getGlobalExportByName(apiName); }
    catch (error) { emit('hook-failed', { api: apiName, error: String(error) }); return null; }
  }
}
const GetCurrentObject = new NativeFunction(exportPtr('gdi32.dll', 'GetCurrentObject'), 'pointer', ['pointer', 'uint']);
const GetTextFaceA = new NativeFunction(exportPtr('gdi32.dll', 'GetTextFaceA'), 'int', ['pointer', 'int', 'pointer']);

function currentFontForHdc(hdc) {
  const key = hex(hdc);
  let selected = hdcFonts[key] || null;
  const actualHandle = safe(() => GetCurrentObject(ptr(hdc), OBJ_FONT), ptr('0x0'));
  let actualFace = '';
  safe(() => {
    const buf = Memory.alloc(96);
    const n = GetTextFaceA(ptr(hdc), 95, buf);
    if (n > 0) actualFace = cstr(buf, n);
  }, null);
  const known = actualHandle.isNull() ? null : (fonts[hex(actualHandle)] || null);
  return {
    selected,
    currentHandle: actualHandle.isNull() ? null : hex(actualHandle),
    currentKnownFont: known,
    currentFace: actualFace,
  };
}
function hook(apiName, callbacks) {
  const addr = exportPtr('gdi32.dll', apiName) || exportPtr('user32.dll', apiName);
  if (addr === null) return;
  try { Interceptor.attach(addr, callbacks); emit('hook-installed', { api: apiName, addr: hex(addr) }); }
  catch (error) { emit('hook-failed', { api: apiName, error: String(error) }); }
}

hook('CreateFontA', {
  onEnter(args) {
    this.info = {
      height: args[0].toInt32(),
      width: args[1].toInt32(),
      escapement: args[2].toInt32(),
      orientation: args[3].toInt32(),
      weight: args[4].toInt32(),
      italic: args[5].toInt32(),
      underline: args[6].toInt32(),
      strikeOut: args[7].toInt32(),
      charset: args[8].toInt32(),
      outPrecision: args[9].toInt32(),
      clipPrecision: args[10].toInt32(),
      quality: args[11].toInt32(),
      pitchAndFamily: args[12].toInt32(),
      face: cstr(args[13], 96),
      faceHex: bytesHex(args[13], 96),
      backtrace: bt(this.context),
    };
  },
  onLeave(retval) {
    const handle = hex(retval);
    fonts[handle] = { api: 'CreateFontA', handle, ...this.info };
    emit('font-created', fonts[handle]);
  }
});

hook('CreateFontIndirectA', {
  onEnter(args) {
    this.info = { api: 'CreateFontIndirectA', logfont: logfonta(args[0]), backtrace: bt(this.context) };
  },
  onLeave(retval) {
    const handle = hex(retval);
    fonts[handle] = { handle, ...this.info };
    emit('font-created', fonts[handle]);
  }
});

hook('SelectObject', {
  onEnter(args) {
    this.hdc = hex(args[0]);
    this.obj = hex(args[1]);
    this.font = fonts[this.obj] || null;
  },
  onLeave(retval) {
    if (this.font === null) return;
    hdcFonts[this.hdc] = { handle: this.obj, font: this.font };
    emit('font-selected', { hdc: this.hdc, handle: this.obj, font: this.font, previous: hex(retval) });
  }
});

function maybeEmitText(apiName, hdc, textPtr, count, context) {
  if (textEvents >= SAMPLE_LIMIT) return;
  const sample = previewAnsi(textPtr, count);
  if (sample.length === 0) return;
  textEvents += 1;
  emit('text-output', {
    api: apiName,
    hdc: hex(hdc),
    sample,
    font: currentFontForHdc(hdc),
    backtrace: bt(context),
  });
}
hook('ExtTextOutA', {
  onEnter(args) { maybeEmitText('ExtTextOutA', args[0], args[5], args[6].toInt32(), this.context); }
});
hook('TextOutA', {
  onEnter(args) { maybeEmitText('TextOutA', args[0], args[3], args[4].toInt32(), this.context); }
});
hook('DrawTextA', {
  onEnter(args) { maybeEmitText('DrawTextA', args[0], args[1], args[2].toInt32(), this.context); }
});
emit('watch-ready', { moduleBase: hex(BASE), sampleLimit: SAMPLE_LIMIT, backtraceDepth: BACKTRACE_DEPTH });
"""
        .replace("__SAMPLE_LIMIT__", str(max(1, int(sample_limit))))
        .replace("__BACKTRACE_DEPTH__", str(max(0, int(backtrace_depth))))
    )


def run(args: argparse.Namespace) -> int:
    frida = importlib.import_module("frida")
    spawned = args.spawn_exe is not None
    pid = args.pid if args.pid is not None else (0 if spawned else _session_pid(args.session))
    if args.require_canonical:
        checked_exe = args.spawn_exe if args.spawn_exe is not None else INSTALLED_CLIENT_EXE
        status = verify_client_sha(checked_exe, expected_sha256=PLAYABLE_CLIENT_SHA256)
        if not status.verified:
            print(json.dumps({
                "error": "installed-client-sha-mismatch",
                "path": str(status.path),
                "sha256": status.sha256,
                "expected": status.expected_sha256,
                "label": status.label,
            }, ensure_ascii=False, indent=2))
            return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    session = None
    script = None
    cleanup_errors: list[str] = []
    device = frida.get_local_device()
    font_receipt = None
    with args.out.open("w", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(json.dumps({
                "message": message,
                "dataLength": 0 if data is None else len(data),
            }, ensure_ascii=False) + "\n")
            out.flush()

        try:
            if spawned:
                font_receipt = _register_pretendard_fonts(args.out.parent)
                pid = device.spawn([str(args.spawn_exe)], cwd=str(args.spawn_exe.parent))
            session = frida.attach(pid)
            script = session.create_script(build_js(
                sample_limit=args.sample_limit,
                backtrace_depth=args.backtrace_depth,
            ))
            script.on("message", on_message)
            script.load()
            if spawned:
                device.resume(pid)
            time.sleep(args.seconds)
        finally:
            cleanup_errors = _best_effort_cleanup(script, session)
            if spawned:
                try:
                    device.kill(pid)
                except Exception as exc:  # pragma: no cover - best effort cleanup.
                    cleanup_errors.append(f"kill:{exc}")
    print(json.dumps({
        "attachedPid": pid,
        "spawned": spawned,
        "spawnExe": str(args.spawn_exe) if args.spawn_exe else None,
        "fontRegistration": font_receipt,
        "out": str(args.out),
        "seconds": args.seconds,
        "events": events,
        "cleanupErrors": cleanup_errors,
    }, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--spawn-exe", type=Path, default=None,
                        help="spawn this canonical EXE suspended, install hooks, then resume")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--sample-limit", type=int, default=320)
    parser.add_argument("--backtrace-depth", type=int, default=8)
    parser.add_argument("--require-canonical", action="store_true", default=True)
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
