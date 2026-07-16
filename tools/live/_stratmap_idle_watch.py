#!/usr/bin/env python3
"""전략맵 진입 후 무조작 idle 관찰 — 자동 발생 다이얼로그(初期化 에러) 포착.

Frida 미사용(순수 화면/윈도우 관찰). 시드 store로 로비 우회, 로그인→게임개시
→캐릭터카드 더블클릭으로 전략맵 진입까지만 조작. 이후 300초 무조작 대기하며
~5초 간격 전체화면 스크린샷 + 클라 top-level 윈도우 열거로 다이얼로그 감지.

usage: python _stratmap_idle_watch.py <evidence-dir> [idle_seconds]
"""
from __future__ import annotations

import sys
import time
import subprocess
import ctypes
from ctypes import wintypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import (  # noqa: E402
    find_client_hwnd, foreground, client_geometry, screenshot, do_login, mouse_click,
)

# 콘솔이 cp949여도 유니코드 로그(—, 初期化 등)가 깨지지 않게 stdout 재설정
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

CLIENT_EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"

GAME_START = (125, 191)
CHAR_CARD = (655, 305)
LOBBY_REF = (1024, 768)


class RECT(ctypes.Structure):
    _fields_ = [("left", wintypes.LONG), ("top", wintypes.LONG),
                ("right", wintypes.LONG), ("bottom", wintypes.LONG)]


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


