"""Frida dynamic trace of the LOGH VII client lobby dispatch chain.

Spawns the real client under frida (so hooks are installed before login), starts the auth server,
drives login, and logs every call to the key dispatch functions WITH a call-stack backtrace
(mapped back to Ghidra VAs). This resolves the dynamic control flow that static analysis + single-
point probes could not: exactly which router invocation / processor handles conn2's decoded 0x2001,
and where the chain to FUN_004ba2b0 / the lobby enqueue breaks.

Usage: python -m tools.logh7_frida_trace --port 47900 --seconds 8
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

import frida  # type: ignore[import-not-found]

from tools.logh7_real_client_probe import _ensure_string_backup, _kill_game_processes, _restore_string_file
from tools.logh7_window_login import find_client_window, login

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / ".omo/work/logh7-installed/exe"
CLIENT_EXE = CLIENT_DIR / "G7MTClient.exe"

JS = r"""
const mod = Process.getModuleByName('G7MTClient.exe');
const BASE = mod.base;
const G = (a) => BASE.add(a - 0x400000);
const gh = (addr) => {
  try { return '0x' + addr.sub(BASE).add(0x400000).toString(16); } catch (e) { return addr.toString(); }
};
const TARGETS = {
  0x645db0: 'decipher', 0x4b8850: 'enqueue', 0x4ba2b0: 'dispatcher',
  0x4ac700: 'LoginProc', 0x4ae0d0: 'lobbyRecvCb', 0x4bdb70: 'caseD_2001',
};
// recv() result site (0x615307): EDI = recvCount, ESI = transport
try {
  Interceptor.attach(G(0x615307), {
    onEnter() {
      const n = this.context.edi.toInt32();
      if (n > 0) send({ fn: 'recvN', extra: ' n=' + n + ' tr=0x' + this.context.esi.toUInt32().toString(16) });
    },
  });
} catch (e) {}
for (const a in TARGETS) {
  const name = TARGETS[a];
  try {
    Interceptor.attach(G(parseInt(a)), {
      onEnter(args) {
        let extra = '';
        try {
          const sp = this.context.esp;
          const a0 = sp.add(4).readU32();
          extra = ' arg0=0x' + (a0 & 0xffffffff).toString(16) + ' arg0w=0x' + (a0 & 0xffff).toString(16);
        } catch (e) {}
        let bt = [];
        try { bt = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, 5).map(gh); } catch (e) {}
        send({ fn: name, extra: extra, bt: bt });
      },
      onLeave(ret) {
        if (name === 'decipher' || name === 'router' || name === 'enqueue') {
          send({ fn: name + '.ret', ret: ret.toInt32() });
        }
      },
    });
  } catch (e) { send({ fn: 'HOOK_FAIL ' + name + ' ' + e }); }
}
// decode dispatch 0x613193 (call [edx+0x18]): log the actual decode fn target + transport (esi)
try {
  Interceptor.attach(G(0x613193), {
    onEnter() {
      try {
        const edx = this.context.edx;            // codec vtable
        const tgt = edx.add(0x18).readU32();      // slot6 = decode fn
        send({ fn: 'decodeDispatch', extra: 'fn=' + gh(ptr(tgt)) + ' esi=0x' + this.context.esi.toUInt32().toString(16) });
      } catch (e) {}
    },
  });
} catch (e) {}
send({ fn: '__ready__', base: BASE.toString() });
"""


def run(port: int, seconds: int, out: Path, patched_exe: Path | None = None) -> int:
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]

    _ensure_string_backup(CLIENT_DIR)
    _kill_game_processes()
    _restore_string_file(CLIENT_DIR)
    exe_backup = CLIENT_DIR / "G7MTClient.exe.fridabak"
    if patched_exe is not None:
        shutil.copy2(CLIENT_EXE, exe_backup)
        shutil.copy2(patched_exe, CLIENT_EXE)

    import os
    env = dict(os.environ)
    env["LOGH_LOBBY_PROACTIVE_OK"] = "1"
    server = subprocess.Popen(
        ["node", "src/server/logh7-server.mjs", "serve-auth", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
    )
    deadline = time.time() + 8
    while time.time() < deadline:
        line = server.stdout.readline() if server.stdout else ""
        if "listening" in line:
            break

    events: list[dict] = []

    def on_message(message, data):
        if message.get("type") == "send":
            events.append(message["payload"])
        else:
            events.append({"fn": "ERROR", "raw": str(message)})

    pid = frida.spawn([str(CLIENT_EXE)], cwd=str(CLIENT_DIR))
    session = frida.attach(pid)
    script = session.create_script(JS)
    script.on("message", on_message)
    script.load()
    frida.resume(pid)

    try:
        hwnd = find_client_window(win32gui, win32process, pid)
        time.sleep(2.5)
        # force the game window foreground (Codex etc. may hold it) so clicks register
        import ctypes
        u = ctypes.windll.user32
        fg = u.GetForegroundWindow()
        ft = u.GetWindowThreadProcessId(fg, None)
        ct = ctypes.windll.kernel32.GetCurrentThreadId()
        u.AttachThreadInput(ft, ct, True)
        u.ShowWindow(hwnd, 9)
        u.BringWindowToTop(hwnd)
        u.SetForegroundWindow(hwnd)
        u.AttachThreadInput(ft, ct, False)
        time.sleep(0.5)
        login(win32api, win32con, win32gui, hwnd)
        time.sleep(seconds)
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
        if patched_exe is not None and exe_backup.exists():
            shutil.copy2(exe_backup, CLIENT_EXE)
            exe_backup.unlink()

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    # compact console summary
    print(f"captured {len(events)} events -> {out}")
    for e in events:
        fn = e.get("fn", "?")
        if fn in ("__ready__",) or fn.endswith(".ret") or "HOOK_FAIL" in fn or fn == "ERROR":
            print(" ", json.dumps(e, ensure_ascii=False))
        else:
            print(f"  {fn}{e.get('extra','')}  bt={e.get('bt')}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--port", type=int, default=47900)
    p.add_argument("--seconds", type=int, default=8)
    p.add_argument("--out", type=Path, default=ROOT / ".omo/ui-explorer/frida-trace.json")
    p.add_argument("--patched-exe", type=Path, default=None)
    args = p.parse_args()
    return run(args.port, args.seconds, args.out, patched_exe=args.patched_exe)


if __name__ == "__main__":
    raise SystemExit(main())
