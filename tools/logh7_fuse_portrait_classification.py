from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any


DEFAULT_RANKINGS = [
    ("vi_help_ensemble", "LOGH VI help ensemble", "prior", Path(".omo/work/logh7-prior-game/vi-help-vii-ensemble-rankings.json")),
    ("vi_help_deep", "LOGH VI help DINOv2+CLIP", "prior_deep", Path(".omo/work/logh7-prior-game/vi-help-vii-deep-rankings.json")),
    ("vi_labeled_ensemble", "LOGH VI extracted ensemble", "prior", Path(".omo/work/logh7-prior-game/vi-vii-ensemble-rankings.json")),
    ("vi_labeled_deep", "LOGH VI extracted DINOv2+CLIP", "prior_deep", Path(".omo/work/logh7-prior-game/vi-vii-deep-rankings.json")),
    (
        "jp_nameplate_ensemble",
        "Japanese screenshot nameplate ensemble",
        "nameplate",
        Path(".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-vii-ensemble-rankings.json"),
    ),
    (
        "jp_nameplate_deep",
        "Japanese screenshot nameplate DINOv2+CLIP",
        "nameplate_deep",
        Path(".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-vii-deep-rankings.json"),
    ),
    (
        "kr_nameplate_ensemble",
        "Korean screenshot nameplate ensemble",
        "nameplate",
        Path(".omo/work/logh7-screenshot-evidence/nameplate-vii-ensemble-rankings.json"),
    ),
    (
        "kr_nameplate_deep",
        "Korean screenshot nameplate DINOv2+CLIP",
        "nameplate_deep",
        Path(".omo/work/logh7-screenshot-evidence/nameplate-vii-deep-rankings.json"),
    ),
]

DIRECT_EVIDENCE_MANIFESTS = [
    Path(".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-manifest.json"),
    Path(".omo/work/logh7-screenshot-evidence/nameplate-confirmed-manifest.json"),
]

SOURCE_WEIGHT = {
    "prior": 0.78,
    "prior_deep": 1.18,
    "nameplate": 1.08,
    "nameplate_deep": 1.42,
}

STATUS_BONUS = {"accepted": 0.16, "candidate": 0.08, "rejected": 0.0}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKC", value)
    value = value.lower()
    value = re.sub(r"[\s・ㆍ·.\-_/()（）［］\\[\\],，]+", "", value)
    return value


def display_name(reference: dict[str, Any]) -> str:
    for key in ("name_ko", "name_kr", "name_ja", "name_en", "title", "source_name", "identifier"):
        value = reference.get(key)
        if value:
            return str(value)
    return "unknown"


def merge_direct_evidence(reference: dict[str, Any], direct_by_key: dict[str, dict[str, Any]]) -> dict[str, Any]:
    keys = [
        reference.get("local_path"),
        reference.get("source_name"),
        Path(str(reference.get("local_path") or "")).name,
    ]
    merged = dict(reference)
    for key in keys:
        if not key:
            continue
        evidence = direct_by_key.get(str(key))
        if not evidence:
            continue
        for source_key, target_key in [
            ("name_kr", "name_kr"),
            ("name_kr", "name_ko"),
            ("name_ko", "name_ko"),
            ("name_ja", "name_ja"),
            ("name_en", "name_en"),
            ("note", "nameplate_note"),
            ("evidence_path", "evidence_path"),
            ("annotated_context_path", "annotated_context_path"),
            ("transcription_status", "transcription_status"),
        ]:
            if evidence.get(source_key) and not merged.get(target_key):
                merged[target_key] = evidence[source_key]
        break
    return merged


