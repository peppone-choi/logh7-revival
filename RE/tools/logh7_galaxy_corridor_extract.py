#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""LOGH VII 전략 갤럭시 — 이제르론/페잔 1칸 회랑 추출기.

page101-bg.jpg(星系図 배경 래스터)의 중앙 gap(두 진영 사이 검은 띠)에서
실제 통로(teal 그리드 채움) 픽셀을 셀 단위로 측정해, 회랑이 가로지르는
정확한 1칸 폭 채널 행(row)을 산출한다.

격자 매핑(canon-positions.json):  col = round((px-95)/14),  row = round((py-215)/14)
gapCol = 50 (두 진영을 가르는 중앙 검은 띠의 중심 열).

회랑 = 검은 띠를 가로지르는 좁은 항행 가능 통로.
 - 이제르론 회랑: 제국(우)↔동맹(좌), 캐논 イゼルローン (col53,row12) 부근.
 - 페잔 회랑:   페잔 성계 경유, 캐논 フェザーン (col51,row38) 부근.

출력: gap 열(45..60) × 전체 행(0..49)의 blueness 점수 맵 + 회랑 후보 행.
이 스크립트는 측정/시각화 전용이다(마스크는 별도 재빌드 도구가 쓴다).
"""
import json
import sys
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / ".omo/work/galaxy-extract/page101-bg.jpg"

# ★격자 매핑 (page101-bg.jpg 844x579 실측, 캐논 별점 4개 최소제곱 피팅):
#   pixX = 7.0035*col + 50.06   (pitch ≈ 7.0px/cell, 매뉴얼 pitchPt=7.0과 일치)
#   pixY = 6.9772*row + 114.39
# 이전 pitchPx=14/origin(95,215)는 2배 스케일 page101.png용이라 이 jpg엔 안 맞음.
PITCH_X = 7.0035
OX = 50.0596
PITCH_Y = 6.9772
OY = 114.3852
GAP_COL = 50  # 중앙 검은 띠 중심 열


def cell_center(col, row):
    return OX + col * PITCH_X, OY + row * PITCH_Y


def main():
    img = Image.open(IMG).convert("RGB")
    W, H = img.size
    arr = np.asarray(img).astype(float)
    print(f"# image {W}x{H}  pitchX={PITCH_X} pitchY={PITCH_Y} origin=({OX:.1f},{OY:.1f}) gapCol={GAP_COL}")

    def sample(col, row, rad=3):
        cx, cy = cell_center(col, row)
        x0, y0 = int(cx - rad), int(cy - rad)
        x1, y1 = int(cx + rad), int(cy + rad)
        x0 = max(0, x0); y0 = max(0, y0)
        x1 = min(W, x1); y1 = min(H, y1)
        if x1 <= x0 or y1 <= y0:
            return None
        patch = arr[y0:y1, x0:x1, :]
        r = patch[:, :, 0].mean()
        g = patch[:, :, 1].mean()
        b = patch[:, :, 2].mean()
        return r, g, b

    cols = list(range(44, 62))
    print("# blueness score = B - (R+G)/2  (>~40 => navigable teal fill)")
    header = "row | " + " ".join(f"{c:3d}" for c in cols)
    print(header)
    # 중앙 검은 띠 안쪽(깊은 gap) 열. 회랑은 이 깊은 띠를 가로지르는 좁은 통로다.
    gap_inner = list(range(48, 57))
    deep_gap = list(range(50, 57))  # 두 진영이 진짜로 갈라지는 가장 깊은 중심
    score_map = {}
    deep_mean = {}  # row -> 깊은 gap 평균 blueness
    for row in range(0, 50):
        vals = []
        for col in cols:
            s = sample(col, row)
            if s is None:
                vals.append("  .")
                continue
            r, g, b = s
            score = b - (r + g) / 2.0
            score_map[(col, row)] = score
            vals.append(f"{int(score):3d}")
        ds = [score_map[(c, row)] for c in deep_gap if (c, row) in score_map]
        if ds:
            deep_mean[row] = sum(ds) / len(ds)
        print(f"r{row:2d} | " + " ".join(vals))

    # ★회랑 = 중앙 isthmus(rows 8..42, 두 진영이 진짜 분리된 구간)에서
    #   깊은 gap 평균이 국소 최대(>90)인 crisp 밝은 띠. 정확히 2개여야 한다.
    isthmus = range(8, 43)
    peaks = []
    for row in isthmus:
        m = deep_mean.get(row, 0.0)
        if m > 90 and m >= deep_mean.get(row - 1, 0.0) and m >= deep_mean.get(row + 1, 0.0):
            peaks.append((row, round(m, 1)))

    print("\n# 깊은 gap(cols 50..56) 평균 blueness — 회랑은 밝은 띠:")
    for row in isthmus:
        bar = "#" * int(max(0, deep_mean.get(row, 0)) / 5)
        print(f"  r{row:2d}: {deep_mean.get(row,0):6.1f} {bar}")
    print("\n# ★회랑 채널(국소 최대 밝은 띠, isthmus 내부):")
    for row, m in peaks:
        print(f"  CHANNEL row {row}: deep-mean {m}")

    out = ROOT / ".omo/work/galaxy-extract/corridor-channel-measure.json"
    payload = {
        "_source": str(IMG.relative_to(ROOT)),
        "_note": (
            "page101-bg.jpg(844x579) 실측 격자로 중앙 검은 띠의 회랑 채널을 식별. "
            "회랑 = isthmus(rows 8..42) 안에서 깊은 gap 평균 blueness 국소 최대(>90)인 1칸 띠."
        ),
        "_grid": {"pitchX": PITCH_X, "pitchY": PITCH_Y, "originPx": [OX, OY], "gapCol": GAP_COL},
        "deepGapCols": deep_gap,
        "gapInnerCols": gap_inner,
        "channelRows": [{"row": r, "deepMean": m} for r, m in peaks],
        "deepGapMeanByRow": {str(r): round(deep_mean.get(r, 0.0), 1) for r in range(50)},
        "scoreMap": {f"{c},{r}": round(v, 1) for (c, r), v in score_map.items()},
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n# wrote {out}")
    print(f"# CHANNEL ROWS (1칸 회랑) = {[r for r, _ in peaks]}  (expect [12, 38])")


if __name__ == "__main__":
    main()
