"""Frida confirmation + live repair for the LOGH VII strategic-map Korean garbling.

ROOT CAUSE (static RE, see docs / session notes): the client draws every in-world wire-string
(0x031d StaticInformationBase system names, base labels, character cards) by NARROWING the parsed
UTF-16 name chars to ANSI via the CRT wctomb -> WideCharToMultiByte(DAT_03350674, ...) then ExtTextOutA
(ANSI-only GDI). On a machine whose system ANSI code page is UTF-8 (65001) or Shift-JIS (932), the CRT
locale code page DAT_03350674 is wrong, so Hangul (U+B8EC ...) round-trips through a code page that has
no Hangul and renders as garbled boxes.

This tool, run against the LIVE client, does two things:

  (1) OBSERVE: hooks kernel32!WideCharToMultiByte (the NARROW path that draws the names) and logs the
      CodePage arg + a sample of the wide input + return. This PROVES whether the code page is wrong.
      It also reads the three CRT code-page-state globals so we can see the live values:
        - DAT_03350674  (VA 0x03350674)  : CRT LC_CTYPE ANSI code page  (want 949)
        - DAT_03350664  (VA 0x03350664)  : DBCS/CTYPE-active flag        (want != 0)
        - DAT_007b4470  (VA 0x007b4470)  : __mb_cur_max                  (want 2 for CP949)

  (2) REPAIR (--force-cp 949): rewrites args[0] (CodePage) to 949 IN FLIGHT for every non-ASCII NARROW
      conversion that currently uses a wrong code page (0/65001/932), AND writes 949 into DAT_03350674
      so subsequent draws self-correct. If the strategic map / base labels suddenly render correct
      Hangul on the next redraw, the fix is proven = "force the CRT ANSI code page to 949".

Image facts (verified): G7MTClient.exe has NO ASLR and NO relocations (DllCharacteristics=0x0000,
reloc dir size 0) -> it ALWAYS loads at imagebase 0x400000, so 0x03350674 etc. are ABSOLUTE runtime
VAs. In Frida just use ptr('0x3350674') directly; no module-base rebasing is needed. (clientBase =
*0x7ccffc is a different thing -- the game's internal this-pointer for +0x357xxx state offsets -- and
is NOT involved in the code-page globals.)

This is the NARROW-side sibling of tools/logh7_frida_mbtowc.py (which hooks the WIDEN path,
MultiByteToWideChar, used by the title-menu CP949 strings and the announce panel).

Usage:
  python -m tools.logh7_frida_codepage --port 47900 --seconds 15            # observe only (prove wrong CP)
  python -m tools.logh7_frida_codepage --port 47900 --seconds 15 --force-cp 949   # live-prove the fix
  python -m tools.logh7_frida_codepage --patched-exe .omo/work/logh7-ko-overlay/exe/G7MTClient.korean.menufix.exe
Prereq: overlay the KO content first and run with LOGH_KO_NAMES=1 so the wire carries Hangul names.
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

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / ".omo/work/logh7-installed/exe"
CLIENT_EXE = CLIENT_DIR / "G7MTClient.exe"

# CRT code-page-state globals (absolute VAs; no ASLR/relocs on this image).
VA_CP_CTYPE = 0x03350674  # DAT_03350674 : LC_CTYPE ANSI code page (want 949)
VA_DBCS_FLAG = 0x03350664  # DAT_03350664 : DBCS/CTYPE-active flag (want != 0)
VA_MB_CUR_MAX = 0x007B4470  # DAT_007b4470 : __mb_cur_max (want 2 for CP949)


def build_js(force_cp: int) -> str:
    return (
        "const FORCE_CP = %d;\n" % int(force_cp)
        + "const VA_CP = ptr('0x%x');\n" % VA_CP_CTYPE
        + "const VA_FLAG = ptr('0x%x');\n" % VA_DBCS_FLAG
        + "const VA_MBCUR = ptr('0x%x');\n" % VA_MB_CUR_MAX
        + r"""
function readGlobals() {
  let cp = -1, flag = -1, mb = -1;
  try { cp = VA_CP.readU32(); } catch (e) {}
  try { flag = VA_FLAG.readU32(); } catch (e) {}
  try { mb = VA_MBCUR.readU32(); } catch (e) {}
  return { cp_ctype: cp, dbcs_flag: flag, mb_cur_max: mb };
}

// Snapshot the CRT code-page globals at attach time (proves the wrong-CP root cause directly).
send({ fn: 'GLOBALS@attach', globals: readGlobals() });

