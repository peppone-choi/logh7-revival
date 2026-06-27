"""Keep a window in the foreground for a fixed duration.

Used to keep the LOGH VII D3D8 splash/boot window foregrounded so the
client can progress past the splash screen."""

import argparse
import json
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Keep a window foregrounded.")
    parser.add_argument("session", help="ui_explorer session directory")
    parser.add_argument("--seconds", type=int, default=40, help="duration to keep foreground")
    parser.add_argument("--interval", type=float, default=0.5, help="seconds between SetForegroundWindow calls")
    args = parser.parse_args()

    session = Path(args.session)
    session_json = session / "session.json"

    # Wait for session.json to appear.
    for _ in range(50):
        if session_json.exists():
            break
        time.sleep(0.2)
    else:
        print("session.json did not appear", file=sys.stderr)
        return 1

    hwnd = None
    for _ in range(20):
        try:
            data = json.loads(session_json.read_text(encoding="utf-8"))
            hwnd = data.get("hwnd")
            if hwnd:
                break
        except Exception:
            pass
        time.sleep(0.2)

    if not hwnd:
        print("hwnd not found in session.json", file=sys.stderr)
        return 1

    try:
        import win32gui  # type: ignore[import-not-found]
    except ImportError:
        print("pywin32 required", file=sys.stderr)
        return 1

    print(f"keeping foreground for hwnd={hwnd} for {args.seconds}s")
    iterations = int(args.seconds / args.interval)
    for i in range(iterations):
        try:
            win32gui.SetForegroundWindow(hwnd)
        except Exception as exc:
            print(f"SetForegroundWindow error at {i}: {exc}", file=sys.stderr)
        time.sleep(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
