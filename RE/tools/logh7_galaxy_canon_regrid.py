"""DEPRECATED: stale cx/cy regrid tool kept only for old evidence replay.

Do not use this to repair current content. The 2026-06-20 handoff established
that axis swapping is not the root cause; the old pipeline used annotation/line
marker centers instead of the actual page-101 vector marker anchor. Use
`python -m tools.logh7_galaxy_star_extract` instead.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GALAXY = ROOT / "content" / "galaxy.json"

COL_LO, COL_HI = 3, 96   # canonCol 여백(기존 _canon_grid 범위 유지)
ROW_LO, ROW_HI = 2, 49   # canonRow 여백
W, H = 100, 50


def regrid(galaxy: dict) -> tuple[dict, list]:
    systems = galaxy["systems"]
    pts = [(s.get("cx"), s.get("cy")) for s in systems]
    xs = [x for x, _ in pts if x is not None]
    ys = [y for _, y in pts if y is not None]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    spanx = (maxx - minx) or 1
    spany = (maxy - miny) or 1

    def target(cx, cy):
        col = round(COL_LO + (cx - minx) / spanx * (COL_HI - COL_LO))
        row = round(ROW_LO + (cy - miny) / spany * (ROW_HI - ROW_LO))
        return col, row

    used: set[tuple[int, int]] = set()

    def place(col, row):
        # 가까운 빈 셀로 나선형(ring) 스냅 — 원 셀이 차 있으면 반경을 넓혀 가장 가까운 free 선택.
        if (col, row) not in used:
            used.add((col, row))
            return col, row
        for radius in range(1, max(W, H)):
            best = None
            for dc in range(-radius, radius + 1):
                for dr in range(-radius, radius + 1):
                    if max(abs(dc), abs(dr)) != radius:
                        continue
                    c, r = col + dc, row + dr
                    if COL_LO <= c <= COL_HI and ROW_LO <= r <= ROW_HI and (c, r) not in used:
                        d2 = dc * dc + dr * dr
                        if best is None or d2 < best[0]:
                            best = (d2, c, r)
            if best:
                _, c, r = best
                used.add((c, r))
                return c, r
        used.add((col, row))
        return col, row

    moves = []
    for s in systems:
        cx, cy = s.get("cx"), s.get("cy")
        if cx is None or cy is None:
            continue
        tc, tr = target(cx, cy)
        col, row = place(tc, tr)
        old = (s.get("canonCol"), s.get("canonRow"))
        s["canonCol"], s["canonRow"] = col, row
        if old != (col, row):
            moves.append((s.get("system"), old, (col, row)))
    galaxy["_canon_grid"] = {
        "width": W, "height": H,
        "note": f"canonCol=f(cx) {COL_LO}..{COL_HI}, canonRow=f(cy) {ROW_LO}..{ROW_HI}; "
                "X/Y un-swapped 2026-06-20 (회랑 정렬 교정), 충돌회피 유일셀",
    }
    return galaxy, moves


def render(galaxy: dict, w: int = 40, h: int = 20) -> str:
    named = {"イゼルローン": "I", "フェザーン": "P", "アイゼンヘルツ": "H", "ヴァンフリート": "V",
             "アムリッツァ": "M", "ハイネセン": "@", "オーディン": "O"}
    grid = [[" "] * w for _ in range(h)]
    for s in galaxy["systems"]:
        c, r = s.get("canonCol"), s.get("canonRow")
        if c is None:
            continue
        cc = int(c / W * w)
        rr = int(r / H * h)
        ch = named.get(s.get("system", "")) or {"empire": "e", "alliance": "a", "neutral": "n"}.get(s.get("faction"), "?")
        if grid[rr][cc] == " " or ch.isupper():
            grid[rr][cc] = ch
    return "\n".join("".join(row) for row in grid)


def main() -> int:
    ap = argparse.ArgumentParser(description="galaxy.json canonCol/canonRow 축 교환 해제 재생성")
    ap.add_argument("--write", action="store_true", help="galaxy.json에 실제 기록(기본 dry-run)")
    ap.add_argument(
        "--force-stale-regrid",
        action="store_true",
        help="오래된 증거 재현 전용. 현재 콘텐츠 수정에는 사용하지 말 것.",
    )
    args = ap.parse_args()
    if not args.force_stale_regrid:
        ap.error("stale axis regrid is disabled; use python -m tools.logh7_galaxy_star_extract")
    galaxy = json.loads(GALAXY.read_text(encoding="utf-8"))
    galaxy, moves = regrid(galaxy)
    print(f"재배치된 성계: {len(moves)}개")
    # 중복 검사
    cells = [(s.get("canonCol"), s.get("canonRow")) for s in galaxy["systems"] if s.get("canonCol") is not None]
    assert len(cells) == len(set(cells)), "중복 셀 발생!"
    print(f"유일 셀 {len(cells)}개 (중복 없음)")
    print("=== 재생성 후 레이아웃 ===")
    print("  I=이제르론 P=페잔 H=아이젠헤르츠 V=반플리트 M=암리처 @=하이네센 O=오딘")
    print(render(galaxy))
    if args.write:
        GALAXY.write_text(json.dumps(galaxy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n기록됨: {GALAXY}")
    else:
        print("\n(dry-run — 적용하려면 --write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
