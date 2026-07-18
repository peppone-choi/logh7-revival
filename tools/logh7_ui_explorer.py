from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from tools.live.lineage_guard import check_client_lineage, check_client_lineage_set

# ctypes 타입 별칭 (wintypes는 Windows 전용이므로 폴백 제공)
try:
    from ctypes import wintypes as _wintypes  # type: ignore[attr-defined]
    _CT_WORD  = _wintypes.WORD
    _CT_DWORD = _wintypes.DWORD
except (ImportError, AttributeError):
    _CT_WORD  = ctypes.c_uint16  # type: ignore[assignment]
    _CT_DWORD = ctypes.c_uint32  # type: ignore[assignment]

# ─── SendInput / keybd_event 상수 ────────────────────────────────────────────
_KEYEVENTF_KEYUP   = 0x0002
_KEYEVENTF_UNICODE = 0x0004
_INPUT_KEYBOARD    = 1


class _KEYBDINPUT(ctypes.Structure):
    """KEYBDINPUT 구조체 (winuser.h)."""

    _fields_ = [
        ("wVk",         _CT_WORD),
        ("wScan",       _CT_WORD),
        ("dwFlags",     _CT_DWORD),
        ("time",        _CT_DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class _INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("ki",   _KEYBDINPUT),
        # MOUSEINPUT(64비트=32B)이 union 최대 멤버 → INPUT cbSize=40 이어야 SendInput 수락.
        # 24로 두면 sizeof(_INPUT)=32 ≠ 40 → SendInput 이 ERROR_INVALID_PARAMETER(87)로 거부(sent=0).
        ("_pad", ctypes.c_byte * 32),
    ]


class _INPUT(ctypes.Structure):
    """SendInput 에 넘기는 INPUT 구조체."""

    _fields_ = [
        ("type",   _CT_DWORD),
        ("_input", _INPUT_UNION),
    ]

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SESSION = ROOT / ".omo/ui-explorer/session"
PREPARE_STRATEGY_UI_CLIENT = ROOT / "tools/live/prepare_strategy_ui_client.mjs"
DESCRIPTION = "Minimal LOGH VII live UI driver restored from 5bd249c."

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_BREAKAWAY_FROM_JOB = 0x01000000

# lineage 게이트가 launch를 차단할 때의 종료 코드 (hash·image base·sentinel 불일치).
LINEAGE_MISMATCH_EXIT = 3

VK_NAMES: dict[str, int] = {
    "ENTER": 0x0D,
    "RETURN": 0x0D,
    "ESC": 0x1B,
    "ESCAPE": 0x1B,
    "TAB": 0x09,
    "SPACE": 0x20,
    "BACK": 0x08,
    "BACKSPACE": 0x08,
    "DELETE": 0x2E,
    "DEL": 0x2E,
    "UP": 0x26,
    "DOWN": 0x28,
    "LEFT": 0x25,
    "RIGHT": 0x27,
    "HOME": 0x24,
    "END": 0x23,
    "PAGEUP": 0x21,
    "PAGEDOWN": 0x22,
    "F1": 0x70,
    "F2": 0x71,
    "F3": 0x72,
    "F4": 0x73,
    "F5": 0x74,
    "F6": 0x75,
    "F7": 0x76,
    "F8": 0x77,
    "F9": 0x78,
    "F10": 0x79,
    "F11": 0x7A,
    "F12": 0x7B,
}


def _require_windows() -> None:
    if sys.platform != "win32":
        raise SystemExit("logh7_ui_explorer requires Windows")


def _require_pywin32() -> tuple[Any, Any, Any, Any]:
    _require_windows()
    try:
        import win32api  # type: ignore[import-not-found]
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]
        import win32process  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit(f"pywin32 is required: {exc}") from exc
    return win32api, win32con, win32gui, win32process


def _session_path(session: Path) -> Path:
    return session / "session.json"


def _timestamp() -> str:
    return datetime.now(UTC).astimezone().strftime("%Y%m%d-%H%M%S")


def _json_default(value: Any) -> str:
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"unsupported JSON value: {type(value)!r}")


