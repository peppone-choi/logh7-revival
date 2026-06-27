"""Live brute-force for the in-world chat-open key (0x0f1c trigger) in LOGH VII."""
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / ".omo/ui-explorer/chat-key-brute-20260624"
UI_EXPLORER = [sys.executable, "-m", "tools.logh7_ui_explorer", "--session", str(SESSION)]

VK_MAP = {
    "Enter": 0x0D,
    "Space": 0x20,
    "Esc": 0x1B,
    "Tab": 0x09,
    "Back": 0x08,
    "Ins": 0x2D,
    "Del": 0x2E,
    "Home": 0x24,
    "End": 0x23,
    "PgUp": 0x21,
    "PgDn": 0x22,
    "Up": 0x26,
    "Down": 0x28,
    "Left": 0x25,
    "Right": 0x27,
    "/": 0xBF,
    "\\": 0xDC,
    ";": 0xBA,
    "'": 0xDE,
    ",": 0xBC,
    ".": 0xBE,
    "-": 0xBD,
    "=": 0xBB,
    "[": 0xDB,
    "]": 0xDD,
    "`": 0xC0,
}
for i in range(10):
    VK_MAP[str(i)] = 0x30 + i
for i in range(26):
    VK_MAP[chr(ord("a") + i)] = 0x41 + i
for i in range(1, 13):
    VK_MAP[f"F{i}"] = 0x70 + (i - 1)
for i in range(10):
    VK_MAP[f"Numpad{i}"] = 0x60 + i


def run(args, timeout=60):
    return subprocess.run(
        UI_EXPLORER + args,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def has_code(code: str) -> bool:
    result = run(["trace", "--all"], timeout=30)
    try:
        data = json.loads(result.stdout)
    except Exception:
        return False
    for ev in data.get("events", []):
        if code in ev.get("text", ""):
            return True
    return False


def main():
    import shutil

    # Clean slate.
    if SESSION.exists():
        shutil.rmtree(SESSION)

    account_db = SESSION / "accounts.sqlite"
    env = [
        "LOGH_ACCEPT_ANY_GIN7=1",
        "LOGH_LOBBY_OK_FORMAT=message32",
        "LOGH_LOBBY_EARLY_OK=1",
        "LOGH_SS_FORMAT=message32",
        "LOGH_STRAT_GALAXY=1",
        "LOGH_STRAT_GRID_EARLY=1",
        "LOGH_STRAT_TERRAIN=1",
        "LOGH_WORLD_PLAYER=1",
        "LOGH_POSTLOAD_PLAYER_RECORD=1",
        "LOGH_FULL_UNIT_LOCATION=1",
        "LOGH_GRID_ENTER=1",
        "LOGH_PLAYER_FOCUS_CELL=1",
    ]
    start_args = [
        "start",
        "--port",
        "47900",
        "--patched-exe",
        str(ROOT / ".omo/work/logh7-installed/exe/G7MTClient.autologin.emp1.exe"),
        "--no-login",
    ]
    for e in env:
        start_args += ["--env", e]

    print("[brute] starting server+client...")
    run(start_args, timeout=120)
    print("[brute] waiting for splash...")
    time.sleep(40)

    print("[brute] creating character...")
    r = run(
        [
            "create-character",
            "--session-row",
            "1",
            "--faction",
            "empire",
            "--lastname",
            "Lohengram",
            "--firstname",
            "Reinhard",
            "--flagship",
            "Brunhild",
        ],
        timeout=120,
    )
    print(r.stdout[-500:] if r.stdout else "")
    if r.returncode != 0:
        print("[brute] create-character failed; stopping.")
        run(["stop"], timeout=60)
        return 1

    print("[brute] waiting for world entry...")
    time.sleep(8)

    # Record baseline trace offset to avoid old events.
    run(["trace"], timeout=30)

    results = []
    for name, vk in VK_MAP.items():
        print(f"[brute] key {name} (vk={vk:#x})")
        r = run(["key", str(vk), "--hw", "--label", f"key-{name}", "--settle", "0.6"], timeout=30)
        time.sleep(0.5)
        if has_code("0x0f1c"):
            print(f"[brute] *** 0x0f1c triggered by {name} ***")
            results.append((name, vk))
            break
        # Also check if any UI opened (chat window title changes not detectable).

    print(f"[brute] keys that triggered 0x0f1c: {results}")
    report_path = SESSION / "key-brute-report.json"
    report_path.write_text(json.dumps({"results": results, "tested": list(VK_MAP.keys())}, ensure_ascii=False, indent=2))
    print(f"[brute] report written to {report_path}")

    run(["stop"], timeout=60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
