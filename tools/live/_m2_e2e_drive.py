#!/usr/bin/env python3
"""M2→M3 end-to-end 라이브 검증 드라이버 (진단 전용, 서버/클라 무변조).

빈 계정 → 로그인 → 로비(잠금) → item2 オリジナルキャラクター抽選(0x1006 charge)
→ 로비 해제·캐릭터 표시 → 게임개시 → 카드 선택 → 월드 진입 → NOW LOADING 감시.

서버는 별도로 _m2_lottery_launch.mjs 로 이미 47900 에 떠 있어야 한다(빈 store).
이 드라이버는 클라 런치 + Frida(_frida_worldload_final.js) attach + 클릭 구동 +
서버 trace 폴링(0x1006/CHARGE) 만 한다.

usage: python _m2_e2e_drive.py <evidence-dir> <server-trace.jsonl>
"""
from __future__ import annotations

import json
import sys
import time
import subprocess
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (  # noqa: E402
    find_client_hwnd, foreground, client_geometry, screenshot, do_login, mouse_click,
)

user32 = ctypes.windll.user32

CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
FINAL_JS = Path(__file__).resolve().parent / "_frida_worldload_final.js"

# 로비 메뉴 (1024x768 실측, logh7_agent_drive 저널):
#   start192 create256 original313 delete371 session429 settings480 credits544, X=164
LOBBY_REF = (1024, 768)
ITEM_ORIGINAL = (164, 313)   # item2 オリジナルキャラクター抽選 (첫 캐릭터 경로)
GAME_START = (164, 192)      # item0 ゲーム開始
CHAR_CARD = (655, 305)       # 우측 캐릭터 카드 1행

# 오리지널 추첨 후보 선택 후보 좌표 (탐색적 — 세션/후보 피커 위치 미확정)
CAND_TRIES = [
    (520, 280), (520, 340), (655, 305), (655, 470),
    (520, 250), (600, 300), (655, 400), (515, 310),
]
# 확인/OK 버튼 후보
OK_TRIES = [(655, 585), (655, 600), (512, 600), (700, 430), (560, 420)]


def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])