def _save_session(session: Path, state: dict[str, Any]) -> None:
    session.mkdir(parents=True, exist_ok=True)
    _session_path(session).write_text(
        json.dumps(state, ensure_ascii=False, indent=2, default=_json_default) + "\n",
        encoding="utf-8",
    )


def _load_session(session: Path) -> dict[str, Any]:
    path = _session_path(session)
    if not path.exists():
        raise SystemExit(f"no active session at {session} (run `start` first)")
    return json.loads(path.read_text(encoding="utf-8"))


def _process_alive(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    if sys.platform == "win32":
        completed = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            return False
        output = completed.stdout.strip()
        return bool(output) and not output.startswith("INFO:")
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _taskkill_pid(pid: int | None) -> bool:
    if not _process_alive(pid):
        return False
    subprocess.run(
        ["taskkill", "/F", "/PID", str(pid)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    for _ in range(10):
        if not _process_alive(pid):
            return True
        time.sleep(0.2)
    return False


def _window_rect(win32gui: Any, hwnd: int) -> dict[str, int]:
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    return {
        "left": int(left),
        "top": int(top),
        "right": int(right),
        "bottom": int(bottom),
        "width": int(right - left),
        "height": int(bottom - top),
    }


def find_client_window(
    win32gui: Any,
    win32process: Any,
    pid: int,
    *,
    title_substring: str | None = None,
) -> int:
    matches: list[tuple[int, int]] = []
    needle = title_substring.casefold() if title_substring else None

    def callback(hwnd: int, _extra: int) -> bool:
        if not win32gui.IsWindowVisible(hwnd):
            return True
        _, window_pid = win32process.GetWindowThreadProcessId(hwnd)
        if window_pid != pid:
            return True
        title = win32gui.GetWindowText(hwnd) or ""
        if needle and needle not in title.casefold():
            return True
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        area = max(0, right - left) * max(0, bottom - top)
        if area <= 0:
            return True
        matches.append((area, hwnd))
        return True

    win32gui.EnumWindows(callback, 0)
    if not matches:
        raise LookupError(f"no visible top-level window found for pid {pid}")
    matches.sort()
    return matches[-1][1]


def _wait_for_window(
    pid: int,
    *,
    timeout: float,
    title_substring: str | None = None,
) -> int:
    _, _, win32gui, win32process = _require_pywin32()
    deadline = time.time() + timeout
    last_error = "window-not-found"
    while time.time() < deadline:
        try:
            return find_client_window(
                win32gui,
                win32process,
                pid,
                title_substring=title_substring,
            )
        except LookupError as exc:
            last_error = str(exc)
            time.sleep(0.25)
    raise SystemExit(last_error)


def _resolve_hwnd(state: dict[str, Any]) -> int:
    _, _, win32gui, win32process = _require_pywin32()
    hwnd = int(state.get("hwnd") or 0)
    if hwnd and win32gui.IsWindow(hwnd):
        return hwnd
    pid = int(state.get("clientPid") or 0)
    if not _process_alive(pid):
        raise SystemExit("client process is no longer running")
    title_substring = state.get("titleSubstring")
    hwnd = find_client_window(win32gui, win32process, pid, title_substring=title_substring)
    state["hwnd"] = hwnd
    return hwnd


def _force_foreground(win32gui: Any, hwnd: int) -> bool:
    """대상 창을 포그라운드로 확정한다. 실제 전환이 확인되면 True.

    SetForegroundWindow 는 다른 스레드가 활성이거나 활성화 잠금이 걸리면
    조용히 실패할 수 있어, GetForegroundWindow 로 확인하며 짧게 재시도한다.
    전환 직후 포커스가 안정될 시간을 주지 않으면 첫 하드웨어 입력이
    활성화 레이스에 흡수돼 첫 글자가 누락된다(로그인 id 첫 글자 손실).
    """
    for _ in range(5):
        try:
            win32gui.ShowWindow(hwnd, 5)
            win32gui.SetForegroundWindow(hwnd)
        except Exception:
            pass
        try:
            if win32gui.GetForegroundWindow() == hwnd:
                return True
        except Exception:
            return False
        time.sleep(0.02)
    return False


def _capture_window(hwnd: int, output_path: Path) -> dict[str, Any]:
    _require_windows()
    from PIL import ImageGrab

    _, _, win32gui, _ = _require_pywin32()
    rect = _window_rect(win32gui, hwnd)
    bbox = (
        rect["left"],
        rect["top"],
        rect["right"],
        rect["bottom"],
    )
    image = ImageGrab.grab(bbox=bbox, all_screens=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return {
        "screenshotPath": str(output_path),
        "windowRect": rect,
        "title": win32gui.GetWindowText(hwnd),
    }


def _send_named_key(hwnd: int, key_name: str) -> dict[str, Any]:
    """PostMessage 경로로 가상키 전송 (레거시)."""
    win32api, win32con, win32gui, _ = _require_pywin32()
    normalized = key_name.upper()
    if normalized not in VK_NAMES:
        raise SystemExit(f"unknown key name: {key_name}")
    _force_foreground(win32gui, hwnd)
    vk = VK_NAMES[normalized]
    win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, 0)
    win32api.PostMessage(hwnd, win32con.WM_KEYUP, vk, 0)
    return {"mode": "virtual-key", "key": normalized, "vk": vk}


def _send_text(hwnd: int, text: str) -> dict[str, Any]:
    """PostMessage WM_CHAR 경로로 텍스트 전송 (레거시)."""
    _, win32con, win32gui, _ = _require_pywin32()
    _force_foreground(win32gui, hwnd)
    for char in text:
        win32gui.PostMessage(hwnd, win32con.WM_CHAR, ord(char), 0)
        time.sleep(0.01)
    return {"mode": "text", "text": text, "count": len(text)}


# ─── 하드웨어 입력 경로 (SendInput / keybd_event) ────────────────────────────

_VK_BACK = 0x08  # Backspace — 워밍업 더미 문자를 자기상쇄로 지운다
_WARMUP_DUMMY_CHAR = "x"  # 무해한 단일 unicode 문자 (파이프라인 워밍용)


def _build_type_sequence(text: str, *, warmup: bool = True) -> list[dict[str, Any]]:
    """하드웨어 타이핑 시퀀스를 순수 데이터로 구성한다(Win32 실호출 없음).

    창 세션에서 첫 KEYEVENTF_UNICODE 주입이 삼켜져 첫 실문자가 누락되는
    문제(라이브 재검증으로 확정: `inei00` → `nei00`)를 막기 위해, 실문자
    앞에 자기상쇄(self-cancelling) unicode 워밍업을 prepend 한다:

      [더미 unicode 문자][VK_BACK Backspace]

    더미는 반드시 실문자와 동일한 unicode 주입 방식(KEYEVENTF_UNICODE,
    wScan=ord(ch))이라야 파이프라인을 워밍한다. 두 경우 모두 결정적으로
    필드에는 진짜 문자만 남는다:
      - 더미가 첫 unicode로 삼켜지면 → 필드는 비고, Backspace 는 빈 필드
        no-op → 실문자 전부 land.
      - 더미가 land 하면 → Backspace 가 지움 → 실문자 전부 land.
    Backspace 는 삼킴 대상(첫 unicode)이 아니므로 VK_BACK 로 정상 동작한다.

    반환 항목: {"kind": "warmup"|"char", "char": str|None, "vk": int,
                "scan": int, "unicode": bool}
    """
    seq: list[dict[str, Any]] = []
    if warmup:
        seq.append(
            {
                "kind": "warmup",
                "char": _WARMUP_DUMMY_CHAR,
                "vk": 0,
                "scan": ord(_WARMUP_DUMMY_CHAR),
                "unicode": True,
            }
        )
        seq.append(
            {"kind": "warmup", "char": None, "vk": _VK_BACK, "scan": 0, "unicode": False}
        )
    for ch in text:
        seq.append(
            {"kind": "char", "char": ch, "vk": 0, "scan": ord(ch), "unicode": True}
        )
    return seq


def _hw_type_text(hwnd: int, text: str, *, warmup: bool = True) -> dict[str, Any]:
    """SendInput + KEYEVENTF_UNICODE 로 유니코드 문자열 하드웨어 타이핑.

    PostMessage WM_CHAR 와 달리 GetAsyncKeyState 등에도 반영되므로
    레거시 Win32 로그인 폼 PW 필드 포커스 문제를 우회한다. 첫 실문자 앞에
    자기상쇄 unicode 워밍업(더미 문자+Backspace)을 넣어, 창 세션의 첫
    KEYEVENTF_UNICODE 주입이 삼켜져 첫 글자가 누락되는 문제를 방지한다.
    """
    _, _, win32gui, _ = _require_pywin32()
    foreground = _force_foreground(win32gui, hwnd)
    time.sleep(0.05)  # 포그라운드 전환 후 포커스 안정 대기

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    pair = (_INPUT * 2)()
    sent_total = 0

    for event in _build_type_sequence(text, warmup=warmup):
        down_flags = _KEYEVENTF_UNICODE if event["unicode"] else 0
        up_flags = down_flags | _KEYEVENTF_KEYUP
        # key down
        pair[0].type = _INPUT_KEYBOARD
        pair[0]._input.ki.wVk   = event["vk"]
        pair[0]._input.ki.wScan = event["scan"]
        pair[0]._input.ki.dwFlags = down_flags
        pair[0]._input.ki.time  = 0
        # key up
        pair[1].type = _INPUT_KEYBOARD
        pair[1]._input.ki.wVk   = event["vk"]
        pair[1]._input.ki.wScan = event["scan"]
        pair[1]._input.ki.dwFlags = up_flags
        pair[1]._input.ki.time  = 0

        sent = user32.SendInput(2, pair, ctypes.sizeof(_INPUT))
        if event["kind"] == "char":
            sent_total += sent
        time.sleep(0.015)  # 문자 간 딜레이 (구형 Win32 앱 처리 여유)

    return {
        "mode": "hw-unicode",
        "text": text,
        "chars": len(text),
        "sent": sent_total,
        "warmup": warmup,
        "foreground": foreground,
    }


def _hw_send_key(hwnd: int, key_name: str) -> dict[str, Any]:
    """keybd_event 로 가상키 하드웨어 입력 (TAB·ENTER·ESC 등).

    keybd_event 는 SendInput 보다 구형이지만 모든 Win32 앱에서 작동하며
    GetAsyncKeyState 에도 반영된다.
    """
    _, _, win32gui, _ = _require_pywin32()
    normalized = key_name.upper()
    if normalized not in VK_NAMES:
        raise SystemExit(f"unknown key name: {key_name}")
    _force_foreground(win32gui, hwnd)
    time.sleep(0.05)

    vk = VK_NAMES[normalized]
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.keybd_event(vk, 0, 0, 0)                      # key down
    time.sleep(0.02)
    user32.keybd_event(vk, 0, _KEYEVENTF_KEYUP, 0)       # key up
    return {"mode": "hw-vkey", "key": normalized, "vk": vk}


def _click_window(hwnd: int, x: int, y: int) -> dict[str, Any]:
    win32api, win32con, win32gui, _ = _require_pywin32()
    _force_foreground(win32gui, hwnd)
    left, top, _, _ = win32gui.GetWindowRect(hwnd)
    screen_x = int(left) + int(x)
    screen_y = int(top) + int(y)
    win32api.SetCursorPos((screen_x, screen_y))
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, screen_x, screen_y, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, screen_x, screen_y, 0, 0)
    return {"mode": "hardware-click", "x": int(x), "y": int(y), "screenX": screen_x, "screenY": screen_y}


def _observe(session: Path, state: dict[str, Any], label: str, settle: float) -> dict[str, Any]:
    if settle > 0:
        time.sleep(settle)
    hwnd = _resolve_hwnd(state)
    state["hwnd"] = hwnd
    screenshot_path = session / "shots" / f"{_timestamp()}-{_sanitize_label(label)}.png"
    report = {
        "session": str(session),
        "label": label,
        "settle": settle,
        "clientPid": state.get("clientPid"),
        "hwnd": hwnd,
        "capturedAt": datetime.now(UTC).astimezone().isoformat(),
    }
    report.update(_capture_window(hwnd, screenshot_path))
    _save_session(session, state)
    return report


def _sanitize_label(label: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in label.strip())
    return cleaned.strip("-") or "shot"


def _prepare_default_client() -> tuple[Path, dict[str, Any]]:
    completed = subprocess.run(
        ["node", str(PREPARE_STRATEGY_UI_CLIENT)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=True,
    )
    receipt: dict[str, Any] = json.loads(completed.stdout)
    exe = Path(receipt["path"]).resolve()
    receipt["path"] = str(exe)
    receipt["selectionMode"] = "default-overlay"
    return exe, receipt


def _enforce_lineage_gate(session: Path, exe: Path, manifest_path: Path) -> int | None:
    """manifest가 주어지면 launch 전에 lineage를 강제한다(fail-closed).

    대상 EXE의 sha256·PE image base·sentinel을 manifest ``working`` 블록과
    대조해 하나라도 불일치하거나 검증 불가면 launch를 막고, 근거를 담은
    blocked receipt(JSON)를 session에 남긴 뒤 non-zero exit code를 돌려준다.
    전부 일치하면 ``None``을 돌려줘 정상 launch를 이어가게 한다.
    """
    reason: str | None = None
    working: Any = None
    nodes: Any = None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            reason = "manifest must be a JSON object"
        else:
            # v2: 인가된 계보 노드 집합(원본 + 승인된 패치 노드). v1: 단일 working 블록.
            # 빈 authorizedNodes([])는 "v2 부재"로 취급해 working으로 폴백한다 —
            # 빈 리스트가 유효 working을 조용히 차단하는 함정을 없앤다.
            nodes = manifest.get("authorizedNodes")
            working = manifest.get("working")
            if not nodes and working is None:
                if isinstance(nodes, list):  # authorizedNodes: [] 인데 working도 없음
                    reason = "manifest authorizedNodes is empty and no working block is present"
                else:
                    reason = "manifest is missing the authorizedNodes and working blocks"
    except OSError as error:
        reason = f"manifest unreadable: {error}"
    except json.JSONDecodeError as error:
        reason = f"manifest is not valid JSON: {error}"

    if reason is not None:
        verdict: dict[str, Any] = {"ok": False, "exe": str(exe), "checks": [], "mismatches": [], "reason": reason}
    elif nodes:
        # 인가 노드 중 하나에 완전 매치해야 통과. 미상 hash는 fail-closed 차단.
        verdict = check_client_lineage_set(exe, nodes)
    else:
        # nodes가 None이거나 []; 여기 도달하면 working은 반드시 존재(위 reason 가드).
        verdict = check_client_lineage(exe, working)

    if verdict["ok"]:
        return None

    receipt = {
        "blocked": True,
        "reason": "lineage mismatch - launch refused before start",
        "exe": str(exe),
        "manifest": str(manifest_path),
        "exitCode": LINEAGE_MISMATCH_EXIT,
        "verdict": verdict,
        "blockedAt": datetime.now(UTC).astimezone().isoformat(),
    }
    receipt_path = session / "lineage-blocked.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    receipt["receiptPath"] = str(receipt_path)
    # 콘솔 print는 ASCII-safe로 — cp949/cp932 기본 콘솔에서 non-ASCII(일본어 EXE
    # 경로·기호)로 UnicodeEncodeError가 나면 exit 3 대신 크래시(exit 1)로 종료된다.
    # receipt 파일(위)은 UTF-8로 그대로 두고, 콘솔 echo만 이스케이프한다.
    print(json.dumps(receipt, ensure_ascii=True, indent=2))
    return LINEAGE_MISMATCH_EXIT


def cmd_start(args: argparse.Namespace) -> int:
    _require_windows()
    session: Path = args.session.resolve()
    session.mkdir(parents=True, exist_ok=True)
    if _session_path(session).exists():
        existing = _load_session(session)
        if _process_alive(int(existing.get("clientPid") or 0)):
            raise SystemExit(f"session already active at {session}")
    if args.exe is None:
        exe, client_selection = _prepare_default_client()
    else:
        exe = args.exe.resolve()
        client_selection = {
            "path": str(exe),
            "sha256": hashlib.sha256(exe.read_bytes()).hexdigest() if exe.is_file() else None,
            "mode": "explicit",
            "manifestId": None,
        }
    if not exe.exists():
        raise SystemExit(f"client exe not found: {exe}")
    lineage_manifest = getattr(args, "lineage_manifest", None)
    if lineage_manifest is not None:
        blocked = _enforce_lineage_gate(session, exe, Path(lineage_manifest).resolve())
        if blocked is not None:
            return blocked
    creationflags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB
    process = subprocess.Popen(
        [str(exe)],
        cwd=str(exe.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    try:
        hwnd = _wait_for_window(
            process.pid,
            timeout=args.window_timeout,
            title_substring=args.title_substring,
        )
        state = {
            "session": str(session),
            "exe": str(exe),
            "clientSelection": client_selection,
            "clientPid": process.pid,
            "hwnd": hwnd,
            "startedAt": datetime.now(UTC).astimezone().isoformat(),
            "titleSubstring": args.title_substring,
        }
        _save_session(session, state)
        report = _observe(session, state, args.label, args.settle)
        print(json.dumps({"started": state, "initial": report}, ensure_ascii=False, indent=2))
        return 0
    except BaseException:
        _taskkill_pid(process.pid)
        raise


def cmd_shot(args: argparse.Namespace) -> int:
    session: Path = args.session.resolve()
    state = _load_session(session)
    report = _observe(session, state, args.label, args.settle)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_key(args: argparse.Namespace) -> int:
    session: Path = args.session.resolve()
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    state["hwnd"] = hwnd
    hw: bool = getattr(args, "hw", False)
    if args.text is not None:
        action = _hw_type_text(hwnd, args.text) if hw else _send_text(hwnd, args.text)
        label = args.label or f"text-{_sanitize_label(args.text[:24])}"
    else:
        action = _hw_send_key(hwnd, args.key_name) if hw else _send_named_key(hwnd, args.key_name)
        label = args.label or f"key-{args.key_name.lower()}"
    report = _observe(session, state, label, args.settle)
    report["action"] = action
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_self_test(_args: argparse.Namespace) -> int:
    """ctypes 구조체·user32 함수 존재 여부를 실클라 없이 검증 (스모크 테스트)."""
    results: list[dict[str, Any]] = []

    # 1) _INPUT 구조체 인스턴스화 + 필드 쓰기
    try:
        inp = _INPUT()
        inp.type = _INPUT_KEYBOARD
        inp._input.ki.wVk   = 0
        inp._input.ki.wScan = 0x0041  # 'A' 유니코드
        inp._input.ki.dwFlags = _KEYEVENTF_UNICODE
        results.append({"check": "INPUT-struct", "ok": True, "sizeof": ctypes.sizeof(_INPUT)})
    except Exception as exc:
        results.append({"check": "INPUT-struct", "ok": False, "error": str(exc)})

    # 2) user32.SendInput / keybd_event 심볼 접근 (Windows 전용)
    if sys.platform == "win32":
        for fn_name in ("SendInput", "keybd_event"):
            try:
                user32 = ctypes.WinDLL("user32", use_last_error=True)
                _ = getattr(user32, fn_name)
                results.append({"check": f"user32.{fn_name}", "ok": True})
            except Exception as exc:
                results.append({"check": f"user32.{fn_name}", "ok": False, "error": str(exc)})
    else:
        results.append({"check": "platform", "ok": False, "error": "not Windows — hardware input N/A"})

    # 3) VK_NAMES에 로그인 필수 키 포함 여부
    required_keys = {"ENTER", "TAB", "ESCAPE"}
    missing = required_keys - set(VK_NAMES)
    results.append({"check": "VK_NAMES", "ok": not missing, "missing": sorted(missing)})

    # 4) 상수 값 검증
    results.append({
        "check": "constants",
        "ok": _KEYEVENTF_KEYUP == 0x0002 and _KEYEVENTF_UNICODE == 0x0004,
        "KEYEVENTF_KEYUP": hex(_KEYEVENTF_KEYUP),
        "KEYEVENTF_UNICODE": hex(_KEYEVENTF_UNICODE),
    })

    all_ok = all(r["ok"] for r in results)
    print(json.dumps({"selfTest": results, "allOk": all_ok}, ensure_ascii=False, indent=2))
    return 0 if all_ok else 1


def cmd_click(args: argparse.Namespace) -> int:
    session: Path = args.session.resolve()
    state = _load_session(session)
    hwnd = _resolve_hwnd(state)
    state["hwnd"] = hwnd
    action = _click_window(hwnd, args.x, args.y)
    label = args.label or f"click-{args.x}-{args.y}"
    report = _observe(session, state, label, args.settle)
    report["action"] = action
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    session: Path = args.session.resolve()
    state = _load_session(session)
    client_pid = int(state.get("clientPid") or 0)
    info = {
        "session": str(session),
        "statePath": str(_session_path(session)),
        "clientPid": client_pid,
        "clientAlive": _process_alive(client_pid),
        "hwnd": state.get("hwnd"),
        "exe": state.get("exe"),
        "startedAt": state.get("startedAt"),
    }
    print(json.dumps(info, ensure_ascii=False, indent=2))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    session: Path = args.session.resolve()
    state = _load_session(session)
    client_pid = int(state.get("clientPid") or 0)
    was_alive = _process_alive(client_pid)
    stopped = _taskkill_pid(client_pid) if was_alive else True
    result = {
        "session": str(session),
        "clientPid": client_pid,
        "clientWasAlive": was_alive,
        "clientStopped": stopped,
        "stoppedAt": datetime.now(UTC).astimezone().isoformat(),
    }
    state["stoppedAt"] = result["stoppedAt"]
    state["clientStopped"] = stopped
    _save_session(session, state)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start")
    p_start.add_argument("--exe", type=Path)
    p_start.add_argument("--label", default="initial")
    p_start.add_argument("--settle", type=float, default=5.0)
    p_start.add_argument("--window-timeout", type=float, default=30.0)
    p_start.add_argument("--title-substring", default=None)
    p_start.add_argument(
        "--lineage-manifest",
        type=Path,
        default=None,
        help="client lineage manifest v1; 주어지면 launch 전 sha256·image base·sentinel을 강제 검증",
    )
    p_start.set_defaults(func=cmd_start)

    p_shot = sub.add_parser("shot")
    p_shot.add_argument("--label", default="shot")
    p_shot.add_argument("--settle", type=float, default=0.3)
    p_shot.set_defaults(func=cmd_shot)

    p_key = sub.add_parser("key")
    group = p_key.add_mutually_exclusive_group(required=True)
    group.add_argument("key_name", nargs="?")
    group.add_argument("--text")
    p_key.add_argument("--hw", action="store_true", default=False,
                        help="하드웨어 입력 경로 사용 (SendInput/keybd_event). "
                             "PostMessage WM_CHAR 대신 실제 하드웨어 이벤트를 주입해 "
                             "GetAsyncKeyState 에도 반영됨.")
    p_key.add_argument("--label", default=None)
    p_key.add_argument("--settle", type=float, default=0.3)
    p_key.set_defaults(func=cmd_key)

    p_click = sub.add_parser("click")
    p_click.add_argument("x", type=int)
    p_click.add_argument("y", type=int)
    p_click.add_argument("--label", default=None)
    p_click.add_argument("--settle", type=float, default=0.3)
    p_click.set_defaults(func=cmd_click)

    sub.add_parser("info").set_defaults(func=cmd_info)
    sub.add_parser("stop").set_defaults(func=cmd_stop)
    sub.add_parser("self-test",
                   help="ctypes 구조체·user32 함수 존재 여부를 실클라 없이 검증"
                   ).set_defaults(func=cmd_self_test)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
