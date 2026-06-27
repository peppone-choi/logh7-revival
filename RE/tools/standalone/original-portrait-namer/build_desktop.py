#!/usr/bin/env python3
"""Reproducibly build/refresh the standalone Original-Character Portrait Namer onto the Desktop.

Copies the O-group canon portraits + runtime files (serve.py/index.html/start.bat/README.md) and
regenerates suggestions.json from content/canon-face-registry.json. Run from the repo:

    python tools/standalone/original-portrait-namer/build_desktop.py
    python tools/standalone/original-portrait-namer/build_desktop.py --dest "C:/path/to/out"

stdlib-only; safe to re-run (does not touch an existing names.json).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PORTRAITS_SRC = REPO / "content" / "roster" / "canon-portraits"
REGISTRY = REPO / "content" / "canon-face-registry.json"
ATLASES = ("o", "oam", "oem")
RUNTIME = ("serve.py", "index.html", "start.bat", "README.md")

# curated ja -> kr for famous characters; the rest fall back to ja-only autocomplete.
KR = {
    "ローエングラム": "로엔그람", "ミューゼル": "뮤젤", "キルヒアイス": "키르히아이스", "ミッターマイヤー": "미터마이어",
    "ロイエンタール": "로이엔탈", "オーベルシュタイン": "오베르슈타인", "メックリンガー": "메크링거", "ミュラー": "뮐러",
    "ビッテンフェルト": "비텐펠트", "ファーレンハイト": "파렌하이트", "ワーレン": "발렌", "ルッツ": "루츠", "ケスラー": "케슬러",
    "ケンプ": "켐프", "レンネンカンプ": "렌넨캄프", "シュタインメッツ": "슈타인메츠", "メルカッツ": "메르카츠",
    "フリードリヒⅣ世": "프리드리히 4세", "リヒテンラーデ": "리히텐라데", "クラーゼン": "클라젠", "ゲルラッハ": "겔라흐",
    "レムシャイト": "렘샤이트", "エーレンベルグ": "에렌베르크", "シュタインホフ": "슈타인호프", "オッペンハイマー": "오펜하이머",
    "オフレッサー": "오프레서", "シャフト": "샤프트", "シュターデン": "슈타덴", "フォーゲル": "포겔", "ランズベルク": "란츠베르크",
    "フレーゲル": "프레겔", "ゼークト": "제크트", "アンスバッハ": "안스바흐", "ホフマイスター": "호프마이스터",
    "G.ミュッケンベルガー": "뮈켄베르거", "グライフス": "그라이프스", "ヒルデスハイム": "힐데스하임", "ディッタースドルフ": "디터스도르프",
    "グリューネマン": "그뤼네만", "シュトックハウゼン": "슈토크하우젠", "ホワン": "황", "ブロンズ": "브론즈", "ホーウッド": "호우드",
}


def build_suggestions(dest: Path) -> int:
    reg = json.loads(REGISTRY.read_text(encoding="utf-8"))
    seen, items = set(), []
    for r in reg["records"]:
        ja = r["name_ja"]
        if ja in seen:
            continue
        seen.add(ja)
        items.append({"ja": ja, "kr": KR.get(ja, ""), "faction": r["faction"]})
    out = {"_purpose": "autocomplete suggestions for naming O-group canon portraits "
                       "(ja from registry + curated kr). Edit freely.", "items": items}
    (dest / "suggestions.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(items)


def main() -> int:
    ap = argparse.ArgumentParser()
    default_dest = Path(os.path.expanduser("~")) / "Desktop" / "LOGH7-OriginalPortraitNamer"
    ap.add_argument("--dest", type=Path, default=default_dest)
    args = ap.parse_args()
    dest = args.dest

    if not PORTRAITS_SRC.is_dir():
        print(f"[ERROR] portraits source not found: {PORTRAITS_SRC}")
        return 1
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "portraits").mkdir(exist_ok=True)

    total = 0
    for atlas in ATLASES:
        src = PORTRAITS_SRC / atlas
        if not src.is_dir():
            continue
        dst = dest / "portraits" / atlas
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src, dst)
        total += len(list(dst.glob("*.png")))

    for name in RUNTIME:
        shutil.copy2(HERE / name, dest / name)
    n_sug = build_suggestions(dest)

    print(f"Built portrait namer -> {dest}")
    print(f"  portraits: {total}  |  suggestions: {n_sug}  |  runtime files: {len(RUNTIME)}")
    print(f"  run: double-click {dest / 'start.bat'}  (names.json preserved if present)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
