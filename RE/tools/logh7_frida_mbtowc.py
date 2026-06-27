"""Frida capture of MultiByteToWideChar calls at the LOGH VII title/menu render.

Definitive localization diagnostic: hooks kernel32!MultiByteToWideChar in the live client and logs
(codePage, dwFlags, first input bytes, return) for every NON-ASCII conversion. At the title menu the
constmsg menu strings (#2429+, CP949 in the KO overlay) are converted to UTF-16 — this shows EXACTLY
what code page the client passes and whether the conversion succeeds, pinpointing the surgical patch.

Usage: python -m tools.logh7_frida_mbtowc --port 47900 --seconds 12 [--patched-exe <exe>]
       python -m tools.logh7_frida_mbtowc --force-cp 949   # live-prove the fix at the menu render
Prereq: overlay the KO constmsg.dat first so the menu text is the Korean CP949 we want to trace.

--force-cp N rewrites args[0] (codePage) to N *in flight* for every non-ASCII (DBCS) conversion whose
current code page is a "wrong" one (CP_ACP=0, UTF-8=65001, or Shift-JIS=932). If the menu suddenly
renders correct Hangul, the fix is proven to be "force the ANSI code page to 949" — no guessing which
push site / DAT store to patch. This converts the diagnostic into an end-to-end proof of the fix.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import frida  # type: ignore[import-not-found]

from tools.logh7_real_client_probe import _kill_game_processes, _restore_string_file
from tools.logh7_window_login import find_client_window, login

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / ".omo/work/logh7-installed/exe"
CLIENT_EXE = CLIENT_DIR / "G7MTClient.exe"


def _screenshot(path: Path, tag: str) -> None:
    """Best-effort full-screen grab. D3D8 exclusive fullscreen may yield a black frame via GDI; the
    frida JSON (cp/flags/ret) is the authoritative evidence, this is only a visual aid."""
    target = path.with_name(f"{path.stem}-{tag}{path.suffix or '.png'}")
    try:
        from PIL import ImageGrab  # type: ignore[import-not-found]

        target.parent.mkdir(parents=True, exist_ok=True)
        ImageGrab.grab(all_screens=True).save(str(target))
        print(f"screenshot[{tag}] -> {target}")
    except Exception as exc:  # noqa: BLE001 - screenshot is non-critical
        print(f"screenshot[{tag}] failed: {exc}")

def build_js(force_cp: int) -> str:
    # frida 17.x removed the static two-arg Module.getExportByName(module, name); resolve via the
    # module instance, falling back to the global export lookup.
    return (
        "const FORCE_CP = %d;\n" % int(force_cp)
        + r"""
