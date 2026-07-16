#!/usr/bin/env python3
"""0x0323 char 스테이징 진단 드라이버 (무변조) — BE 커밋(93fcf150) 후 유닛 미적재 파악.
_frida_charstage_probe.js로 FUN_004c2a80 스테이저/FUN_004c2c80 조인 프롤로그 관측.
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
PROBE_JS = Path(__file__).resolve().parent / "_frida_charstage_probe.js"
M2_LAUNCH = ROOT / "tools" / "live" / "_m2_launch.mjs"
LOBBY_REF = (1024, 768); GAME_START = (125, 191); CHAR_CARD = (655, 305)

SEED_STORE = {"accounts": {"inei00": [{
    "id": 1, "power": 2, "camp": 2, "blood": 1, "sex": 0, "generated": 1,
    "lastname": "Reinhard", "firstname": "Lohengramm", "face": 305419896,
    "ability8": [80, 75, 70, 65, 60, 55, 50, 45], "bonusPoint": 0, "specialAbilityNum": 0,
    "title": 0, "rank": 13, "charState": 1, "age": 20, "flagship": 7}]}, "nextId": 2}


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
        (evdir / "charstage.jsonl").write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
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
        if ev == "charh_enter":
            note(f"  >>> CHARH_ENTER #{p.get('n')} lastCode={p.get('lastCode')}")
            if p.get('ebx_win'):
                note(f"        char-handler ebx={p.get('ebx')} win={p.get('ebx_win')}")
            for r in (p.get("recs") or []):
                if r.get("id_at0") is not None or r.get("flag_at24") is not None:
                    note(f"        {r.get('nm')} id@0={r.get('id_at0') and hex(r['id_at0'])} flag@24={r.get('flag_at24') and hex(r['flag_at24'])} win={r.get('win')}")
            t = p.get("table") or {}
            note(f"        table: ccnt={t.get('ccnt')} ucnt={t.get('ucnt')} char0_id={t.get('char0_id') and hex(t['char0_id'])} char0_flag={t.get('char0_flag') and hex(t['char0_flag'])}")
        elif ev == "unith_enter":
            note(f"  >>> UNITH_ENTER #{p.get('n')}")
            for r in (p.get("recs") or []):
                if r.get("win"):
                    note(f"        {r.get('nm')} ptr={r.get('ptr')} win={r.get('win')}")
        elif ev == "unit_handler_enter":
            note(f"  >>> UNIT_HANDLER #{p.get('n')} lastCode={p.get('lastCode')} ebx={p.get('ebx')} win={p.get('ebx_win')}")
        elif ev == "char_handler_enter":
            note(f"  >>> CHAR_HANDLER #{p.get('n')} lastCode={p.get('lastCode')} ebx={p.get('ebx')} win={p.get('ebx_win')}")
        elif ev == "base_captured":
            note(f"  [base_captured] {p.get('base')}")
        elif ev == "stager_enter":
            t = p.get("table") or {}
            note(f"  >>> STAGER_ENTER #{p.get('n')} al={p.get('al')} arg0={p.get('arg0')} lastCode={p.get('lastCode')} ccnt={t.get('ccnt')} ucnt={t.get('ucnt')} "
                 f"char0_id={t.get('char0_id') and hex(t['char0_id'])} char0_flag={t.get('char0_flag') and hex(t['char0_flag'])} unit0_d0={t.get('unit0_d0') and hex(t['unit0_d0'])}")
            note(f"        char0_win={t.get('char0_win')}")
            note(f"        unit0_win={t.get('unit0_win')}")
        elif ev == "stager_leave":
            t = p.get("table") or {}
            note(f"  <<< STAGER_LEAVE #{p.get('n')} ccnt={t.get('ccnt')} ucnt={t.get('ucnt')} char0_flag={t.get('char0_flag') and hex(t['char0_flag'])}")
            f = p.get("focus") or {}
            note(f"        FOCUS@leave selfId={f.get('selfId') and hex(f['selfId'])} slot0_occ={f.get('slot0_occ')} "
                 f"slot0_id={f.get('slot0_id') and hex(f['slot0_id'])} focusObj={f.get('focusObj')} "
                 f"focusId={f.get('focusId') and hex(f['focusId'])} hud={f.get('hud')}")
            note(f"        PLAYER@leave {f.get('playerInfo')} OUTFIT@leave {f.get('outfitRegistry')}")
            if f.get("ui") is not None:
                note(f"        UI@leave {f.get('ui')}")
        elif ev == "join_enter":
            t = p.get("table") or {}
            note(f"  === JOIN_ENTER #{p.get('n')} lastCode={p.get('lastCode')} ccnt={t.get('ccnt')} char0_flag={t.get('char0_flag') and hex(t['char0_flag'])} unit0_d0={t.get('unit0_d0') and hex(t['unit0_d0'])}")
        elif ev == "hud_gate_enter":
            note(f"  >>> HUD_GATE_ENTER #{p.get('n')} self={p.get('self')} self0={p.get('self0') and hex(p['self0'])} ui={p.get('ui')}")
        elif ev == "hud_gate_leave":
            note(f"  <<< HUD_GATE_LEAVE #{p.get('n')} retval={p.get('retval')}")
        elif ev == "disp":
            note(f"  [disp#{p.get('seq')}] {p.get('code')} ccnt={p.get('ccnt')} ucnt={p.get('ucnt')}")
        elif ev == "EXCEPTION":
            note(f"  ##### EXCEPTION eip={p.get('eip')} memAddr={p.get('memAddr')}")
            f = p.get("focus") or {}
            note(f"        FOCUS@crash selfId={f.get('selfId') and hex(f['selfId'])} slot0_occ={f.get('slot0_occ')} "
                 f"slot0_id={f.get('slot0_id') and hex(f['slot0_id'])} focusObj={f.get('focusObj')} "
                 f"focusId={f.get('focusId') and hex(f['focusId'])} hud={f.get('hud')} clientBase={f.get('clientBase')}")
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
    # 월드로드 관측 + focus 폴링(크래시 前 마지막 실측 확보)
    t0 = time.time(); last_focus = None
    while time.time() - t0 < 30:
        if not alive():
            note(f"=== CLIENT DIED t+{time.time()-t0:.1f}s ===")
            if last_focus is not None:
                f = last_focus
                note(f"        FOCUS@last selfId={f.get('selfId') and hex(f['selfId'])} slot0_occ={f.get('slot0_occ')} "
                     f"slot0_id={f.get('slot0_id') and hex(f['slot0_id'])} focusObj={f.get('focusObj')} "
                     f"focusId={f.get('focusId') and hex(f['focusId'])} hud={f.get('hud')}")
            return fin(4)
        try:
            f = script.exports_sync.focus(); last_focus = f
            events.append({"ev":"focus_poll","t":round(time.time()-t0,1),"focus":f})
        except Exception:
            pass
        time.sleep(1)
    try:
        st = script.exports_sync.stats()
        note(f"=== STATS: stagerN={st.get('stagerN')} joinN={st.get('joinN')} activeCount={st.get('active')} ===")
        f = script.exports_sync.focus()
        note(f"=== FOCUS@survive selfId={f.get('selfId') and hex(f['selfId'])} slot0_occ={f.get('slot0_occ')} "
             f"slot0_id={f.get('slot0_id') and hex(f['slot0_id'])} focusObj={f.get('focusObj')} "
             f"focusId={f.get('focusId') and hex(f['focusId'])} hud={f.get('hud')} ===")
    except Exception as e:
        note(f"stats fail {e}")
    screenshot(hwnd, shots / "stratmap.png")
    note("=== 요약 판정 ===")
    charh_entered = any(e.get("ev")=="charh_enter" for e in events); stager_entered = any(e.get("ev") == "stager_enter" for e in events)
    join_entered = any(e.get("ev") == "join_enter" for e in events)
    staged_ok = any(e.get("ev") == "stager_leave" and e.get("staged") for e in events)
    note(f"스테이저 진입={stager_entered}  조인 진입={join_entered}  스테이징 성공(activeCount↑)={staged_ok}")
    if alive(): proc.terminate()
    return fin(0)


if __name__ == "__main__":
    raise SystemExit(main())
