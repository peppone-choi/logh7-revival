#!/usr/bin/env python3
"""로그인 후 세션 피커를 Frida로 연다 (state 0x20).

라이브 증명 (2026-07-09):
- DAT_02215e2c+4 = 0x20 이면 세션 피커 UI (LOGH VII, 1/2, 제국/동맹)
- 메뉴 클릭은 이 state 를 바꾸지 않음 → 강제 진입이 필요
- 0x2006 BE 텍스트 + packed 세션 목록이 피커에 표시됨

Usage:
  python tools/live/_open_session_picker.py
  # 이미 로비에 있으면 로그인 스킵
"""
from __future__ import annotations

import sys
import time
import ctypes
from ctypes import wintypes
from pathlib import Path

import frida

user32 = ctypes.windll.user32
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import find_client_hwnd, foreground, client_geometry, screenshot, do_login

SCRIPT = r"""
rpc.exports = {
  scene() {
    const p = ptr('0x02215e2c').readPointer();
    return { p: p.toString(), state: p.add(4).readU32() };
  },
  setState(v) {
    const p = ptr('0x02215e2c').readPointer();
    p.add(4).writeU32(v >>> 0);
    return p.add(4).readU32();
  }
};
"""


def main() -> int:
    sd = Path("server/data/agent-drive/session-picker-open")
    sd.mkdir(parents=True, exist_ok=True)

    hwnd = find_client_hwnd()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    print(f"hwnd={hwnd:#x} pid={pid.value}")
    foreground(hwnd)

    ox, oy, cw, ch = client_geometry(hwnd)
    if cw < 900:
        do_login(hwnd, "inei00", "dummy", sd)
        for i in range(16):
            time.sleep(1)
            ox, oy, cw, ch = client_geometry(hwnd)
            print(f"t+{i}s {cw}x{ch}")
            if cw >= 1000 and i >= 11:
                break

    screenshot(hwnd, sd / "01-before.png")
    session = frida.attach(pid.value)
    script = session.create_script(SCRIPT)
    script.load()
    print("before", script.exports_sync.scene())

    for attempt in range(6):
        script.exports_sync.set_state(0x20)
        time.sleep(0.7)
        st = script.exports_sync.scene()["state"]
        print(f"attempt {attempt} state={st}(0x{st:x})")
        if st in (0x20, 0x1C, 0x1E, 0x2D, 0x2E, 0x2F):
            break

    screenshot(hwnd, sd / "02-picker.png")
    print("after", script.exports_sync.scene())
    print("shot", sd / "02-picker.png")
    session.detach()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
