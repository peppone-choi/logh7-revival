#!/usr/bin/env python3
"""M3 종결 재검증 (커밋 83a52a5e: 0x0325 count LE 정정 + 0x032b 기함정보 응답).

검증 5항목(전부 라이브 증거):
 1. 유닛 목록 적재: 클라 레지스트리 @0x7db3c8 activeCount>0 (이전 0).
 2. 마커클릭 무크래시(회귀).
 3. 旗艦情報 팝업: 0x032b 응답으로 창이 뜨는지 + 스탯(指揮/攻撃/防御) 시드값 일치.
    시드 ability8=[80,75,70,65,60,55,50,45] → 指揮=ability8[4]=60, 攻撃=[6]=50, 防御=[7]=45.
    뒤집혀 보이면(엔디안) 정확히 기록.
 4. idle 사망 해소: 무입력 300s 관찰 (이전 261초쯤 exit 0xCFFFFFFF).
 5. 빈셀 이동클릭 크래시(exit 0xCFFFFFFF) count 수정으로 사라졌는지.
 6. --natural-move: 기함정보 창을 닫고 함대행→이동명령행→목적지를 클릭한 뒤 0x0b01→0x0b07을 검증.

순서: 로드→레지스트리(1)→마커(2)→旗艦情報(3)→idle300s(4)→[생존시]빈셀(5).
서버/클라 무변조. usage: py -3 _m3_close_probe.py <evdir> [--natural-move] [--idle N]
"""
from __future__ import annotations
import json, sys, time, subprocess, ctypes
from ctypes import wintypes
from pathlib import Path
import frida

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.live.logh7_agent_drive import (  # noqa
    find_client_hwnd, foreground, client_geometry, screenshot, do_login, mouse_click,
)

user32 = ctypes.windll.user32
ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
PROBE_JS = Path(__file__).resolve().parent / "_frida_crash_probe.js"
M2_LAUNCH = ROOT / "tools" / "live" / "_m2_launch.mjs"

LOBBY_REF = (1024, 768); GAME_START = (125, 191); CHAR_CARD = (655, 305)
MAP_REF = (1028, 772)
MARKER = (209, 187)            # シュバーラ
ICON1 = (778, 750)            # 各種情報
FLAGSHIP_ROW = (821, 621)      # 旗艦情報
EMPTY_CELL = (512, 268)
AUTHORITY_TAB = (735, 580)
CAPTAIN_CARD = (823, 482)
WARP_COMMAND = (722, 282)
COMMON_DIALOG_CONFIRM = (536, 487)
NATURAL_MOVE_STEPS = (
    ("authority-tab", AUTHORITY_TAB),
    ("captain-card", CAPTAIN_CARD),
    ("warp-command", WARP_COMMAND),
    ("destination-cell", EMPTY_CELL),
    ("confirm", COMMON_DIALOG_CONFIRM),
)
IDLE_SEC = 300

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


def movement_trace_gate(trace_events: list[tuple[str, str]]) -> bool:
    request_seen = False
    for direction, code in trace_events:
        if direction == "recv" and code == "0x0b01":
            request_seen = True
        elif request_seen and direction == "resp" and code == "0x0b07":
            return True
    return False


def natural_move_steps() -> tuple[tuple[str, tuple[int, int]], ...]:
    return NATURAL_MOVE_STEPS


def required_result_gates(natural_move: bool) -> tuple[str, ...]:
    required = ("worldEntry", "unitRegistry", "markerClick", "idleDeath", "emptyCellMove")
    return required + (("naturalMove",) if natural_move else ())


def should_probe_flagship(natural_move: bool) -> bool:
    return not natural_move


