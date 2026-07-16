#!/usr/bin/env python3
"""旗艦情報(기함 정보) 클릭 크래시 재현 (진단 전용, 서버/클라 무변조).

사용자 제보: 전략맵 함대콘솔의 캐릭터정보 서브메뉴 "旗艦情報"를 클릭하면 클라 튕김.
재현 절차: 로그인->로비->전략맵 진입 후
  1) 함대콘솔 "キャラクター情報" 탭(818,575) 클릭 -> 서브메뉴 펼침
  2) "旗艦情報" 항목(818,622) 클릭 -> 크래시 관측
크래시 시 exit code + frida 계측(lookup/crashfn/errsite/exception) + 서버 trace 마지막
프레임을 증거로 남긴다. 수정은 하지 않는다.

메뉴 좌표 근거: .omo/live-qa/m3-markerclick-20260711-121317/shots/13-marker1-move.png
  (클라 1028x772 기준, 확대 판독)
  キャラクター情報 헤더 = (818,575)
  艦艇情報=(818,597) 旗艦情報=(818,622) 戦隊情報=(818,645)
  部隊情報=(818,669) 陸戦部隊情報=(818,693) 惑星要塞情報=(818,718)

usage: py -3 _flagship_click_drive.py <evidence-dir>
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

CHARINFO_TAB = (818, 575)   # キャラクター情報 탭(서브메뉴 여는 곳)
# 서브메뉴 항목들(캡처판독). 대상은 旗艦情報.
MENU_ITEMS = {
    "kantei_艦艇情報": (818, 597),
    "kikan_旗艦情報": (818, 622),
    "sentai_戦隊情報": (818, 645),
}
TARGET = "kikan_旗艦情報"

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
    evdir = Path(sys.argv[1]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line)
        (evdir / "flagship-log.txt").write_text("\n".join(log), encoding="utf-8")

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
                     f"memOp={p.get('memOp')} memAddr={p.get('memAddr')} edi={p.get('edi')} "
                     f"eax={p.get('eax')} ecx={p.get('ecx')} lastDisp={p.get('lastDisp')}")
            elif ev == "odstring":
                note(f"  [ODS] ascii={p.get('ascii')!r}")

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

    def dump_reg(tag):
        try:
            r = script.exports_sync.dumpregistry()
        except Exception as e:
            note(f"dumpregistry fail {tag}: {e}"); return None
        note(f"[REGISTRY {tag}] activeCount={r.get('activeCount')} "
             f"ids={[e.get('id') for e in r.get('entries', [])][:40]}")
        events.append({"ev": "registry", "tag": tag, "data": r}); return r

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
        note(f"EXCEPTION count={len(exc)} last={exc[-1] if exc else None}")

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
    dump_reg("map-loaded")   # 기함/commander 필드 상태 기록(팀리드 가설)

    ox, oy, cw, ch = client_geometry(hwnd)
    note(f"client geometry origin=({ox},{oy}) size={cw}x{ch}")

    # ---- 1) キャラクター情報 탭 클릭 -> 서브메뉴 펼침 ----
    script.exports_sync.clear()
    tx, ty = scale(MENU_REF, CHARINFO_TAB, cw, ch)
    note(f"--- click CHARINFO tab menuref={CHARINFO_TAB} client=({tx},{ty})")
    foreground(hwnd); time.sleep(0.3)
    mouse_click(ox + tx, oy + ty); time.sleep(1.2)
    if not alive(): die_report("charinfo-tab-click"); return finish(4)
    screenshot(hwnd, shots / "20-charinfo-menu-open.png")
    snap("charinfo-menu")

    # ---- 2) 旗艦情報 클릭 -> 크래시 관측 ----
    fx, fy = scale(MENU_REF, MENU_ITEMS[TARGET], cw, ch)
    note(f"=== CLICK TARGET {TARGET} menuref={MENU_ITEMS[TARGET]} client=({fx},{fy}) screen=({ox+fx},{oy+fy}) ===")
    script.exports_sync.clear()
    before = snap("before-flagship-click")
    foreground(hwnd); time.sleep(0.3)
    mouse_click(ox + fx, oy + fy)
    # 크래시 여부를 촘촘히 관측(최대 6s)
    crashed = False
    for k in range(12):
        time.sleep(0.5)
        if not alive():
            crashed = True
            note(f"*** CLIENT DIED {(k+1)*0.5:.1f}s after 旗艦情報 click ***")
            break
    if crashed:
        # 죽기 직전 화면(전체) 시도
        try:
            from PIL import ImageGrab
            ImageGrab.grab(all_screens=True).save(shots / "21-flagship-CRASH-fullscreen.png")
        except Exception as e:
            note(f"postmortem grab fail: {e}")
        die_report("旗艦情報-click")
        (evdir / "events.jsonl").write_text(
            "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
        return finish(4)

    # 안 죽었으면 결과 캡처
    screenshot(hwnd, shots / "21-flagship-clicked.png")
    after = snap("after-flagship-click")
    if before and after:
        note(f">>> 旗艦情報: outbound+{(after.get('outCount') or 0)-(before.get('outCount') or 0)} "
             f"lookups+{(after.get('lookupCount') or 0)-(before.get('lookupCount') or 0)} "
             f"crashfn={after.get('crashfnCount')} errsites={len(after.get('errsites', []))} ALIVE={alive()}")
    note("NOTE: 旗艦情報 클릭 후 클라 생존 — 크래시 미재현(이 시드/상태에서)")

    note("=== FINAL ===")
    if alive(): screenshot(hwnd, shots / "99-final.png")
    (evdir / "events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
    try:
        if alive(): proc.terminate(); note("terminated client")
    except Exception:
        pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
