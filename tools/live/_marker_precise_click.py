#!/usr/bin/env python3
"""성계 마커 정밀 클릭 검증 (진단 전용, 서버/클라 무변조).

앞선 _crash_click_drive.py의 warm-blob 검출기가 배경별/HUD를 오검출해
실제 성계 마커를 한 번도 못 눌렀다(서버 트레이스상 클릭 시 아웃바운드 0건).
이 드라이버는 렌더된 스크린샷에서 눈으로 확정한 성계 중심좌표를 직접 찍는다.

마커 좌표 근거: .omo/live-qa/m3-markerclick-20260711-121317/shots/10-map-loaded.png
  (클라 클라이언트영역 1028x772 기준)
  シュバーラ = (209,187)  — 엄격 임계 블롭검출로 실측
  メルカリト = (638,128)  — 백색 항성(육안 확정)

각 마커에 좌클릭 → 더블클릭 → 우클릭 순으로 시도하고 매 단계
lookup/crashfn/아웃바운드/생존을 계측한다. 이동명령(빈칸 클릭)은 하지 않는다
(별개 크래시가 있어 마커 결과 관측을 오염시킴).

usage: py -3 _marker_precise_click.py <evidence-dir>
"""
from __future__ import annotations
import json, sys, time, subprocess, ctypes
from ctypes import wintypes
from pathlib import Path
import frida

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (  # noqa
    find_client_hwnd, foreground, client_geometry, screenshot, do_login, mouse_click,
)

user32 = ctypes.windll.user32
ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
PROBE_JS = Path(__file__).resolve().parent / "_frida_crash_probe.js"
M2_LAUNCH = ROOT / "tools" / "live" / "_m2_launch.mjs"

LOBBY_REF = (1024, 768)
GAME_START = (125, 191)
CHAR_CARD = (655, 305)

# 성계 마커(클라 클라이언트영역 1028x772 기준 실측 중심)
MAP_REF = (1028, 772)
MARKERS = [("シュバーラ", 209, 187), ("メルカリト", 638, 128)]

SEED_STORE = {
    "accounts": {"inei00": [{
        "id": 1, "power": 2, "camp": 2, "blood": 1, "sex": 0, "generated": 1,
        "lastname": "Reinhard", "firstname": "Lohengramm", "face": 305419896,
        "ability8": [80, 75, 70, 65, 60, 55, 50, 45], "bonusPoint": 0, "specialAbilityNum": 0,
        "title": 0, "rank": 13, "charState": 1, "age": 20}]},
    "nextId": 2,
}


def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])


def right_click(x, y):
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.08)
    user32.mouse_event(0x0008, 0, 0, 0, 0)   # RIGHTDOWN
    time.sleep(0.05)
    user32.mouse_event(0x0010, 0, 0, 0, 0)   # RIGHTUP


