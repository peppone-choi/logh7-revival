#!/usr/bin/env python3
"""월드진입 크래시 잔여리스크 계측 드라이버 (무변조).
디스패치 시퀀스 + this+0x126711 플래그 + activeCount를 크래시 직전까지 캡처.
usage: py -3 _worldenter_diag.py <evdir>
"""
from __future__ import annotations
import json, sys, time, subprocess, ctypes
from ctypes import wintypes
from pathlib import Path
import frida

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (find_client_hwnd, foreground, client_geometry,
                               screenshot, do_login, mouse_click)

user32 = ctypes.windll.user32
ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
PROBE_JS = Path(__file__).resolve().parent / "_frida_worldenter_probe.js"
M2_LAUNCH = ROOT / "tools" / "live" / "_m2_launch.mjs"
LOBBY_REF = (1024, 768); GAME_START = (125, 191); CHAR_CARD = (655, 305)

SEED_STORE = {"accounts": {"inei00": [{
    "id": 1, "power": 2, "camp": 2, "blood": 1, "sex": 0, "generated": 1,
    "lastname": "Reinhard", "firstname": "Lohengramm", "face": 305419896,
    "ability8": [80, 75, 70, 65, 60, 55, 50, 45], "bonusPoint": 0, "specialAbilityNum": 0,
    "title": 0, "rank": 13, "charState": 1, "age": 20}]}, "nextId": 2}


def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])


def main() -> int:
    evdir = Path(sys.argv[1]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")
    log = []; events = []

    def note(m):
        line = f"[{time.strftime('%H:%M:%S')}] {m}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line); (evdir / "diag-console.txt").write_text("\n".join(log), encoding="utf-8")

    srv_log = open(evdir / "server-stdout.txt", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT), stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 20:
        if "m2-server-ready" in (evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore"): break
        if srv.poll() is not None: note(f"server rc={srv.returncode}"); return 2
        time.sleep(0.4)
    note("server ready")

    def fin(rc):
        (evdir / "wedisp.jsonl").write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
        try: srv.terminate()
        except Exception: pass
        srv_log.close(); return rc

    proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
    note(f"client pid={proc.pid}")
    hwnd = None; t0 = time.time()
    while time.time() - t0 < 30:
        try:
            h = find_client_hwnd()
            if h: hwnd = h; break
        except Exception: pass
        time.sleep(0.5)
    if not hwnd: note("no window"); return fin(3)
    pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    def on_message(m, _d):
        if m["type"] == "send":
            p = m["payload"]; events.append(p)
            ev = p.get("ev") if isinstance(p, dict) else None
            if ev == "wedisp":
                note(f"  disp#{p.get('seq')} {p.get('code')} active={p.get('active')} "
                     f"flagMod={p.get('flagMod')} flagEcx={p.get('flagEcx')} ecx={p.get('ecx')}")
            elif ev == "EXCEPTION":
                note(f"  ##### EXCEPTION {p.get('type')} eip={p.get('eip')} memAddr={p.get('memAddr')} "
                     f"active={p.get('active')} flagMod={p.get('flagMod')} ecx={p.get('ecx')}")
            elif ev == "ready":
                note(f"  probe ready base={p.get('base')} flagOff={p.get('flagOff')}")

    script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
            script.on("message", on_message); script.load(); time.sleep(0.5)
            note(f"probe loaded try{attempt}"); break
        except Exception as e:
            note(f"attach fail {e}"); time.sleep(1.0); script = None
    if not script: return fin(3)

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900: do_login(hwnd, "inei00", "dummy", shots)
    for i in range(20):
        time.sleep(1)
        if not alive(): note("died at login"); return fin(4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000: break
    time.sleep(9)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch); note("click GAME_START")
        mouse_click(ox + gs[0], oy + gs[1]); time.sleep(3.5)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch); note("dblclick CHAR_CARD (월드진입)")
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1])
    # 크래시 직전까지 이벤트 수집
    t0 = time.time()
    while time.time() - t0 < 25:
        if not alive():
            note(f"=== CLIENT DIED (월드진입) t+{time.time()-t0:.1f}s ===")
            rc = None
            for _ in range(12):
                rc = proc.poll()
                if rc is not None: break
                time.sleep(0.3)
            note(f"exit={rc} ({(rc & 0xffffffff):#x})" if rc is not None else "exit=zombie")
            wed = [e for e in events if isinstance(e, dict) and e.get("ev") == "wedisp"]
            note(f"디스패치 시퀀스({len(wed)}): {[ (e.get('code'), e.get('active'), e.get('flagMod')) for e in wed ]}")
            reached_b0a = any(e.get("code") == "0xb0a" for e in wed)
            note(f"0x0b0a 도달={reached_b0a}  (도달못하면 크래시가 로드트리거보다 앞)")
            return fin(0)
        time.sleep(0.5)
    note("=== 25s 생존 (크래시 없음?) ===")
    try:
        note(f"activeCount={script.exports_sync.active()} flag={script.exports_sync.flag()}")
    except Exception as e:
        note(f"rpc fail {e}")
    screenshot(hwnd, shots / "survived.png")
    if alive(): proc.terminate()
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
