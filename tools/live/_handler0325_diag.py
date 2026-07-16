#!/usr/bin/env python3
"""0x0325 판별자 확정 (무변조). FUN_00404610의 *(arg1) vs 0x8000 + AL 반환을 0x0325 vs 0x0323 대조.
usage: py -3 _dispatch610_diag.py <evdir>
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
CLIENT_EXE = str(next(ROOT.glob("artifacts/logh7-install/*/*/exe/g7mtclient.exe")))
PROBE_JS = Path(__file__).resolve().parent / "_frida_handler0325_probe.js"
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
        (evdir / "d610.jsonl").write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
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
            note(f"  [frida-err] {m}"); return
        p = m["payload"]
        if not isinstance(p, dict): return
        events.append(p); ev = p.get("ev")
        if ev == "handler":
            tag = "  <<< HANDLER" if p.get("code") == "0x325" else "  handler"
            note(f"{tag} code={p.get('code')} al={p.get('al')} hfunc={p.get('hfunc')} vtbl={p.get('vtbl')} hobj={p.get('hobj')}")
        elif ev == "onrecv":
            tag = "  <<< ONRECV" if p.get("code") == "0x325" else "  onrecv"
            note(f"{tag} code={p.get('code')}")
        elif ev == "disp":
            note(f"  disp#{p.get('seq')} {p.get('code')}")
        elif ev == "EXCEPTION":
            note(f"  ##### EXCEPTION {p.get('type')} eip={p.get('eip')} memAddr={p.get('memAddr')} active={p.get('active')}")
        elif ev == "ready":
            note(f"  probe ready base={p.get('base')}")

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
    t0 = time.time()
    while time.time() - t0 < 20:
        if not alive():
            note(f"=== CLIENT DIED t+{time.time()-t0:.1f}s ==="); break
        time.sleep(0.5)
    if alive(): proc.terminate()

    # 요약: 0x0325 vs 0x0323 실 핸들러 함수 대조
    h = {e.get("code"): e for e in events if e.get("ev") == "handler"}
    onr = [e.get("code") for e in events if e.get("ev") == "onrecv"]
    disp = [e.get("code") for e in events if e.get("ev") == "disp"]
    f325 = h.get("0x325", {}).get("hfunc"); f323 = h.get("0x323", {}).get("hfunc")
    note("===== 0x0325 vs 0x0323 실 핸들러 =====")
    note(f"[0x0325] hfunc={f325} vtbl={h.get('0x325',{}).get('vtbl')} al={h.get('0x325',{}).get('al')}")
    note(f"[0x0323] hfunc={f323} vtbl={h.get('0x323',{}).get('vtbl')} al={h.get('0x323',{}).get('al')}")
    note(f"코드별 핸들러함수: {{k: v.get('hfunc') for k,v in h.items()}}")
    note(f"[OnRecv] 0x325={'O' if '0x325' in onr else 'X'}  [디스패치] 0x325={'O' if '0x325' in disp else 'X'}")
    if f325 and f323:
        if f325 == f323:
            note("판정→ 동일 핸들러함수: 0x0325·0x0323 같은 함수 → 분기는 내용/상태(핸들러 내부 필드검증). 그 함수 정적RE.")
        else:
            note(f"판정→ ★다른 핸들러함수: 0x0325={f325} vs 0x0323={f323} → opcode-keyed 핸들러 상이. 0x0325 핸들러가 스테이징 안하는 타입/스텁. 그 함수 정적RE.")
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