def movement_state_evidence(
    trace_path: Path, store_path: Path, account_id: str, character_id: int,
) -> dict[str, object]:
    evidence: dict[str, object] = {
        "pass": False,
        "accountId": account_id,
        "characterId": character_id,
        "destinationCell": None,
        "storeCell": None,
    }
    try:
        records = [json.loads(line) for line in trace_path.read_text(encoding="utf-8").splitlines()]
        moves = [
            record for record in records
            if record.get("event") == "world-response-sent"
            and record.get("kind") == "move"
            and "0x0b07" in (record.get("codes") or [])
        ]
        destination_cell = moves[-1]["cell"]
        characters = json.loads(store_path.read_text(encoding="utf-8"))["accounts"][account_id]
        character = next(record for record in characters if record.get("id") == character_id)
        store_cell = character.get("cell")
        evidence.update({
            "pass": isinstance(destination_cell, int) and store_cell == destination_cell,
            "destinationCell": destination_cell,
            "storeCell": store_cell,
        })
    except (OSError, ValueError, KeyError, IndexError, StopIteration, TypeError) as error:
        evidence["error"] = str(error)
    return evidence


FLAGSHIP_CLOSE = (758, 146)


def main() -> int:
    args = sys.argv[1:]
    evdir = Path(args[0]); evdir.mkdir(parents=True, exist_ok=True)
    natural_move = "--natural-move" in args
    idle_sec = IDLE_SEC
    if "--idle" in args:
        idle_sec = int(args[args.index("--idle") + 1])
    shots = evdir / "shots"; shots.mkdir(parents=True, exist_ok=True)
    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")
    events = []; log = []; results: dict[str, dict[str, object]] = {}
    if natural_move:
        results["naturalMove"] = {"pass": None, "note": "자연 이동 단계에 도달하지 못함"}
    trace_path = evdir / "trace.jsonl"

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        log.append(line); (evdir / "driver-console.txt").write_text("\n".join(log), encoding="utf-8")

    def trace_len():
        try: return sum(1 for _ in open(trace_path, encoding="utf-8", errors="ignore"))
        except Exception: return 0

    def trace_since(mark):
        recv, resp, unh = [], [], []
        try: lines = open(trace_path, encoding="utf-8", errors="ignore").read().splitlines()
        except Exception: return recv, resp, unh
        for ln in lines[mark:]:
            try: r = json.loads(ln)
            except Exception: continue
            ev = r.get("event")
            if ev == "0030-decoded": recv.append(r.get("innerCodeHex"))
            elif ev == "world-response-sent": resp.extend(r.get("codes") or [])
            elif ev in ("inner-unhandled", "lobby-inner-error"): unh.append(r.get("innerCodeHex"))
        return recv, resp, unh

    def movement_trace_since(mark: int) -> list[tuple[str, str]]:
        ordered: list[tuple[str, str]] = []
        try:
            lines = trace_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            return ordered
        for line in lines[mark:]:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            event = record.get("event")
            if event == "0030-decoded":
                code = record.get("innerCodeHex")
                if isinstance(code, str):
                    ordered.append(("recv", code))
            elif event == "world-response-sent":
                ordered.extend(("resp", code) for code in record.get("codes") or [] if isinstance(code, str))
        return ordered

    srv_log = open(evdir / "server-stdout.txt", "w", encoding="utf-8")
    srv = subprocess.Popen(["node", str(M2_LAUNCH), str(evdir)], cwd=str(ROOT),
                           stdout=srv_log, stderr=subprocess.STDOUT)
    t0 = time.time(); ready = False
    while time.time() - t0 < 20:
        txt = (evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore")
        if "m2-server-ready" in txt: ready = True; break
        if "EADDRINUSE" in txt: note("FAIL EADDRINUSE(47900 점유중)"); return 2
        if srv.poll() is not None: note(f"FAIL server rc={srv.returncode}"); return 2
        time.sleep(0.4)
    if not ready: note("FAIL server not ready"); srv.terminate(); return 2
    note("m2-server-ready")

    def finish(rc):
        (evdir / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        (evdir / "events.jsonl").write_text(
            "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
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
    if not hwnd: note("FAIL no window"); return finish(3)
    pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    note(f"window hwnd={hwnd:#x} pid={pid.value}")

    def on_message(m, _d):
        if m["type"] == "send":
            p = m["payload"]; events.append(p)
            ev = p.get("ev") if isinstance(p, dict) else None
            if ev == "crashfn":
                note(f"  !!! CRASHFN unitId={p.get('unitId')} lastLookupRet={p.get('lastLookupRet')}")
            elif ev == "EXCEPTION" and p.get("type") != "system":
                note(f"  ##### EXCEPTION {p.get('type')} atVA={p.get('address')} "
                     f"memAddr={p.get('memAddr')} lastDisp={p.get('lastDisp')}")

    session = script = None
    for attempt in range(3):
        try:
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding="utf-8"))
            script.on("message", on_message); script.load(); time.sleep(0.5)
            note(f"probe loaded (try {attempt})"); break
        except Exception as e:
            note(f"attach try {attempt} FAIL {e}"); time.sleep(1.0); script = None
    if not script: note("FAIL frida attach x3"); return finish(3)

    def alive(): return bool(user32.IsWindow(hwnd)) and proc.poll() is None

    def die_report(trigger):
        rc = None
        for _ in range(12):
            rc = proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        recv, resp, unh = trace_since(max(0, trace_len() - 10))
        try: s = script.exports_sync.snapshot()
        except Exception: s = {}
        exithex = f"{rc & 0xffffffff:#x}" if rc is not None else "None(zombie)"
        note(f"=== CLIENT DIED [{trigger}] exit={rc} ({exithex}) ===")
        note(f"  last recv={recv[-4:]} resp={resp[-4:]} unhandled={unh[-4:]} lastDisp={s.get('lastDisp')} "
             f"crashfn={s.get('crashfnCount')} lookupMiss={s.get('lookupMisses')}")
        excs = [e for e in events if isinstance(e, dict) and e.get("ev") == "EXCEPTION" and e.get("type") != "system"]
        if excs:
            note(f"  EXC={[(e.get('type'), e.get('address'), e.get('memAddr'), e.get('lastDisp')) for e in excs[-3:]]}")
        return {"exit": rc, "exithex": exithex, "lastRecv": recv[-4:], "lastResp": resp[-4:],
                "lastUnhandled": unh[-4:], "lastDisp": s.get("lastDisp"), "crashfn": s.get("crashfnCount")}

    def click(cx, cy, ref=MAP_REF):
        ox, oy, cw, ch = client_geometry(hwnd)
        sx, sy = ox + int(cx * cw / ref[0]), oy + int(cy * ch / ref[1])
        foreground(hwnd); time.sleep(0.2); mouse_click(sx, sy); return sx, sy

    def dismiss_modal() -> None:
        foreground(hwnd)
        user32.keybd_event(0x1B, 0, 0, 0)
        time.sleep(0.05)
        user32.keybd_event(0x1B, 0, 2, 0)
        time.sleep(0.8)
        ox, oy, cw, ch = client_geometry(hwnd)
        sx = ox + int(FLAGSHIP_CLOSE[0] * cw / MAP_REF[0])
        sy = oy + int(FLAGSHIP_CLOSE[1] * ch / MAP_REF[1])
        foreground(hwnd)
        mouse_click(sx, sy)
        time.sleep(0.8)
        user32.keybd_event(0x1B, 0, 0, 0)
        time.sleep(0.05)
        user32.keybd_event(0x1B, 0, 2, 0)
        time.sleep(0.8)
        user32.keybd_event(0x1B, 0, 0, 0)
        time.sleep(0.05)
        user32.keybd_event(0x1B, 0, 2, 0)
        time.sleep(0.8)

    # ── login → stratmap (월드진입 크래시 관측) ──
    foreground(hwnd)
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900: note(f"login {cw}x{ch}"); do_login(hwnd, "inei00", "dummy", shots)
    for i in range(20):
        time.sleep(1)
        if not alive():
            results["worldEntry"] = {"pass": False, **die_report("login-settle")}
            note("[항목] 월드진입: FAIL (로그인 정착중 크래시)")
            return finish_all(results, note, evdir, srv, srv_log, events, 4)
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000: note(f"lobby {cw}x{ch}"); break
    time.sleep(9)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch); note(f"click GAME_START {gs}")
        mouse_click(ox + gs[0], oy + gs[1]); time.sleep(3.5)
    if alive():
        ox, oy, cw, ch = client_geometry(hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch); note(f"dblclick CHAR_CARD {cc}")
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1])
    note("=== wait world/map load 30s (레지스트리/디스패치 폴링) ===")
    # 로드창 동안 레지스트리 activeCount + 0x325 디스패치를 빠르게 폴링해 크래시 직전 상태 포착.
    # 진단 목적: 클라가 0x0325를 디스패치했는데도 activeCount=0이면 = 라우팅 아니라 로더가 내용 거부.
    last_ac = None; last_disp325 = None; last_snap = {}
    t0 = time.time()
    while time.time() - t0 < 30:
        if not alive():
            note(f"  crash-preload: lastActiveCount={last_ac} last0x325dispatched={last_disp325}")
            rep = die_report("map-load")
            results["worldEntry"] = {"pass": False, "lastActiveCount": last_ac,
                                     "last0x325dispatched": last_disp325, **rep}
            note("[항목] 월드진입: FAIL (로드중 크래시)")
            return finish_all(results, note, evdir, srv, srv_log, events, 4)
        try:
            reg = script.exports_sync.dumpregistry(); ac = reg.get("activeCount")
            snp = script.exports_sync.snapshot(); dc = snp.get("dispCounts", {})
            d325 = dc.get("0x325"); last_snap = {"activeCount": ac, "0x325": d325, "0x323": dc.get("0x323")}
            if ac != last_ac or d325 != last_disp325:
                note(f"  [load-poll +{time.time()-t0:.1f}s] activeCount={ac} 0x325disp={d325} 0x323disp={dc.get('0x323')}")
            last_ac = ac; last_disp325 = d325
        except Exception:
            pass
        # 맵 로드 완료 판정: 레지스트리 채워지고 5초 경과
        if last_ac and last_ac > 0 and time.time() - t0 > 6:
            break
        time.sleep(0.35)
    screenshot(hwnd, shots / "10-stratmap.png")
    world_ok = bool(last_ac and last_ac > 0)
    results["worldEntry"] = {"pass": world_ok, "activeCount": last_ac,
                              "last0x325dispatched": last_disp325,
                              "note": "전략맵 로드 성공(크래시 없음)" if world_ok else "유닛 레지스트리 미충전"}
    note(f"[항목] 월드진입: {'PASS' if world_ok else 'FAIL'} (전략맵 로드, activeCount={last_ac})")
    if not world_ok:
        return finish_all(results, note, evdir, srv, srv_log, events, 4)

    # ── 항목1: 유닛 레지스트리 activeCount ──
    try:
        r = script.exports_sync.dumpregistry()
        ac = r.get("activeCount"); ids = [e.get("idHex") for e in r.get("entries", [])][:30]
        results["unitRegistry"] = {"pass": bool(ac and ac > 0), "activeCount": ac, "ids": ids}
        note(f"[항목1] 유닛레지스트리 activeCount={ac} ids={ids} -> {'PASS' if ac else 'FAIL'}")
        events.append({"ev": "registry", "data": r})
    except Exception as e:
        results["unitRegistry"] = {"pass": None, "err": str(e)}; note(f"registry fail: {e}")

    # ── 항목2: 마커클릭 무크래시 ──
    mark = trace_len(); screenshot(hwnd, shots / "20-marker-before.png")
    sx, sy = click(*MARKER); note(f"[항목2] 마커클릭 シュバーラ screen=({sx},{sy})"); time.sleep(2.5)
    if not alive():
        results["markerClick"] = {"pass": False, **die_report("marker")}
        note("[항목2] 마커클릭: FAIL (크래시)")
        return finish_all(results, note, evdir, srv, srv_log, events, 4)
    screenshot(hwnd, shots / "21-marker-after.png")
    mrecv, mresp, munh = trace_since(mark)
    results["markerClick"] = {"pass": True, "recv": mrecv, "resp": mresp, "unhandled": munh}
    note(f"[항목2] 마커클릭: PASS (생존) recv={mrecv} resp={mresp}")

    if natural_move:
        mark = trace_len()
        clicked_steps = []
        for index, (step_name, point) in enumerate(natural_move_steps(), start=1):
            sx, sy = click(*point)
            clicked_steps.append({"step": step_name, "reference": point, "screen": (sx, sy)})
            note(f"[자연이동 {index}/5] {step_name} ref={point} screen=({sx},{sy})")
            time.sleep(3.0 if step_name == "confirm" else 1.2)
            if not alive():
                break
            screenshot(hwnd, shots / f"{index + 31}-natural-{step_name}.png")
        ordered_trace = movement_trace_since(mark)
        move_alive = alive()
        state_evidence = movement_state_evidence(trace_path, evdir / "store.json", "inei00", 1)
        move_pass = move_alive and movement_trace_gate(ordered_trace) and state_evidence["pass"] is True
        results["naturalMove"] = {
            "pass": move_pass,
            "alive": move_alive,
            "steps": clicked_steps,
            "trace": [{"direction": direction, "code": code} for direction, code in ordered_trace],
            "requiredSequence": ["recv:0x0b01", "resp:0x0b07"],
            "stateEvidence": state_evidence,
            "coordinateSource": {
                "authorityTab": "B60/B62 권한 탭 성공 경로",
                "captainCard": "B71 함장 카드 성공 경로",
                "warpCommand": "B71 워프 명령 성공 경로",
                "destination": "existing EMPTY_CELL regression coordinate",
                "confirm": "공통 확인 대화상자 버튼",
            },
        }
        (evdir / "natural-move-trace.json").write_text(
            json.dumps(results["naturalMove"], ensure_ascii=False, indent=2), encoding="utf-8")
        note(f"[자연이동] {'PASS' if move_pass else 'FAIL'} trace={ordered_trace}")
        if not move_alive:
            results["naturalMove"].update(die_report("natural-move"))
            return finish_all(results, note, evdir, srv, srv_log, events, 4)

    if should_probe_flagship(natural_move):
        click(*ICON1); time.sleep(1.5); screenshot(hwnd, shots / "30-popup-open.png")
        mark = trace_len()
        sx, sy = click(*FLAGSHIP_ROW); note(f"[항목3] 旗艦情報 클릭 screen=({sx},{sy})")
        time.sleep(3.0)
        if not alive():
            results["flagshipInfo"] = {"pass": False, **die_report("flagship")}
            note("[항목3] 旗艦情報: FAIL (크래시)")
            return finish_all(results, note, evdir, srv, srv_log, events, 4)
        screenshot(hwnd, shots / "31-flagship-window.png")
        frecv, fresp, funh = trace_since(mark)
        got_032b = "0x032b" in fresp
        results["flagshipInfo"] = {"pass": got_032b, "recv": frecv, "resp": fresp, "unhandled": funh,
                                   "expectStats": {"指揮": 60, "攻撃": 50, "防御": 45},
                                   "note": "스탯 육안검증은 31-flagship-window.png"}
        note(f"[항목3] 旗艦情報: recv={frecv} resp={fresp} unhandled={funh} 0x032b={'YES' if got_032b else 'NO'}")

    # ── 항목4: idle 300s ──
    note(f"=== 항목4: idle {idle_sec}s 무입력 관찰 ===")
    t0 = time.time(); died_idle = False
    while time.time() - t0 < idle_sec:
        if not alive():
            el = time.time() - t0
            results["idleDeath"] = {"pass": False, "diedAtSec": round(el), **die_report(f"idle+{el:.0f}s")}
            note(f"[항목4] idle: FAIL (idle+{el:.0f}s 사망)")
            died_idle = True; break
        time.sleep(5)
        if int(time.time() - t0) % 60 < 5:
            note(f"  idle alive +{time.time()-t0:.0f}s")
    if not died_idle:
        screenshot(hwnd, shots / "40-idle-survived.png")
        results["idleDeath"] = {"pass": True, "note": f"{idle_sec}s 무입력 생존"}
        note(f"[항목4] idle: PASS ({idle_sec}s 생존)")

    # ── 항목5: 빈셀 이동클릭(생존시) ──
    if alive():
        dismiss_modal()
        mark = trace_len(); screenshot(hwnd, shots / "50-emptycell-before.png")
        sx, sy = click(*EMPTY_CELL); note(f"[항목5] 빈셀 이동클릭 screen=({sx},{sy})")
        for _ in range(15):
            time.sleep(0.4)
            if not alive(): break
        if not alive():
            results["emptyCellMove"] = {"pass": False, **die_report("empty-cell")}
            note("[항목5] 빈셀이동: FAIL (크래시 — 여전)")
        else:
            screenshot(hwnd, shots / "51-emptycell-after.png")
            ecrecv, ecresp, ecunh = trace_since(mark)
            results["emptyCellMove"] = {
                "pass": True,
                "gateKind": "crash-regression-only",
                "movementProven": False,
                "recv": ecrecv,
                "resp": ecresp,
            }
            note(f"[항목5] 빈셀 클릭 크래시 회귀: PASS (생존만 확인, 이동 미입증) recv={ecrecv} resp={ecresp}")
    else:
        results["emptyCellMove"] = {"pass": None, "note": "idle 사망으로 미실행"}

    note("=== FINAL ===")
    if alive(): screenshot(hwnd, shots / "99-final.png"); proc.terminate()
    return finish_all(results, note, evdir, srv, srv_log, events, 0)