def main() -> int:
    evdir = Path(sys.argv[1]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line)
        (evdir / "precise-log.txt").write_text("\n".join(log), encoding="utf-8")

    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")

    srv_log = open(evdir / "server-stdout.log", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT),
                           stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time(); ready = False
    while time.time() - t0 < 20:
        if "m2-server-ready" in (evdir / "server-stdout.log").read_text(encoding="utf-8", errors="ignore"):
            ready = True; break
        if srv.poll() is not None:
            note(f"FAIL server rc={srv.returncode}"); return 2
        time.sleep(0.4)
    if not ready:
        note("FAIL server not ready"); srv.terminate(); return 2
    note("m2-server-ready")

    def finish(rc):
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
    if not hwnd:
        note("FAIL no window"); return finish(3)
    pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    note(f"window hwnd={hwnd:#x} pid={pid.value}")

    def on_message(m, _d):
        if m["type"] == "send":
            p = m["payload"]; events.append(p)
            ev = p.get("ev") if isinstance(p, dict) else None
            if ev == "errsite":
                note(f"  !!! ERRSITE {p.get('tag')} ret={p.get('ret')} lastDisp={p.get('lastDisp')}")
            elif ev == "send":
                note(f"  >> SEND n={p.get('n')} code={p.get('code')} size={p.get('size')} head={p.get('head')}")
            elif ev == "lookup":
                note(f"  [LOOKUP] id={p.get('id')} ret={p.get('ret')} MISS={p.get('missed')}")
            elif ev == "crashfn":
                note(f"  !!! CRASHFN unitId={p.get('unitId')} lastLookupId={p.get('lastLookupId')} "
                     f"lastLookupRet={p.get('lastLookupRet')}")
            elif ev == "EXCEPTION":
                note(f"  ##### EXCEPTION type={p.get('type')} atVA={p.get('address')} "
                     f"memOp={p.get('memOp')} memAddr={p.get('memAddr')} lastDisp={p.get('lastDisp')}")

    session = script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
            script.on("message", on_message); script.load(); time.sleep(0.5)
            note(f"probe loaded (try {attempt})"); break
        except Exception as e:
            note(f"attach try {attempt} FAIL {e}"); time.sleep(1.0)
    if not script:
        note("FAIL frida attach x3"); return finish(3)

    def snap(tag):
        try: s = script.exports_sync.snapshot()
        except Exception as e: note(f"snapshot fail {tag}: {e}"); return None
        note(f"[{tag}] out={s.get('outCount')} lookups={s.get('lookupCount')} "
             f"misses={s.get('lookupMisses')} crashfn={s.get('crashfnCount')} "
             f"errsites={len(s.get('errsites', []))} lastDisp={s.get('lastDisp')}")
        events.append({"ev": "snapshot", "tag": tag, "data": s}); return s

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    def die_report(trigger):
        note(f"=== CLIENT DIED === trigger={trigger}")
        rc = None
        for _ in range(12):
            rc = proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        note(f"exit code={rc} ({rc & 0xffffffff if rc else rc:#x})" if rc else f"exit code={rc}")
        looks = [e for e in events if isinstance(e, dict) and e.get("ev") == "lookup"]
        crfn = [e for e in events if isinstance(e, dict) and e.get("ev") == "crashfn"]
        errs = [e for e in events if isinstance(e, dict) and e.get("ev") == "errsite"]
        note(f"errsites={[e.get('tag') for e in errs]}")
        note(f"lookups={[(e.get('id'), e.get('ret'), e.get('missed')) for e in looks[-8:]]}")
        note(f"crashfn={[(e.get('unitId'), e.get('lastLookupRet')) for e in crfn[-4:]]}")

    # ---- login -> lobby -> stratmap ----
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login {cw}x{ch} -> do_login"); do_login(hwnd, "inei00", "dummy", shots)
    for i in range(20):
        time.sleep(1)
        if not alive(): die_report("login-settle"); return finish(4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000: note(f"lobby-size t+{i}s {cw}x{ch}"); break
    time.sleep(9)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch); note(f"click GAME_START {gs}")
        mouse_click(ox + gs[0], oy + gs[1]); time.sleep(3.5)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch); note(f"dblclick CHAR_CARD {cc}")
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(2.5)

    note("=== wait world/map load 35s ===")
    t0 = time.time()
    while time.time() - t0 < 35:
        if not alive(): die_report("map-load"); return finish(4)
        time.sleep(2)
    screenshot(hwnd, shots / "10-map-loaded.png")
    snap("map-loaded")
    try:
        r = script.exports_sync.dumpregistry()
        note(f"[REGISTRY] activeCount={r.get('activeCount')} ids={[e.get('id') for e in r.get('entries', [])][:40]}")
        events.append({"ev": "registry", "tag": "map-loaded", "data": r})
    except Exception as e:
        note(f"registry fail: {e}")

    # ---- 정밀 마커 클릭: 좌클릭 -> 더블클릭 -> 우클릭 ----
    ox, oy, cw, ch = client_geometry(hwnd)
    note(f"client geometry origin=({ox},{oy}) size={cw}x{ch}")
    for name, mx, my in MARKERS:
        rx, ry = scale(MAP_REF, (mx, my), cw, ch)
        sx, sy = ox + rx, oy + ry
        tag = name.encode("ascii", "replace").decode("ascii")

        for action in ("left", "double", "right"):
            if not alive(): die_report(f"before-{tag}-{action}"); return finish(4)
            script.exports_sync.clear()
            before = snap(f"{tag}-{action}-BEFORE")
            note(f"--- {action.upper()} on {tag} mapref=({mx},{my}) client=({rx},{ry}) screen=({sx},{sy})")
            foreground(hwnd); time.sleep(0.3)
            if action == "left":
                mouse_click(sx, sy)
            elif action == "double":
                mouse_click(sx, sy); time.sleep(0.15); mouse_click(sx, sy)
            else:
                right_click(sx, sy)
            time.sleep(2.5)
            if not alive():
                die_report(f"{tag}-{action}-click")
                return finish(4)
            screenshot(hwnd, shots / f"20-{tag}-{action}.png")
            after = snap(f"{tag}-{action}-AFTER")
            if before and after:
                d_out = (after.get("outCount") or 0) - (before.get("outCount") or 0)
                d_lk = (after.get("lookupCount") or 0) - (before.get("lookupCount") or 0)
                note(f"  >>> {tag} {action}: outbound+{d_out} lookups+{d_lk} "
                     f"crashfn={after.get('crashfnCount')} ALIVE={alive()}")
            # 우클릭 메뉴가 떴을 수 있으니 ESC로 닫고 다음 액션
            if action == "right":
                user32.keybd_event(0x1B, 0, 0, 0); time.sleep(0.05)
                user32.keybd_event(0x1B, 0, 2, 0); time.sleep(0.8)

    note("=== FINAL ===")
    if alive():
        screenshot(hwnd, shots / "99-final.png")
    snap("FINAL")
    note(f"client alive={alive()} exit={proc.poll()}")
    (evdir / "events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
    try:
        if alive(): proc.terminate(); note("terminated client")
    except Exception:
        pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