let mbtowc;
try { mbtowc = Process.getModuleByName('kernel32.dll').getExportByName('MultiByteToWideChar'); }
catch (e) { mbtowc = Module.getGlobalExportByName('MultiByteToWideChar'); }
Interceptor.attach(mbtowc, {
  onEnter(args) {
    this.cp = args[0].toInt32();
    this.flags = args[1].toInt32();
    this.src = args[2];
    this.cb = args[3].toInt32();
    this.high = false; this.hex = '';
    try {
      const n = this.cb > 0 ? Math.min(this.cb, 24) : 24;
      const ba = new Uint8Array(this.src.readByteArray(n));
      for (let i = 0; i < ba.length; i++) {
        this.hex += ba[i].toString(16).padStart(2, '0');
        if (ba[i] >= 0x81 && ba[i] !== 0xff) this.high = true;
      }
    } catch (e) { this.hex = '?'; }
    this.forced = false;
    // Force the ANSI code page to FORCE_CP only for non-ASCII text conversions that currently use a
    // "wrong" code page (CP_ACP=0, UTF-8=65001, Shift-JIS=932). Explicit 949/1200/etc are left alone.
    if (FORCE_CP && this.high && (this.cp === 0 || this.cp === 65001 || this.cp === 932)) {
      args[0] = ptr(FORCE_CP);
      this.forced = true;
    }
  },
  onLeave(ret) {
    if (this.high) {  // only the text-ish (DBCS/non-ASCII) conversions — skips ASCII paths/keys
      send({ fn: 'MBToWC', cp: this.cp, forcedCp: this.forced ? FORCE_CP : null,
             flags: this.flags, cb: this.cb, inp: this.hex, ret: ret.toInt32() });
    }
  }
});
"""
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Frida capture of MultiByteToWideChar at menu render.")
    ap.add_argument("--port", type=int, default=47900)
    ap.add_argument("--seconds", type=float, default=12.0)
    ap.add_argument("--patched-exe", type=Path, default=None)
    ap.add_argument("--force-cp", type=int, default=0,
                    help="rewrite codePage to this value in flight for wrong-CP non-ASCII conversions "
                         "(e.g. 949) to live-prove the fix; 0 = observe only")
    ap.add_argument("--out", type=Path, default=ROOT / ".omo/ui-explorer/mbtowc-capture.json")
    ap.add_argument("--shot", type=Path, default=None, help="save best-effort menu screenshots (a/b) to this path")
    args = ap.parse_args()

    import win32api, win32con, win32gui, win32process  # type: ignore

    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)
    exe_backup = CLIENT_DIR / "G7MTClient.exe.fridabak"
    if args.patched_exe is not None:
        shutil.copy2(CLIENT_EXE, exe_backup)
        shutil.copy2(args.patched_exe, CLIENT_EXE)

    env = dict(os.environ)
    env["LOGH_LOBBY_PROACTIVE_OK"] = "1"
    env.setdefault("LOGH_LOBBY_OK_FORMAT", "message32")
    env.setdefault("LOGH_SS_FORMAT", "message32")
    env.setdefault("LOGH_WORLD_PLAYER", "1")
    server = subprocess.Popen(
        ["node", "src/server/logh7-server.mjs", "serve-auth", "--host", "127.0.0.1", "--port", str(args.port)],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
    )
    deadline = time.time() + 8
    while time.time() < deadline:
        line = server.stdout.readline() if server.stdout else ""
        if "listening" in line:
            break

    events: list[dict] = []
    seen: set[tuple] = set()

    def on_message(message, data):
        if message.get("type") == "send":
            p = message["payload"]
            key = (p.get("cp"), p.get("flags"), p.get("inp"), p.get("ret"))
            if key not in seen:  # dedupe identical calls (the menu redraws every frame)
                seen.add(key)
                events.append(p)
        else:
            events.append({"fn": "ERROR", "raw": str(message)})

    pid = frida.spawn([str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
    session = frida.attach(pid)
    script = session.create_script(build_js(args.force_cp))
    script.on("message", on_message)
    script.load()
    frida.resume(pid)

    try:
        hwnd = find_client_window(win32gui, win32process, pid)
        time.sleep(2.5)
        login(win32api, win32con, win32gui, hwnd)
        if args.shot is not None:
            half = max(1.0, args.seconds / 2.0)
            time.sleep(half)
            _screenshot(args.shot, "a")
            time.sleep(half)
            _screenshot(args.shot, "b")
        else:
            time.sleep(args.seconds)
    finally:
        try:
            script.unload()
        except Exception:
            pass
        try:
            session.detach()
        except Exception:
            pass
        _kill_game_processes()
        server.terminate()
        _restore_string_file(CLIENT_DIR)
        if args.patched_exe is not None and exe_backup.exists():
            shutil.copy2(exe_backup, CLIENT_EXE)
            exe_backup.unlink()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    # summary: code pages seen + a few samples
    from collections import Counter
    cps = Counter((e.get("cp"), e.get("flags")) for e in events if e.get("fn") == "MBToWC")
    forced = sum(1 for e in events if e.get("forcedCp"))
    print(json.dumps({"distinctNonAsciiCalls": len(events),
                      "forceCp": args.force_cp or None,
                      "forcedConversions": forced,
                      "byCodepageFlags": {f"cp{k[0]}/fl{k[1]}": v for k, v in cps.items()},
                      "samples": events[:12]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