def finish_all(results, note, evdir, srv, srv_log, events, rc):
    (evdir / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (evdir / "events.jsonl").write_text(
        "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in events) + "\n", encoding="utf-8")
    try: srv.terminate()
    except Exception: pass
    try: srv_log.close()
    except Exception: pass
    summary = ", ".join(f"{k}={'PASS' if v.get('pass') else v.get('pass')}" for k, v in results.items() if isinstance(v, dict))
    note(f"결과요약: {summary}")
    required = required_result_gates("naturalMove" in results)
    gate_failures = [name for name in required if isinstance(results.get(name), dict) and results[name].get("pass") is not True]
    missing = [name for name in required if name not in results]
    shot_dir = Path(evdir) / "shots"
    required_shots = ("10-stratmap.png", "21-marker-after.png", "40-idle-survived.png")
    if "naturalMove" in results:
        required_shots += (
            "32-natural-authority-tab.png",
            "33-natural-captain-card.png",
            "34-natural-warp-command.png",
            "35-natural-destination-cell.png",
            "36-natural-confirm.png",
        )
    missing_shots = [name for name in required_shots if not (shot_dir / name).is_file()]
    required_evidence = ("natural-move-trace.json",) if "naturalMove" in results else ()
    missing_evidence = [name for name in required_evidence if not (Path(evdir) / name).is_file()]
    final_rc = rc if rc else (5 if gate_failures or missing or missing_shots or missing_evidence else 0)
    if gate_failures or missing or missing_shots or missing_evidence:
        note(
            f"FAIL-CLOSED gates={gate_failures} missing={missing} "
            f"missingShots={missing_shots} missingEvidence={missing_evidence}")
    return final_rc


if __name__ == "__main__":
    raise SystemExit(main())
