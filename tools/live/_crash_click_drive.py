#!/usr/bin/env python3
"""전략맵 크래시/클릭 검증 드라이버 (진단 전용, 서버/클라 무변조).

목표(팀리드 확장 스코프):
  1) 성계 마커 렌더 스크린샷.
  2) "초기화 안됨" 크래시 결정적 캡처 — 자동인가 클릭유발인가, 에러문자열, 마지막 코드, exit code.
  3) 마커 클릭→이동(0x0b01) vs info(0x0f08) vs 크래시 판정.
  4) HUD 버튼별 무반응/크래시.
프로브: _frida_crash_probe.js  (에러사이트 0x4bfe92/0x4c976e + 로거 0x5923a0 + 아웃바운드)
usage: py -3 _crash_click_drive.py <evidence-dir>
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
SEED_STORE = {
    "accounts": {"inei00": [{
        "id": 1, "power": 2, "camp": 2, "blood": 1, "sex": 0, "generated": 1,
        "lastname": "Reinhard", "firstname": "Lohengramm", "face": 305419896,
        "ability8": [80,75,70,65,60,55,50,45], "bonusPoint": 0, "specialAbilityNum": 0,
        "title": 0, "rank": 13, "charState": 1, "age": 20}]},
    "nextId": 2,
}


class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


def scale(ref, pt, cw, ch):
    return int(pt[0]*cw/ref[0]), int(pt[1]*ch/ref[1])


def win_rect(hwnd):
    r = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def detect_markers(hwnd, save_path):
    """따뜻한색(주황/빨강/노랑) 성계 글로우 블롭 중심을 창-픽셀 좌표로 검출."""
    from PIL import ImageGrab
    l, t, r, b = win_rect(hwnd)
    img = ImageGrab.grab(bbox=(l, t, r, b)).convert("RGB")
    if save_path:
        img.save(save_path)
    W, H = img.size
    px = img.load()
    # 맵 영역만: 상단~중앙(하단 HUD y>440ish 제외), 좌측 채팅박스 제외
    buckets = {}  # (gx,gy) -> [sumx,sumy,cnt]
    GS = 24
    for y in range(0, min(H, 445), 2):
        for x in range(0, W, 2):
            rr, gg, bb = px[x, y]
            # 따뜻한 밝은 별: R 높고 B 낮음, 흰 텍스트(R,G,B 모두 큰) 배제
            if rr > 150 and rr > bb + 45 and gg < rr and bb < 150:
                gx, gy = x//GS, y//GS
                k = (gx, gy)
                s = buckets.get(k) or [0, 0, 0]
                s[0] += x; s[1] += y; s[2] += 1
                buckets[k] = s
    # 인접 버킷 병합 + 최소 픽셀수 필터
    cents = []
    for (gx, gy), (sx, sy, c) in buckets.items():
        if c < 12:
            continue
        cents.append((sx/c, sy/c, c))
    # 근접 중심 병합(<28px)
    merged = []
    for cx, cy, c in sorted(cents, key=lambda z: -z[2]):
        hit = False
        for m in merged:
            if abs(m[0]-cx) < 28 and abs(m[1]-cy) < 28:
                hit = True; break
        if not hit:
            merged.append([cx, cy, c])
    return [(int(cx), int(cy), c) for cx, cy, c in merged], (l, t)


# 미니맵(하단중앙 HUD 블루 사각형) → 보드셀 클릭. 1024x768 기준 픽셀바운드.
MINIMAP_BOX = (378, 634, 582, 714)   # x0,y0,x1,y1 (창-픽셀, LOBBY_REF 스케일)


def minimap_click(hwnd, u, v):
    """u,v ∈ [0,1] 보드 분율 위치를 미니맵에서 클릭. 셀(col,row) = (u*100, v*50)."""
    ox, oy, cw, ch = client_geometry(hwnd)
    x0, y0, x1, y1 = MINIMAP_BOX
    px = x0 + u*(x1-x0)
    py = y0 + v*(y1-y0)
    rx, ry = scale(LOBBY_REF, (px, py), cw, ch)
    sx, sy = ox+rx, oy+ry
    mouse_click(sx, sy)
    return sx, sy


def main() -> int:
    evdir = Path(sys.argv[1]); evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line)
        (evdir / "crash-drive-log.txt").write_text("\n".join(log), encoding="utf-8")

    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")
    note(f"seeded {evdir/'store.json'}")

    srv_log = open(evdir / "server-stdout.log", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT),
                           stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time(); ready = False
    while time.time()-t0 < 20:
        if "m2-server-ready" in (evdir/"server-stdout.log").read_text(encoding="utf-8", errors="ignore"):
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

    note(f"launch client {CLIENT_EXE}")
    proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
    note(f"client pid={proc.pid}")
    hwnd = None; t0 = time.time()
    while time.time()-t0 < 30:
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
                note(f"  !!! ERRSITE {p.get('tag')} ret={p.get('ret')} lastDisp={p.get('lastDisp')} lastOut={p.get('lastOut')}")
            elif ev == "logger":
                fa = p.get("fmtAscii"); fh = p.get("fmtHex")
                note(f"  [LOG] ascii={fa!r} hex={fh} ret={p.get('ret')} lastDisp={p.get('lastDisp')}")
            elif ev == "send":
                note(f"  >> SEND n={p.get('n')} code={p.get('code')} len={p.get('len')} size={p.get('size')} head={p.get('head')}")
            elif ev == "decrypt-fail":
                note(f"  !!! DECRYPT-FAIL lastDisp={p.get('lastDisp')}")
            elif ev == "odstring":
                note(f"  [ODS] ascii={p.get('ascii')!r} hex={p.get('hex')} lastDisp={p.get('lastDisp')} lastOut={p.get('lastOut')}")
            elif ev == "lookup":
                note(f"  [LOOKUP] id={p.get('id')} ret={p.get('ret')} MISS={p.get('missed')} lastDisp={p.get('lastDisp')}")
            elif ev == "crashfn":
                note(f"  !!! CRASHFN 진입 unitId={p.get('unitId')} edi={p.get('edi')} "
                     f"lastLookupId={p.get('lastLookupId')} lastLookupRet={p.get('lastLookupRet')} lastDisp={p.get('lastDisp')}")
            elif ev == "EXCEPTION":
                note(f"  ##### EXCEPTION(팅김) type={p.get('type')} atVA={p.get('address')} eip={p.get('eip')} "
                     f"memOp={p.get('memOp')} memAddr={p.get('memAddr')} edi={p.get('edi')} eax={p.get('eax')} "
                     f"ecx={p.get('ecx')} lastDisp={p.get('lastDisp')} lastOut={p.get('lastOut')}")
            elif ev == "ready":
                note(f"  probe-ready hookStatus={p.get('hookStatus')}")
            elif ev == "hook-fail":
                note(f"  hook-fail {p.get('name')} @{p.get('addr')}: {p.get('err')}")
        elif m["type"] == "error":
            note(f"frida-error {m.get('description')}")

    session = script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
            script.on("message", on_message); script.load(); time.sleep(0.5)
            if any(e.get("ev") == "ready" for e in events):
                note(f"probe loaded (try {attempt})"); break
        except Exception as e:
            note(f"attach try {attempt} FAIL {e}"); time.sleep(1.0)
    if not script:
        note("FAIL frida attach x3"); return finish(3)

    def snap(tag):
        try: s = script.exports_sync.snapshot()
        except Exception as e: note(f"snapshot fail {tag}: {e}"); return None
        dc = s.get("dispCounts") or {}
        note(f"[{tag}] errsites={len(s.get('errsites',[]))} loggerCount={s.get('loggerCount')} "
             f"outCount={s.get('outCount')} lastDisp={s.get('lastDisp')} lastOut={s.get('lastOut')} "
             f"lookupCount={s.get('lookupCount')} lookupMisses={s.get('lookupMisses')} crashfnCount={s.get('crashfnCount')}")
        note(f"[{tag}] dispCounts={dc}  (0x325 dispatched={'0x325' in dc}, 0x315 dispatched={'0x315' in dc})")
        events.append({"ev": "snapshot", "tag": tag, "data": s}); return s

    def dump_reg(tag):
        try:
            r = script.exports_sync.dumpregistry()
        except Exception as e:
            note(f"dumpregistry fail {tag}: {e}"); return None
        ids = [e.get("id") for e in r.get("entries", [])]
        note(f"[REGISTRY {tag}] activeCount={r.get('activeCount')} scanned={r.get('scanned')} "
             f"ids={ids[:40]}{' ...' if len(ids)>40 else ''}")
        events.append({"ev": "registry", "tag": tag, "data": r}); return r

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    def crash_report(trigger):
        note(f"=== CRASH/EXIT REPORT === trigger={trigger}")
        rc = None
        for _ in range(12):
            rc = proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        note(f"exit code={rc} (None=좀비/살아있음)  time={time.strftime('%Y-%m-%d %H:%M:%S')}")
        errs = [e for e in events if isinstance(e, dict) and e.get("ev") == "errsite"]
        logs = [e for e in events if isinstance(e, dict) and e.get("ev") == "logger"]
        sends = [e for e in events if isinstance(e, dict) and e.get("ev") == "send"]
        looks = [e for e in events if isinstance(e, dict) and e.get("ev") == "lookup"]
        crfn = [e for e in events if isinstance(e, dict) and e.get("ev") == "crashfn"]
        note(f"errsites fired={[e.get('tag') for e in errs]}")
        note(f"last 6 logger msgs:")
        for e in logs[-6:]:
            note(f"   ascii={e.get('fmtAscii')!r} hex={e.get('fmtHex')}")
        note(f"last 6 sends: {[(e.get('code'),e.get('size')) for e in sends[-6:]]}")
        # ★ 갭 실측 핵심: 크래시 직전 조회 id / retval / crashfn unitId
        note(f"lookup total={len(looks)} misses={sum(1 for e in looks if e.get('missed'))}")
        note(f"last 8 lookups (id,ret,MISS): {[(e.get('id'),e.get('ret'),e.get('missed')) for e in looks[-8:]]}")
        note(f"crashfn entries={len(crfn)} last: "
             f"{[(e.get('unitId'),e.get('lastLookupId'),e.get('lastLookupRet')) for e in crfn[-4:]]}")
        try:
            r = script.exports_sync.dumpregistry()
            rids = [e.get("id") for e in r.get("entries", [])]
            note(f"REGISTRY@crash activeCount={r.get('activeCount')} ids={rids[:60]}")
            events.append({"ev": "registry", "tag": "at-crash", "data": r})
        except Exception as e:
            note(f"registry dump at crash fail: {e}")

    # ---- login -> lobby -> map ----
    foreground(hwnd); screenshot(hwnd, shots/"01-login.png")
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login {cw}x{ch} -> do_login"); do_login(hwnd, "inei00", "dummy", shots)
    for i in range(20):
        time.sleep(1)
        if not alive(): crash_report("during-login-settle"); return finish(4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000: note(f"lobby-size t+{i}s {cw}x{ch}"); break
    time.sleep(9)
    if alive(): foreground(hwnd); screenshot(hwnd, shots/"02-lobby.png")
    snap("lobby")
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch); note(f"click GAME_START {gs}")
        mouse_click(ox+gs[0], oy+gs[1]); time.sleep(3.5); screenshot(hwnd, shots/"03-game-start.png")
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch); note(f"click CHAR_CARD {cc}")
        mouse_click(ox+cc[0], oy+cc[1]); time.sleep(1.2); mouse_click(ox+cc[0], oy+cc[1]); time.sleep(2.5)
        screenshot(hwnd, shots/"04-char-card.png")

    # ---- 맵 로드 대기(0x315 디스패치까지) ----
    note("=== wait world/map load 40s ===")
    t0 = time.time()
    while time.time()-t0 < 40:
        if not alive(): crash_report("during-map-load"); return finish(4)
        time.sleep(2)
    if not alive(): crash_report("post-load-check"); return finish(4)
    screenshot(hwnd, shots/"10-map-loaded.png")
    snap("map-loaded")
    dump_reg("map-loaded")   # 유닛 레지스트리 비었는지(마커 클릭 미스 원인) 실측

    # ---- 자동 크래시 관찰(무입력 20s) ----
    note("=== PHASE-A idle 20s (자동 크래시 관찰) ===")
    t0 = time.time()
    while time.time()-t0 < 20:
        if not alive(): crash_report("idle-no-input"); return finish(4)
        time.sleep(2)
    snap("after-idle")
    note("PHASE-A: no auto-crash while idle" if alive() else "PHASE-A: crashed idle")

    # ---- 마커 검출 & 클릭 ----
    note("=== PHASE-B marker detect+click ===")
    try:
        markers, (wl, wt) = detect_markers(hwnd, shots/"11-premarker.png")
    except Exception as e:
        note(f"marker detect fail: {e}"); markers, (wl, wt) = [], win_rect(hwnd)[:2]
    note(f"detected {len(markers)} warm blobs: {[(m[0],m[1],m[2]) for m in markers[:8]]}")

    # 카메라가 빈 코너(그리드 1,1)에 있으면 마커 0개 → 미니맵으로 마커밀집 구역 재중심.
    # 알려진 마커셀(frida 실측): col 6~94, row 1~40 전역 분포. 보드중앙/사분면을 훑는다.
    if len(markers) == 0 and alive():
        note("=== PHASE-B0 마커 0개 → 미니맵 재중심 헌트 ===")
        hunt_targets = [(0.50,0.50),(0.30,0.30),(0.70,0.60),(0.24,0.04),(0.80,0.30),
                        (0.46,0.24),(0.64,0.10),(0.13,0.22),(0.94,0.30),(0.40,0.80)]
        for hi,(u,v) in enumerate(hunt_targets):
            if not alive(): crash_report(f"minimap-hunt-{hi}(col{int(u*100)}row{int(v*50)})"); return finish(4)
            script.exports_sync.clear()
            sx,sy = minimap_click(hwnd, u, v)
            note(f"--- minimap#{hi} board=(col{int(u*100)},row{int(v*50)}) screen=({sx},{sy})")
            time.sleep(1.6)
            if not alive(): crash_report(f"minimap-click-{hi}(col{int(u*100)}row{int(v*50)})"); return finish(4)
            screenshot(hwnd, shots/f"11b-minimap{hi}.png")
            snap(f"minimap{hi}")
            try:
                markers,(wl,wt) = detect_markers(hwnd, shots/f"11c-minimap{hi}-view.png")
            except Exception as e:
                note(f"detect fail: {e}"); markers=[]
            note(f"  after minimap#{hi}: {len(markers)} warm blobs {[(m[0],m[1]) for m in markers[:6]]}")
            if markers:
                note(f"  markers appeared after minimap#{hi} → 메인뷰 클릭 진행"); break

    for idx, (mx, my, c) in enumerate(markers[:3]):
        if not alive(): crash_report(f"before-marker-click-{idx}"); return finish(4)
        script.exports_sync.clear()
        sx, sy = wl+mx, wt+my
        note(f"--- click MARKER#{idx} winpx=({mx},{my}) screen=({sx},{sy}) blobpx={c}")
        foreground(hwnd); mouse_click(sx, sy); time.sleep(2.0)
        screenshot(hwnd, shots/f"12-marker{idx}-click.png")
        s = snap(f"marker{idx}-clicked")
        if not alive():
            crash_report(f"marker-click-{idx}"); return finish(4)
        # 이동모드 시도: 다른 셀로 2차 클릭(이동명령 유발 시도)
        note(f"--- MARKER#{idx} second click(이동시도) offset+60x")
        mouse_click(min(sx+60, wl+1000), sy); time.sleep(1.5)
        screenshot(hwnd, shots/f"13-marker{idx}-move.png")
        snap(f"marker{idx}-moveattempt")
        if not alive():
            crash_report(f"marker-move-{idx}"); return finish(4)

    # ---- 빈 셀 클릭(이동) ----
    if alive():
        note("=== PHASE-C empty-cell click(이동 명령 유발) ===")
        script.exports_sync.clear()
        ox, oy, cw, ch = client_geometry(hwnd)
        ecx, ecy = ox+int(cw*0.5), oy+int(ch*0.35)
        note(f"click empty map ({ecx},{ecy})"); foreground(hwnd); mouse_click(ecx, ecy); time.sleep(1.5)
        mouse_click(ox+int(cw*0.6), oy+int(ch*0.4)); time.sleep(1.5)
        screenshot(hwnd, shots/"20-empty-click.png"); snap("empty-click")
        if not alive(): crash_report("empty-cell-click"); return finish(4)

    # ---- HUD 커맨드 버튼 스윕 ----
    if alive():
        note("=== PHASE-D HUD 버튼 스윕 ===")
        ox, oy, cw, ch = client_geometry(hwnd)
        # 1024x768 기준 하단 우측 아이콘바 + 좌하 커맨드
        btns = {
            "hud-icon1": (735, 752), "hud-icon2": (780, 752), "hud-icon3": (828, 752),
            "hud-icon4": (875, 752), "hud-icon5": (922, 752), "hud-icon6": (968, 752),
            "map-toggle-XY": (485, 610), "plus": (345, 645), "minus": (345, 710),
            "interrupt-game": (735, 580), "sound-cfg": (895, 580),
        }
        for name, (bx, by) in btns.items():
            if not alive(): crash_report(f"before-btn-{name}"); return finish(4)
            script.exports_sync.clear()
            rx, ry = scale(LOBBY_REF, (bx, by), cw, ch)
            note(f"--- click {name} client=({rx},{ry})")
            foreground(hwnd); mouse_click(ox+rx, oy+ry); time.sleep(1.2)
            s = snap(f"btn-{name}")
            screenshot(hwnd, shots/f"30-btn-{name}.png")
            if not alive():
                crash_report(f"button-{name}"); return finish(4)

    note("=== FINAL ==="); screenshot(hwnd, shots/"99-final.png")
    snap("FINAL")
    note(f"client alive={alive()}")
    (evdir/"crash-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events)+"\n", encoding="utf-8")
    note(f"wrote {len(events)} events")
    try: session.detach()
    except Exception: pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
