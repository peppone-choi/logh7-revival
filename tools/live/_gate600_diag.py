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
PROBE_JS = Path(__file__).resolve().parent / "_frida_gate600_probe.js"
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
        if ev == "gate600":
            note(f"  <<< GATE600 code={p.get('code')} ax={p.get('ax')}({p.get('ax_hex')}) pass={p.get('pass')} msg32_off={p.get('msg32_off')} edi={p.get('edi')}")
            note(f"          edi_win(edi-8..+47)=[{p.get('edi_win')}]  esi={p.get('esi')} esi_win=[{p.get('esi_win')}]")
        elif ev == "pregate":
            note(f"  <<< PREGATE(pre-swap) code={p.get('code')} edi={p.get('edi')} pre_bytes=[{p.get('pre_bytes')}]")
        elif ev == "stager":
            note(f"  <<< STAGER code={p.get('code')} arg_al={p.get('arg_al')} active={p.get('active')}")
        elif ev == "join":
            note(f"  <<< JOIN code={p.get('code')} active={p.get('active')}")
        elif ev == "handler_enter":
            note(f"  handler_enter code={p.get('code')} arg0={p.get('arg0')} arg1={p.get('arg1')}")
        elif ev == "onrecv":
            tag = "  <<< ONRECV" if p.get("code") == "0x325" else "  onrecv"
            note(f"{tag} code={p.get('code')}")
        elif ev == "disp":
            note(f"  disp#{p.get('seq')} {p.get('code')}")
        elif ev == "EXCEPTION":
            note(f"  ##### EXCEPTION {p.get('type')} eip={p.get('eip')} memAddr={p.get('memAddr')} active={p.get('active')}")
            note(f"        regs eax={p.get('eax')} ecx={p.get('ecx')} edx={p.get('edx')} esi={p.get('esi')} edi={p.get('edi')} ebx={p.get('ebx')}")
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
    crashed = False
    while time.time() - t0 < 30:
        if not alive():
            crashed = True; note(f"=== CLIENT DIED t+{time.time()-t0:.1f}s ==="); break
        time.sleep(0.5)
    else:
        note("=== 생존(크래시 없음) ===")
    try: fin_active = script.exports_sync.active()
    except Exception: fin_active = None
    if alive(): proc.terminate()

    # 요약: 통합 A/B 검증 (fix-count-be 작업트리)
    g = [e for e in events if e.get("ev") == "gate600"]
    he = [e for e in events if e.get("ev") == "handler_enter"]
    onr = [e.get("code") for e in events if e.get("ev") == "onrecv"]
    disp = [e.get("code") for e in events if e.get("ev") == "disp"]
    maxactive = max([e.get("active", 0) for e in events] + [fin_active or 0])
    note("===== 통합 A/B 검증 (count-BE fix) =====")
    note(f"핸들러 진입: {len(he)}회 / 게이트: {len(g)}회")
    for e in g:
        note(f"  gate600 ax={e.get('ax')}({e.get('ax_hex')}) pass={e.get('pass')} msg32_off={e.get('msg32_off')} edi_win=[{e.get('edi_win')}]")
    pregate = [e for e in events if e.get("ev") == "pregate" and e.get("code") == "0x325"]
    stager = [e for e in events if e.get("ev") == "stager"]
    join = [e for e in events if e.get("ev") == "join"]
    note(f"[게이트] 0x0325 ax={[e.get('ax') for e in g]}  (기대 25)")
    note(f"[pre-swap 타이브레이커] 0x325 edi 원바이트={[e.get('pre_bytes') for e in pregate]} (서버 실송신: 19 00=LE / 00 19=BE)")
    note(f"[스테이저 FUN_004c2a80] 진입={len(stager)}회 (게이트통과 후 실행되면 >0)")
    note(f"[조인 FUN_004c2c80] 진입={len(join)}회")
    note(f"[OnRecv] 0x325={'O' if '0x325' in onr else 'X'}  [디스패치] 0x325={'O' if '0x325' in disp else 'X'}")
    note(f"[activeCount 최대]={maxactive}  [최종 activeCount]={fin_active}  [crashed]={crashed}")
    if g and all(e.get("ax") == 25 for e in g):
        if not crashed and '0x325' in disp and maxactive > 0:
            note("★판정 PASS→ count-BE 수정 성공: ax=25 게이트통과 + 스테이징(activeCount>0) + 0x0325 디스패치 + 생존. M3 종결 후보.")
        else:
            note(f"판정 부분→ ax=25 게이트통과했으나 이후 실패: dispatch={'0x325' in disp} active={maxactive} crashed={crashed}. jbe 이후 경로 조사.")
    elif g:
        note(f"판정 FAIL→ ax={[e.get('ax') for e in g]}≠25 → count 수정 no-op(게이트가 다른 오프셋/엔디안 읽음). msg32_off={[e.get('msg32_off') for e in g]}, edi_win 으로 실제 읽는 필드 역산 → 방향전환.")
    else:
        note("판정→ 게이트 미도달(핸들러 진입 여부 확인)")
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