def wait_window(timeout=30.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            h = find_client_hwnd()
            if h:
                return h
        except Exception:
            pass
        time.sleep(0.5)
    return None


def read_trace(trace_path: Path):
    """서버 trace 를 파싱해 이벤트 리스트로 반환(견고: 부분 라인 무시)."""
    out = []
    try:
        for ln in trace_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            ln = ln.strip()
            if not ln:
                continue
            try:
                out.append(json.loads(ln))
            except Exception:
                pass
    except Exception:
        pass
    return out


def trace_has_charge(events):
    for e in events:
        if e.get("event") in ("CHARGE-addCharacter", "CHARGE-persisted"):
            return True
        if str(e.get("requestInnerCodeHex", "")).lower() == "0x1006":
            return True
        if str(e.get("codeHex", "")).lower() == "0x1006":
            return True
    return False


def char_count_seen(events):
    """마지막 lobby-login-ok-sent 의 characterCount."""
    cc = None
    for e in events:
        if e.get("event") == "lobby-login-ok-sent" and "characterCount" in e:
            cc = e["characterCount"]
    return cc


def frame_codes(events):
    codes = []
    for e in events:
        c = e.get("codeHex") or e.get("requestInnerCodeHex")
        if c:
            codes.append(c)
    return codes


def main() -> int:
    evdir = Path(sys.argv[1])
    trace_path = Path(sys.argv[2])
    shots = evdir / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        log.append(line)
        (evdir / "e2e-log.txt").write_text("\n".join(log), encoding="utf-8")

    # 1) 클라 런치
    note(f"launch {CLIENT_EXE}")
    proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
    note(f"client pid(spawn)={proc.pid}")
    hwnd = wait_window(30)
    if not hwnd:
        note("FAIL: no client window in 30s")
        return 2
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    note(f"window hwnd={hwnd:#x} pid={pid.value}")

    # 2) Frida attach (재시도 최대 3회 — ready 이벤트 확인)
    def on_message(message, _data):
        if message["type"] == "send":
            events.append(message["payload"])
        elif message["type"] == "error":
            note(f"frida-error {message.get('description')}")

    session = script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(FINAL_JS.read_text(encoding="utf-8"))
            script.on("message", on_message)
            script.load()
            time.sleep(0.6)
            ready = [e for e in events if e.get("ev") == "ready"]
            if ready:
                note(f"attach OK (try {attempt}) ready={ready}")
                break
            note(f"attach try {attempt}: no ready event, retrying")
        except Exception as e:
            note(f"attach try {attempt} FAIL: {e}")
            time.sleep(1.0)
    if not script:
        note("FAIL: frida attach failed x3")
        return 3

    def snap(tag):
        try:
            s = script.exports_sync.snap()
            s["tag"] = tag
            note(f"SNAP {tag}: gamemode={s['gamemode']} objTable={s.get('objTable')} "
                 f"charCount={s['charCount']} c2c80={s.get('c2c80')}")
            return s
        except Exception as e:
            note(f"snap fail {tag}: {e}")
            return None

    snaps = [snap("attach")]
    foreground(hwnd)
    screenshot(hwnd, shots / "01-login.png")

    # 3) 로그인
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login screen {cw}x{ch} -> do_login")
        do_login(hwnd, "inei00", "dummy", shots)
    else:
        note(f"already lobby-size {cw}x{ch}")

    # 4) 로비 정착 (splash 9s)
    for i in range(20):
        time.sleep(1)
        if not user32.IsWindow(hwnd):
            note(f"client died during settle at {i}s")
            break
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000:
            note(f"lobby-size at t+{i}s {cw}x{ch}")
            break
    note("wait 9s splash -> lobby menu")
    time.sleep(9)
    snaps.append(snap("lobby"))
    if user32.IsWindow(hwnd):
        foreground(hwnd)
        screenshot(hwnd, shots / "02-lobby-locked.png")

    # 5) item2 オリジナルキャラクター抽選 클릭
    if user32.IsWindow(hwnd):
        ox, oy, cw, ch = client_geometry(hwnd)
        it = scale(LOBBY_REF, ITEM_ORIGINAL, cw, ch)
        note(f"click ITEM_ORIGINAL(item2 추첨) client={it}")
        mouse_click(ox + it[0], oy + it[1])
        time.sleep(2.5)
        screenshot(hwnd, shots / "03-after-original.png")

    # 6) 후보 선택 탐색 + charge 폴링 (~60s)
    note("=== candidate-select + charge poll (60s) ===")
    t0 = time.time()
    ci = 0
    shot_i = 4
    charged = False
    while time.time() - t0 < 60:
        if not user32.IsWindow(hwnd):
            note("client window gone during charge poll")
            break
        ev = read_trace(trace_path)
        if trace_has_charge(ev):
            note("*** 0x1006 CHARGE detected in server trace ***")
            charged = True
            break
        cc = char_count_seen(ev)
        if cc and cc >= 1:
            note(f"*** characterCount={cc} (lobby unlocked) ***")
            charged = True
            break
        # 후보/확인 클릭 순환
        if user32.IsWindow(hwnd):
            ox, oy, cw, ch = client_geometry(hwnd)
            if ci < len(CAND_TRIES):
                pt = scale(LOBBY_REF, CAND_TRIES[ci], cw, ch)
                note(f"cand try {ci} client={pt}")
                mouse_click(ox + pt[0], oy + pt[1])
                time.sleep(0.15)
                mouse_click(ox + pt[0], oy + pt[1])  # double
            elif ci - len(CAND_TRIES) < len(OK_TRIES):
                j = ci - len(CAND_TRIES)
                pt = scale(LOBBY_REF, OK_TRIES[j], cw, ch)
                note(f"ok try {j} client={pt}")
                mouse_click(ox + pt[0], oy + pt[1])
            ci += 1
            screenshot(hwnd, shots / f"{shot_i:02d}-cand-{ci}.png")
            shot_i += 1
        snaps.append(snap(f"charge+{int(time.time()-t0)}s"))
        time.sleep(2.5)

    note(f"charge result = {charged}")
    if user32.IsWindow(hwnd):
        screenshot(hwnd, shots / "20-post-charge.png")

    # 7) charge 성공 시 월드 진입 시도
    world_entered = False
    if charged and user32.IsWindow(hwnd):
        note("=== attempt world entry (game-start -> card) ===")
        time.sleep(3)  # SS2LG 재로그인 + 로비 재구성 대기
        screenshot(hwnd, shots / "21-relobby.png")
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch)
        note(f"click GAME_START client={gs}")
        mouse_click(ox + gs[0], oy + gs[1])
        time.sleep(3.5)
        screenshot(hwnd, shots / "22-game-start.png")
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch)
        note(f"click CHAR_CARD client={cc}")
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(2.5)
        screenshot(hwnd, shots / "23-char-card.png")

        # 45s world-load monitor
        note("=== world-load monitor (45s) ===")
        t0 = time.time()
        si = 24
        last = 0
        while time.time() - t0 < 45:
            if not user32.IsWindow(hwnd):
                note("client gone during world monitor")
                break
            s = snap(f"world+{int(time.time()-t0)}s")
            if s:
                snaps.append(s)
                if s.get("gamemode", -1) == 0 or (s.get("c2c80") or 0) > 0:
                    world_entered = True
            now = time.time() - t0
            if now - last >= 6:
                last = now
                screenshot(hwnd, shots / f"{si:02d}-world-{int(now)}s.png")
                si += 1
            time.sleep(2.5)
        if user32.IsWindow(hwnd):
            screenshot(hwnd, shots / "99-final.png")

    # 8) 덤프
    (evdir / "frida-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
    (evdir / "snaps.jsonl").write_text(
        "\n".join(json.dumps(s, ensure_ascii=False) for s in snaps if s) + "\n", encoding="utf-8")

    ev = read_trace(trace_path)
    note("=== SUMMARY ===")
    note(f"charged={charged} world_entered={world_entered}")
    note(f"final characterCount={char_count_seen(ev)}")
    note(f"FUN_004c2a80 calls: {len([e for e in events if e.get('ev')=='load-enter'])}")
    gm = sorted(set(s['gamemode'] for s in snaps if s))
    note(f"gamemode values seen: {gm}")
    seen = frame_codes(ev)
    note(f"server frame codes: {seen}")
    note(f"client alive={bool(user32.IsWindow(hwnd))}")

    try:
        session.detach()
    except Exception:
        pass
    try:
        if user32.IsWindow(hwnd):
            proc.terminate()
    except Exception:
        pass
    (evdir / "e2e-log.txt").write_text("\n".join(log), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
