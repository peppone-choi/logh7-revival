"""logh7_msg_catalog -- regenerate the authoritative in-world message catalog from the Ghidra
full-decompile index, so the code<->class<->size map is reproducible (not hand-transcribed).

Sources (both inside .omo/ghidra/export/<bin>/):
  - FUN_004ba2b0 : the client message handler. Each code branch logs "<Class> OK" -> code<->class.
  - FUN_004b8b00 : the dispatch/size table. Each `case 0xNNN:` sets `*param_4 = <bodySize>` and may
                   call the parser FUN_xxxx -> code<->size(+parser).

Emits content/client/message-catalog.json: [{code, name, dir, size, parser}], dir inferred from the
class-name prefix (Command*=C2S, Notify*/Response*/Transaction*=S2C, others=bidir/server).

Usage:  python -m tools.logh7_msg_catalog            # write the json
        python -m tools.logh7_msg_catalog --print    # also print the table
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Final

EXPORT: Final[Path] = Path(".omo/ghidra/export/G7MTClient")
OUT: Final[Path] = Path("content/client/message-catalog.json")


def _func_c(addr: str) -> str:
    """Decompiled C of the function whose record addr starts with `addr` (e.g. '0x004ba2b0')."""
    path = EXPORT / "functions.jsonl"
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if addr in line[:48]:
                return json.loads(line)["c"]
    raise SystemExit(f"function {addr} not found in {path}")


def _strings() -> dict[str, str]:
    out: dict[str, str] = {}
    with (EXPORT / "strings.tsv").open(encoding="utf-8", errors="replace") as f:
        for ln in f:
            p = ln.rstrip("\n").split("\t")
            if len(p) >= 2:
                out[p[0].lower()] = p[1]
    return out


def code_to_class() -> dict[int, str]:
    """From FUN_004ba2b0: map code -> class name via the '<Class> OK' log strings near each branch."""
    strs = _strings()
    c = _func_c("0x004ba2b0")
    cur: int | None = None
    found: dict[int, str] = {}
    for ln in c.splitlines():
        m = re.search(r"local_3c == (0x[0-9a-fA-F]+)", ln) or re.search(r"case (0x[0-9a-fA-F]+):", ln)
        if m:
            cur = int(m.group(1), 16)
        if cur is None:
            continue
        for sm in re.finditer(r"_(0[0-9a-fA-F]{7})\b|0x(0[0-9a-fA-F]{7})", ln):
            key = ("0x" + (sm.group(1) or sm.group(2))).lower()
            txt = strs.get(key, "")
            mm = re.match(r"([A-Za-z][A-Za-z0-9_]+) OK", txt)
            if mm and cur not in found:
                found[cur] = mm.group(1)
    return found


def code_to_size() -> dict[int, dict]:
    """From FUN_004b8b00: map code -> {size, parser}."""
    c = _func_c("0x004b8b00")
    out: dict[int, dict] = {}
    cur: dict | None = None
    for ln in c.splitlines():
        m = re.search(r"case (0x[0-9a-fA-F]+|\d+):", ln)
        if m:
            v = m.group(1)
            code = int(v, 16) if v.startswith("0x") else int(v)
            cur = {"code": code, "size": None, "parser": None}
            out[code] = cur
            continue
        if cur is None:
            continue
        ms = re.search(r"\*param_4 = (0x[0-9a-fA-F]+|\d+);", ln)
        if ms and cur["size"] is None:
            cur["size"] = int(ms.group(1), 16) if ms.group(1).startswith("0x") else int(ms.group(1))
        mf = re.search(r"(FUN_[0-9a-f]+)\(param_2", ln)
        if mf and cur["parser"] is None:
            cur["parser"] = mf.group(1)
    return out


# --- curated overlays (NOT in the binary): implementation status + which RE doc covers each code ---
# status: "done" = server build/parse + test landed; "spec" = wire layout reverse-engineered in a doc;
# "todo" = catalogued only. Keep this in sync as the server grows (future-AI handoff signal).
STATUS_DONE = {
    0x0201, 0x0202, 0x0204, 0x0206, 0x2000, 0x2001, 0x2002, 0x2004, 0x2006, 0x200a, 0x7001, 0x7002,
    0x0301, 0x0323, 0x031f, 0x0313, 0x0315, 0x0325, 0x033b, 0x0f01, 0x0f03, 0x1008,
    0x0400, 0x0402, 0x0423, 0x0424, 0x0b01, 0x0b07, 0x0b09, 0x0b0a, 0x0f1c,
    # space war (G201):
    0x0404, 0x0405, 0x0406, 0x0407, 0x0411, 0x0425, 0x0426, 0x0427, 0x042f, 0x0440,
    # ground combat (G201):
    0x040f, 0x0410, 0x0412, 0x0429, 0x042a, 0x0437,
    # internal affairs (G201): personnel / strategy / logistics / social / info-records / simple-info
    0x0704, 0x0705, 0x0706, 0x0707, 0x0708, 0x0709, 0x070a, 0x070b, 0x0356, 0x0358,
    0x0900, 0x0901, 0x0902, 0x0903, 0x0904, 0x0905, 0x0906, 0x0907, 0x0908,
    0x0b00, 0x0b02, 0x0b03, 0x0b04, 0x0b05, 0x0b06, 0x0b0b, 0x0b0c, 0x0b0d, 0x0b08, 0x0e00,
    0x0c00, 0x0c01, 0x0c02, 0x0c05, 0x0c08, 0x0c0b, 0x0c0c,
    0x031d, 0x0321, 0x0327, 0x0329, 0x032b,
    0x0f0a, 0x0f0b, 0x0f0c, 0x0f0d, 0x0f0e, 0x0f0f, 0x0f10, 0x0f11, 0x0f12, 0x0f13, 0x0f14, 0x0f15,
    0x0f16, 0x0f17, 0x0f18, 0x0f19, 0x0f1a, 0x0f1b, 0x0f1e,
    0x1200, 0x1201, 0x1202, 0x1203, 0x1204, 0x1205, 0x1206, 0x1207, 0x1208, 0x1209,
    0x120a, 0x120b, 0x120c, 0x120d, 0x120e, 0x120f,
}
STATUS_SPEC_FAMILIES = {  # families with a reversed wire-spec doc (see DOC_BY_FAMILY)
    "battle", "info-record", "personnel", "strategy", "strategic-map", "logistics",
    "social-world", "account", "simple-info",
}
DOC_BY_FAMILY = {
    "battle": "docs/logh7-proto-battle-core.md|battle-fire|battle-fleetops",
    "info-record": "docs/logh7-proto-info-records.md (+ tactics-data)",
    "personnel": "docs/logh7-proto-personnel-strategy.md",
    "strategy": "docs/logh7-proto-personnel-strategy.md",
    "strategic-map": "docs/logh7-proto-strategic-logistics.md",
    "logistics": "docs/logh7-proto-strategic-logistics.md",
    "institution": "docs/logh7-proto-strategic-logistics.md",
    "social-world": "docs/logh7-proto-social-account.md",
    "account": "docs/logh7-proto-social-account.md",
    "simple-info": "docs/logh7-proto-social-account.md",
}


def status_of(code: int, fam: str) -> str:
    if code in STATUS_DONE:
        return "done"
    if fam in STATUS_SPEC_FAMILIES:
        return "spec"
    return "todo"


def direction(name: str) -> str:
    if name.startswith("Command"):
        return "C2S"
    if name.startswith(("Notify", "Response", "Transaction", "Information")):
        return "S2C"
    if name.endswith(("OK", "NG")) or name.startswith(("SS", "LG", "Lobby")):
        return "S2C"
    return "bidir"


def family(code: int) -> str:
    fams = {
        0x200: "session", 0x300: "info-record", 0x400: "battle", 0x500: "error",
        0x700: "personnel", 0x900: "strategy", 0xB00: "strategic-map", 0xC00: "logistics",
        0xE00: "institution", 0xF00: "social-world", 0x1000: "account", 0x1200: "simple-info",
        0x2000: "lobby", 0x7000: "login-gate",
    }
    base = code & 0xFF00
    return fams.get(base, f"0x{base:04x}")


def build() -> list[dict]:
    classes = code_to_class()
    sizes = code_to_size()
    rows: list[dict] = []
    for code in sorted(set(classes) | set(sizes)):
        name = classes.get(code)
        info = sizes.get(code, {})
        fam = family(code)
        rows.append({
            "code": f"0x{code:04x}",
            "name": name or "(unknown)",
            "dir": direction(name) if name else "?",
            "family": fam,
            "size": info.get("size"),
            "parser": info.get("parser"),
            "status": status_of(code, fam),
            "doc": DOC_BY_FAMILY.get(fam),
        })
    return rows


def main() -> None:
    rows = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "_source": "regenerated by tools/logh7_msg_catalog.py from Ghidra FUN_004ba2b0 (code<->class) + FUN_004b8b00 (size/parser)",
        "_framing": "C->S inner = [u16 BE code][LE body]; S->C conn3 = message32 [u32 0][u16 code][LE body]",
        "count": len(rows),
        "messages": rows,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} messages)")
    if "--print" in sys.argv:
        for r in rows:
            sz = "" if r["size"] is None else f"{r['size']}"
            print(f"  {r['code']}  {r['dir']:4s}  {r['family']:13s}  size={sz:>6}  {r['parser'] or '':>13}  {r['name']}")


if __name__ == "__main__":
    main()
