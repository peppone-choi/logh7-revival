#!/usr/bin/env python3
"""전략맵 클릭 가능 객체 전수/재귀 탐사 (진단 전용, 서버/클라 무변조).

목적(팀리드 지시): 전략맵의 클릭 가능한 모든 메뉴/버튼/객체를 클릭해 각 클릭의
  - 클라가 보낸 inner 요청코드(frida ws-send + 서버 trace)
  - 서버 응답코드/처리결과(handled vs inner-unhandled)
  - 반응 3분류: 정상(창 열림/상태변화) / 무반응(아무 일 없음=서버 미구현 후보) / 종료(크래시)
를 기록해 M4 커맨드 백로그의 실측 근거를 만든다.

트리 순회는 '메뉴 열기 → 항목 클릭 → (창 열리면 내부 클릭) → 닫기 → 다음 형제'.
각 항목 클릭 전에 메뉴를 다시 열어 형제 간 상태 오염을 막는다(직전 런에서 ESC가
창을 못 닫아 icon3~5 스샷이 동일해진 문제 회피).

크래시 시: 종료코드 + 그 시점 서버 마지막 inner 코드 + 직전 스크린샷 남기고
클라 재기동 → 전략맵 재진입 → 다음 노드부터 재개.

PLAN: 아래 CLICK_PLAN(리스트). 각 원소 = 하나의 메뉴 브랜치.
  { 'menu':'라벨', 'open':[x,y] (또는 None=이미 화면상 객체),
    'items':[{ 'label':.., 'x':.., 'y':.., 'depth':n, 'path':'..' }, ...] }

usage: py -3 _clickmap_probe.py <evidence-dir> [--plan character]
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

# 하단 함대콘솔 아이콘 행(실측): y=750
ICON_Y = 750
ICON = {0: 730, 1: 778, 2: 827, 3: 875, 4: 923, 5: 972}

# ── 클릭 플랜 ──────────────────────────────────────────────
# キャラクター情報 팝업(icon1 로 열림). 항목 6종. x=821(버튼 중앙 열), 행피치 24.
CHAR_ITEMS = [
    ("艦艇情報", 821, 597),
    ("旗艦情報", 821, 621),
    ("戦闘隊情報", 821, 645),
    ("部隊情報", 821, 669),
    ("陸戦隊情報", 821, 693),
    ("惑星要塞情報", 821, 717),
]

# ── 상단/좌측/콘솔 클릭 후보(클린 stratmap 001 스샷 실측) ──
MENU_TABS = [
    ("職務権限カード", 735, 580),          # 전략 HUD 왼쪽 탭: 직무 권한 카드
    ("同スポットキャラクター", 895, 580),  # 전략 HUD 오른쪽 탭: 같은 스폿 캐릭터
]
MESSENGER_BTNS = [
    ("메신저_i", 140, 558), ("메신저_dash", 198, 558),
    ("메신저_ヤメ", 245, 558), ("메신저_물음표", 262, 558),
]
MARKERS = [("シュバーラ", 209, 187), ("メルカリト", 638, 128)]
# 콘솔 아이콘 6종(door=icon5는 종료 가능 → 마지막에)
ICON_LABELS = {
    0: "아이콘0_통신", 1: "아이콘1_各種情報", 2: "아이콘2_전화",
    3: "아이콘3_메일", 4: "아이콘4_모니터", 5: "아이콘5_도어退出",
}

# ── 로비 버튼(클라 1024x768 기준 실측, 02-lobby.png) ──
# 좌측 세로 8버튼, x=125. delete/quit 은 특수취급(코드만 관측·확정 금지).
LOBBY_REF = (1024, 768)
LOBBY_BTNS = [
    ("게임개시_ゲーム開始", 125, 191, "게임진입(세션/캐릭선택)"),
    ("신캐릭작성_新キャラクター作成", 125, 249, "캐릭생성 폼"),
    ("오리지널추첨_抽選", 125, 307, "0x1006 추첨플로우"),
    ("캐릭삭제_削除", 125, 365, "삭제=확인만 관측·취소"),
    ("세션변경_セッション変更", 125, 423, "세션선택"),
    ("환경설정_環境設定", 125, 480, "클라측 설정"),
    ("크레딧_クレジット", 125, 538, "클라측 크레딧"),
    ("게임종료_ゲーム終了", 125, 596, "의도된 종료(마지막)"),
]
# 전략맵 빈 셀(이동명령) — qa-marker 관측 크래시(exit 0xCFFFFFFF, crashfn=0) 재확인용
EMPTY_CELL = (512, 268)

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


def _cp949_ok(c):
    """스샷 파일명은 로케일 ACP(cp949)로 인코딩된다 — 인코딩 가능한 문자만 허용."""
    try:
        c.encode("cp949"); return True
    except Exception:
        return False


class Driver:
    def __init__(self, evdir: Path):
        self.evdir = evdir
        self.shots = evdir / "shots"; self.shots.mkdir(parents=True, exist_ok=True)
        self.log_lines = []
        self.events = []
        self.results = []           # 클릭맵 표 행
        self.srv = None; self.srv_log = None
        self.proc = None; self.hwnd = None; self.pid = None
        self.script = None; self.session = None
        self.trace_path = evdir / "trace.jsonl"
        self.shot_n = 0

    def note(self, msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
        self.log_lines.append(line)
        (self.evdir / "driver-console.txt").write_text("\n".join(self.log_lines), encoding="utf-8")

    def snap_shot(self, tag):
        self.shot_n += 1
        # 파일명은 cp949(로케일 ACP) 인코딩 불가 문자(가타카나 ー 등)에서 스샷 저장이 깨진다.
        # 인코딩 가능한 문자만 남기고 나머지는 '_' 로 치환(라벨 원문은 results 에 보존).
        safe = "".join(c if _cp949_ok(c) else "_" for c in tag)
        p = self.shots / f"{self.shot_n:03d}-{safe}.png"
        try:
            screenshot(self.hwnd, p)
        except Exception as e:
            self.note(f"shot fail {tag}: {e}")
        return p.name

    # ---- server ----
    def start_server(self):
        self.srv_log = open(self.evdir / "server-stdout.txt", "w", encoding="utf-8")
        self.srv = subprocess.Popen(["node", str(M2_LAUNCH), str(self.evdir)], cwd=str(ROOT),
                                    stdout=self.srv_log, stderr=subprocess.STDOUT)
        t0 = time.time()
        while time.time() - t0 < 20:
            txt = (self.evdir / "server-stdout.txt").read_text(encoding="utf-8", errors="ignore")
            if "m2-server-ready" in txt:
                self.note("m2-server-ready"); return True
            if "EADDRINUSE" in txt:
                self.note("FAIL EADDRINUSE — 다른 라이브 세션이 47900 점유중"); return False
            if self.srv.poll() is not None:
                self.note(f"FAIL server rc={self.srv.returncode}"); return False
            time.sleep(0.4)
        self.note("FAIL server not ready"); return False

    def trace_len(self):
        try:
            return sum(1 for _ in open(self.trace_path, encoding="utf-8", errors="ignore"))
        except Exception:
            return 0

    def trace_since(self, mark):
        """mark 라인 이후 trace 레코드에서 inner 요청/응답/미처리 요약."""
        recv, resp, unhandled = [], [], []
        try:
            lines = open(self.trace_path, encoding="utf-8", errors="ignore").read().splitlines()
        except Exception:
            return recv, resp, unhandled
        for ln in lines[mark:]:
            try:
                r = json.loads(ln)
            except Exception:
                continue
            ev = r.get("event")
            if ev == "0030-decoded":
                recv.append(r.get("innerCodeHex"))
            elif ev == "world-response-sent":
                resp.extend(r.get("codes") or [])
            elif ev in ("inner-unhandled", "lobby-inner-error"):
                unhandled.append(r.get("innerCodeHex"))
        return recv, resp, unhandled

    # ---- client + frida ----
    def on_message(self, m, _d):
        if m["type"] == "send":
            p = m["payload"]; self.events.append(p)
            ev = p.get("ev") if isinstance(p, dict) else None
            if ev == "send":
                self.note(f"  >> SEND code={p.get('code')} size={p.get('size')}")
            elif ev == "crashfn":
                self.note(f"  !!! CRASHFN unitId={p.get('unitId')} lastLookupRet={p.get('lastLookupRet')}")
            elif ev == "EXCEPTION" and p.get("type") != "system":
                self.note(f"  ##### EXCEPTION {p.get('type')} atVA={p.get('address')} "
                          f"memAddr={p.get('memAddr')} lastDisp={p.get('lastDisp')}")

    def alive(self):
        return bool(self.hwnd and user32.IsWindow(self.hwnd)) and self.proc and self.proc.poll() is None

    def launch_client(self):
        self.proc = subprocess.Popen([CLIENT_EXE], cwd=str(Path(CLIENT_EXE).parent))
        self.note(f"client pid={self.proc.pid}")
        self.hwnd = None; t0 = time.time()
        while time.time() - t0 < 30:
            try:
                h = find_client_hwnd()
                if h: self.hwnd = h; break
            except Exception: pass
            time.sleep(0.5)
        if not self.hwnd:
            self.note("FAIL no window"); return False
        pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(self.hwnd, ctypes.byref(pid))
        self.pid = pid.value
        self.note(f"window hwnd={self.hwnd:#x} pid={self.pid}")
        for attempt in range(3):
            try:
                self.session = frida.attach(self.pid)
                self.script = self.session.create_script(PROBE_JS.read_text(encoding="utf-8"))
                self.script.on("message", self.on_message); self.script.load(); time.sleep(0.5)
                self.note(f"probe loaded (try {attempt})"); break
            except Exception as e:
                self.note(f"attach try {attempt} FAIL {e}"); time.sleep(1.0); self.script = None
        return self.script is not None

    def frida_snap(self):
        try:
            return self.script.exports_sync.snapshot()
        except Exception:
            return None

    def frida_clear(self):
        try: self.script.exports_sync.clear()
        except Exception: pass

    def reach_stratmap(self):
        """login -> lobby -> char -> stratmap. 성공시 True."""
        foreground(self.hwnd)
        ox, oy, cw, ch = client_geometry(self.hwnd)
        if cw < 900:
            self.note(f"login {cw}x{ch} -> do_login"); do_login(self.hwnd, "inei00", "dummy", self.shots)
        for i in range(20):
            time.sleep(1)
            if not self.alive(): return False
            ox, oy, cw, ch = client_geometry(self.hwnd)
            if cw >= 1000: self.note(f"lobby {cw}x{ch}"); break
        time.sleep(9)
        if not self.alive(): return False
        ox, oy, cw, ch = client_geometry(self.hwnd)
        gs = scale(LOBBY_REF, GAME_START, cw, ch)
        mouse_click(ox + gs[0], oy + gs[1]); time.sleep(3.5)
        if not self.alive(): return False
        ox, oy, cw, ch = client_geometry(self.hwnd)
        cc = scale(LOBBY_REF, CHAR_CARD, cw, ch)
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(1.2)
        mouse_click(ox + cc[0], oy + cc[1]); time.sleep(2.5)
        t0 = time.time()
        while time.time() - t0 < 28:
            if not self.alive(): return False
            time.sleep(2)
        self.snap_shot("stratmap-loaded")
        return self.alive()

    def reach_lobby(self):
        """login -> 로비 메뉴까지(게임개시 누르지 않음). 성공시 True."""
        foreground(self.hwnd)
        ox, oy, cw, ch = client_geometry(self.hwnd)
        if cw < 900:
            self.note(f"login {cw}x{ch} -> do_login"); do_login(self.hwnd, "inei00", "dummy", self.shots)
        for i in range(20):
            time.sleep(1)
            if not self.alive(): return False
            ox, oy, cw, ch = client_geometry(self.hwnd)
            if cw >= 1000: self.note(f"lobby {cw}x{ch}"); break
        time.sleep(9)  # 스플래시 -> 로비 메뉴
        self.snap_shot("lobby-loaded")
        return self.alive()

    def ensure_client(self):
        """클라가 죽었으면 재기동+전략맵 재진입."""
        if self.alive(): return True
        self.note("=== 클라 재기동 (전략맵 재진입) ===")
        try:
            if self.proc: self.proc.terminate()
        except Exception: pass
        if not self.launch_client(): return False
        return self.reach_stratmap()

    def click_client(self, cx, cy, ref=MAP_REF):
        ox, oy, cw, ch = client_geometry(self.hwnd)
        sx, sy = ox + int(cx * cw / ref[0]), oy + int(cy * ch / ref[1])
        foreground(self.hwnd); time.sleep(0.2)
        mouse_click(sx, sy)
        return sx, sy

    def esc(self, n=2):
        for _ in range(n):
            user32.keybd_event(0x1B, 0, 0, 0); time.sleep(0.05)
            user32.keybd_event(0x1B, 0, 2, 0); time.sleep(0.4)

    def die_report(self, path_label):
        rc = None
        for _ in range(12):
            rc = self.proc.poll()
            if rc is not None: break
            time.sleep(0.3)
        recv, resp, unh = self.trace_since(max(0, self.trace_len() - 12))
        s = self.frida_snap() or {}
        exithex = f"{rc & 0xffffffff:#x}" if rc is not None else "None(zombie)"
        self.note(f"=== CLIENT DIED at {path_label} exit={rc} ({exithex}) ===")
        self.note(f"  last recv={recv[-4:]} resp={resp[-4:]} unhandled={unh[-4:]} lastDisp={s.get('lastDisp')}")
        return {"exit": rc, "exithex": exithex, "lastRecv": recv[-4:], "lastResp": resp[-4:],
                "lastUnhandled": unh[-4:], "lastDisp": s.get("lastDisp"),
                "crashfn": s.get("crashfnCount"), "lookupMiss": s.get("lookupMisses")}

    def probe_click(self, label, path, depth, cx, cy, open_seq=None):
        """한 객체 클릭 → 서버코드/반응 기록. open_seq: 클릭 전 열기 클릭들."""
        if not self.ensure_client():
            self.note(f"SKIP {path} — 클라 재기동 실패"); return "진행불가"
        # 형제 오염 방지: 열기 시퀀스 재실행
        if open_seq:
            for (ox_, oy_) in open_seq:
                if not self.alive(): break
                self.click_client(ox_, oy_); time.sleep(1.0)
        if not self.alive():
            rep = self.die_report(f"{path}-open")
            self.results.append({"label": label, "path": path, "depth": depth, "reaction": "종료(열기중)", **rep})
            return "종료"
        self.frida_clear()
        before_shot = self.snap_shot(f"d{depth}-{label}-before")
        mark = self.trace_len()
        sx, sy = self.click_client(cx, cy)
        self.note(f"--- CLICK [{path}] client=({cx},{cy}) screen=({sx},{sy})")
        # 크래시 감지: 짧은 폴링
        died = False
        for _ in range(8):
            time.sleep(0.4)
            if not self.alive(): died = True; break
        after_shot = self.snap_shot(f"d{depth}-{label}-after")
        recv, resp, unh = self.trace_since(mark)
        s = self.frida_snap() or {}
        sends = [e.get("code") for e in self.events if isinstance(e, dict) and e.get("ev") == "send"]
        row = {"label": label, "path": path, "depth": depth, "client": [cx, cy],
               "recv": recv, "resp": resp, "unhandled": unh,
               "beforeShot": before_shot, "afterShot": after_shot}
        if died:
            rep = self.die_report(path)
            row.update(rep); row["reaction"] = "종료"
            self.results.append(row)
            self.note(f"  >>> [{path}] 종료 exit={rep['exithex']} recv={recv} unhandled={unh}")
            return "종료"
        # 반응 분류: unhandled 있으면 무반응(서버미구현), recv 있는데 resp도 있으면 정상후보
        if unh:
            row["reaction"] = "무반응(서버미구현)"
        elif recv and resp:
            row["reaction"] = "정상(응답있음)"
        elif not recv:
            row["reaction"] = "무반응(요청없음)"
        else:
            row["reaction"] = "정상(요청만)"
        self.results.append(row)
        self.note(f"  >>> [{path}] {row['reaction']} recv={recv} resp={resp} unhandled={unh}")
        # 닫기: ESC 2회(창 닫기 시도)
        self.esc(2)
        return row["reaction"]

    def finish(self, rc=0):
        (self.evdir / "results.jsonl").write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in self.results) + "\n", encoding="utf-8")
        (self.evdir / "events.jsonl").write_text(
            "\n".join(json.dumps(e, ensure_ascii=False, default=str) for e in self.events) + "\n", encoding="utf-8")
        try:
            if self.alive(): self.proc.terminate(); self.note("terminated client")
        except Exception: pass
        try: self.srv.terminate()
        except Exception: pass
        if self.srv_log: self.srv_log.close()
        return rc


def probe_fresh(d: Driver, label, path, depth, cx, cy):
    """매 프로브마다 클라 재기동 → 전략맵 재진입 후 단일 클릭(크래시 격리 목적)."""
    d.note(f"=== FRESH relaunch for [{path}] ===")
    try:
        if d.alive(): d.proc.terminate(); time.sleep(1.0)
    except Exception: pass
    if not d.launch_client() or not d.reach_stratmap():
        d.note(f"SKIP {path} — 재기동/재진입 실패")
        d.results.append({"label": label, "path": path, "depth": depth, "reaction": "진행불가(재기동실패)"})
        return
    d.frida_clear()
    before = d.snap_shot(f"d{depth}-{label}-before")
    mark = d.trace_len()
    sx, sy = d.click_client(cx, cy)
    d.note(f"--- CLICK [{path}] client=({cx},{cy}) screen=({sx},{sy})")
    died = False
    for _ in range(10):
        time.sleep(0.4)
        if not d.alive(): died = True; break
    after = d.snap_shot(f"d{depth}-{label}-after")
    recv, resp, unh = d.trace_since(mark)
    row = {"label": label, "path": path, "depth": depth, "client": [cx, cy],
           "recv": recv, "resp": resp, "unhandled": unh, "beforeShot": before, "afterShot": after}
    if died:
        rep = d.die_report(path); row.update(rep); row["reaction"] = "종료"
        d.note(f"  >>> [{path}] 종료 exit={rep['exithex']} recv={recv} unhandled={unh}")
    else:
        if unh: row["reaction"] = "무반응(서버미구현)"
        elif recv and resp: row["reaction"] = "정상(응답있음)"
        elif not recv: row["reaction"] = "무반응(요청없음)"
        else: row["reaction"] = "정상(요청만)"
        d.note(f"  >>> [{path}] {row['reaction']} recv={recv} resp={resp} unhandled={unh}")
    d.results.append(row)


def probe_fresh_lobby(d: Driver, label, path, cx, cy, note_desc=""):
    """매 프로브마다 재기동 → 로비까지만 진입 후 단일 클릭. 삭제/종료 안전(재기동이 리셋)."""
    d.note(f"=== FRESH lobby for [{path}] {note_desc} ===")
    try:
        if d.alive(): d.proc.terminate(); time.sleep(1.0)
    except Exception: pass
    if not d.launch_client() or not d.reach_lobby():
        d.note(f"SKIP {path} — 재기동/로비 실패")
        d.results.append({"label": label, "path": path, "depth": 1, "reaction": "진행불가(재기동실패)"})
        return
    d.frida_clear()
    before = d.snap_shot(f"lobby-{label}-before")
    mark = d.trace_len()
    sx, sy = d.click_client(cx, cy, ref=LOBBY_REF)
    d.note(f"--- CLICK [{path}] client=({cx},{cy}) screen=({sx},{sy})")
    died = False
    for _ in range(10):
        time.sleep(0.4)
        if not d.alive(): died = True; break
    time.sleep(1.0)  # 다이얼로그 렌더 대기
    after = d.snap_shot(f"lobby-{label}-after")
    recv, resp, unh = d.trace_since(mark)
    row = {"label": label, "path": path, "depth": 1, "client": [cx, cy], "desc": note_desc,
           "recv": recv, "resp": resp, "unhandled": unh, "beforeShot": before, "afterShot": after}
    if died:
        rep = d.die_report(path); row.update(rep); row["reaction"] = "종료"
        d.note(f"  >>> [{path}] 종료 exit={rep['exithex']} recv={recv} unhandled={unh}")
    else:
        if unh: row["reaction"] = "무반응(서버미구현)"
        elif recv and resp: row["reaction"] = "정상(응답있음)"
        elif not recv: row["reaction"] = "무반응/클라측(요청없음)"
        else: row["reaction"] = "정상(요청만)"
        d.note(f"  >>> [{path}] {row['reaction']} recv={recv} resp={resp} unhandled={unh}")
    d.results.append(row)


def main() -> int:
    args = sys.argv[1:]
    evdir = Path(args[0]); evdir.mkdir(parents=True, exist_ok=True)
    branch = "character"
    if "--branch" in args:
        branch = args[args.index("--branch") + 1]
    (evdir / "store.json").write_text(json.dumps(SEED_STORE, ensure_ascii=False, indent=2), encoding="utf-8")
    d = Driver(evdir)
    if not d.start_server(): return 2
    if not d.launch_client(): return d.finish(3)

    if branch == "lobby":
        # 로비 8버튼: 각각 fresh 재기동으로 격리. 삭제=확인만 관측(재기동이 취소역할). 종료=마지막.
        for label, cx, cy, desc in LOBBY_BTNS:
            probe_fresh_lobby(d, label, f"로비>{label}", cx, cy, desc)
        d.note("=== FINAL ===")
        d.note(f"probed={len(d.results)} rows")
        return d.finish(0)

    if not d.reach_stratmap():
        d.note("FAIL 전략맵 미도달"); return d.finish(4)

    if branch == "movecell":
        # 빈 셀 이동클릭 크래시 재확인(qa-marker: exit 0xCFFFFFFF, crashfn=0)
        d.frida_clear()
        before = d.snap_shot("movecell-before")
        mark = d.trace_len()
        cx, cy = EMPTY_CELL
        sx, sy = d.click_client(cx, cy)
        d.note(f"--- CLICK [빈셀이동] client=({cx},{cy}) screen=({sx},{sy})")
        died = False
        for _ in range(15):
            time.sleep(0.4)
            if not d.alive(): died = True; break
        after = d.snap_shot("movecell-after")
        recv, resp, unh = d.trace_since(mark)
        row = {"label": "빈셀이동명령", "path": "전략맵>빈셀클릭(이동)", "depth": 1,
               "client": [cx, cy], "recv": recv, "resp": resp, "unhandled": unh,
               "beforeShot": before, "afterShot": after}
        if died:
            rep = d.die_report("빈셀이동"); row.update(rep); row["reaction"] = "종료"
        else:
            row["reaction"] = "무반응" if not recv else "정상/기타"
        d.results.append(row)
        d.note(f"  >>> [빈셀이동] {row['reaction']} recv={recv} unhandled={unh}")

    elif branch == "character":
        icon1 = (ICON[1], ICON_Y)
        for label, cx, cy in CHAR_ITEMS:
            d.probe_click(label, f"콘솔>各種情報(icon1)>{label}", 3, cx, cy, open_seq=[icon1])

    elif branch == "toplevel":
        # 마커 + 메뉴탭 + 메신저버튼: 한 세션에서 순차 클릭(창 안 여는 것 위주)
        for label, cx, cy in MARKERS:
            d.probe_click(label, f"맵>마커>{label}", 1, cx, cy)
        for label, cx, cy in MESSENGER_BTNS:
            d.probe_click(label, f"좌측메신저>{label}", 1, cx, cy)
        for label, cx, cy in MENU_TABS:
            d.probe_click(label, f"메뉴바>{label}", 1, cx, cy)

    elif branch == "icons":
        # 콘솔 아이콘 6종: 각각 fresh 재기동으로 크래시 격리. door(5)는 마지막.
        for i in [0, 1, 2, 3, 4, 5]:
            probe_fresh(d, ICON_LABELS[i], f"콘솔아이콘>{ICON_LABELS[i]}", 1, ICON[i], ICON_Y)

    d.note("=== FINAL ===")
    if d.alive(): d.snap_shot("final")
    d.note(f"probed={len(d.results)} rows")
    return d.finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
