#!/usr/bin/env python3
"""전략맵 UI 안정성 검증 — (A) 성계 마커 클릭, (B) 旗艦情報 메뉴 클릭.

배경:
  - 사용자 제보: 旗艦情報(기함정보)를 누르면 클라가 종료된다.
  - .omo/live-qa/stratmap-idle-20260711-031804/shots/55-idle-256s-full.png 에
    キャラクター情報 팝업(艦艇情報/旗艦情報/戦闘隊情報/部隊情報/陸戦隊情報/惑星要塞情報)이
    열린 채 "응답 없음" 다이얼로그가 떠 있다 — 커서가 旗艦情報 위에 있다.
    즉 그 크래시는 idle 타이머가 아니라 旗艦情報 클릭으로 보인다.
  - 팝업은 메뉴바 탭이 아니라 하단 아이콘 행에서 열리는 것으로 추정된다.

PHASE1(probe): 마커 클릭 → 하단 아이콘을 하나씩 눌러 팝업을 여는 아이콘을 찾고
  클라이언트영역 좌표계로 스크린샷을 남긴다(팝업 항목 좌표 확정용).
PHASE2(click): 확정된 旗艦情報 좌표를 눌러 크래시를 재현한다.
  --flagship X,Y 를 주면 PHASE2를 수행한다.

모든 이벤트에 map-load 이후 경과초(t+)를 붙인다 — 시간기반 크래시와 클릭기반
크래시를 구분하기 위한 대조군.

usage: py -3 _flagship_probe.py <evidence-dir> [--flagship X,Y] [--icons] [--holdsec N]
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

MAP_REF = (1028, 772)
# 성계 마커(실측, m3-markerprecise 런에서 확인된 좌표)
MARKER = ("shubara", 209, 187)
# 하단 함대콘솔 아이콘 행(99-final.png 실측): y=750, x=730/778/827/875/923/972
ICON_Y = 750
ICON_XS = [730, 778, 827, 875, 923, 972]

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


def main() -> int:
    args = sys.argv[1:]
    evdir = Path(args[0]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    flagship = None
    do_icons = "--icons" in args
    hold = 0
    for i, a in enumerate(args):
        if a == "--flagship":
            flagship = tuple(int(v) for v in args[i + 1].split(","))
        if a == "--holdsec":
            hold = int(args[i + 1])

    events = []
    log = []
    map_t0 = [None]

    def note(msg):
        el = "" if map_t0[0] is None else f" t+{time.time() - map_t0[0]:.0f}s"
        line = f"[{time.strftime('%H:%M:%S')}{el}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line)
        (evdir / "driver-console.txt").write_text("\n".join(log), encoding="utf-8")

    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")

    srv_log = open(evdir / "server-stdout.txt", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT),
                           stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time(); ready = False
    while time.time() - t0 < 20:
        if "m2-server-ready" in (evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore"):
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
        srv_log.close()
        (evdir / "events.jsonl").write_text(
            "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n",
            encoding="utf-8")
        return rc

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
                note(f"  >> SEND n={p.get('n')} code={p.get('code')} size={p.get('size')}")
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
        events.append({"ev": "snapshot", "tag": tag, "data": s, "t": time.time()}); return s

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    def die_report(trigger):
        note(f"=== CLIENT DIED === trigger={trigger}")
        rc = None
        for _ in range(12):
            rc = proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        note(f"exit code={rc} hex={(rc & 0xffffffff):#x}" if rc is not None else "exit code=None(zombie)")
        looks = [e for e in events if isinstance(e, dict) and e.get("ev") == "lookup"]
        crfn = [e for e in events if isinstance(e, dict) and e.get("ev") == "crashfn"]
        errs = [e for e in events if isinstance(e, dict) and e.get("ev") == "errsite"]
        excs = [e for e in events if isinstance(e, dict) and e.get("ev") == "EXCEPTION"]
        note(f"errsites={[e.get('tag') for e in errs]}")
        note(f"EXCEPTIONS={[(e.get('type'), e.get('address'), e.get('memAddr'), e.get('lastDisp')) for e in excs[-3:]]}")
        note(f"lookups(last8)={[(e.get('id'), e.get('ret'), e.get('missed')) for e in looks[-8:]]}")
        note(f"crashfn={[(e.get('unitId'), e.get('lastLookupRet')) for e in crfn[-4:]]}")
        events.append({"ev": "died", "trigger": trigger, "exitcode": rc, "t": time.time()})

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

    note("=== wait world/map load 30s ===")
    t0 = time.time()
    while time.time() - t0 < 30:
        if not alive(): die_report("map-load"); return finish(4)
        time.sleep(2)
    map_t0[0] = time.time()
    screenshot(hwnd, shots / "10-map-loaded.png")
    snap("map-loaded")
    ox, oy, cw, ch = client_geometry(hwnd)
    note(f"client geometry origin=({ox},{oy}) size={cw}x{ch}")

    # ---- (A) 성계 마커 클릭 ----
    name, mx, my = MARKER
    rx, ry = scale(MAP_REF, (mx, my), cw, ch)
    script.exports_sync.clear()
    before = snap("markerA-BEFORE")
    screenshot(hwnd, shots / "20-marker-before.png")
    note(f"--- (A) MARKER click {name} client=({rx},{ry}) screen=({ox+rx},{oy+ry})")
    foreground(hwnd); time.sleep(0.3)
    mouse_click(ox + rx, oy + ry); time.sleep(2.5)
    if not alive():
        die_report("A-marker-click"); screenshot(hwnd, shots / "21-marker-after.png"); return finish(4)
    screenshot(hwnd, shots / "21-marker-after.png")
    after = snap("markerA-AFTER")
    if before and after:
        note(f"  >>> (A) MARKER outbound+{(after.get('outCount') or 0) - (before.get('outCount') or 0)} "
             f"lookups+{(after.get('lookupCount') or 0) - (before.get('lookupCount') or 0)} ALIVE={alive()}")

    # ---- (B) 旗艦情報 ----
    if do_icons:
        # 팝업을 여는 아이콘 탐색: 하나씩 클릭 + 스크린샷 + ESC
        for idx, ix in enumerate(ICON_XS):
            if not alive(): die_report(f"icon{idx}-pre"); return finish(4)
            sx, sy = ox + int(ix * cw / MAP_REF[0]), oy + int(ICON_Y * ch / MAP_REF[1])
            note(f"--- ICON#{idx} client=({ix},{ICON_Y}) screen=({sx},{sy})")
            foreground(hwnd); time.sleep(0.2)
            mouse_click(sx, sy); time.sleep(1.5)
            if not alive():
                die_report(f"icon{idx}-click"); return finish(4)
            screenshot(hwnd, shots / f"30-icon{idx}.png")
            snap(f"icon{idx}")
            user32.keybd_event(0x1B, 0, 0, 0); time.sleep(0.05)
            user32.keybd_event(0x1B, 0, 2, 0); time.sleep(0.8)
            screenshot(hwnd, shots / f"31-icon{idx}-esc.png")

    if flagship:
        fx, fy = flagship
        sx, sy = ox + int(fx * cw / MAP_REF[0]), oy + int(fy * ch / MAP_REF[1])
        if not alive(): die_report("flagship-pre"); return finish(4)
        # 팝업 열기: ICON#1(각종정보 열람, client 778,750) — 여기서 キャラクター情報 메뉴가 뜬다
        ix, iy = ICON_XS[1], ICON_Y
        isx, isy = ox + int(ix * cw / MAP_REF[0]), oy + int(iy * ch / MAP_REF[1])
        note(f"--- (B) open popup ICON#1 client=({ix},{iy}) screen=({isx},{isy})")
        foreground(hwnd); time.sleep(0.3)
        mouse_click(isx, isy); time.sleep(1.5)
        if not alive(): die_report("B-popup-open"); return finish(4)
        screenshot(hwnd, shots / "39-flagship-popup-open.png")
        snap("popup-open")

        script.exports_sync.clear()
        before = snap("flagship-BEFORE")
        screenshot(hwnd, shots / "40-flagship-click-before.png")
        note(f"--- (B) FLAGSHIP(旗艦情報) click client=({fx},{fy}) screen=({sx},{sy})")
        foreground(hwnd); time.sleep(0.3)
        mouse_click(sx, sy)
        # 크래시 순간 포착: 짧은 간격으로 생존 확인
        for i in range(20):
            time.sleep(0.5)
            if not alive():
                die_report("B-flagship-click")
                snap("flagship-AFTER-DEAD")
                return finish(4)
        screenshot(hwnd, shots / "41-flagship-click-after.png")
        after = snap("flagship-AFTER")
        if before and after:
            note(f"  >>> (B) FLAGSHIP outbound+{(after.get('outCount') or 0) - (before.get('outCount') or 0)} "
                 f"lookups+{(after.get('lookupCount') or 0) - (before.get('lookupCount') or 0)} ALIVE={alive()}")

    # ---- 대조군: 무입력 유지 (시간기반 크래시 배제) ----
    if hold:
        note(f"=== CONTROL: {hold}s 무입력 유지 (시간기반 크래시 대조) ===")
        t0 = time.time()
        while time.time() - t0 < hold:
            if not alive():
                die_report(f"idle-control+{time.time()-t0:.0f}s"); return finish(4)
            time.sleep(2)
        screenshot(hwnd, shots / "50-idle-control.png")
        note(f"CONTROL survived {hold}s with no input")

    note("=== FINAL ===")
    if alive():
        screenshot(hwnd, shots / "99-final.png")
    snap("FINAL")
    note(f"client alive={alive()} exit={proc.poll()}")
    try:
        if alive(): proc.terminate(); note("terminated client")
    except Exception:
        pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
