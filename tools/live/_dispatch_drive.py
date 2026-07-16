#!/usr/bin/env python3
"""디스패치 스트림 실측 드라이버 (진단 전용, 서버/클라 무변조).

목표: 클라 디스패처 FUN_004ba2b0 param_1(메시지 코드) 전량 로깅 →
      0x0307 이후 코드 시퀀스에 0x315 가 디스패치되는지 판정.
      0x315 안 나오면 recv 큐 덤프로 0x0307 직후 실적재 code/size 확인.

시드 우회: evdir/store.json 생성완료 캐릭터 심음 → _m2_launch.mjs(47900) →
클라 런치 → Frida(_frida_dispatch_probe.js) attach → 로그인 inei00 → 로비 →
게임개시(125,191) → 카드(655,305) → 월드 진입 → NOW LOADING 감시하며
주기적으로 rpc.summary()/rpc.recv() 를 폴링해 스트림/큐 상태 수집.

usage: python _dispatch_drive.py <evidence-dir>
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

ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
PROBE_JS = Path(__file__).resolve().parent / "_frida_dispatch_probe.js"
M2_LAUNCH = ROOT / "tools" / "live" / "_m2_launch.mjs"

LOBBY_REF = (1024, 768)
GAME_START = (125, 191)
CHAR_CARD = (655, 305)

SEED_STORE = {
    "accounts": {
        "inei00": [{
            "id": 1, "power": 2, "camp": 2, "blood": 1, "sex": 0, "generated": 1,
            "lastname": "Reinhard", "firstname": "Lohengramm", "face": 305419896,
            "ability8": [80, 75, 70, 65, 60, 55, 50, 45],
            "bonusPoint": 0, "specialAbilityNum": 0, "title": 0, "rank": 13,
            "charState": 1, "age": 20,
        }]
    },
    "nextId": 2,
}


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


def main() -> int:
    evdir = Path(sys.argv[1])
    evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    events = []
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        log.append(line)
        (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")

    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
    note(f"seeded {evdir/'store.json'}")

    srv_log = open(evdir / "server-stdout.log", "w", encoding="utf-8")
    note(f"launch server: node {M2_LAUNCH} {evdir}")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)],
                           cwd=str(ROOT), stdout=srv_log, stderr=subprocess.STDOUT)
    ready = False
    t0 = time.time()
    while time.time() - t0 < 20:
        try:
            txt = (evdir / "server-stdout.log").read_text(encoding="utf-8", errors="ignore")
            if "m2-server-ready" in txt:
                ready = True
                break
        except Exception:
            pass
        if srv.poll() is not None:
            note(f"FAIL: server exited early rc={srv.returncode}")
            return 2
        time.sleep(0.4)
    if not ready:
        note("FAIL: server not ready in 20s")
        srv.terminate()
        return 2
    note("m2-server-ready")

    def finish(rc):
        try:
            srv.terminate()
        except Exception:
            pass
        srv_log.close()
        return rc

    note(f"launch client {CLIENT_EXE}")
    proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
    note(f"client pid(spawn)={proc.pid}")
    hwnd = wait_window(30)
    if not hwnd:
        note("FAIL: no client window in 30s")
        return finish(3)
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    note(f"window hwnd={hwnd:#x} pid={pid.value}")

    def on_message(message, _data):
        if message["type"] == "send":
            events.append(message["payload"])
            p = message["payload"]
            if isinstance(p, dict) and p.get("ev") == "DISPATCH-0x315":
                note(f"!!! 0x315 DISPATCHED: {json.dumps(p, ensure_ascii=False)}")
        elif message["type"] == "error":
            events.append({"ev": "frida-error", "desc": message.get("description")})
            note(f"frida-error {message.get('description')}")

    session = script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
            script.on("message", on_message)
            script.load()
            time.sleep(0.6)
            rdy = [e for e in events if e.get("ev") == "ready"]
            if rdy:
                note(f"probe loaded (try {attempt}) base={rdy[0].get('base')} "
                     f"disp={rdy[0].get('disp')} cbPtr={rdy[0].get('clientBasePtr')}")
                break
            note(f"attach try {attempt}: no ready, retry")
        except Exception as e:
            note(f"attach try {attempt} FAIL: {e}")
            time.sleep(1.0)
    if not script:
        note("FAIL: frida attach x3")
        return finish(3)

    def pull(tag):
        try:
            s = script.exports_sync.summary()
        except Exception as e:
            note(f"summary rpc fail: {e}")
            return None
        note(f"[{tag}] total={s['total']} seen315={s['seen315']} "
             f"c315={s['count315']} c314={s['count314']} c307={s['count307']} "
             f"c305={s['count305']}")
        note(f"[{tag}] workUniqueOrder={s['workUniqueOrder']}")
        note(f"[{tag}] workTail={s['workTail']}")
        events.append({"ev": "summary", "tag": tag, "data": s})
        return s

    foreground(hwnd)
    screenshot(hwnd, shots / "01-login.png")

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login screen {cw}x{ch} -> do_login")
        do_login(hwnd, "inei00", "dummy", shots)
    else:
        note(f"already lobby-size {cw}x{ch}")

    for i in range(20):
        time.sleep(1)
        if not user32.IsWindow(hwnd):
            note(f"client died during settle at {i}s")
            return finish(4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000:
            note(f"lobby-size at t+{i}s {cw}x{ch}")
            break
    note("wait 9s splash -> lobby menu")
    time.sleep(9)
    if user32.IsWindow(hwnd):
        foreground(hwnd)
        screenshot(hwnd, shots / "02-lobby.png")
    pull("lobby")

    if user32.IsWindow(hwnd):
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch)
        note(f"click GAME_START client={gs}")
        mouse_click(ox + gs[0], oy + gs[1])
        time.sleep(3.5)
        screenshot(hwnd, shots / "03-game-start.png")
    if user32.IsWindow(hwnd):
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch)
        note(f"click CHAR_CARD client={cc}")
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(2.5)
        screenshot(hwnd, shots / "04-char-card.png")

    note("=== monitor world-load (55s), poll dispatch stream ===")
    t0 = time.time()
    si = 5
    last = 0
    while time.time() - t0 < 55:
        if not user32.IsWindow(hwnd):
            note("client window gone during monitor")
            break
        now = time.time() - t0
        if now - last >= 5:
            last = now
            pull(f"t+{int(now)}s")
            screenshot(hwnd, shots / f"{si:02d}-mon-{int(now)}s.png")
            si += 1
        time.sleep(1.0)

    if user32.IsWindow(hwnd):
        screenshot(hwnd, shots / "99-final.png")
    alive = bool(user32.IsWindow(hwnd))
    note(f"client alive={alive}")

    # 최종 판정용 스냅샷
    final = pull("FINAL")
    try:
        recv = script.exports_sync.recv(40)
        events.append({"ev": "recv-dump", "data": recv})
        note("=== RECV QUEUE DUMP (stall time) ===")
        note(f"clientBase={recv.get('clientBase')} selfId={recv.get('selfId')}")
        for e in recv.get("entries", [])[:40]:
            if e["code"] != "0x0" or e["size"] not in (0, -1):
                note(f"  recv[{e['i']}] code={e['code']} code32={e['code32']} size={e['size']}")
    except Exception as e:
        note(f"recv rpc fail: {e}")

    note("=== VERDICT ===")
    if final:
        if final["seen315"]:
            note("0x315 DISPATCHED — 팝조건 런타임 위반 방향. DISPATCH-0x315 이벤트/selfId 참조.")
        else:
            note("0x315 NOT DISPATCHED — 외곽 envelope/recv 프레이밍 desync 방향. recv 큐 덤프 참조.")
            note(f"after307 seq(first400)={final.get('after307')}")

    (evdir / "frida-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")

    try:
        session.detach()
    except Exception:
        pass
    try:
        if user32.IsWindow(hwnd):
            proc.terminate()
    except Exception:
        pass
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
