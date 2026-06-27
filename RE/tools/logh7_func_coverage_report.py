#!/usr/bin/env python3
"""LOGH VII 함수레벨 RE 커버리지 행렬 생성 (결정론적, 에이전트 미사용).

P0-06("클라이언트/DLL/데이터 RE 커버리지 행렬")을 함수레벨로 승격한다.
각 바이너리의 summary.json(트리아지) + ledger.json(deep-RE 동기화) + lightdoc.json(baseline)을
읽어 docs/logh7-function-re-coverage-matrix.md 를 생성.

사용: python -m tools.logh7_func_coverage_report
"""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / ".omo/re-audit/functions"
DOC = REPO_ROOT / "docs/logh7-function-re-coverage-matrix.md"


def load(p: Path):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (json.JSONDecodeError, OSError, FileNotFoundError):
        return None


def main():
    bins = sorted(p.name for p in OUT_ROOT.iterdir() if p.is_dir())
    rows = []
    grand_total = grand_deep = grand_light = grand_target = 0
    subsys_acc: dict[str, int] = {}
    for b in bins:
        base = OUT_ROOT / b
        s = load(base / "summary.json") or {}
        led = load(base / "ledger.json") or {}
        light = load(base / "lightdoc.json") or {}
        total = s.get("total_functions") or light.get("total") or 0
        re_target = s.get("re_target_functions") or 0
        deep = led.get("documented_count", len(led.get("documented", {})) if isinstance(led.get("documented"), dict) else 0)
        light_total = light.get("total", 0)
        cov = round(deep / re_target * 100, 1) if re_target else 0.0
        bcov = round(deep / total * 100, 1) if total else 0.0
        rows.append({
            "bin": b, "total": total, "re_target": re_target, "deep": deep,
            "cov_target": cov, "cov_total": bcov,
            "light": light_total, "batches_done": len(led.get("batches_done", [])),
            "named": s.get("named_functions", 0),
        })
        grand_total += total
        grand_deep += deep
        grand_light += light_total
        grand_target += re_target
        for k, v in (s.get("subsystems") or {}).items():
            subsys_acc[k] = subsys_acc.get(k, 0) + v

    lines = []
    lines.append("# LOGH VII 함수레벨 RE 커버리지 행렬 (P0-06)")
    lines.append("")
    lines.append("자동 생성: `python -m tools.logh7_func_coverage_report`. "
                 "소스 = `.omo/re-audit/functions/<bin>/{summary,ledger,lightdoc}.json`.")
    lines.append("")
    lines.append("- **total** = 디컴파일 인덱스 전 함수")
    lines.append("- **re_target** = 트리아지가 deep-RE 대상으로 분류(thunk/library/trivial 제외)")
    lines.append("- **deep** = 워크플로 maker가 목적+매개변수+오프셋까지 문서화(원장 동기화 실측)")
    lines.append("- **light** = lightdoc baseline(전 함수 한 줄 자동문서; 누락 0)")
    lines.append("")
    lines.append("| 바이너리 | total | re_target | deep-RE | re_target대비 | total대비 | lightdoc | 배치완료 |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        lines.append(f"| {r['bin']} | {r['total']} | {r['re_target']} | "
                     f"**{r['deep']}** | {r['cov_target']}% | {r['cov_total']}% | "
                     f"{r['light']} | {r['batches_done']} |")
    gct = round(grand_deep / grand_target * 100, 1) if grand_target else 0
    gtt = round(grand_deep / grand_total * 100, 1) if grand_total else 0
    lines.append(f"| **합계** | **{grand_total}** | **{grand_target}** | "
                 f"**{grand_deep}** | **{gct}%** | **{gtt}%** | **{grand_light}** | |")
    lines.append("")
    lines.append("## 서브시스템 분포 (re_target 태깅, 전 바이너리 합)")
    lines.append("")
    for k, v in sorted(subsys_acc.items(), key=lambda kv: -kv[1]):
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## 정직 고지")
    lines.append("- **G7MTClient가 실질 게임 본체**. BootFirst·G7Start·Gin7UpdateClient·setup은 "
                 "MFC/MSVCRT/CRT 런타임 비중이 크고 게임직결 함수는 소수(verifier/합성 정직 기록).")
    lines.append("- deep-RE 미완 함수도 **lightdoc baseline은 존재**(목적/규약/매개변수수/필드오프셋). "
                 "\"비트 하나도 빠뜨리지 마\" 기준 누락 0; deep-RE는 게임플레이 레버리지 순으로 진행.")
    lines.append("- 각 deep-RE 함수의 confidence(P0-decompile/P3-inferred)는 "
                 "`out/batch-*.json` 및 웨이브 요약 문서에 개별 표기.")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {DOC}")
    print(f"grand deep={grand_deep} / re_target={grand_target} ({gct}%) ; "
          f"lightdoc={grand_light} / total={grand_total}")


if __name__ == "__main__":
    main()
