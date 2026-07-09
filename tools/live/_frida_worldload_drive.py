#!/usr/bin/env python3
"""월드 로드(NOW LOADING) 정지 원인 실측 — 클라 런치 → Frida 훅 → 월드 진입 구동.

진단 전용. 게임 로직/서버/자산 변조 없음. clientBase+offset 및 함수 훅 읽기만.
usage: python _frida_worldload_drive.py <evidence-dir>
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
SCRIPT_JS = Path(__file__).resolve().parent / "_frida_worldload_probe.js"
_JS_OVERRIDE = None  # 두번째 인자로 대체 프로브 지정 가능

# 로비(1024x768 기준) 클릭 좌표 — 태스크 지정: 게임개시 125,191 / 캐릭터카드 655,305
GAME_START = (125, 191)
CHAR_CARD = (655, 305)
LOBBY_REF = (1024, 768)


def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])


def wait_window(timeout=30.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            hwnd = find_client_hwnd()
            if hwnd:
                return hwnd
        except Exception:
            pass
        time.sleep(0.5)
    return None


def main() -> int:
    evdir = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    script_js = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else SCRIPT_JS
    shots = evdir / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        log.append(line)

    # 1) 클라 런치
    note(f"launch {CLIENT_EXE}")
    proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
    note(f"client pid(spawn)={proc.pid}")

    hwnd = wait_window(30)
    if not hwnd:
        note("FAIL: no client window in 30s")
        (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")
        return 2
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    note(f"window hwnd={hwnd:#x} pid={pid.value}")

    # 2) Frida attach + 훅 로드 (로그인 전 부착 → 세션 전체 캡처)
    def on_message(message, _data):
        if message["type"] == "send":
            events.append(message["payload"])
        elif message["type"] == "error":
            events.append({"ev": "frida-error", "desc": message.get("description")})
            note(f"frida-error {message.get('description')}")

    try:
        session = frida.attach(pid.value)
    except Exception as e:
        note(f"FAIL attach: {e}")
        (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")
        return 3
    note(f"probe script = {script_js.name}")
    script = session.create_script(script_js.read_text(encoding="utf-8"))
    script.on("message", on_message)
    script.load()
    time.sleep(0.6)
    ready = [e for e in events if e.get("ev") == "ready"]
    note(f"hooks loaded, ready={ready}")

    def snap(tag):
        try:
            s = script.exports_sync.snap()
            s["tag"] = tag
            note(f"SNAP {tag}: gamemode={s['gamemode']} ring={s['ring']} "
                 f"sel={s['sel']} charCount={s['charCount']}")
            return s
        except Exception as e:
            note(f"snap fail {tag}: {e}")
            return None

    snaps = []
    snaps.append(snap("attach"))
    foreground(hwnd)
    screenshot(hwnd, shots / "01-login.png")

    # 3) 로그인
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login screen {cw}x{ch} -> do_login")
        do_login(hwnd, "inei00", "dummy", shots)
    else:
        note(f"already lobby {cw}x{ch}")

    # 4) 로비 대기 — cw>=1000 은 BOTHTEC 스플래시에서도 참이므로, 스플래시가
    #    걷히고 실제 로비 메뉴가 렌더될 때까지 추가 대기(고정 9s).
    for i in range(20):
        time.sleep(1)
        if not user32.IsWindow(hwnd):
            note(f"client died during settle at {i}s")
            break
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000:
            note(f"lobby-size reached at t+{i}s {cw}x{ch} (splash may still show)")
            break
    note("wait 9s for BOTHTEC splash to clear -> lobby menu")
    time.sleep(9)
    snaps.append(snap("lobby"))
    if user32.IsWindow(hwnd):
        foreground(hwnd)
        screenshot(hwnd, shots / "02-lobby.png")

    # 5) 게임개시 → 우측 패널 캐릭터 카드 populate 대기 → 카드 선택 (월드 진입)
    if user32.IsWindow(hwnd):
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch)
        note(f"click GAME_START client={gs}")
        mouse_click(ox + gs[0], oy + gs[1])
        time.sleep(3.5)          # 우측 패널에 캐릭터 카드가 뜰 시간
        snaps.append(snap("after-game-start"))
        screenshot(hwnd, shots / "03-game-start.png")

    if user32.IsWindow(hwnd):
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch)
        note(f"click CHAR_CARD client={cc}")
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(1.5)
        snaps.append(snap("after-char-card"))
        screenshot(hwnd, shots / "04-char-card.png")
        # 더블클릭 확정(카드 선택 → 월드 로그인)
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(2.5)
        snaps.append(snap("after-char-dbl"))
        screenshot(hwnd, shots / "05-char-dbl.png")

    # 6) NOW LOADING 감시 — 폴링 + 이벤트 수집 (~45s)
    note("=== monitor world-load (45s) ===")
    t0 = time.time()
    shot_i = 6
    last_shot = 0
    while time.time() - t0 < 45:
        if not user32.IsWindow(hwnd):
            note("client window gone during monitor")
            break
        s = snap(f"mon+{int(time.time()-t0)}s")
        if s:
            snaps.append(s)
        now = time.time() - t0
        if now - last_shot >= 6:
            last_shot = now
            screenshot(hwnd, shots / f"{shot_i:02d}-mon-{int(now)}s.png")
            shot_i += 1
        time.sleep(2.5)

    snaps.append(snap("final"))
    if user32.IsWindow(hwnd):
        screenshot(hwnd, shots / "99-final.png")
    note(f"alive={bool(user32.IsWindow(hwnd))}")

    # 7) 덤프
    try:
        dc = script.exports_sync.dispcount()
        note(f"dispatch total = {dc}")
    except Exception:
        pass

    (evdir / "frida-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
    (evdir / "snaps.jsonl").write_text(
        "\n".join(json.dumps(s, ensure_ascii=False) for s in snaps if s) + "\n", encoding="utf-8")
    (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")

    # 요약
    load_enter = [e for e in events if e.get("ev") == "load-enter"]
    load_leave = [e for e in events if e.get("ev") == "load-leave"]
    note("=== SUMMARY ===")
    note(f"FUN_004c2a80 calls: {len(load_enter)}")
    for e in load_enter:
        note(f"  load-enter arg0={e.get('arg0')} gamemode={e.get('gamemode')} "
             f"ring={e.get('ring')} sel={e.get('sel')} charCount={e.get('charCount')}")
    for e in load_leave:
        note(f"  load-leave arg0={e.get('arg0')} ret={e.get('ret')} "
             f"gamemode={e.get('gamemode')} ring={e.get('ring')}")
    gm_vals = sorted(set(s["gamemode"] for s in snaps if s))
    ring_vals = sorted(set(s["ring"] for s in snaps if s))
    note(f"gamemode values seen: {gm_vals}")
    note(f"ring values seen: {ring_vals}")
    fin = snaps[-1] if snaps else None
    if fin:
        note(f"FINAL gamemode={fin['gamemode']} ring={fin['ring']} "
             f"sel={fin['sel']} charCount={fin['charCount']}")

    # 정리
    try:
        session.detach()
    except Exception:
        pass
    try:
        if user32.IsWindow(hwnd):
            proc.terminate()
    except Exception:
        pass
    (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
