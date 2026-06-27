#!/usr/bin/env python3
"""LOGH VII 함수 baseline 라이트 문서화(결정론적, 에이전트 미사용).

agent 심층 RE 대상에서 제외되는 thunk/accessor/trivial/library 함수도 "빠뜨리지"
않도록, 디컴파일 C 본문에서 패턴을 인식해 한 줄 목적 + 매개변수 수/호출규약 +
읽기/쓰기 필드 오프셋을 자동 추출한다. 전 함수에 baseline을 부여하고, 게임로직
함수는 워크플로의 심층 문서가 덮어쓴다(supersede).

출력: .omo/re-audit/functions/<bin>/lightdoc.json
  {binary, total, functions:[{addr,name,conv,n_params,auto_purpose,kind,
    field_reads:[...],field_writes:[...]}]}

사용:
  python -m tools.logh7_func_lightdoc --all
  python -m tools.logh7_func_lightdoc --bin G7MTClient
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORT_ROOT = REPO_ROOT / ".omo/ghidra/export"
OUT_ROOT = REPO_ROOT / ".omo/re-audit/functions"

CONV_RE = re.compile(r"__(thiscall|fastcall|cdecl|stdcall)\b")
FUN_RE = re.compile(r"FUN_([0-9a-fA-F]{8})")
# 필드 접근: *(type *)(param_1 + 0xNN)  또는  *(type *)((int)this + 0xNN)
FIELD_READ_RE = re.compile(r"\*\([^)]*\*\)\((?:param_1|this|in_ECX|unaff_ECX)\s*\+\s*(0x[0-9a-fA-F]+)\)")
FIELD_WRITE_RE = re.compile(r"\*\([^)]*\*\)\((?:param_1|this|in_ECX|unaff_ECX)\s*\+\s*(0x[0-9a-fA-F]+)\)\s*=")
RET_PTR_RE = re.compile(r"return\s+&(PTR_[A-Za-z0-9_]+|DAT_[0-9a-fA-F]+);")
RET_CONST_RE = re.compile(r"return\s+(-?\d+|0x[0-9a-fA-F]+);")
RET_FIELD_RE = re.compile(r"return\s+\*\([^)]*\*\)\((?:param_1|this)\s*\+\s*(0x[0-9a-fA-F]+)\);")


def first_line(c: str) -> str:
    for ln in c.splitlines():
        ln = ln.strip()
        if ln:
            return ln
    return ""


def count_params(sig_line: str) -> int:
    m = re.search(r"\(([^)]*)\)", sig_line)
    if not m:
        return 0
    inside = m.group(1).strip()
    if inside == "" or inside.lower() == "void":
        return 0
    # 쉼표 분할(중첩 괄호 거의 없음)
    return len([p for p in inside.split(",") if p.strip()])


def classify_light(c: str, name: str) -> tuple[str, str]:
    """(kind, auto_purpose) 반환. 본문 패턴 기반 휴리스틱."""
    body = c
    # 본문 내 비공백 statement 수(대략)
    stmts = [s for s in re.split(r"[;{}]", body) if s.strip()]
    funs = FUN_RE.findall(body)
    n_calls = len(re.findall(r"FUN_[0-9a-fA-F]{8}\s*\(", body))

    m = RET_PTR_RE.search(body)
    if m:
        return "table-accessor", f"전역 {m.group(1)} 포인터 반환(테이블/vtable 접근자)"
    m = RET_FIELD_RE.search(body)
    if m:
        return "field-getter", f"필드 [this+{m.group(1)}] 값 반환(게터)"
    m = RET_CONST_RE.search(body)
    if m and len(stmts) <= 3:
        return "const-return", f"상수 {m.group(1)} 반환"
    # 단일 호출 위임
    if n_calls == 1:
        callee = funs[0] if funs else "?"
        if len(stmts) <= 4:
            return "thunk", f"FUN_{callee} 로 위임(thunk/래퍼)"
    writes = FIELD_WRITE_RE.findall(body)
    reads = FIELD_READ_RE.findall(body)
    if writes and len(stmts) <= 6:
        return "field-setter", f"필드 [this+{','.join(sorted(set(writes))[:4])}] 기록(세터)"
    if not funs and len(stmts) <= 6:
        return "leaf-util", "외부 호출 없는 소형 유틸(산술/필드 조작)"
    if n_calls >= 1 and len(stmts) <= 10:
        return "small-wrapper", f"{n_calls}개 호출을 감싸는 소형 래퍼"
    return "uncharacterized", f"{n_calls}개 호출/{len(stmts)}개 statement 소형 함수(심층 RE 권장)"


def lightdoc_binary(bin_name: str) -> dict:
    export_dir = EXPORT_ROOT / bin_name
    fjsonl = export_dir / "functions.jsonl"
    if not fjsonl.exists():
        raise SystemExit(f"no functions.jsonl for {bin_name}")

    out_funcs = []
    for line in fjsonl.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        c = r.get("c", "") or ""
        fl = first_line(c)
        conv_m = CONV_RE.search(fl)
        conv = conv_m.group(1) if conv_m else "cdecl?"
        n_params = count_params(fl)
        kind, purpose = classify_light(c, r.get("name", ""))
        reads = sorted(set(FIELD_READ_RE.findall(c)))[:12]
        writes = sorted(set(FIELD_WRITE_RE.findall(c)))[:12]
        out_funcs.append({
            "addr": r["addr"],
            "name": r.get("name", ""),
            "conv": conv,
            "n_params": n_params,
            "auto_purpose": purpose,
            "kind": kind,
            "field_reads": reads,
            "field_writes": writes,
        })

    out_dir = OUT_ROOT / bin_name
    out_dir.mkdir(parents=True, exist_ok=True)
    kinds: dict[str, int] = {}
    for f in out_funcs:
        kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1
    result = {"binary": bin_name, "total": len(out_funcs), "kinds": kinds,
              "functions": out_funcs}
    (out_dir / "lightdoc.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"binary": bin_name, "total": len(out_funcs), "kinds": kinds}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        bins = [p.name for p in EXPORT_ROOT.iterdir() if (p / "functions.jsonl").exists()]
    elif args.bin:
        bins = [args.bin]
    else:
        raise SystemExit("--bin <name> 또는 --all 필요")
    for b in sorted(bins):
        print(json.dumps(lightdoc_binary(b), ensure_ascii=False))


if __name__ == "__main__":
    main()
