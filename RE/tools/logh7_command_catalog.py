"""Extract the in-game command catalog from the client's constmsg.dat (HFWR, Shift-JIS) into
structured command-rule data the server's command engine can use. Turns the client's own data
(command name + 実行待機時間 cooldown + 実行所要時間 duration + usage scope) into JSON.

The client holds the whole command system as text (logh7-client-data-map); this recovers the
machine-usable rules (cooldown/duration/scope) per command, e.g.:
  移動 (Move): cooldown 48 G-sec, duration=continuous, scope=unit
  白兵戦 (Boarding): cooldown 48, duration 240, scope=flagship-vs-flagship

Usage: python -m tools.logh7_command_catalog [--file .../constmsg.dat] [--out .omo/work/command-catalog.json]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

DEFAULT_FILE = ".omo/work/logh7-installed/data/MsgDat/constmsg.dat"

WAIT_RE = re.compile(r"実行待機時間\s*(\d+)\s*G")
DURATION_RE = re.compile(r"実行所要時間\s*(\d+)\s*G")
NAME_RE = re.compile(r"^\[\s*(.+?)\s*\]$")
# Romanized labels for the canonical tactical commands so server code can key on them.
ROMAJI = {
    "移動": "move",
    "旋回": "turn",
    "攻撃": "attack",
    "射撃": "fire",
    "白兵戦": "boarding",
    "レーダー": "radar",
    "鼓舞": "inspire",
    "具申": "advise",
    "平行移動": "parallel_move",
    "停止": "stop",
}


def _extract_strings(data: bytes, min_len: int = 1) -> list[str]:
    text = data.decode("cp932", errors="ignore")
    out, cur = [], []
    for ch in text:
        keep = ch == "\t" or (ch.isprintable() and ch not in "\r\n")
        jp = "぀" <= ch <= "ヿ" or "一" <= ch <= "鿿" or "＀" <= ch <= "￯"
        if keep or jp:
            cur.append(ch)
        else:
            s = "".join(cur).strip()
            if len(s) >= min_len:
                out.append(s)
            cur = []
    s = "".join(cur).strip()
    if len(s) >= min_len:
        out.append(s)
    return out


def parse_catalog(path: Path) -> dict:
    strings = _extract_strings(path.read_bytes())
    commands = []
    current = None
    for s in strings:
        m = NAME_RE.match(s)
        if m:
            if current:
                commands.append(current)
            name = m.group(1)
            current = {
                "name": name,
                "romaji": ROMAJI.get(name),
                "description": [],
                "cooldownG": None,
                "durationG": None,
                "durationText": None,
            }
            continue
        if current is None:
            continue
        w = WAIT_RE.search(s)
        d = DURATION_RE.search(s)
        if w:
            current["cooldownG"] = int(w.group(1))
        elif d:
            current["durationG"] = int(d.group(1))
        elif s.startswith("実行所要時間"):
            current["durationText"] = s.replace("実行所要時間", "").strip()
        else:
            current["description"].append(s)
    if current:
        commands.append(current)
    return {"source": str(path), "commandCount": len(commands), "commands": commands}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--out", default=".omo/work/command-catalog.json")
    args = ap.parse_args()
    catalog = parse_catalog(Path(args.file))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    named = [c for c in catalog["commands"] if c["romaji"]]
    print(f"parsed {catalog['commandCount']} commands -> {out}")
    print("canonical tactical commands:")
    for c in named:
        print(f"  {c['romaji']:14} cooldown={c['cooldownG']} duration={c['durationG'] if c['durationG'] is not None else c['durationText']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
