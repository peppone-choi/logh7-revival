#!/usr/bin/env python3
"""BE 수정 후 렌더 검증 드라이버 (진단 전용, 서버/클라 무변조).

0x0315 RLE카운트 엔디안 BE 회귀 수정 후:
  - 클라 디스패처 FUN_004ba2b0 가 0x315 를 디스패치하나(count315)?
  - recv 큐 FUN_004b8850 에 0x315 적재되나(enq315)?
  - NOW LOADING 페이드 clientBase+0x357e88 가 1.0 도달하나?
  - 팅김(크래시) 시 종료코드 + 마지막 수신/디스패치/decrypt-fail 로그.
프로브: _frida_wiretap_fade_probe.js
usage: python _wiretap_fade_drive.py <evidence-dir>
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
PROBE_JS = Path(__file__).resolve().parent / "_frida_wiretap_fade_probe.js"
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
    last_frame = {"v": None}
    last_disp = {"v": None}

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        safe = line.encode("ascii", "replace").decode("ascii")
        print(safe, flush=True)
        log.append(line)
        (evdir / "drive-log.txt").write_text("\n".join(log), encoding="utf-8")

    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
    note(f"seeded {evdir/'store.json'}")

    srv_log = open(evdir / "server-stdout.log", "w", encoding="utf-8")
    note(f"launch server: node {M2_LAUNCH} {evdir}  (HEAD = BE fix)")
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
            p = message["payload"]
            events.append(p)
            if isinstance(p, dict):
                ev = p.get("ev")
                if ev == "frame":
                    last_frame["v"] = p
                    note(f"  FRAME i={p.get('i')} total={p.get('total')} "
                         f"code={p.get('code')} hdr={p.get('hdr')}")
                elif ev == "decrypt-fail":
                    note(f"  !!! DECRYPT-FAIL n={p.get('n')} envCode={p.get('envCode')} "
                         f"hex={p.get('hex')}")
                elif ev == "dispatch-315":
                    last_disp["v"] = p
                    note(f"  *** DISPATCH-315 state={p.get('state')}")
                elif ev == "enqueue-315":
                    note("  *** ENQUEUE-315 (recv큐 적재)")
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
                     f"recv={rdy[0].get('recv')} clientState={rdy[0].get('clientState')}")
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
        cs = s.get("clientState", {})
        note(f"[{tag}] recvCalls={s['recvCalls']} inbound={s['totalInbound']} "
             f"frames={s['frameCount']} dispTotal={s['dispTotal']} "
             f"c315={s['count315']} enq315={s.get('enq315')} c307={s['count307']} c305={s['count305']}")
        note(f"[{tag}] fade={cs.get('fade')} phase={cs.get('phase')} "
             f"waitCount={cs.get('waitCount')} headExp={cs.get('headExpCode')} "
             f"walkStep={cs.get('walkStep')} walkDone={cs.get('walkDone')}")
        if s.get("failCount"):
            note(f"[{tag}] decrypt-fail count={s['failCount']} frames={s.get('failFrames')}")
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
            return crash_report(finish, proc, note, events, evdir, last_frame, last_disp)
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

    note("=== monitor world-load (60s), poll wiretap + fade ===")
    t0 = time.time()
    si = 5
    last = 0
    crashed = False
    while time.time() - t0 < 60:
        if not user32.IsWindow(hwnd):
            note("client window gone during monitor")
            crashed = True
            break
        now = time.time() - t0
        if now - last >= 5:
            last = now
            pull(f"t+{int(now)}s")
            try:
                screenshot(hwnd, shots / f"{si:02d}-mon-{int(now)}s.png")
            except Exception:
                pass
            si += 1
        time.sleep(1.0)

    alive = bool(user32.IsWindow(hwnd))
    if alive:
        screenshot(hwnd, shots / "99-final.png")
    note(f"client alive={alive}")

    final = None
    if alive:
        final = pull("FINAL")

    note("=== VERDICT ===")
    if final:
        cs = final.get("clientState", {})
        note(f"count315={final['count315']} enq315={final.get('enq315')} "
             f"failCount={final.get('failCount')} fade={cs.get('fade')} "
             f"walkStep={cs.get('walkStep')} walkDone={cs.get('walkDone')}")
        if final["count315"] > 0:
            note("VERDICT-A: 0x315 DISPATCHED. (fade=1.0 & 렌더면 완전 A)")
        else:
            note("VERDICT-B: 0x315 여전히 미디스패치. enq315/failCount/desync 참조.")
        note(f"final dispWorkSeq={final.get('dispWorkSeq')}")
        note(f"final enqWorkSeq={final.get('enqWorkSeq')}")

    if crashed or not alive:
        crash_report(lambda rc: rc, proc, note, events, evdir, last_frame, last_disp)

    (evdir / "frida-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
    note(f"wrote {len(events)} events, pid={pid.value}")

    try:
        session.detach()
    except Exception:
        pass
    rendered = bool(final and final.get("count315", 0) > 0 and
                    final.get("clientState", {}).get("walkDone") == 1 and
                    (shots / "99-final.png").is_file())
    return finish(0 if rendered and not crashed and alive else 5)


def crash_report(finish_fn, proc, note, events, evdir, last_frame, last_disp):
    """팅김 상세: 종료코드 + 마지막 수신/디스패치/decrypt-fail."""
    note("=== CRASH/EXIT REPORT (팅김) ===")
    rc = None
    for _ in range(10):
        rc = proc.poll()
        if rc is not None:
            break
        time.sleep(0.3)
    note(f"client process exit code={rc} (None=아직 살아있음/좀비)")
    note(f"crash time={time.strftime('%Y-%m-%d %H:%M:%S')}")
    note(f"last frame received={last_frame['v']}")
    note(f"last 0x315 dispatch={last_disp['v']}")
    fails = [e for e in events if isinstance(e, dict) and e.get("ev") == "decrypt-fail"]
    note(f"decrypt-fail events total={len(fails)}")
    for f in fails[-5:]:
        note(f"  decrypt-fail n={f.get('n')} envCode={f.get('envCode')} hex={f.get('hex')}")
    recent = [e for e in events if isinstance(e, dict) and e.get("ev") == "frame"][-8:]
    note(f"last 8 frames: {[(e.get('i'), e.get('total'), e.get('code')) for e in recent]}")
    (evdir / "frida-events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
    if callable(finish_fn):
        return finish_fn(4)
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
