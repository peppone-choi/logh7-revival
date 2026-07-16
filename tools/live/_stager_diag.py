#!/usr/bin/env python3
"""유닛 스테이저 진단 드라이버 (무변조) — BE 커밋(93fcf150) 후 유닛 미적재 파악.
_frida_stager_probe.js로 FUN_004c2a80 스테이저/FUN_004c2c80 조인 프롤로그 관측.
질문: (1)스테이저 진입? (2)조인 성공/실패(activeCount) (3)조인키 char.dword9 vs unit.dword0.
usage: py -3 _stager_diag.py <evdir>
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
PROBE_JS = Path(__file__).resolve().parent / "_frida_stager_probe.js"
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
        txt = (evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore")
        if "m2-server-ready" in txt: break
        if "EADDRINUSE" in txt: note("FAIL EADDRINUSE(47900 점유)"); return 2
        if srv.poll() is not None: note(f"server rc={srv.returncode}"); return 2
        time.sleep(0.4)
    note("server ready")

    def fin(rc):
        (evdir / "stager.jsonl").write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
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
        if m["type"] != "send":
            if m["type"] == "error": note(f"  JS-ERR {m.get('description')}")
            return
        p = m["payload"]; events.append(p)
        ev = p.get("ev") if isinstance(p, dict) else None
        if ev == "stager_enter":
            note(f"  >>> STAGER_ENTER #{p.get('n')} lastCode={p.get('lastCode')} ecx={p.get('ecx')} "
                 f"args={p.get('args')} acBefore={p.get('acBefore')}")
            note(f"        ecx_win={p.get('ecx_win')}")
        elif ev == "stager_leave":
            note(f"  <<< STAGER_LEAVE #{p.get('n')} acBefore={p.get('acBefore')} acAfter={p.get('acAfter')} staged={p.get('staged')}")
        elif ev == "join_enter":
            note(f"  === JOIN_ENTER #{p.get('n')} lastCode={p.get('lastCode')}")
            for k in ("ecxKeys", "edxKeys", "a1Keys", "a2Keys", "a3Keys"):
                kv = p.get(k)
                if kv: note(f"        {k}: at0={kv.get('at0') and hex(kv['at0'])} at24={kv.get('at24') and hex(kv['at24'])} win={kv.get('win')}")
        elif ev == "handler_enter":
            note(f"  [handler_enter] lastCode={p.get('lastCode')} active={p.get('active')}")
        elif ev == "disp":
            note(f"  [disp#{p.get('seq')}] {p.get('code')} active={p.get('active')}")
        elif ev == "EXCEPTION":
            note(f"  ##### EXCEPTION eip={p.get('eip')} memAddr={p.get('memAddr')} active={p.get('active')}")
        elif ev == "ready":
            note(f"  probe ready base={p.get('base')} strNoUnit={p.get('strNoUnit')}")

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
    # 월드로드 관측
    t0 = time.time()
    while time.time() - t0 < 30:
        if not alive():
            note(f"=== CLIENT DIED t+{time.time()-t0:.1f}s ==="); return fin(4)
        time.sleep(2)
    try:
        st = script.exports_sync.stats()
        note(f"=== STATS: stagerN={st.get('stagerN')} joinN={st.get('joinN')} activeCount={st.get('active')} ===")
    except Exception as e:
        note(f"stats fail {e}")
    screenshot(hwnd, shots / "stratmap.png")
    note("=== 요약 판정 ===")
    stager_entered = any(e.get("ev") == "stager_enter" for e in events)
    join_entered = any(e.get("ev") == "join_enter" for e in events)
    staged_ok = any(e.get("ev") == "stager_leave" and e.get("staged") for e in events)
    note(f"스테이저 진입={stager_entered}  조인 진입={join_entered}  스테이징 성공(activeCount↑)={staged_ok}")
    if alive(): proc.terminate()
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
