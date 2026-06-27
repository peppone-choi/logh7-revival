#!/usr/bin/env python3
"""LOGH VII 함수 전수 RE 트리아지 도구.

Ghidra 풀 디컴파일 인덱스(functions.jsonl + strings.tsv + symbols.tsv)를 읽어
바이너리의 전 함수를 분류/랭킹/서브시스템 태깅하고, 대규모 RE 팬아웃 워크플로가
소비할 우선순위 work-list와 배치 파일을 생성한다. 결정론적(에이전트 미사용).

출력(.omo/re-audit/functions/<bin>/):
  catalog.json   — 전 함수 메타(코드 본문 제외): addr,name,size,conv,callees,callers,
                   dat_refs,str_refs,subsystem,category,score
  worklist.json  — 중요도 내림차순 addr 목록 + 요약 통계
  summary.json   — 버킷/서브시스템 카운트
  ledger.json    — addr->{documented:false} 커버리지 원장(synthesis가 채움; 이미 있으면 보존)
  work/batch-####.jsonl — 에이전트 1명이 처리할 함수 묶음(addr,name,sig,c 포함)

사용:
  python -m tools.logh7_func_triage --bin G7MTClient
  python -m tools.logh7_func_triage --all
  python -m tools.logh7_func_triage --bin G7MTClient --batch-funcs 30 --batch-chars 14000
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORT_ROOT = REPO_ROOT / ".omo/ghidra/export"
OUT_ROOT = REPO_ROOT / ".omo/re-audit/functions"

FUN_RE = re.compile(r"FUN_([0-9a-fA-F]{8})")
DAT_RE = re.compile(r"\b(?:DAT|PTR|UNK)_(?:[A-Za-z]+_)?([0-9a-fA-F]{8})")
SSTR_RE = re.compile(r"\bs_([A-Za-z0-9_]+?)_([0-9a-fA-F]{8})\b")
HEX_RE = re.compile(r"0x([0-9a-fA-F]{6,8})\b")
CONV_RE = re.compile(r"__(thiscall|fastcall|cdecl|stdcall)\b")

# 서브시스템 태깅용 키워드 -> 태그. 함수가 참조하는 문자열/심볼 텍스트로 매칭.
SUBSYSTEM_KEYWORDS = {
    "network": ["GIN7", "login", "session", "connect", "socket", "recv", "send",
                "packet", "WSA", "tcp", "cipher", "decipher", "0x70", "server"],
    "strategic": ["strat", "galaxy", "grid", "fleet", "sector", "planet", "system",
                  "fortress", "mode", "command"],
    "battle": ["battle", "tactic", "combat", "ship", "weapon", "damage", "attack"],
    "render": ["d3d", "Direct3D", "mesh", "vertex", "texture", "render", "draw",
               "sprite", "model", "mdx", "mds", "D3DX"],
    "ui": ["window", "dialog", "button", "menu", "font", "Font", "widget", "panel",
           "cursor", "click", "HUD", "MsgDat", "constmsg"],
    "file": [".dat", ".mdx", ".tcf", ".bmp", ".tga", ".wav", ".ogg", "Data\\",
             "fopen", "fread", "CreateFile", "HFWR", "GFWR"],
    "audio": ["sound", "Sound", "ogg", "wav", "DirectSound", "Vorbis", "mmio", "BGM"],
    "input": ["GetAsyncKeyState", "keybd", "mouse", "DirectInput", "DInput", "key"],
    "crt": ["bad_alloc", "std::", "operator", "__except", "_msize", "malloc",
            "free", "printf", "scanf", "locale", "terminate"],
}

# 알려진 핵심 게이트/디스패치(문서 기반) — 이걸 참조/근접하면 critical 가산.
CRITICAL_FUN = {
    "004ba2b0",  # opcode dispatch
    "004b68f0",  # mode 분기
    "004fef90",  # StrategySequence event-9 enqueue
    "0050d230",  # event-9 소비
    "004d3580",  # world->grid 투영
    "004d6310",  # grid validator
    "004c4170",  # current-source
    "00507f20",  # click 확정 dequeue
    "004fd7a0",  # HUD mode 활성화
    "00522060",  # HFWR loader
    "004dd6a0",  # mdx/mds loader
    "005924c0",  # tcf atlas
    "00601fbc",  # entry
}
CRITICAL_DAT = {
    "007ccffc", "02215e2c", "00779b10", "02214c00", "022142b0",
    "007cd04c", "00c9e2e0", "05393830",
}


def load_tsv_map(path: Path) -> dict[str, str]:
    """addr(8hex 소문자) -> text 매핑. TSV 첫 칼럼=addr, 둘째=text 가정."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        a = parts[0].strip().lower().replace("0x", "")
        if len(a) >= 8:
            a = a[-8:]
        out[a] = parts[1]
    return out


