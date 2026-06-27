"""다유저 2:2(제국2·동맹2) 라이브 테스트용 멀티클라 하네스.

기존 단일클라 모델(tools/logh7_ui_explorer.py)을 N개 클라로 확장한다. 단일클라가 가진
4대 블로커(멀티플레이 감사 산출)를 다음과 같이 해소한다 — 중복구현 없이 기존 모듈을 재사용:

  블로커1 (단일 EXE/cwd): client_exe.py는 단일 INSTALLED_CLIENT_EXE/CLIENT_DIR cwd만 안다.
    → run 디렉토리 .omo/multiclient/<run>/client-{0..3}/ 에 EXE·dgVoodoo.conf·String.txt·
      GraphicConfig.txt 를 복제해 클라마다 격리된 cwd 를 만든다(_clone_client_dir).

  블로커2 (전역 입력): mouse_event/keybd_event 는 전역 입력이라 동시 4창 중 포커스 1개만
    입력이 도달한다(PostMessage 는 게임이 GetCursorPos 폴링이라 안 통함 → window_login 의
    _click/_type_text 가 mouse_event 절대좌표 글라이드를 쓰는 이유).
    → ★클라마다 SetForegroundWindow → 입력 → 다음 클라 순차(직렬화). 절대 병렬 입력 안 함
      (_SerialInputDriver 가 입력 전 항상 SetForegroundWindow 선행, 호출자가 클라 루프를 순차로 돈다).

  블로커3 (무차별 kill): real_client_probe._kill_game_processes 는 'G7MTClient*.exe' 와일드카드
    Stop-Process 라 병렬 워크플로/다른 작업의 클라·node 까지 죽인다.
    → ★PID-scoped taskkill 로 대체(_kill_pids). 이 run 이 spawn 한 PID(+자식 /T)만 죽인다.
      _kill_game_processes 는 절대 호출하지 않는다.

  블로커4 (하드코딩 argv): login-commandline-bootstrap 은 ginei00/127.0.0.1:47900 고정 +
    _validate_commandline_bootstrap_port 가 포트≠47900 거부 → 클라별 다른 계정 불가.
    → ★window-login 경로(좌표클릭으로 클라별 계정 id/password 입력)를 쓴다. ui_flow.run_login_flow
      재사용. 클라별 EXE 재인코딩은 범위 밖.

머신부하: 4 풀스크린은 비현실적이라 ★windowed/borderless + 축소해상도(GraphicConfig.txt 의
ScreenWidth/Height 를 줄임)를 전제로 한다. splash ~30초/창 이므로 4창을 순차 spawn 한다.

서브커맨드 (모두 --run DIR 기본 .omo/multiclient/<자동생성 run-id>):
  up            client-{K} cwd 복제 + 순차 detached spawn(splash 대기) + window/borderless 적용
  seed-accounts admin create 로 4계정(emp1/emp2/all1/all2) → <run>/accounts.db
  login-all     순차 SetForeground → window_login 으로 클라별 계정 로그인
  create-all    클라별 ui_flow.run_create_character_flow(--faction empire/alliance)
  world-all     세션 0x2006 더블클릭 → 월드 진입
  drive         --client K 로 단일 클라에 click/key/text 1회(순차 입력 직렬화)
  trace         서버 단일 trace.jsonl 을 connectionId 로 분할(--client K 또는 전체 분할 덤프)
  verify-visibility  relay-deliver 로 타플레이어 0x0325/0x0323/0x0426 가 전달됐는지 검사
  shot-all      모든 클라 스크린샷
  down          run 의 모든 PID PID-scoped 종료(다른 워크플로 보존)

서버 기동(★FORBIDDEN_DEFAULT 라 명시 필수):
  LOGH_AUTHORITATIVE=1 LOGH_RELAY=1 LOGH_MP_VISIBILITY=1 LOGH_ACCOUNT_DB=<run>/accounts.db
  단일 서버 47900. up 이 자동으로 위 env 를 붙여 serve-auth 를 detached 로 띄운다.

usage:
  python -m tools.logh7_multiclient_test up --clients 4 --factions empire,empire,alliance,alliance
  python -m tools.logh7_multiclient_test seed-accounts
  python -m tools.logh7_multiclient_test login-all
  python -m tools.logh7_multiclient_test create-all
  python -m tools.logh7_multiclient_test world-all
  python -m tools.logh7_multiclient_test trace --split
  python -m tools.logh7_multiclient_test verify-visibility
  python -m tools.logh7_multiclient_test down
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tools.logh7_client_exe import (
    CLIENT_DIR,
    CANONICAL_PLAYABLE_EXE,
    INSTALLED_CLIENT_EXE,
    REPO_ROOT,
    label_for_sha,
    sha256_file,
)
from tools.logh7_ui_flow import (
    CharacterFaction,
    CharacterFlowSpec,
    InvalidFactionError,
    LoginSpec,
    matching_trace_events,
    parse_faction,
    parse_trace_code,
    run_create_character_flow,
    run_login_flow,
)
from tools.logh7_window_login import _click, _type_text, find_client_window

ROOT = REPO_ROOT
DEFAULT_RUN_ROOT = ROOT / ".omo/multiclient"
SERVER_PORT = 47900  # 단일 서버. 클라별 EXE 재인코딩은 범위 밖이라 모두 같은 포트로 붙는다.

# Windows process-creation flags(자식이 Bash 툴 job-object teardown 을 살아남게 한다 — ui_explorer 와 동일).
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_BREAKAWAY_FROM_JOB = 0x01000000

# ★서버 기동에 반드시 명시해야 하는 멀티플레이 가시성 플래그(FORBIDDEN_DEFAULT).
#   verify-visibility 의 진짜 신호(relay-deliver/0x0325 재push/0x0423·0x0424·0x0426)는 이게 켜져야 흐른다.
REQUIRED_SERVER_ENV = {
    "LOGH_AUTHORITATIVE": "1",
    "LOGH_RELAY": "1",
    "LOGH_MP_VISIBILITY": "1",
}

# 클라 cwd 로 복제할 런타임 파일들. EXE 는 별도(복제 후 playable 로 덮어씀).
CLIENT_RUNTIME_FILES = (
    "dgVoodoo.conf",
    "D3D8.dll",
    "String.txt",
    "GraphicConfig.txt",
    "window2.dat",
    "window3.dat",
)

# 2:2 기본 계정(seed-accounts 가 만들고 login-all 이 클라별로 매핑).
DEFAULT_ACCOUNTS = ("emp1", "emp2", "all1", "all2")
DEFAULT_FACTIONS = ("empire", "empire", "alliance", "alliance")
DEFAULT_PASSWORD = "dummy"  # window-login 패스워드 필드는 검증만, 실제 자격은 GIN7 credential.

# 클라별 자동로그인 EXE: 폼 키보드 로그인이 4창 겹침에서 불안정(엔진 폼 ID필드 기본 포커스 미보장 →
# 타이핑이 허공으로 새 계정이 unknown/dummy 로 깨짐, 2026-06-22 라이브 2회 확인)하므로,
# login-commandline-bootstrap 의 정적 argv 계정 문자열("ginei00")을 클라별로 바이트 패치해 키보드 없이
# 각 클라가 다른 계정으로 자동 로그인하게 한다. 소스=canonical playable(부트스트랩+로그인폼 정렬, 24611e07).
AUTOLOGIN_ACCOUNT_OFFSET = 0x36EE2C          # G7MTClient.playable.exe 내 "ginei00\0" 파일 오프셋(단일 위치)
AUTOLOGIN_ACCOUNT_ORIGINAL = b"ginei00\x00"  # 8바이트 슬롯(직후 "47900" 포트 문자열 — 경계 침범 금지)

# 축소해상도(머신부하 완화). 4창 borderless 라도 1280x720 이면 디버깅 가능.
# ★해상도 축소 금지: login-native-layout/lobby-native-layout 패치는 1920x1080 절대좌표 기준이라,
# 더 낮은 내부해상도로 렌더하면 위젯(예 x=960)이 배경(균일 스트레치 텍스처)과 어긋난다(폼/버튼 detached).
# 단일클라(cmd4)가 1920x1080 원본 해상도라 레이아웃 정합 → 다클라도 동일 해상도를 유지한다.
# 머신부하용 다창 타일링은 dgVoodoo windowed 모드(별도)로 처리.
REDUCED_WIDTH = 1920
REDUCED_HEIGHT = 1080

VK_NAMES: dict[str, int] = {
    "ENTER": 0x0D, "RETURN": 0x0D, "ESC": 0x1B, "ESCAPE": 0x1B, "TAB": 0x09,
    "SPACE": 0x20, "BACK": 0x08, "BACKSPACE": 0x08, "DELETE": 0x2E, "DEL": 0x2E,
    "UP": 0x26, "DOWN": 0x28, "LEFT": 0x25, "RIGHT": 0x27, "HOME": 0x24, "END": 0x23,
    "PAGEUP": 0x21, "PAGEDOWN": 0x22, "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73,
    "F5": 0x74, "F6": 0x75, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79,
    "F11": 0x7A, "F12": 0x7B,
}


# --------------------------------------------------------------------------- PID-scoped kill (블로커3)


def _kill_pids(pids: list[int]) -> list[dict[str, Any]]:
    """★PID-scoped 종료: 주어진 PID(+자식 트리 /T)만 taskkill. 와일드카드/이름매칭 절대 안 함.

    real_client_probe._kill_game_processes 가 'G7MTClient*.exe' 전체를 죽이는 것과 대비된다 —
    이 함수는 이 run 이 직접 spawn 해서 PID 를 아는 프로세스만 건드리므로 병렬 워크플로의
    클라·node 를 보존한다.
    """
    results: list[dict[str, Any]] = []
    for pid in pids:
        if not isinstance(pid, int) or pid <= 0:
            results.append({"pid": pid, "skipped": "invalid-pid"})
            continue
        proc = subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            capture_output=True,
            text=True,
        )
        results.append(
            {
                "pid": pid,
                "returncode": proc.returncode,
                "killed": proc.returncode == 0,
                "stderr": proc.stderr.strip() or None,
            }
        )
    return results


def _select_kill_targets(state: dict[str, Any]) -> list[int]:
    """run 상태에서 PID-scoped kill 대상(서버 + 모든 클라 PID)을 모은다. 셀프테스트로 검증 가능."""
    pids: list[int] = []
    server_pid = state.get("serverPid")
    if isinstance(server_pid, int) and server_pid > 0:
        pids.append(server_pid)
    for client in state.get("clients", []):
        pid = client.get("pid")
        if isinstance(pid, int) and pid > 0:
            pids.append(pid)
    return pids


def _process_alive(pid: int) -> bool:
    import ctypes

    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    code = ctypes.c_ulong()
    ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(handle)
    return bool(ok) and code.value == 259  # STILL_ACTIVE


# --------------------------------------------------------------------------- cwd 복제 (블로커1)


def _reduced_graphic_config(text: str, width: int, height: int) -> str:
    """GraphicConfig.txt 의 ScreenWidth/ScreenHeight 값(키 다음 줄)을 축소해상도로 바꾼다.

    포맷은 'KEY\\nVALUE' 라인쌍(EasyGraphicConfigFile). 키를 만나면 바로 다음 비어있지 않은
    데이터 줄을 새 값으로 교체한다. 셀프테스트(dry-run)로 검증 가능하도록 순수 문자열 함수로 둔다.
    """
    lines = text.splitlines()
    out: list[str] = []
    replace_next: str | None = None
    for line in lines:
        if replace_next is not None and line.strip() != "":
            out.append(replace_next)
            replace_next = None
            continue
        out.append(line)
        key = line.strip()
        if key == "ScreenWidth":
            replace_next = str(width)
        elif key == "ScreenHeight":
            replace_next = str(height)
    trailing = "\n" if text.endswith("\n") else ""
    return "\n".join(out) + trailing


def _build_autologin_exe(account: str) -> Path:
    """canonical playable(부트스트랩 포함)에서 자동로그인 계정 문자열만 account 로 바꾼 클라별 EXE 를 만든다.

    8바이트 슬롯("ginei00\\0")을 account+널패딩으로 덮어쓴다(account=ASCII ≤7자). 정적 argv 의 account
    포인터가 가리키는 단일 문자열이라 다른 코드 경로엔 영향 없음. 비파괴(canonical 무수정, 파생 테스트
    EXE 만 생성). 슬롯이 기대값과 다르면(EXE 가 바뀜) 즉시 실패해 엉뚱한 바이트 패치를 막는다."""
    acct = account.encode("ascii")
    if not 1 <= len(acct) <= 7:
        raise SystemExit(f"autologin account must be 1..7 ASCII chars: {account!r}")
    if not CANONICAL_PLAYABLE_EXE.exists():
        raise SystemExit(f"canonical playable EXE not found for autologin: {CANONICAL_PLAYABLE_EXE}")
    data = bytearray(CANONICAL_PLAYABLE_EXE.read_bytes())
    off = AUTOLOGIN_ACCOUNT_OFFSET
    slot = bytes(data[off:off + len(AUTOLOGIN_ACCOUNT_ORIGINAL)])
    if slot != AUTOLOGIN_ACCOUNT_ORIGINAL:
        raise SystemExit(
            f"autologin account slot mismatch at 0x{off:x}: expected {AUTOLOGIN_ACCOUNT_ORIGINAL!r}, got {slot!r} "
            "(canonical playable EXE 변경 — 'ginei00' 오프셋 재탐색 필요)"
        )
    data[off:off + len(AUTOLOGIN_ACCOUNT_ORIGINAL)] = acct + b"\x00" * (len(AUTOLOGIN_ACCOUNT_ORIGINAL) - len(acct))
    dest = CLIENT_DIR / f"G7MTClient.autologin.{account}.exe"
    dest.write_bytes(bytes(data))
    return dest


def _clone_plan(client_index: int, run_dir: Path, account: str | None = None) -> dict[str, Any]:
    """클라 K 의 cwd 복제 계획(소스→목적지 + EXE 소스)을 순수하게 계산한다(dry-run 검증용)."""
    client_dir = run_dir / f"client-{client_index}"
    # 1) 클라별 자동로그인 EXE(있으면 최우선): 폼 키보드 로그인 우회(4창 포커스 불안정 해소). account 별 파일.
    autologin_exe = (CLIENT_DIR / f"G7MTClient.autologin.{account}.exe") if account else None
    # 2) 없으면 자동로그인 제거 EXE(noauto): 로그인폼이 떠서 클라별 계정을 window-login 으로 넣는다(레거시).
    noauto_exe = CLIENT_DIR / "G7MTClient.noauto.exe"
    if autologin_exe is not None and autologin_exe.exists():
        exe_source = autologin_exe
    elif noauto_exe.exists():
        exe_source = noauto_exe
    elif CANONICAL_PLAYABLE_EXE.exists():
        exe_source = CANONICAL_PLAYABLE_EXE
    else:
        exe_source = INSTALLED_CLIENT_EXE
    files = []
    for name in CLIENT_RUNTIME_FILES:
        src = CLIENT_DIR / name
        files.append({"name": name, "source": str(src), "dest": str(client_dir / name), "exists": src.exists()})
    return {
        "clientIndex": client_index,
        "clientDir": str(client_dir),
        "exe": {"source": str(exe_source), "dest": str(client_dir / "G7MTClient.exe"), "exists": exe_source.exists()},
        "files": files,
        "reduceResolution": {"width": REDUCED_WIDTH, "height": REDUCED_HEIGHT},
    }


def _clone_client_dir(client_index: int, run_dir: Path, account: str | None = None) -> dict[str, Any]:
    """클라 K 의 격리 cwd 를 실제로 복제한다(블로커1 해소). EXE 는 autologin(account) > noauto > playable, 축소해상도 적용."""
    plan = _clone_plan(client_index, run_dir, account=account)
    client_dir = Path(plan["clientDir"])
    client_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for entry in plan["files"]:
        src = Path(entry["source"])
        if not src.exists():
            continue
        dest = Path(entry["dest"])
        if entry["name"] == "GraphicConfig.txt":
            # 축소해상도로 변환해 기록(원본 1920x1080 → 1280x720).
            raw = src.read_text(encoding="utf-8", errors="replace")
            dest.write_text(_reduced_graphic_config(raw, REDUCED_WIDTH, REDUCED_HEIGHT), encoding="utf-8")
        else:
            shutil.copy2(src, dest)
        copied.append(entry["name"])
    exe_src = Path(plan["exe"]["source"])
    exe_dest = client_dir / "G7MTClient.exe"
    shutil.copy2(exe_src, exe_dest)
    # String.txt 가 비면(복제 글리치) 원본/.original 에서 재복제 — 빈 String.txt 는 클라 크래시 유발.
    str_dest = client_dir / "String.txt"
    if (not str_dest.exists()) or str_dest.stat().st_size == 0:
        for cand in (CLIENT_DIR / "String.txt", CLIENT_DIR / "String.txt.original"):
            if cand.exists() and cand.stat().st_size > 0:
                shutil.copy2(cand, str_dest)
                break
    return {
        "clientIndex": client_index,
        "clientDir": str(client_dir),
        "exe": str(exe_dest),
        "exeSha": sha256_file(exe_dest),
        "exeKind": label_for_sha(sha256_file(exe_dest)),
        "copied": copied,
    }


# --------------------------------------------------------------------------- spawn (detached)


def _spawn_detached(args: list[str], cwd: Path, stdout: Any, stderr: Any, env: dict[str, str] | None = None) -> subprocess.Popen[bytes]:
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB
    try:
        return subprocess.Popen(
            args, cwd=str(cwd), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=flags, env=env
        )
    except OSError:
        flags &= ~CREATE_BREAKAWAY_FROM_JOB
        return subprocess.Popen(
            args, cwd=str(cwd), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=flags, env=env
        )


# --------------------------------------------------------------------------- run state


def _run_state_path(run_dir: Path) -> Path:
    return run_dir / "run.json"


def _save_state(run_dir: Path, state: dict[str, Any]) -> None:
    _run_state_path(run_dir).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_state(run_dir: Path) -> dict[str, Any]:
    path = _run_state_path(run_dir)
    if not path.exists():
        raise SystemExit(f"no active run at {run_dir} (run `up` first)")
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_run_dir(args: argparse.Namespace) -> Path:
    if args.run is not None:
        return Path(args.run).resolve()
    # up 은 새 run-id 자동생성, 그 외는 가장 최근 run 을 고른다.
    if getattr(args, "command", None) == "up":
        run_id = time.strftime("run-%Y%m%d-%H%M%S")
        return (DEFAULT_RUN_ROOT / run_id).resolve()
    if not DEFAULT_RUN_ROOT.exists():
        raise SystemExit(f"no runs under {DEFAULT_RUN_ROOT}; run `up` first")
    runs = sorted((p for p in DEFAULT_RUN_ROOT.iterdir() if p.is_dir() and _run_state_path(p).exists()))
    if not runs:
        raise SystemExit(f"no active runs under {DEFAULT_RUN_ROOT}; run `up` first")
    return runs[-1].resolve()


# --------------------------------------------------------------------------- 순차 입력 직렬화 (블로커2)


@dataclass
class _SerialInputDriver:
    """클라 1개에 입력하는 ui_flow 드라이버. SetForegroundWindow 선행으로 전역 입력을 이 창에 묶는다.

    ★멀티클라에서는 절대 두 클라에 동시에 입력하지 않는다 — 호출자가 클라마다 이 드라이버를
    새로 만들어 순차로 돌린다(전역 mouse_event/keybd_event 충돌 방지).
    """

    hwnd: int
    win32api: Any
    win32con: Any
    win32gui: Any

    def _focus(self) -> None:
        # ★겹친 1:1 풀모니터 창들 중 이 창을 z-order 최상단으로(클릭이 맞는 창에 떨어지게).
        _foreground(self.win32con, self.win32gui, self.hwnd)

    def click(self, x: int, y: int, *, label: str, settle: float) -> dict[str, Any]:
        self._focus()
        _click(self.win32api, self.win32con, self.win32gui, self.hwnd, x, y)
        time.sleep(settle)
        return {"action": "click", "x": x, "y": y, "label": label}

    def text(self, value: str, *, label: str, settle: float) -> dict[str, Any]:
        self._focus()
        compensate_first = label == "login-account-text"
        _type_text(self.win32con, self.win32gui, self.hwnd, value, self.win32api, compensate_first=compensate_first)
        time.sleep(settle)
        redacted = "password" in label
        return {"action": "text", "label": label, **({"valueLen": len(value)} if redacted else {"value": value})}


# --------------------------------------------------------------------------- connectionId trace 분할 (trace 서브커맨드)


def _read_trace_events(trace_path: Path) -> list[dict[str, Any]]:
    if not trace_path.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in trace_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _split_trace_by_connection(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """서버 단일 trace.jsonl 을 connectionId 로 분할한다.

    auth-server.writeTrace 는 거의 모든 이벤트에 connectionId 를 붙인다(buildLoginMessageTraceFields,
    relay-deliver/relay-broadcast/world-join 등). connectionId 가 없는 이벤트(서버 부팅 등)는
    '_global' 버킷에 모은다. 순수 함수라 단위테스트로 검증 가능.
    """
    buckets: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        conn = event.get("connectionId")
        key = str(conn) if isinstance(conn, int) else "_global"
        buckets.setdefault(key, []).append(event)
    return buckets


# --------------------------------------------------------------------------- 가시성 판정 (verify-visibility)


# ★주의: 0x0313(전체 갤럭시 마커)은 로그인 1회 push 라 "동적 가시성"이 아니다 → 신호에서 제외.
#   진짜 멀티플레이 가시성 = relay 가 다른 connectionId 의 행동을 타 플레이어에게 전달했는가.
VISIBILITY_RELAY_EVENTS = ("relay-deliver", "relay-broadcast")
# 타 플레이어에게 도달해야 의미 있는 코드들: 0x0325 unit 재push, 0x0323 character, 0x0426 피격, 0x0423/0x0424 이동/선회.
VISIBILITY_CODES = (0x0325, 0x0323, 0x0426, 0x0423, 0x0424)


def _analyze_visibility(events: list[dict[str, Any]]) -> dict[str, Any]:
    """relay-deliver/relay-broadcast 이벤트에서 타플레이어 가시성 코드(0x0325/0x0323/0x0426...)를 집계.

    순수 함수(이벤트 리스트 → 판정)라 합성 trace 로 단위테스트 가능. 0x0313 은 의도적으로 무시.
    """
    relay_events = [e for e in events if e.get("event") in VISIBILITY_RELAY_EVENTS]
    code_hits: dict[str, int] = {f"0x{c:04x}": 0 for c in VISIBILITY_CODES}
    per_connection: dict[str, int] = {}
    for event in relay_events:
        conn = event.get("connectionId")
        key = str(conn) if isinstance(conn, int) else "_global"
        per_connection[key] = per_connection.get(key, 0) + 1
        for code in VISIBILITY_CODES:
            if matching_trace_events([event], code):
                code_hits[f"0x{code:04x}"] += 1
    ignored_0313 = len(matching_trace_events(events, 0x0313))
    visible = any(v > 0 for v in code_hits.values())
    return {
        "relayEventCount": len(relay_events),
        "perConnectionRelayCount": per_connection,
        "visibilityCodeHits": code_hits,
        "ignored0313LoginMarkerHits": ignored_0313,
        "crossPlayerVisibilityObserved": visible,
        "note": (
            "0x0313(전체 갤럭시 마커)은 로그인 1회 push 라 동적 가시성 아님 — 제외. "
            "진짜 신호는 relay-deliver/relay-broadcast 로 전달된 0x0325/0x0323/0x0426/0x0423/0x0424."
        ),
    }


# --------------------------------------------------------------------------- win32 helpers


def _win32():
    import win32api  # type: ignore[import-not-found]
    import win32con  # type: ignore[import-not-found]
    import win32gui  # type: ignore[import-not-found]
    import win32process  # type: ignore[import-not-found]

    return win32api, win32con, win32gui, win32process


def _apply_window_mode(win32api: Any, win32con: Any, win32gui: Any, hwnd: int, index: int, total: int) -> dict[str, Any]:
    """4창을 전부 모니터 풀사이즈(백버퍼와 1:1) borderless 로 만든다.

    ★중요(2026-06-22 버그수정): 이전엔 모니터를 2x2 타일(예: 960x540)로 줄였는데, D3D8 백버퍼는
    GraphicConfig(1920x1080) 고정이고 각 씬(로그인 640x480·로비/생성 1024x768)은 백버퍼 좌상단에
    *늘이지 않고* 네이티브로 그려진다. 따라서 ui_flow 의 클릭좌표(로그인 325,333 … 생성 766,598)는
    *백버퍼 절대픽셀*이다. 창을 960x540 으로 줄이면 Present 가 백버퍼를 0.5배로 축소 표시 → 모든
    클릭이 절반 위치에 떨어져 폼을 빗나간다(로그인 4클라 미도달의 실제 원인). 표준 ui_explorer 가
    풀모니터 1:1 로 로그인/생성에 성공하는 환경을 그대로 복제한다.

    1920x1080 모니터에 1:1 창 4개는 반드시 겹친다(타일 불가) → 입력/스크린샷 직전 _foreground 로
    대상 창을 z-order 최상단으로 올려 클릭이 맞는 창에 떨어지고 PrintWindow 가 가려지지 않게 한다.
    입력은 호출자가 순차로 돌리므로 동시 입력 충돌 없음.
    """
    monitor = win32api.MonitorFromWindow(hwnd, 2)
    info = win32api.GetMonitorInfo(monitor)
    left, top, right, bottom = info["Monitor"]
    ex_style_index = getattr(win32con, "GWL_EXSTYLE", -20)
    win32gui.SetMenu(hwnd, 0)
    win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, win32con.WS_POPUP | win32con.WS_VISIBLE)
    win32gui.SetWindowLong(hwnd, ex_style_index, getattr(win32con, "WS_EX_APPWINDOW", 0x00040000))
    win32gui.SetWindowPos(
        hwnd, win32con.HWND_TOP, left, top, right - left, bottom - top,
        win32con.SWP_FRAMECHANGED | win32con.SWP_SHOWWINDOW,
    )
    return {
        "tile": [0, 0],
        "backbufferOneToOne": True,
        "windowRect": list(win32gui.GetWindowRect(hwnd)),
        "monitorRect": [left, top, right, bottom],
    }


def _force_foreground_attachthreadinput(hwnd: int) -> bool:
    """포그라운드 락을 AttachThreadInput 으로 우회해 대상 창에 *진짜 키보드 포커스*를 강제한다.

    ★근본(2026-06-22 라이브 확정): keybd_event 는 전역 — 키는 OS 의 *포그라운드(키보드 포커스)* 창에
    떨어진다. 백그라운드 파이썬 프로세스에서 SetForegroundWindow 단독 호출은 Windows 포그라운드 락
    (다른 프로세스가 포그라운드를 훔치지 못하게)에 막혀 자주 무시된다 → 4창 겹침에서 키가 엉뚱한
    클라로 새어 로그인 자격이 깨졌다(unknown/ummy/*****). 표준 우회=현재 포그라운드 스레드와 대상
    스레드에 우리 스레드 입력을 AttachThreadInput 으로 붙인 뒤 SetForegroundWindow → 락 통과.
    z-order(BringWindowToTop)만으로 충분한 *마우스* 클릭과 달리, *키보드* 는 이 포커스 강제가 필수.
    ctypes 직접 호출(pywin32 AttachThreadInput 노출 불확실 회피)."""
    import ctypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    SW_RESTORE, SW_SHOW = 9, 5
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
    else:
        user32.ShowWindow(hwnd, SW_SHOW)
    fg = user32.GetForegroundWindow()
    cur_thread = kernel32.GetCurrentThreadId()
    fg_thread = user32.GetWindowThreadProcessId(fg, None) if fg else 0
    tgt_thread = user32.GetWindowThreadProcessId(hwnd, None)
    attach_to = {t for t in (fg_thread, tgt_thread) if t and t != cur_thread}
    for t in attach_to:
        user32.AttachThreadInput(cur_thread, t, True)
    try:
        user32.BringWindowToTop(hwnd)
        HWND_TOP, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW = 0, 0x0002, 0x0001, 0x0040
        user32.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
        user32.SetForegroundWindow(hwnd)
        user32.SetActiveWindow(hwnd)
        user32.SetFocus(hwnd)
    finally:
        for t in attach_to:
            user32.AttachThreadInput(cur_thread, t, False)
    return bool(user32.GetForegroundWindow() == hwnd)


def _foreground(win32con: Any, win32gui: Any, hwnd: int) -> None:
    """겹친 1:1 창 중 대상 창을 z-order 최상단 + *키보드 포커스 강제*. 입력/캡처 직전 호출.

    1) AttachThreadInput 로 진짜 포그라운드 강제(키보드 keybd_event 가 이 창에만 떨어지게) →
    2) 실패 대비 pywin32 폴백(ShowWindow/BringWindowToTop/SetWindowPos/SetForegroundWindow).
    마우스 클릭은 z-order 만으로도 맞지만 키보드는 1)이 필수(4창 로그인 자격 깨짐의 실제 원인)."""
    try:
        _force_foreground_attachthreadinput(hwnd)
    except Exception:  # noqa: BLE001
        pass
    swp_nomove = getattr(win32con, "SWP_NOMOVE", 0x0002)
    swp_nosize = getattr(win32con, "SWP_NOSIZE", 0x0001)
    swp_show = getattr(win32con, "SWP_SHOWWINDOW", 0x0040)
    for fn in (
        lambda: win32gui.ShowWindow(hwnd, getattr(win32con, "SW_SHOW", 5)),
        lambda: win32gui.BringWindowToTop(hwnd),
        lambda: win32gui.SetWindowPos(hwnd, getattr(win32con, "HWND_TOP", 0), 0, 0, 0, 0, swp_nomove | swp_nosize | swp_show),
        lambda: win32gui.SetForegroundWindow(hwnd),
    ):
        try:
            fn()
        except Exception:  # noqa: BLE001
            pass
    time.sleep(0.15)


def _capture_shot(hwnd: int, out: Path) -> bool:
    try:
        from tools.logh7_auth_server_e2e import _capture_window  # type: ignore
    except Exception:  # noqa: BLE001
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        return bool(_capture_window(hwnd, out))
    except Exception:  # noqa: BLE001
        return False


def _resolve_hwnd(client: dict[str, Any], win32gui: Any, win32process: Any) -> int:
    hwnd = int(client.get("hwnd") or 0)
    if hwnd and win32gui.IsWindow(hwnd):
        return hwnd
    return find_client_window(win32gui, win32process, int(client["pid"]))


# --------------------------------------------------------------------------- commands


def _link_shared_install_dirs(run_dir: Path) -> list[str]:
    """게임은 cwd(client-K)의 ../data, ../fonts 를 읽는다(EXE 가 exe/ 에서 ../data 참조 — image/model/MsgDat/sound).
    client-K = <run>/client-K 이므로 <run>/data, <run>/fonts 정션을 실제 설치(.omo/work/logh7-installed)로 건다.
    정션(mklink /J)은 관리자 권한 불필요. <run> 은 하네스가 절대 rmtree 하지 않으므로 타깃 삭제 위험 없음."""
    install_root = CLIENT_DIR.parent  # .omo/work/logh7-installed (exe 의 부모)
    linked: list[str] = []
    for sib in ("data", "fonts"):
        target = install_root / sib
        link = run_dir / sib
        if not target.exists():
            continue
        if link.exists():
            linked.append(sib)
            continue
        subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)],
                       capture_output=True, text=True)
        if link.exists():
            linked.append(sib)
    return linked


def cmd_up(args: argparse.Namespace) -> int:
    win32api, win32con, win32gui, win32process = _win32()
    run_dir: Path = _resolve_run_dir(args)
    run_dir.mkdir(parents=True, exist_ok=True)
    n = args.clients
    factions = _parse_factions(args.factions, n)
    # ★게임이 ../data(image/model/MsgDat/sound)를 찾도록 <run>/data, <run>/fonts 정션 생성.
    # 없으면 client-K 에서 ../data 가 안 풀려 클라가 기동 직후 크래시(스모크로 확인된 P0).
    _link_shared_install_dirs(run_dir)

    # 서버 1개 기동(★필수 env 명시). 단일 trace.jsonl 로 모든 connectionId 를 한 파일에 적는다.
    account_db = run_dir / "accounts.db"
    trace_path = run_dir / "trace.jsonl"
    if trace_path.exists():
        trace_path.unlink()
    server_log = run_dir / "server.log"
    server_env = dict(os.environ)
    server_env.update(REQUIRED_SERVER_ENV)
    # ★진영/캐릭터 구분은 "진짜 캐릭터 생성"으로 한다(2026-06-22, 사용자 지시): autologin 부트스트랩은
    #   로그인→로비→세션연결→월드를 default char(1)/power1 로 자동관통해 4클라가 "같은 캐릭터"가 된다.
    #   해법=각 클라가 create-character(0x1008) 플로우로 distinct 진영(제국2·동맹2)+이름을 직접 생성하면
    #   서버가 generatedCharacterId 로 그 캐릭터를 월드진입에 쓴다(서버에 0x1008 핸들러 이미 존재).
    #   따라서 서버측 정체성 위조 env(LOGH_MP_ACCOUNT_ROSTER)는 emit 하지 않는다.
    # ★로그인 인증 모드(2026-06-22 라이브 확정): --account-db 를 붙이면 서버가 acceptAnyGin7=false 가 되어
    #   seeded 계정의 credentialHex 와 *정확 매칭*을 요구한다. 그런데 엔진 로그인 폼이 보내는 GIN7 credential 의
    #   hex 를 우리가 알지 못하므로 폼 로그인이 'credential not registered' 로 전부 reject 된다(connection 4건은
    #   뜨지만 0x7000 가 reject). 표준 ui_explorer 가 폼 로그인에 성공하던 이유 = account-db 미사용(acceptAnyGin7
    #   =true)으로 폼이 친 account label(emp1/emp2/all1/all2)을 그대로 인증하기 때문. 4클라 LAN 테스트도 동일하게
    #   기본 acceptAnyGin7=true 로 띄운다. 정확 credential 매칭이 필요할 때만 --account-db 를 명시.
    if getattr(args, "account_db", False):
        server_env["LOGH_ACCOUNT_DB"] = str(account_db)
    for pair in getattr(args, "env", None) or []:
        if "=" in pair:
            k, v = pair.split("=", 1)
            server_env[k] = v
    log_handle = server_log.open("wb")
    server = _spawn_detached(
        ["node", "src/server/logh7-server.mjs", "serve-auth",
         "--host", "127.0.0.1", "--port", str(SERVER_PORT), "--trace", str(trace_path)],
        ROOT, log_handle, log_handle, env=server_env,
    )
    deadline = time.time() + 12
    ready = False
    while time.time() < deadline:
        if not _process_alive(server.pid):
            log_handle.close()
            raise SystemExit(f"server exited early; log:\n{server_log.read_text(errors='replace')}")
        if server_log.exists() and "listening" in server_log.read_text(errors="replace"):
            ready = True
            break
        time.sleep(0.1)
    log_handle.close()
    if not ready:
        _kill_pids([server.pid])
        raise SystemExit("server did not become ready within 12s")

    # ★자동로그인 모드(--autologin): 클라별로 canonical playable 의 정적 argv 계정 문자열만 바이트 패치해
    #   각 클라가 다른 계정(emp1/emp2/all1/all2)으로 *키보드 없이* 자동 로그인하게 한다. 폼 키보드 로그인은
    #   4창 겹침에서 엔진 폼 ID필드 기본 포커스 미보장으로 계정이 깨져(unknown/dummy) 불안정(2026-06-22 라이브 2회).
    autologin = getattr(args, "autologin", False)
    autologin_exes: dict[str, str] = {}

    clients: list[dict[str, Any]] = []
    for index in range(n):
        account = DEFAULT_ACCOUNTS[index] if index < len(DEFAULT_ACCOUNTS) else f"player{index}"
        if autologin:
            dest = _build_autologin_exe(account)
            autologin_exes[account] = str(dest)
        clone = _clone_client_dir(index, run_dir, account=account if autologin else None)
        client_dir = Path(clone["clientDir"])
        proc = _spawn_detached([str(Path(clone["exe"]))], client_dir, subprocess.DEVNULL, subprocess.DEVNULL)
        # ★splash ~30초 대기: 창이 뜨고 BOTHTEC 스플래시가 끝날 때까지(다음 창 spawn 전에 순차).
        try:
            hwnd = find_client_window(win32gui, win32process, proc.pid)
        except RuntimeError:
            hwnd = 0
        window_info: dict[str, Any] = {}
        if hwnd:
            window_info = _apply_window_mode(win32api, win32con, win32gui, hwnd, index, n)
        clients.append({
            "clientIndex": index,
            "pid": proc.pid,
            "hwnd": hwnd,
            "clientDir": clone["clientDir"],
            "exeSha": clone["exeSha"],
            "exeKind": clone["exeKind"],
            "faction": factions[index].value,
            "account": account,
            "autologin": autologin,
            "window": window_info,
            "splashWaitSec": args.splash,
        })
        # splash 대기(스플래시 ~30초). 마지막 창 후에는 굳이 안 기다린다.
        if index < n - 1:
            time.sleep(args.splash)

    state = {
        "runDir": str(run_dir),
        "port": SERVER_PORT,
        "serverPid": server.pid,
        "serverLog": str(server_log),
        "tracePath": str(trace_path),
        "accountDb": str(account_db),
        "requiredServerEnv": REQUIRED_SERVER_ENV,
        "clients": clients,
        "factions": [f.value for f in factions],
        "autologin": autologin,
        "autologinExes": autologin_exes,
    }
    _save_state(run_dir, state)
    print(json.dumps({"up": state}, ensure_ascii=False, indent=2))
    return 0


def cmd_seed_accounts(args: argparse.Namespace) -> int:
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    account_db = state["accountDb"]
    accounts = [c["account"] for c in state["clients"]] or list(DEFAULT_ACCOUNTS)
    results: list[dict[str, Any]] = []
    for account in accounts:
        # admin create 재사용(scrypt/GIN7 credential 은 서버 admin 이 처리). 패스워드는 stdin.
        proc = subprocess.run(
            ["node", "src/server/logh7-server.mjs", "admin", "create", account,
             "--password-stdin", "--account-db", account_db],
            cwd=ROOT, input=DEFAULT_PASSWORD, capture_output=True, text=True,
        )
        results.append({
            "account": account,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip() or None,
            "created": proc.returncode == 0 or "already exists" in (proc.stderr or ""),
        })
    print(json.dumps({"seedAccounts": {"accountDb": account_db, "results": results}}, ensure_ascii=False, indent=2))
    return 0 if all(r["created"] for r in results) else 1


def cmd_login_all(args: argparse.Namespace) -> int:
    win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    reports: list[dict[str, Any]] = []
    # ★순차 입력 직렬화: 클라마다 SetForeground → window_login → 다음 클라(전역 입력 충돌 방지).
    for client in state["clients"]:
        hwnd = _resolve_hwnd(client, win32gui, win32process)
        driver = _SerialInputDriver(hwnd=hwnd, win32api=win32api, win32con=win32con, win32gui=win32gui)
        spec = LoginSpec(account=client["account"], password=DEFAULT_PASSWORD)
        run = run_login_flow(driver, spec, settle=args.settle)
        reports.append({"clientIndex": client["clientIndex"], "account": client["account"], "flow": run.to_json()})
    print(json.dumps({"loginAll": reports}, ensure_ascii=False, indent=2))
    return 0


def cmd_create_all(args: argparse.Namespace) -> int:
    win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    reports: list[dict[str, Any]] = []
    only = args.client
    for client in state["clients"]:
        idx = client["clientIndex"]
        if only is not None and idx != only:
            continue
        hwnd = _resolve_hwnd(client, win32gui, win32process)
        driver = _SerialInputDriver(hwnd=hwnd, win32api=win32api, win32con=win32con, win32gui=win32gui)
        try:
            faction = parse_faction(client["faction"])
        except InvalidFactionError as exc:
            raise SystemExit(str(exc)) from exc
        # ★상호작용 E2E: 4명이 같은 게임 세션에 들어가야 서로 보이고 전투한다 → session_row 고정(기본 1).
        #   (예전 "같은 세션 공유=충돌" 주석은 캐릭터 생성 충돌 오해였고, 멀티플레이 세션은 공유가 정상.)
        spec = CharacterFlowSpec(
            session_row=args.session_row,
            faction=faction,
            lastname=args.lastname or f"P{idx}",
            firstname=args.firstname or client["account"],
            flagship=args.flagship or "Brunhild",
        )
        run = run_create_character_flow(driver, spec, settle=args.settle)
        reports.append({"clientIndex": idx, "faction": client["faction"], "flow": run.to_json()})
    print(json.dumps({"createAll": reports}, ensure_ascii=False, indent=2))
    return 0


def cmd_world_all(args: argparse.Namespace) -> int:
    win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    reports: list[dict[str, Any]] = []
    for client in state["clients"]:
        hwnd = _resolve_hwnd(client, win32gui, win32process)
        driver = _SerialInputDriver(hwnd=hwnd, win32api=win32api, win32con=win32con, win32gui=win32gui)
        # 세션 0x2006 더블클릭(세션 picker row → 더블클릭 → 0x0200 세션연결 → 월드진입).
        row = client["clientIndex"] + 1
        rx, ry = 745, 258 + ((row - 1) * 84)
        driver.click(128, 258, label="menu-session", settle=args.settle)
        driver.click(rx, ry, label=f"session-row-{row}-first", settle=args.settle)
        driver.click(rx, ry, label=f"session-row-{row}-second", settle=max(args.settle, 2.0))
        reports.append({"clientIndex": client["clientIndex"], "row": row, "rowPoint": [rx, ry]})
    print(json.dumps({"worldAll": reports}, ensure_ascii=False, indent=2))
    return 0


def cmd_drive(args: argparse.Namespace) -> int:
    win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    clients = state["clients"]
    if args.client < 0 or args.client >= len(clients):
        raise SystemExit(f"--client out of range 0..{len(clients) - 1}")
    client = clients[args.client]
    hwnd = _resolve_hwnd(client, win32gui, win32process)
    driver = _SerialInputDriver(hwnd=hwnd, win32api=win32api, win32con=win32con, win32gui=win32gui)
    if args.action == "click":
        report = driver.click(args.x, args.y, label=args.label or f"click-{args.x}-{args.y}", settle=args.settle)
    elif args.action == "text":
        report = driver.text(args.value, label=args.label or "text", settle=args.settle)
    elif args.action == "key":
        token = args.value.upper()
        vk = VK_NAMES.get(token)
        if vk is None:
            vk = int(args.value, 0)
        driver._focus()
        # ★인-월드 키는 keybd_event(하드웨어). GetAsyncKeyState 폴링용(RE 2026-06-20).
        KEYEVENTF_KEYUP = 0x0002
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.05)
        win32api.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(args.settle)
        report = {"action": "key", "vk": f"0x{vk:02x}", "name": token}
    else:
        raise SystemExit(f"unknown drive action: {args.action}")
    print(json.dumps({"drive": {"clientIndex": args.client, **report}}, ensure_ascii=False, indent=2))
    return 0


def _tap_vk(win32api: Any, vk: int, *, hold: float = 0.04, after: float = 0.06) -> None:
    """단일 VK 를 keybd_event(하드웨어) 로 down+up. 엔진 폼은 GetAsyncKeyState 폴링이라 하드웨어만 도달."""
    KEYEVENTF_KEYUP = 0x0002
    win32api.keybd_event(vk, 0, 0, 0)
    time.sleep(hold)
    win32api.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(after)


def cmd_keyboard_login_all(args: argparse.Namespace) -> int:
    """엔진 렌더 로그인 폼에 키보드(하드웨어 keybd_event)로 클라별 자격을 입력해 순차 로그인한다.

    ★근본(2026-06-22 라이브 확정): 마우스 클릭은 엔진 렌더 폼의 필드 포커스/버튼을 잡지 못한다
    ([[logh7-c002-mouse-edge]] 마우스 입력레이어 한계와 동일). 키보드 하드웨어 입력만 폼에 도달한다
    (클라가 GetAsyncKeyState 폴링). 기본 포커스=ID 필드 → account 입력 → TAB → password → ENTER.
    서버는 accept-any-GIN7 모드여야 폼이 친 account label 로 인증한다(--account-db 없이 `up`).
    절대 동시 입력 금지 — 클라마다 _focus 후 한 클라씩 직렬 처리(전역 keybd_event 충돌 방지).
    """
    win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    password = args.password
    only = args.client
    reports: list[dict[str, Any]] = []
    for client in state["clients"]:
        idx = client["clientIndex"]
        if only is not None and idx != only:
            continue
        account = client.get("account") or (DEFAULT_ACCOUNTS[idx] if idx < len(DEFAULT_ACCOUNTS) else f"player{idx}")
        hwnd = _resolve_hwnd(client, win32gui, win32process)
        driver = _SerialInputDriver(hwnd=hwnd, win32api=win32api, win32con=win32con, win32gui=win32gui)
        driver._focus()
        time.sleep(0.25)
        # 1) ID 필드 잔여 텍스트 제거(엔진 폼은 마지막 글자부터 지우므로 BACKSPACE 다수).
        for _ in range(args.clear):
            _tap_vk(win32api, 0x08, hold=0.01, after=0.012)
        # 2) account 입력. compensate_first(label="login-account-text")=첫 글자 드롭 보정(eemp1→emp1).
        driver.text(account, label="login-account-text", settle=0.25)
        # 3) TAB 으로 PW 필드 이동(클릭은 포커스 이동 못 함 — TAB 만 동작).
        _tap_vk(win32api, 0x09, after=0.18)
        # 4) PW 필드 잔여 제거.
        for _ in range(args.clear):
            _tap_vk(win32api, 0x08, hold=0.01, after=0.012)
        # 5) password 입력(검증만 — 실제 자격은 GIN7 credential 의 account label).
        driver.text(password, label="login-password-text", settle=0.25)
        # 6) ENTER 제출.
        _tap_vk(win32api, 0x0D, after=args.settle)
        reports.append({"clientIndex": idx, "account": account, "passwordLen": len(password)})
    print(json.dumps({"keyboardLoginAll": reports}, ensure_ascii=False, indent=2))
    return 0


def cmd_trace(args: argparse.Namespace) -> int:
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    events = _read_trace_events(Path(state["tracePath"]))
    buckets = _split_trace_by_connection(events)
    if args.client is not None:
        key = str(args.client)
        out = {"connectionId": args.client, "events": buckets.get(key, []), "count": len(buckets.get(key, []))}
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    # 분할 덤프: connectionId 별 디렉토리에 파일로 쓰고 요약 출력.
    split_dir = run_dir / "trace-split"
    split_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, int] = {}
    for key, evs in buckets.items():
        (split_dir / f"conn-{key}.jsonl").write_text(
            "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in evs), encoding="utf-8"
        )
        summary[key] = len(evs)
    print(json.dumps({"trace": {"totalEvents": len(events), "splitDir": str(split_dir), "perConnection": summary}}, ensure_ascii=False, indent=2))
    return 0


def cmd_verify_visibility(args: argparse.Namespace) -> int:
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    events = _read_trace_events(Path(state["tracePath"]))
    analysis = _analyze_visibility(events)
    analysis["requiredServerEnv"] = state.get("requiredServerEnv", REQUIRED_SERVER_ENV)
    print(json.dumps({"verifyVisibility": analysis}, ensure_ascii=False, indent=2))
    return 0 if analysis["crossPlayerVisibilityObserved"] else 1


def cmd_shot_all(args: argparse.Namespace) -> int:
    _win32api, win32con, win32gui, win32process = _win32()
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    shots: list[dict[str, Any]] = []
    for client in state["clients"]:
        try:
            hwnd = _resolve_hwnd(client, win32gui, win32process)
        except RuntimeError:
            shots.append({"clientIndex": client["clientIndex"], "captured": False, "reason": "window-not-found"})
            continue
        # ★겹친 1:1 창은 가려지면 D3D8 표면이 검게 캡처됨 → 캡처 직전 대상 창을 최상단으로.
        _foreground(win32con, win32gui, hwnd)
        time.sleep(0.35)
        out = run_dir / f"client-{client['clientIndex']}" / "shots" / f"{time.strftime('%H%M%S')}.png"
        ok = _capture_shot(hwnd, out)
        shots.append({"clientIndex": client["clientIndex"], "captured": ok, "path": str(out) if ok else None})
    print(json.dumps({"shotAll": shots}, ensure_ascii=False, indent=2))
    return 0


def cmd_down(args: argparse.Namespace) -> int:
    run_dir = _resolve_run_dir(args)
    state = _load_state(run_dir)
    targets = _select_kill_targets(state)
    # ★PID-scoped: 이 run 의 서버+클라 PID 만(다른 워크플로/node 보존).
    results = _kill_pids(targets)
    state["stopped"] = True
    state["downResults"] = results
    _save_state(run_dir, state)
    print(json.dumps({"down": {"killedPids": targets, "results": results}}, ensure_ascii=False, indent=2))
    return 0


def cmd_selftest(args: argparse.Namespace) -> int:
    """실클라 없이 가능한 셀프테스트: cwd복제 계획·argv조립·PID-scoped kill 대상선정·trace분할·가시성판정."""
    failures: list[str] = []
    checks: list[dict[str, Any]] = []

    def check(name: str, ok: bool, detail: Any = None) -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})
        if not ok:
            failures.append(name)

    # 1) PID-scoped kill 대상선정: 서버+클라 PID 만 모으고 invalid 제외.
    fake_state = {"serverPid": 1111, "clients": [{"pid": 2222}, {"pid": 3333}, {"pid": 0}, {"pid": -5}]}
    targets = _select_kill_targets(fake_state)
    check("kill-targets-pid-scoped", targets == [1111, 2222, 3333], targets)

    # 2) cwd 복제 계획: client-K 디렉토리 + EXE/런타임파일 매핑.
    tmp_run = Path(args.run).resolve() if args.run else (DEFAULT_RUN_ROOT / "selftest")
    plan0 = _clone_plan(0, tmp_run)
    plan3 = _clone_plan(3, tmp_run)
    check("clone-plan-dir-0", plan0["clientDir"].endswith("client-0"), plan0["clientDir"])
    check("clone-plan-dir-3", plan3["clientDir"].endswith("client-3"), plan3["clientDir"])
    check("clone-plan-exe-dest", plan0["exe"]["dest"].endswith("G7MTClient.exe"), plan0["exe"]["dest"])
    check("clone-plan-graphicconfig-listed",
          any(f["name"] == "GraphicConfig.txt" for f in plan0["files"]),
          [f["name"] for f in plan0["files"]])

    # 3) GraphicConfig 축소해상도 변환(키 다음 줄 값 교체).
    sample = "EasyGraphicConfigFile\nScreenWidth\n1920\nScreenHeight\n1080\nScreenBit\n0\n"
    reduced = _reduced_graphic_config(sample, 1280, 720)
    check("graphicconfig-width-reduced", "ScreenWidth\n1280\n" in reduced, reduced)
    check("graphicconfig-height-reduced", "ScreenHeight\n720\n" in reduced, reduced)
    check("graphicconfig-screenbit-untouched", "ScreenBit\n0\n" in reduced, reduced)

    # 4) factions argv 조립.
    factions = _parse_factions("empire,empire,alliance,alliance", 4)
    check("factions-parse-2v2",
          [f.value for f in factions] == ["empire", "empire", "alliance", "alliance"],
          [f.value for f in factions])
    try:
        _parse_factions("empire,empire", 4)
        check("factions-count-mismatch-rejected", False, "no error raised")
    except SystemExit:
        check("factions-count-mismatch-rejected", True)

    # 5) connectionId trace 분할.
    sample_events = [
        {"event": "boot"},  # connectionId 없음 → _global
        {"event": "login-message", "connectionId": 0},
        {"event": "relay-deliver", "connectionId": 1, "code": "0x0325"},
        {"event": "relay-broadcast", "connectionId": 0, "code": "0x0426"},
    ]
    buckets = _split_trace_by_connection(sample_events)
    check("trace-split-global-bucket", len(buckets.get("_global", [])) == 1, list(buckets.keys()))
    check("trace-split-conn0", len(buckets.get("0", [])) == 2, len(buckets.get("0", [])))
    check("trace-split-conn1", len(buckets.get("1", [])) == 1, len(buckets.get("1", [])))

    # 6) 가시성 판정: relay 이벤트의 0x0325/0x0426 잡고, 0x0313 은 무시.
    vis_events = [
        {"event": "relay-deliver", "connectionId": 1, "code": "0x0325"},
        {"event": "relay-broadcast", "connectionId": 0, "code": "0x0426"},
        {"event": "login-marker", "connectionId": 0, "code": "0x0313"},  # ★무시되어야 함
    ]
    vis = _analyze_visibility(vis_events)
    check("visibility-0325-detected", vis["visibilityCodeHits"]["0x0325"] == 1, vis["visibilityCodeHits"])
    check("visibility-0426-detected", vis["visibilityCodeHits"]["0x0426"] == 1, vis["visibilityCodeHits"])
    check("visibility-0313-ignored", vis["ignored0313LoginMarkerHits"] == 1, vis["ignored0313LoginMarkerHits"])
    check("visibility-cross-player-observed", vis["crossPlayerVisibilityObserved"] is True, vis)
    # 가시성 없는 케이스(relay 에 0x0313 만) → False.
    vis_none = _analyze_visibility([{"event": "relay-deliver", "connectionId": 1, "code": "0x0313"}])
    check("visibility-only-0313-not-observed", vis_none["crossPlayerVisibilityObserved"] is False, vis_none)

    result = {"selftest": {"passed": len(checks) - len(failures), "total": len(checks), "failures": failures, "checks": checks}}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


# --------------------------------------------------------------------------- helpers / argparse


def _parse_factions(spec: str, n: int) -> list[CharacterFaction]:
    if spec:
        tokens = [t.strip() for t in spec.split(",") if t.strip()]
    else:
        tokens = list(DEFAULT_FACTIONS[:n])
    if len(tokens) != n:
        raise SystemExit(f"--factions must list exactly {n} factions (got {len(tokens)}): {spec}")
    out: list[CharacterFaction] = []
    for token in tokens:
        try:
            out.append(parse_faction(token))
        except InvalidFactionError as exc:
            raise SystemExit(str(exc)) from exc
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", type=str, default=None, help="run 디렉토리(생략 시 up=새 run-id, 그 외=최근 run)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_up = sub.add_parser("up", help="cwd 복제 + 서버 기동 + 클라 순차 spawn")
    p_up.add_argument("--clients", type=int, default=4)
    p_up.add_argument("--factions", type=str, default="empire,empire,alliance,alliance")
    p_up.add_argument("--splash", type=float, default=30.0, help="창당 splash 대기 초(BOTHTEC ~30s)")
    p_up.add_argument("--env", action="append", default=[], help="KEY=VAL 추가 서버 env(반복)")
    p_up.add_argument("--account-db", action="store_true",
                      help="서버를 acceptAnyGin7=false(seeded credential 정확매칭)로 기동. 기본은 미지정"
                           "(=acceptAnyGin7=true)이라 엔진 폼이 친 account label 로 바로 인증한다.")
    p_up.add_argument("--autologin", action="store_true",
                      help="클라별 자동로그인 EXE 빌드(canonical playable 의 정적 argv 계정 문자열을 account 로 "
                           "바이트 패치)로 키보드 없이 각 클라가 다른 계정 자동 로그인. 폼 키보드 로그인 불안정 해소.")
    p_up.set_defaults(func=cmd_up)

    p_seed = sub.add_parser("seed-accounts", help="admin create 로 클라별 계정 시드")
    p_seed.set_defaults(func=cmd_seed_accounts)

    p_login = sub.add_parser("login-all", help="순차 window-login 으로 클라별 계정 로그인")
    p_login.add_argument("--settle", type=float, default=2.0)
    p_login.set_defaults(func=cmd_login_all)

    p_create = sub.add_parser("create-all", help="클라별 ui_flow 캐릭터 생성(faction 반영)")
    p_create.add_argument("--client", type=int, default=None, help="특정 clientIndex 만(생략 시 전체)")
    p_create.add_argument("--session-row", type=int, default=1, help="모든 클라가 들어갈 세션 행(기본 1, 상호작용용 공유)")
    p_create.add_argument("--lastname", default=None)
    p_create.add_argument("--firstname", default=None)
    p_create.add_argument("--flagship", default=None)
    p_create.add_argument("--settle", type=float, default=1.0)
    p_create.set_defaults(func=cmd_create_all)

    p_world = sub.add_parser("world-all", help="세션 더블클릭 → 월드 진입")
    p_world.add_argument("--settle", type=float, default=1.5)
    p_world.set_defaults(func=cmd_world_all)

    p_drive = sub.add_parser("drive", help="단일 클라에 click/key/text 1회(순차 입력)")
    p_drive.add_argument("--client", type=int, required=True)
    p_drive.add_argument("action", choices=["click", "key", "text"])
    p_drive.add_argument("x", type=int, nargs="?", default=0)
    p_drive.add_argument("y", type=int, nargs="?", default=0)
    p_drive.add_argument("--value", default="", help="key 이름/VK 또는 text 문자열")
    p_drive.add_argument("--label", default=None)
    p_drive.add_argument("--settle", type=float, default=0.8)
    p_drive.set_defaults(func=cmd_drive)

    p_klogin = sub.add_parser("keyboard-login-all",
                              help="키보드(하드웨어) 로 클라별 자격 로그인 — 마우스 안 통하는 엔진 폼용")
    p_klogin.add_argument("--client", type=int, default=None, help="특정 clientIndex 만(생략 시 전체 순차)")
    p_klogin.add_argument("--password", default=DEFAULT_PASSWORD)
    p_klogin.add_argument("--clear", type=int, default=18, help="필드 잔여제거용 BACKSPACE 횟수")
    p_klogin.add_argument("--settle", type=float, default=0.8, help="ENTER 제출 후 대기 초")
    p_klogin.set_defaults(func=cmd_keyboard_login_all)

    p_trace = sub.add_parser("trace", help="단일 trace.jsonl 을 connectionId 로 분할")
    p_trace.add_argument("--client", type=int, default=None, help="특정 connectionId 만(생략 시 전체 분할 덤프)")
    p_trace.add_argument("--split", action="store_true", help="명시적 분할 덤프(기본 동작과 동일)")
    p_trace.set_defaults(func=cmd_trace)

    p_vis = sub.add_parser("verify-visibility", help="relay-deliver 로 타플레이어 0x0325/0x0323/0x0426 검사")
    p_vis.set_defaults(func=cmd_verify_visibility)

    sub.add_parser("shot-all", help="모든 클라 스크린샷").set_defaults(func=cmd_shot_all)
    sub.add_parser("down", help="run 의 모든 PID PID-scoped 종료").set_defaults(func=cmd_down)
    sub.add_parser("selftest", help="실클라 없이 순수로직 셀프테스트").set_defaults(func=cmd_selftest)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