def grab_fullscreen(path: Path):
    """전체 가상 화면 캡처 — 화면 중앙에 뜨는 OS 메시지박스도 잡는다."""
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab(all_screens=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        return img.size
    except Exception as e:
        return f"ERR:{e}"


def get_window_text(hwnd) -> str:
    n = user32.GetWindowTextLengthW(hwnd)
    if n <= 0:
        return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def get_class_name(hwnd) -> str:
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def enum_child_texts(parent) -> list[str]:
    texts = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        t = get_window_text(hwnd)
        if t:
            texts.append(f"[{get_class_name(hwnd)}] {t}")
        return True

    user32.EnumChildWindows(parent, cb, 0)
    return texts


def enum_pid_windows(pid: int) -> list[dict]:
    """해당 PID 소유의 보이는 top-level 윈도우 열거(제목/클래스/좌표)."""
    out = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        wpid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
        if wpid.value != pid:
            return True
        r = RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        out.append({
            "hwnd": hwnd,
            "class": get_class_name(hwnd),
            "title": get_window_text(hwnd),
            "rect": (r.left, r.top, r.right, r.bottom),
        })
        return True

    user32.EnumWindows(cb, 0)
    return out


def main() -> int:
    evdir = Path(sys.argv[1])
    idle_seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    shots = evdir / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    log = []

    def note(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        log.append(line)
        (evdir / "idle-log.txt").write_text("\n".join(log), encoding="utf-8")

    # 로케일 기록
    acp = kernel32.GetACP()
    ui_lang = kernel32.GetUserDefaultUILanguage()
    lcid = kernel32.GetUserDefaultLCID()
    note(f"LOCALE ACP={acp} UILang={ui_lang:#06x} LCID={lcid:#06x}")

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
    cpid = pid.value
    note(f"window hwnd={hwnd:#x} pid={cpid}")
    foreground(hwnd)
    screenshot(hwnd, shots / "01-login.png")

    # 2) 로그인
    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        note(f"login screen {cw}x{ch} -> do_login")
        do_login(hwnd, "inei00", "dummy", shots)
    else:
        note(f"already lobby {cw}x{ch}")

    # 3) 로비 정착 + splash
    for i in range(20):
        time.sleep(1)
        if not user32.IsWindow(hwnd):
            note(f"client died during settle at {i}s")
            return 4
        ox, oy, cw, ch = client_geometry(hwnd)
        if cw >= 1000:
            note(f"lobby-size at t+{i}s {cw}x{ch}")
            break
    note("wait 9s splash -> lobby menu")
    time.sleep(9)
    if user32.IsWindow(hwnd):
        foreground(hwnd)
        screenshot(hwnd, shots / "02-lobby.png")

    # 4) 게임개시 → 캐릭터 카드 더블클릭 → 전략맵 진입
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
        note(f"click CHAR_CARD client={cc} (double)")
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(1.5)
        mouse_click(ox + cc[0], oy + cc[1])
        time.sleep(3.0)
        screenshot(hwnd, shots / "04-char-dbl.png")
        grab_fullscreen(shots / "05-stratmap-entered-full.png")

    # 기준 윈도우 집합(다이얼로그 감지 기준선)
    base_windows = {w["hwnd"] for w in enum_pid_windows(cpid)}
    note(f"baseline windows({len(base_windows)}): "
         + "; ".join(f"{w['class']}|{w['title']}" for w in enum_pid_windows(cpid)))

    # 5) === IDLE 관찰 (무조작) ===
    note(f"=== IDLE WATCH {idle_seconds}s — NO input from here ===")
    t0 = time.time()
    shot_i = 6
    dialog_captured = False
    died = False
    while time.time() - t0 < idle_seconds:
        elapsed = int(time.time() - t0)
        # 클라 생존 확인
        rc = proc.poll()
        alive = user32.IsWindow(hwnd) and rc is None
        if not alive:
            died = True
            note(f"*** CLIENT GONE at idle+{elapsed}s exitcode={rc} ***")
            grab_fullscreen(shots / f"{shot_i:02d}-DIED-{elapsed}s-full.png")
            break

        # 새 윈도우(다이얼로그) 감지
        cur = enum_pid_windows(cpid)
        new = [w for w in cur if w["hwnd"] not in base_windows]
        msgbox = [w for w in cur if w["class"] in ("#32770", "MessageBox")]
        if new or msgbox:
            note(f"*** NEW WINDOW/DIALOG at idle+{elapsed}s ***")
            for w in (new or msgbox):
                children = enum_child_texts(w["hwnd"])
                note(f"  DIALOG class={w['class']} title={w['title']!r} rect={w['rect']}")
                for c in children:
                    note(f"    child: {c!r}")
            grab_fullscreen(shots / f"{shot_i:02d}-DIALOG-{elapsed}s-full.png")
            screenshot(hwnd, shots / f"{shot_i:02d}-DIALOG-{elapsed}s-client.png")
            shot_i += 1
            dialog_captured = True
            # 다이얼로그 후 상태 추적을 위해 baseline 갱신
            base_windows = {w["hwnd"] for w in cur}
            time.sleep(2.0)
            continue

        # 정기 스크린샷(전체화면 — 중앙 다이얼로그 놓침 방지)
        grab_fullscreen(shots / f"{shot_i:02d}-idle-{elapsed}s-full.png")
        shot_i += 1
        time.sleep(5.0)

    final_elapsed = int(time.time() - t0)
    # 종료 처리
    if died:
        # 종료 직후 잔여 다이얼로그가 있을 수 있어 한 번 더 전체화면
        time.sleep(1.0)
        grab_fullscreen(shots / "98-postmortem-full.png")
    else:
        rc = proc.poll()
        note(f"idle watch complete {final_elapsed}s — client alive={user32.IsWindow(hwnd)} exitcode={rc}")
        grab_fullscreen(shots / "99-final-full.png")
        if user32.IsWindow(hwnd):
            screenshot(hwnd, shots / "99-final-client.png")

    note("=== SUMMARY ===")
    note(f"dialog_captured={dialog_captured} client_died={died} idle_watched={final_elapsed}s")
    note(f"client final alive={bool(user32.IsWindow(hwnd))} exitcode={proc.poll()}")

    # 정리 — 이 드라이버가 띄운 클라만 종료(검증된 PID)
    try:
        if user32.IsWindow(hwnd) and proc.poll() is None:
            proc.terminate()
            note(f"terminated client pid={cpid}")
    except Exception as e:
        note(f"terminate skip: {e}")
    (evdir / "idle-log.txt").write_text("\n".join(log), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
