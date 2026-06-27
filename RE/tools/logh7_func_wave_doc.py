#!/usr/bin/env python3
"""LOGH VII 함수 RE 웨이브 요약 문서 결정론적 생성 (에이전트 미사용).

워크플로 합성 에이전트가 세션한도/오류로 실패했을 때, out/batch-*.json에서 직접
웨이브 요약 markdown을 재생성한다. 함수 표 + 서브시스템 롤업 + 옵코드→함수 인덱스 +
confidence 분포 + (있으면) verifier 정정.

사용:
  python -m tools.logh7_func_wave_doc --bin G7MTClient --wave 2 --start 64 --count 64
  python -m tools.logh7_func_wave_doc --bin Gin7UpdateClient --wave 1 --start 0 --count 40
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / ".omo/re-audit/functions"


def pad(n: int) -> str:
    return f"{n:04d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", required=True)
    ap.add_argument("--wave", type=int, required=True)
    ap.add_argument("--start", type=int, required=True)
    ap.add_argument("--count", type=int, required=True)
    args = ap.parse_args()

    base = OUT_ROOT / args.bin
    out_dir = base / "out"
    funcs = []
    missing = []
    for i in range(args.start, args.start + args.count):
        fp = out_dir / f"batch-{pad(i)}.json"
        if not fp.exists():
            missing.append(i)
            continue
        try:
            d = json.load(open(fp, encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            missing.append(i)
            continue
        for f in d.get("functions", []):
            f["_batch"] = i
            funcs.append(f)

    funcs.sort(key=lambda f: f.get("addr", ""))
    subsys: dict[str, int] = {}
    conf: dict[str, int] = {}
    opmap: dict[str, list] = {}
    for f in funcs:
        s = f.get("subsystem", "?") or "?"
        subsys[s] = subsys.get(s, 0) + 1
        c = f.get("confidence", "?") or "?"
        conf[c] = conf.get(c, 0) + 1
        for op in (f.get("opcodes") or []):
            opmap.setdefault(op, []).append(f.get("name") or f.get("addr"))

    L = []
    L.append(f"# LOGH VII 함수 RE — {args.bin} 웨이브 {pad(args.wave)} 요약 (결정론 재생성)")
    L.append("")
    L.append(f"생성: `tools/logh7_func_wave_doc.py` (합성 에이전트가 세션한도로 실패하여 "
             f"out batch에서 직접 재생성). 배치 {args.start}~{args.start + args.count - 1}.")
    L.append("")
    L.append(f"- 문서화 함수: **{len(funcs)}**")
    if missing:
        L.append(f"- ⚠️ 출력 없는 배치: {missing}")
    L.append(f"- confidence: " + ", ".join(f"{k}={v}" for k, v in sorted(conf.items())))
    L.append(f"- 서브시스템: " + ", ".join(f"{k}={v}" for k, v in sorted(subsys.items(), key=lambda kv: -kv[1])))
    L.append("")
    if opmap:
        L.append("## 옵코드 → 함수 (이 웨이브)")
        L.append("")
        for op in sorted(opmap):
            L.append(f"- `{op}`: {', '.join(sorted(set(opmap[op]))[:6])}")
        L.append("")
    L.append("## 함수 표")
    L.append("")
    L.append("| addr | name | conv | subsystem | conf | 목적(요약) |")
    L.append("|---|---|---|---|---|---|")
    for f in funcs:
        addr = f.get("addr", "")
        name = (f.get("name", "") or "")[:28]
        cc = (f.get("calling_convention", "") or "")[:14].replace("|", "/")
        s = (f.get("subsystem", "") or "")[:10]
        c = (f.get("confidence", "") or "").replace("-decompile", "").replace("-inferred", "?")[:8]
        purpose = (f.get("purpose", "") or "").replace("\n", " ").replace("|", "/")[:130]
        L.append(f"| {addr} | {name} | {cc} | {s} | {c} | {purpose} |")
    L.append("")

    # verifier 정정 (있으면)
    corr = out_dir / f"_wave-{pad(args.wave)}-verifier-corrections.json"
    if corr.exists():
        try:
            cj = json.load(open(corr, encoding="utf-8"))
            L.append("## verifier 적발 (영속)")
            L.append("")
            L.append("```json")
            L.append(json.dumps(cj, ensure_ascii=False, indent=1)[:4000])
            L.append("```")
        except (json.JSONDecodeError, OSError):
            pass
    else:
        L.append("> verifier 정정 파일 없음(이 웨이브는 verifier가 세션한도로 일부/전부 실패했거나 "
                 "구버전 워크플로). confidence는 maker self-flagged 기준.")

    doc = REPO_ROOT / f"docs/logh7-function-re-{args.bin.lower()}-wave-{pad(args.wave)}.md"
    doc.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {doc} ({len(funcs)} funcs, {len(opmap)} opcodes)")


if __name__ == "__main__":
    main()