// Optionally force the LC_CTYPE code-page global to 949 so the narrow path self-corrects on redraw.
if (FORCE_CP) {
  try { VA_CP.writeU32(FORCE_CP); send({ fn: 'FORCE_GLOBAL', wrote: FORCE_CP, to: VA_CP.toString() }); }
  catch (e) { send({ fn: 'FORCE_GLOBAL_ERR', err: '' + e }); }
}

let wctomb;
try { wctomb = Process.getModuleByName('kernel32.dll').getExportByName('WideCharToMultiByte'); }
catch (e) { wctomb = Module.getGlobalExportByName('WideCharToMultiByte'); }

Interceptor.attach(wctomb, {
  onEnter(args) {
    this.cp = args[0].toInt32();
    this.wsrc = args[2];           // LPCWSTR
    this.cch = args[3].toInt32();  // count of wide chars (-1 => NUL-terminated)
    this.high = false; this.whex = '';
    try {
      const n = this.cch > 0 ? Math.min(this.cch, 16) : 16;
      for (let i = 0; i < n; i++) {
        const u = this.wsrc.add(i * 2).readU16();
        if (u === 0 && this.cch < 0) break;
        this.whex += u.toString(16).padStart(4, '0') + ' ';
        if (u >= 0x100) this.high = true;   // any non-Latin1 wide char = the text we care about
      }
    } catch (e) { this.whex = '?'; }
    this.forced = false;
    // Force the code page to 949 in-flight for non-ASCII NARROW conversions using a wrong CP.
    if (FORCE_CP && this.high && (this.cp === 0 || this.cp === 65001 || this.cp === 932)) {
      args[0] = ptr(FORCE_CP);
      this.forced = true;
    }
  },
  onLeave(ret) {
    if (this.high) {  // only the Hangul/CJK-bearing narrow conversions (skip ASCII keys/paths)
      send({ fn: 'WCToMB', cp: this.cp, forcedCp: this.forced ? FORCE_CP : null,
             cch: this.cch, wide: this.whex.trim(), ret: ret.toInt32() });
    }
  }
});
"""
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Frida WideCharToMultiByte capture/repair (strategic-map KO names).")
    ap.add_argument("--port", type=int, default=47900)
    ap.add_argument("--seconds", type=float, default=15.0)
    ap.add_argument("--patched-exe", type=Path, default=None)
    ap.add_argument("--force-cp", type=int, default=0,
                    help="rewrite the narrow code page to this value (e.g. 949) AND poke DAT_03350674; "
                         "0 = observe only")
    ap.add_argument("--out", type=Path, default=ROOT / ".omo/ui-explorer/wctomb-capture.json")
    args = ap.parse_args()

    import win32api, win32con, win32gui, win32process  # type: ignore

    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)
    exe_backup = CLIENT_DIR / "G7MTClient.exe.fridabak"
    if args.patched_exe is not None:
        shutil.copy2(CLIENT_EXE, exe_backup)
        shutil.copy2(args.patched_exe, CLIENT_EXE)

    env = dict(os.environ)
    env["LOGH_KO_NAMES"] = "1"
    env["LOGH_LOBBY_PROACTIVE_OK"] = "1"
    env.setdefault("LOGH_LOBBY_OK_FORMAT", "message32")
    env.setdefault("LOGH_SS_FORMAT", "message32")
    env.setdefault("LOGH_WORLD_PLAYER", "1")
    env.setdefault("LOGH_STRAT_GALAXY", "1")
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
            key = (p.get("fn"), p.get("cp"), p.get("wide"), p.get("ret"))
            if key not in seen:
                seen.add(key)
                events.append(p)
                print(json.dumps(p, ensure_ascii=False))
        else:
            events.append({"fn": "ERROR", "raw": str(message)})
            print("ERROR", message)

    pid = frida.spawn([str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
    session = frida.attach(pid)
    script = session.create_script(build_js(args.force_cp))
    script.on("message", on_message)
    script.load()
    frida.resume(pid)

    try:
        from tools.logh7_window_login import find_client_window, login

        hwnd = find_client_window(win32gui, win32process, pid)
        time.sleep(2.5)
        login(win32api, win32con, win32gui, hwnd)
        time.sleep(args.seconds)
    finally:
        try:
            session.detach()
        except Exception:
            pass
        try:
            server.terminate()
        except Exception:
            pass
        if args.patched_exe is not None and exe_backup.exists():
            shutil.copy2(exe_backup, CLIENT_EXE)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {len(events)} events -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