def classify_category(name: str, size: int, n_callees: int, n_dat: int,
                      n_str: int, subsystems: set[str]) -> str:
    named = not name.startswith("FUN_")
    if size < 140 and n_callees <= 1 and n_dat == 0 and n_str == 0:
        return "thunk"
    if "crt" in subsystems and n_dat == 0 and not named:
        return "library-likely"
    if n_str > 0 or n_dat > 0 or named or size > 600:
        return "game-logic"
    if size < 320 and n_callees <= 3:
        return "trivial"
    return "unknown"


def triage_binary(bin_name: str, batch_funcs: int, batch_chars: int) -> dict:
    export_dir = EXPORT_ROOT / bin_name
    fjsonl = export_dir / "functions.jsonl"
    if not fjsonl.exists():
        raise SystemExit(f"no functions.jsonl for {bin_name} at {fjsonl}")

    strings = load_tsv_map(export_dir / "strings.tsv")
    symbols = load_tsv_map(export_dir / "symbols.tsv")
    str_addrs = set(strings.keys())

    funcs: list[dict] = []
    for line in fjsonl.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        funcs.append(r)

    # 1차 패스: 각 함수 메타 추출
    meta_by_addr: dict[str, dict] = {}
    for r in funcs:
        addr = r["addr"].lower().replace("0x", "")
        if len(addr) >= 8:
            addr = addr[-8:]
        name = r.get("name", f"FUN_{addr}")
        c = r.get("c", "") or ""
        sig = r.get("sig", "") or ""

        callees = {m.lower() for m in FUN_RE.findall(c)}
        callees.discard(addr)  # self
        dat_refs = sorted({m.lower() for m in DAT_RE.findall(c)})
        # 인라인 s_ 이름 문자열
        sstrs = [(t.replace("_", " ").strip(), a.lower()) for t, a in SSTR_RE.findall(c)]
        # 본문 hex 토큰 ∩ strings.tsv 주소
        hex_tokens = {m.lower() for m in HEX_RE.findall(c)}
        ref_str_addrs = (hex_tokens & str_addrs) | {a for _, a in sstrs}
        str_texts = [strings.get(a, "") for a in ref_str_addrs if strings.get(a)]
        str_texts += [t for t, _ in sstrs]

        conv_m = CONV_RE.search(sig) or CONV_RE.search(c[:200])
        conv = conv_m.group(1) if conv_m else "cdecl?"

        # 서브시스템 태깅
        blob = (" ".join(str_texts) + " " + name + " " + " ".join(dat_refs)).lower()
        subsystems = set()
        for tag, kws in SUBSYSTEM_KEYWORDS.items():
            if any(kw.lower() in blob for kw in kws):
                subsystems.add(tag)

        meta_by_addr[addr] = {
            "addr": f"0x00{addr}" if len(addr) == 6 else f"0x{addr}",
            "name": name,
            "conv": conv,
            "size": len(c),
            "callees": sorted(callees),
            "callers": [],  # 2차 패스
            "dat_refs": dat_refs,
            "str_refs": sorted(set(str_texts))[:12],
            "n_str": len(set(str_texts)),
            "subsystems": sorted(subsystems),
            "_c": c,  # 배치용, catalog에선 제거
            "_sig": sig,
        }

    # 2차 패스: caller 역링크
    for addr, m in meta_by_addr.items():
        for callee in m["callees"]:
            if callee in meta_by_addr:
                meta_by_addr[callee]["callers"].append(addr)

    # 3차 패스: 분류 + 점수
    for addr, m in meta_by_addr.items():
        n_callers = len(m["callers"])
        m["category"] = classify_category(
            m["name"], m["size"], len(m["callees"]), len(m["dat_refs"]),
            m["n_str"], set(m["subsystems"]))
        crit = 0
        if addr in CRITICAL_FUN:
            crit += 50
        if any(c in CRITICAL_FUN for c in m["callees"]):
            crit += 15
        if any(d in CRITICAL_DAT for d in m["dat_refs"]):
            crit += 20
        named_bonus = 8 if not m["name"].startswith("FUN_") else 0
        # 중요도 = 호출자수*2 + 문자열참조*3 + dat참조*2 + 크기/200 + critical + named
        m["score"] = round(
            n_callers * 2 + m["n_str"] * 3 + len(m["dat_refs"]) * 2
            + min(m["size"] / 200, 25) + crit + named_bonus, 1)
        # 게임플레이 레버리지 티어: 0=핵심게이트, 1=서브시스템태깅/명명됨, 2=무태깅 인프라
        addr_short = addr
        if crit >= 50 or any(d in CRITICAL_DAT for d in m["dat_refs"]):
            m["_tier"] = 0
        elif m["subsystems"] or not m["name"].startswith("FUN_") or m["n_str"] > 0:
            m["_tier"] = 1
        else:
            m["_tier"] = 2

    # 정렬: game-logic/unknown 우선 → 게임플레이 티어 → 점수 내림차순.
    # (라이브러리/인프라 함수도 전수 대상이나 후순위 웨이브로 미룬다 — 누락 아님.)
    cat_rank = {"game-logic": 0, "unknown": 1, "trivial": 2,
                "library-likely": 3, "thunk": 4}
    ordered = sorted(
        meta_by_addr.values(),
        key=lambda m: (cat_rank.get(m["category"], 9), m.get("_tier", 9), -m["score"]))

    out_dir = OUT_ROOT / bin_name
    work_dir = out_dir / "work"
    work_dir.mkdir(parents=True, exist_ok=True)

    # catalog.json (코드 제외)
    catalog = []
    for m in ordered:
        c = {k: v for k, v in m.items() if not k.startswith("_")}
        catalog.append(c)
    (out_dir / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")

    # 배치: game-logic + unknown 만 RE 대상(thunk/library/trivial은 카탈로그에 분류만 남김)
    re_targets = [m for m in ordered if m["category"] in ("game-logic", "unknown")]
    batches = []
    cur, cur_chars = [], 0
    for m in re_targets:
        c_len = m["size"]
        if cur and (len(cur) >= batch_funcs or cur_chars + c_len > batch_chars):
            batches.append(cur)
            cur, cur_chars = [], 0
        cur.append(m)
        cur_chars += c_len
    if cur:
        batches.append(cur)

    for i, batch in enumerate(batches):
        bpath = work_dir / f"batch-{i:04d}.jsonl"
        with bpath.open("w", encoding="utf-8") as fh:
            for m in batch:
                fh.write(json.dumps({
                    "addr": m["addr"], "name": m["name"], "sig": m["_sig"],
                    "conv": m["conv"], "size": m["size"],
                    "callers": len(m["callers"]),
                    "subsystems": m["subsystems"],
                    "dat_refs": m["dat_refs"][:20],
                    "str_refs": m["str_refs"],
                    "c": m["_c"],
                }, ensure_ascii=False) + "\n")

    # worklist.json
    bucket_counts: dict[str, int] = {}
    subsys_counts: dict[str, int] = {}
    for m in ordered:
        bucket_counts[m["category"]] = bucket_counts.get(m["category"], 0) + 1
        for s in m["subsystems"]:
            subsys_counts[s] = subsys_counts.get(s, 0) + 1
    named = sum(1 for m in ordered if not m["name"].startswith("FUN_"))

    summary = {
        "binary": bin_name,
        "total_functions": len(ordered),
        "named_functions": named,
        "buckets": bucket_counts,
        "subsystems": subsys_counts,
        "re_target_functions": len(re_targets),
        "batches": len(batches),
        "batch_funcs": batch_funcs,
        "batch_chars": batch_chars,
    }
    (out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "worklist.json").write_text(
        json.dumps({"order": [m["addr"] for m in re_targets],
                    "summary": summary}, ensure_ascii=False, indent=1),
        encoding="utf-8")

    # ledger.json (기존 보존)
    ledger_path = out_dir / "ledger.json"
    if not ledger_path.exists():
        ledger = {"binary": bin_name, "documented": {}, "batches_done": []}
        ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=1),
                               encoding="utf-8")

    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", help="export 디렉토리명 (예: G7MTClient)")
    ap.add_argument("--all", action="store_true", help="export 하위 전 바이너리")
    ap.add_argument("--batch-funcs", type=int, default=28)
    ap.add_argument("--batch-chars", type=int, default=14000)
    args = ap.parse_args()

    if args.all:
        bins = [p.name for p in EXPORT_ROOT.iterdir() if (p / "functions.jsonl").exists()]
    elif args.bin:
        bins = [args.bin]
    else:
        raise SystemExit("--bin <name> 또는 --all 필요")

    for b in sorted(bins):
        s = triage_binary(b, args.batch_funcs, args.batch_chars)
        print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
