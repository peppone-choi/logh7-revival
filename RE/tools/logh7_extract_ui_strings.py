#!/usr/bin/env python3
"""Extract the hardcoded UI/dialog/menu strings (the .rsrc layer) into a localization source file.

The in-game narrative text is in MsgDat/String.txt (logh7_text_classify.py). But the launcher/app
menu + dialogs are HARDCODED in the EXE's .rsrc resources (File/Help/New/Open/About, the dialog font),
which the MsgDat localization never touched — that's why "내용은 한글인데 메뉴가 일어". This pulls those
strings (from logh7_binary_strings.py output) into a translation-ready file with empty KO slots, so the
login/menu layer can be localized via a .rsrc resource edit (see docs/logh7-font-remaster.md §7).

Output: content/localization/hardcoded-ui-ja.json  ([{va, restype, text_ja, text_ko:null}])
Run: python tools/logh7_binary_strings.py   (first, to produce the source)
     python tools/logh7_extract_ui_strings.py
"""
from __future__ import annotations
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "content", "extracted", "binary-strings-G7MTClient.json")
OUT = os.path.join(ROOT, "content", "localization", "hardcoded-ui-ja.json")

# real hardcoded UI text categories from logh7_binary_strings.py
UI_CATS = {"localizable.hardcoded-jp", "rsrc.dialog", "rsrc.menu", "rsrc.stringtable"}


def main() -> int:
    if not os.path.exists(SRC):
        print(f"missing {SRC} — run `python tools/logh7_binary_strings.py` first", file=sys.stderr)
        return 2
    d = json.load(open(SRC, encoding="utf-8"))
    seen = set()
    rows = []
    for e in d.get("entries", []):
        if e.get("category") not in UI_CATS:
            continue
        t = (e.get("text") or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        rows.append({
            "va_off": e.get("va_off"),
            "restype": e.get("restype") or e.get("category"),
            "text_ja": t,
            "text_ko": None,  # fill with the Korean translation; cp949 (or UTF-8 if the text-shim is used)
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out = {
        "_purpose": "Hardcoded EXE .rsrc UI strings (launcher/app menu + dialogs) as a localization source. "
                    "Fill text_ko then patch the .rsrc (Resource Hacker / a .rsrc patcher) — separate from the "
                    "MsgDat/String.txt (in-game) localization. See docs/logh7-font-remaster.md §7.",
        "_source": "content/extracted/binary-strings-G7MTClient.json (.rsrc dialog/menu/stringtable)",
        "_count": len(rows),
        "strings": rows,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT}: {len(rows)} hardcoded UI strings (fill text_ko to localize the login/menu)")
    for r in rows[:18]:
        print(f"  [{r['restype']}] {r['text_ja'][:50]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
