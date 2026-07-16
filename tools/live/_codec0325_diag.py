#!/usr/bin/env python3
"""0x0325 디스패치 스킵 확정 계측 드라이버 (무변조).
클라 프레임코덱 FUN_006130a0 훅으로 복호버퍼 용량(codec+0x1c) vs 0x0325 복호길이(52824),
복호 반환 cVar5(0=드롭)를 0x0325/0x0323 프레임별로 실측한다.
usage: py -3 _codec0325_diag.py <evdir>
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
PROBE_JS = Path(__file__).resolve().parent / "_frida_codec0325_probe.js"
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

    note(f"client exe = {CLIENT_EXE}")
    srv_log = open(evdir / "server-stdout.txt", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT), stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 20:
        if "m2-server-ready" in (evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore"): break
        if srv.poll() is not None: note(f"server rc={srv.returncode}"); return 2
        time.sleep(0.4)
    note("server ready")

    def fin(rc):
        (evdir / "codec.jsonl").write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
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
        if ev == "onrecv":
            tag = "  <<< ONRECV" if p.get("code") == "0x325" else "  onrecv"
            note(f"{tag} code={p.get('code')} raw={p.get('raw')} t={p.get('t')} active={p.get('active')}")
        elif ev == "codec":
            note(f"  codec-ok inner={p.get('inner')} t={p.get('t')} active={p.get('active')}")
        elif ev == "disp":
            note(f"  disp#{p.get('seq')} {p.get('code')} t={p.get('t')} active={p.get('active')}")
        elif ev == "EXCEPTION":
            note(f"  ##### EXCEPTION {p.get('type')} eip={p.get('eip')} memAddr={p.get('memAddr')} active={p.get('active')}")
        elif ev == "ready":
            note(f"  probe ready base={p.get('base')} onrecv={p.get('onrecv')} disp={p.get('disp')}")

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
    while time.time() - t0 < 25:
        if not alive():
            note(f"=== CLIENT DIED (월드진입) t+{time.time()-t0:.1f}s ===")
            rc = None
            for _ in range(12):
                rc = proc.poll()
                if rc is not None: break
                time.sleep(0.3)
            note(f"exit={rc} ({(rc & 0xffffffff):#x})" if rc is not None else "exit=zombie")
            break
        time.sleep(0.5)
    else:
        note("=== 25s 생존 ===")
        if alive():
            screenshot(hwnd, shots / "survived.png"); proc.terminate()

    # 요약: 0x0325 도착 이분 (OnRecv → 코덱 → 디스패처)
    onr = [e for e in events if e.get("ev") == "onrecv"]
    cev = [e for e in events if e.get("ev") == "codec"]
    onr325 = [e for e in onr if e.get("code") == "0x325"]
    codec325 = [e for e in cev if e.get("inner") == "0x325"]
    disp = [e for e in events if e.get("ev") == "disp"]
    disp_codes = [e.get("code") for e in disp]
    note("===== 0x0325 도착 이분 =====")
    note(f"[상류] 코덱 복호통과 0x325: {len(codec325)}건 (t={[e.get('t') for e in codec325]})")
    note(f"[OnRecv] 0x325 도착: {len(onr325)}건 (t={[e.get('t') for e in onr325]})  ★도착={'O' if onr325 else 'X'}")
    note(f"[하류] 디스패치 0x325: {'O' if '0x325' in disp_codes else 'X'}")
    note(f"OnRecv 전체 코드 시퀀스: {[e.get('code') for e in onr]}")
    note(f"디스패치 시퀀스: {disp_codes}")
    try:
        note(f"probe stats={script.exports_sync.stats()}")
    except Exception as e:
        note(f"stats rpc fail {e}")
    # 판정 힌트
    if codec325 and onr325 and "0x325" not in disp_codes:
        note("판정→ 하류 드롭(B): 코덱·OnRecv 도착하나 디스패처 미발화 → RecvQue/상태게이트")
    elif codec325 and not onr325:
        note("판정→ OnRecv 이전 소실: 코덱은 통과하나 OnRecv 미도착 → 코덱~OnRecv 사이 배선/큐")
    elif not codec325:
        note("판정→ 상류 소실: 코덱 복호통과 자체가 0x325 없음")
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
