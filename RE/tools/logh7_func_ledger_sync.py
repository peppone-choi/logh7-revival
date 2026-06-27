#!/usr/bin/env python3
"""LOGH VII 함수 RE 원장 결정론적 동기화 (에이전트 미사용).

워크플로 합성 에이전트가 세션한도/오류로 실패해도, 디스크에 쓰인 out/batch-*.json에서
ledger.json을 정확히 재구성한다. 멱등(반복 실행 안전). 합성보다 신뢰 가능한 진실원.

동작:
  .omo/re-audit/functions/<bin>/out/batch-####.json 전부 읽어
   - documented: {addr -> {name, purpose(앞120자), batch, confidence}}
   - batches_done: 출력이 존재하는 배치 인덱스 정렬목록
   - per_func_count, malformed 목록
  ledger.json 기록 + summary.json의 re_target 대비 커버리지 출력.

사용:
  python -m tools.logh7_func_ledger_sync --all
  python -m tools.logh7_func_ledger_sync --bin G7MTClient
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / ".omo/re-audit/functions"
BATCH_RE = re.compile(r"batch-(\d+)\.json$")


def sync_bin(bin_name: str) -> dict:
    base = OUT_ROOT / bin_name
    out_dir = base / "out"
    if not out_dir.exists():
        return {"binary": bin_name, "error": "no out dir"}

    documented: dict[str, dict] = {}
    batches_done: set[int] = set()
    malformed: list[str] = []
    total_funcs = 0

    for fp in sorted(glob.glob(str(out_dir / "batch-*.json"))):
        name = os.path.basename(fp)
        m = BATCH_RE.search(name)
        if not m:
            continue
        bidx = int(m.group(1))
        try:
            d = json.load(open(fp, encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            malformed.append(name)
            continue
        funcs = d.get("functions", []) if isinstance(d, dict) else []
        if not funcs:
            malformed.append(name + " (no functions[])")
            continue
        batches_done.add(bidx)
        for f in funcs:
            addr = (f.get("addr") or "").lower()
            if not addr:
                continue
            total_funcs += 1
            documented[addr] = {
                "name": f.get("name", ""),
                "purpose": (f.get("purpose", "") or "")[:120],
                "batch": bidx,
                "confidence": f.get("confidence", ""),
                "subsystem": f.get("subsystem", ""),
            }

    # re_target / 전체 함수수 (summary.json)
    re_target = None
    total_all = None
    sjson = base / "summary.json"
    if sjson.exists():
        try:
            s = json.load(open(sjson, encoding="utf-8"))
            re_target = s.get("re_target_functions")
            total_all = s.get("total_functions")
        except (json.JSONDecodeError, OSError):
            pass

    ledger = {
        "binary": bin_name,
        "documented": documented,
        "batches_done": sorted(batches_done),
        "documented_count": len(documented),
        "re_target": re_target,
        "total_functions": total_all,
        "malformed": malformed,
    }
    (base / "ledger.json").write_text(
        json.dumps(ledger, ensure_ascii=False, indent=1), encoding="utf-8")

    cov = (len(documented) / re_target * 100) if re_target else None
    return {
        "binary": bin_name,
        "documented": len(documented),
        "batches_done": len(batches_done),
        "re_target": re_target,
        "coverage_pct": round(cov, 2) if cov is not None else None,
        "malformed": malformed,
        "raw_func_rows": total_funcs,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        bins = [p.name for p in OUT_ROOT.iterdir()
                if (p / "out").exists()]
    elif args.bin:
        bins = [args.bin]
    else:
        raise SystemExit("--bin <name> 또는 --all")
    grand = 0
    for b in sorted(bins):
        r = sync_bin(b)
        grand += r.get("documented", 0) if isinstance(r.get("documented"), int) else 0
        print(json.dumps(r, ensure_ascii=False))
    print(json.dumps({"grand_total_documented": grand}, ensure_ascii=False))


if __name__ == "__main__":
    main()
