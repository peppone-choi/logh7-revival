"""Hard-key type /grid <cell> into the focused LOGH VII window for C002 fallback live probe."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / ".omo/ui-explorer/c002-grid-fallback-20260624"

VK_MAP = {
    '/': 0xBF,
    ' ': 0x20,
}
for _i in range(10):
    VK_MAP[str(_i)] = 0x30 + _i
for _i in range(26):
    VK_MAP[chr(ord('a') + _i)] = 0x41 + _i
    VK_MAP[chr(ord('A') + _i)] = 0x41 + _i
KEYEVENTF_KEYUP = 0x0002


def send_key(vk):
    import win32api  # type: ignore[import-not-found]
    win32api.keybd_event(vk, 0, 0, 0)
    time.sleep(0.05)
    win32api.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(0.05)


def main():
    import win32gui  # type: ignore[import-not-found]
    state = json.loads((SESSION / "session.json").read_text())
    hwnd = int(state.get("hwnd") or 0)
    if not hwnd or not win32gui.IsWindow(hwnd):
        print("client window not found")
        return 1
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception as e:  # noqa: BLE001
        print(f"SetForegroundWindow failed: {e}")
    time.sleep(0.5)

    cell = sys.argv[1] if len(sys.argv) > 1 else "8700"
    text = f"/grid {cell}"

    # Try opening chat with Enter.
    send_key(0x0D)
    time.sleep(0.3)

    for ch in text:
        vk = VK_MAP.get(ch)
        if vk is None:
            print(f"unsupported char: {ch!r}")
            return 1
        send_key(vk)

    # Submit.
    send_key(0x0D)
    print(f"typed: {text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