def build_direct_evidence_index(paths: list[Path]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for path in paths:
        data = load_json(path)
        if not data:
            continue
        for entry in data.get("entries", []):
            for key in [
                entry.get("local_path"),
                entry.get("portrait_path"),
                entry.get("source_name"),
                entry.get("id"),
                Path(str(entry.get("local_path") or entry.get("portrait_path") or "")).name,
            ]:
                if key:
                    index[str(key)] = entry
    return index


def score_contribution(source_kind: str, result_status: str, result_gap: float, rank: int, score: float, confidence_cap: float | None) -> float:
    score_norm = clamp((score - 0.72) / 0.22)
    gap_norm = clamp(result_gap / 0.06)
    rank_decay = 1.0 / (rank ** 0.68)
    status_bonus = STATUS_BONUS.get(result_status, 0.0)
    cap = confidence_cap if confidence_cap is not None else 1.0
    return SOURCE_WEIGHT[source_kind] * rank_decay * cap * (0.70 * score_norm + 0.22 * gap_norm + status_bonus)


def reliability(top_score: float, lead: float, source_count: int, deep_count: int, nameplate_count: int, best_raw_score: float) -> str:
    if nameplate_count >= 1 and best_raw_score >= 0.84 and lead >= 0.28:
        return "nameplate_strong"
    if source_count >= 3 and deep_count >= 1 and top_score >= 2.2 and lead >= 0.40:
        return "high"
    if source_count >= 2 and top_score >= 1.35 and lead >= 0.22:
        return "probable"
    if top_score >= 0.75:
        return "candidate"
    return "weak"


def load_contributions(ranking_defs: list[tuple[str, str, str, Path]], direct_by_key: dict[str, dict[str, Any]], max_rank: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    contributions: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    for source_id, label, kind, path in ranking_defs:
        data = load_json(path)
        if not data:
            continue
        sources.append({"id": source_id, "label": label, "kind": kind, "path": str(path), "counts": data.get("_counts")})
        for result in data.get("results", []):
            reference = merge_direct_evidence(result.get("reference", {}), direct_by_key)
            name = display_name(reference)
            name_key = normalize_name(name)
            if not name_key:
                continue
            confidence_cap = reference.get("confidence_cap")
            result_status = result.get("status", "rejected")
            result_gap = float(result.get("gap") or 0.0)
            for rank, top in enumerate((result.get("top") or [])[:max_rank], start=1):
                slot = str(top.get("slot") or "").zfill(4)
                if not re.fullmatch(r"\d{4}", slot):
                    continue
                raw_score = float(top.get("score") or top.get("quick_score") or 0.0)
                contribution_score = score_contribution(kind, result_status, result_gap, rank, raw_score, confidence_cap)
                contributions.append(
                    {
                        "slot": slot,
                        "nameKey": name_key,
                        "displayName": name,
                        "nameKo": reference.get("name_ko") or reference.get("name_kr"),
                        "nameJa": reference.get("name_ja"),
                        "nameEn": reference.get("name_en"),
                        "score": contribution_score,
                        "rawScore": raw_score,
                        "rank": rank,
                        "sourceId": source_id,
                        "sourceLabel": label,
                        "sourceKind": kind,
                        "resultStatus": result_status,
                        "resultGap": result_gap,
                        "reference": reference,
                        "match": top,
                    }
                )
    return contributions, sources


def fuse(contributions: list[dict[str, Any]], sources: list[dict[str, Any]], topn: int) -> dict[str, Any]:
    grouped: dict[str, dict[str, dict[str, Any]]] = {}
    for item in contributions:
        slot = item["slot"]
        name_key = item["nameKey"]
        slot_group = grouped.setdefault(slot, {})
        aggregate = slot_group.setdefault(
            name_key,
            {
                "slot": slot,
                "nameKey": name_key,
                "displayName": item["displayName"],
                "nameKo": item.get("nameKo"),
                "nameJa": item.get("nameJa"),
                "nameEn": item.get("nameEn"),
                "fusedScore": 0.0,
                "bestRawScore": 0.0,
                "sources": set(),
                "deepSources": set(),
                "nameplateSources": set(),
                "evidence": [],
            },
        )
        aggregate["fusedScore"] += item["score"]
        aggregate["bestRawScore"] = max(aggregate["bestRawScore"], item["rawScore"])
        aggregate["sources"].add(item["sourceId"])
        if "deep" in item["sourceKind"]:
            aggregate["deepSources"].add(item["sourceId"])
        if "nameplate" in item["sourceKind"]:
            aggregate["nameplateSources"].add(item["sourceId"])
        aggregate["evidence"].append(
            {
                "sourceId": item["sourceId"],
                "sourceLabel": item["sourceLabel"],
                "sourceKind": item["sourceKind"],
                "contributionScore": round(item["score"], 6),
                "rawScore": round(item["rawScore"], 6),
                "rank": item["rank"],
                "resultStatus": item["resultStatus"],
                "resultGap": round(item["resultGap"], 6),
                "reference": item["reference"],
                "match": item["match"],
            }
        )

    slots: dict[str, dict[str, Any]] = {}
    reliability_counts: dict[str, int] = {}
    for slot, candidates in grouped.items():
        ranked = sorted(candidates.values(), key=lambda item: item["fusedScore"], reverse=True)
        second_score = ranked[1]["fusedScore"] if len(ranked) > 1 else 0.0
        payloads = []
        for index, candidate in enumerate(ranked[:topn]):
            lead = candidate["fusedScore"] - second_score if index == 0 else 0.0
            source_ids = sorted(candidate["sources"])
            deep_ids = sorted(candidate["deepSources"])
            nameplate_ids = sorted(candidate["nameplateSources"])
            candidate_reliability = reliability(
                candidate["fusedScore"],
                lead,
                len(source_ids),
                len(deep_ids),
                len(nameplate_ids),
                candidate["bestRawScore"],
            )
            if index == 0:
                reliability_counts[candidate_reliability] = reliability_counts.get(candidate_reliability, 0) + 1
            candidate["evidence"].sort(key=lambda evidence: evidence["contributionScore"], reverse=True)
            payloads.append(
                {
                    "rank": index + 1,
                    "slot": slot,
                    "displayName": candidate["displayName"],
                    "nameKo": candidate["nameKo"],
                    "nameJa": candidate["nameJa"],
                    "nameEn": candidate["nameEn"],
                    "fusedScore": round(candidate["fusedScore"], 6),
                    "lead": round(lead, 6),
                    "bestRawScore": round(candidate["bestRawScore"], 6),
                    "reliability": candidate_reliability,
                    "sourceCount": len(source_ids),
                    "deepSourceCount": len(deep_ids),
                    "nameplateSourceCount": len(nameplate_ids),
                    "sourceIds": source_ids,
                    "evidence": candidate["evidence"][:12],
                }
            )
        slots[slot] = {"slot": slot, "suggestions": payloads}

    return {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_method": "weighted late-fusion over deterministic ensemble, DINOv2+CLIP rankings, and visible screenshot nameplate crops; scores remain review suggestions, not automatic truth",
        "_weights": SOURCE_WEIGHT,
        "_counts": {
            "sources": len(sources),
            "contributions": len(contributions),
            "slots_with_suggestions": len(slots),
            "top_reliability": reliability_counts,
        },
        "sources": sources,
        "slots": dict(sorted(slots.items())),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fuse LOGH VII portrait ranking evidence into slot-level AI suggestions.")
    parser.add_argument("--out", type=Path, default=Path(".omo/work/portrait-review/fused-classification.json"))
    parser.add_argument("--max-rank", type=int, default=8)
    parser.add_argument("--topn", type=int, default=8)
    args = parser.parse_args(argv)

    direct_by_key = build_direct_evidence_index(DIRECT_EVIDENCE_MANIFESTS)
    contributions, sources = load_contributions(DEFAULT_RANKINGS, direct_by_key, max_rank=args.max_rank)
    output = fuse(contributions, sources, topn=args.topn)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["_counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
