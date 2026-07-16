#!/usr/bin/env python3
"""旗艦情報 컨텍스트메뉴 트리거 헌트 + 크래시 재현 (진단 전용, 무변조).

앞 런에서 확인: 축소상태 메뉴바에는 [ゲーム中断](→システム설정 메뉴)과 [サウンド설정]
두 버튼뿐이고 キャラクター情報(艦艇情報/旗艦情報) 서브메뉴는 여기서 안 열린다.
艦艇/旗艦 정보 메뉴는 함대콘솔/맵 요소의 컨텍스트(우클릭 등)로 뜬다고 추정.

전략: 후보 지점을 좌/우클릭으로 트리거해 메뉴를 띄우고, 각 시도 직후
旗艦情報 항목 예상좌표(810,622 및 대체 y)를 클릭해 크래시를 유도한다. 매 단계
스크린샷 + frida(lookup/crashfn/errsite/exception/생존) 계측. 크래시나면 즉시
exit code + 서버 trace 마지막 프레임까지 리포트.

usage: py -3 _flagship_menu_hunt.py <evidence-dir>
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
MENU_REF = (1028, 772)
GAME_START = (125, 191)
CHAR_CARD = (655, 305)

# 컨텍스트메뉴 트리거 후보 (MENU_REF=1028x772 기준). (label, x, y, button)
# 함대콘솔/HUD 아이콘/맵/함대콘솔 포트레이트를 좌·우클릭으로 훑는다.
TRIGGERS = [
    ("rc-console-portrait", 150, 660, "right"),
    ("rc-console-center", 470, 660, "right"),
    ("rc-map-playerfleet", 500, 300, "right"),
    ("lc-hud-icon-char", 735, 752, "left"),
    ("lc-hud-icon2", 780, 752, "left"),
    ("lc-hud-icon3", 828, 752, "left"),
    ("rc-console-portrait2", 210, 690, "right"),
]
# 旗艦情報 항목 예상좌표(메뉴가 뜨면 이 근처). 여러 y 후보를 훑는다.
FLAGSHIP_ITEM_X = 810
FLAGSHIP_ITEM_YS = [622, 600, 645]

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
    user32.SetCursorPos(int(x), int(y)); time.sleep(0.08)
    user32.mouse_event(0x0008, 0, 0, 0, 0); time.sleep(0.05)
    user32.mouse_event(0x0010, 0, 0, 0, 0)


def main() -> int:
    evdir = Path(sys.argv[1]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line)
        (evdir / "hunt-log.txt").write_text("\n".join(log), encoding="utf-8")

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
                     f"lastLookupRet={p.get('lastLookupRet')} lastDisp={p.get('lastDisp')}")
            elif ev == "EXCEPTION":
                note(f"  ##### EXCEPTION type={p.get('type')} atVA={p.get('address')} eip={p.get('eip')} "
                     f"memOp={p.get('memOp')} memAddr={p.get('memAddr')} edi={p.get('edi')} lastDisp={p.get('lastDisp')}")

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
        except Exception: return None
        return s

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    def die_report(trigger):
        note(f"=== CLIENT DIED === trigger={trigger}")
        rc = None
        for _ in range(15):
            rc = proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        rc_hex = (rc & 0xffffffff) if isinstance(rc, int) else rc
        note(f"exit code={rc} ({rc_hex:#x})" if isinstance(rc, int) else f"exit code={rc}")
        note(f"crash time={time.strftime('%Y-%m-%d %H:%M:%S')}")
        errs = [e for e in events if isinstance(e, dict) and e.get("ev") == "errsite"]
        looks = [e for e in events if isinstance(e, dict) and e.get("ev") == "lookup"]
        crfn = [e for e in events if isinstance(e, dict) and e.get("ev") == "crashfn"]
        exc = [e for e in events if isinstance(e, dict) and e.get("ev") == "EXCEPTION"]
        note(f"errsites fired={[e.get('tag') for e in errs]}")
        note(f"lookups tail={[(e.get('id'), e.get('ret'), e.get('missed')) for e in looks[-8:]]}")
        note(f"crashfn tail={[(e.get('unitId'), e.get('lastLookupId'), e.get('lastLookupRet')) for e in crfn[-4:]]}")
        note(f"EXCEPTION count={len(exc)} last3={exc[-3:]}")
        try:
            from PIL import ImageGrab
            ImageGrab.grab(all_screens=True).save(shots / f"CRASH-{trigger}-fullscreen.png")
        except Exception:
            pass

    # ---- login -> stratmap ----
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login {cw}x{ch} -> do_login"); do_login(hwnd, "inei00", "dummy", shots)
    for i in range(20):
        time.sleep(1)
        if not alive(): die_report("login-settle"); return finish(4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000: break
    time.sleep(9)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch); mouse_click(ox + gs[0], oy + gs[1]); time.sleep(3.5)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch)
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(2.5)
    note("=== wait world/map load 35s ===")
    t0 = time.time()
    while time.time() - t0 < 35:
        if not alive(): die_report("map-load"); return finish(4)
        time.sleep(2)
    screenshot(hwnd, shots / "10-map-loaded.png")
    s = snap("map-loaded")
    if s:
        note(f"[map-loaded] out={s.get('outCount')} lookups={s.get('lookupCount')} crashfn={s.get('crashfnCount')}")
    try:
        r = script.exports_sync.dumpregistry()
        note(f"[REGISTRY] activeCount={r.get('activeCount')} ids={[e.get('id') for e in r.get('entries', [])][:20]}")
        events.append({"ev": "registry", "tag": "map-loaded", "data": r})
    except Exception:
        pass
    ox, oy, cw, ch = client_geometry(hwnd)
    note(f"geometry origin=({ox},{oy}) size={cw}x{ch}")

    # ---- 트리거 헌트: 각 후보를 클릭→스샷→旗艦情報 항목 클릭 시도 ----
    for ti, (label, mx, my, btn) in enumerate(TRIGGERS):
        if not alive(): die_report(f"before-{label}"); return finish(4)
        script.exports_sync.clear()
        rx, ry = scale(MENU_REF, (mx, my), cw, ch)
        sx, sy = ox + rx, oy + ry
        note(f"--- TRIGGER#{ti} {label} {btn}-click menuref=({mx},{my}) screen=({sx},{sy})")
        foreground(hwnd); time.sleep(0.3)
        if btn == "right":
            right_click(sx, sy)
        else:
            mouse_click(sx, sy)
        time.sleep(1.0)
        if not alive(): die_report(f"{label}-trigger"); return finish(4)
        screenshot(hwnd, shots / f"20-{ti:02d}-{label}.png")

        # 메뉴가 떴다고 가정하고 旗艦情報 예상 위치들 클릭
        for yi, iy in enumerate(FLAGSHIP_ITEM_YS):
            if not alive(): die_report(f"{label}-before-flagclick"); return finish(4)
            fx, fy = scale(MENU_REF, (FLAGSHIP_ITEM_X, iy), cw, ch)
            note(f"    click FLAGSHIP-candidate y={iy} screen=({ox+fx},{oy+fy})")
            foreground(hwnd); time.sleep(0.2)
            mouse_click(ox + fx, oy + fy)
            # 촘촘히 크래시 감시
            crashed = False
            for k in range(8):
                time.sleep(0.4)
                if not alive():
                    crashed = True
                    note(f"*** DIED {(k+1)*0.4:.1f}s after flagship-candidate({label},y={iy}) ***")
                    break
            if crashed:
                die_report(f"{label}-flagship-y{iy}")
                (evdir / "events.jsonl").write_text(
                    "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
                return finish(4)
        screenshot(hwnd, shots / f"21-{ti:02d}-{label}-after.png")
        # ESC로 열린 메뉴 닫고 다음 트리거
        user32.keybd_event(0x1B, 0, 0, 0); time.sleep(0.05)
        user32.keybd_event(0x1B, 0, 2, 0); time.sleep(0.6)

    note("=== FINAL — no crash reproduced across triggers ===")
    if alive(): screenshot(hwnd, shots / "99-final.png")
    sf = snap("final")
    if sf:
        note(f"[FINAL] out={sf.get('outCount')} lookups={sf.get('lookupCount')} crashfn={sf.get('crashfnCount')} "
             f"errsites={len(sf.get('errsites', []))} alive={alive()}")
    (evdir / "events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
    try:
        if alive(): proc.terminate(); note("terminated client")
    except Exception:
        pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
