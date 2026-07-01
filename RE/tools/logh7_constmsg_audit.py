"""Build a reproducible constmsg.dat RE audit.

The audit ties three evidence streams together:

* raw MsgDat layout (offset table -> constmsg group ranges)
* canonical extracted client strings
* Ghidra decompile call sites that consume constmsg lookups

It intentionally does not use schema.json or image classification as authority.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
FULL_MSGDAT_PATH = REPO_ROOT / "server" / "content" / "extracted" / "msgdat-full.json"
CLIENT_MSGDAT_PATH = REPO_ROOT / "server" / "content" / "client" / "msgdat.json"
FUNCTIONS_JSONL_PATH = REPO_ROOT / "RE" / ".omo" / "ghidra" / "export" / "G7MTClient" / "functions.jsonl"
CODEGRAPH_DB_PATH = REPO_ROOT / ".codegraph" / "codegraph.db"
DEFAULT_JSON_OUT = REPO_ROOT / "server" / "content" / "extracted" / "constmsg-groups.json"
DEFAULT_MD_OUT = REPO_ROOT / "docs" / "logh7-constmsg-re-audit-2026-06-30.md"


WRAPPER_GROUPS = {
    "FUN_004c8b70": None,  # variable dispatcher; keep as unresolved wrapper evidence.
    "FUN_004c8c90": 0x18,
    "FUN_004c8cb0": 0x03,
    "FUN_004c8cd0": 0x06,
    "FUN_004c8cf0": 0x4A,
    "FUN_004c8d10": 0x49,
}

GROUP_NOTES = {
    0x03: {
        "category": "authority card / duty post labels",
        "evidence": [
            "FUN_004c8cb0 wraps FUN_00522010(3,param)",
            "records start with post labels: individual, emperor, supreme commander",
        ],
    },
    0x04: {
        "category": "organization / institution labels",
        "evidence": [
            "FUN_005229d0(4) first-string consumer observed",
            "records include Imperial Palace, Cabinet, Fleet HQ, Supreme Council",
        ],
    },
    0x06: {
        "category": "authority card / duty post descriptions",
        "evidence": [
            "FUN_004c8cd0 wraps FUN_00522010(6,param)",
            "record alignment mirrors group 0x03 post labels",
        ],
    },
    0x18: {
        "category": "strategic grid / system / location labels",
        "evidence": [
            "FUN_004c8c90 wraps FUN_00522010(0x18,param)",
            "FUN_0057aa90 and FUN_0057a5d0 use FUN_004c8c90 in map/panel text formatting",
        ],
    },
    0x49: {
        "category": "place / facility labels",
        "evidence": [
            "FUN_004c8d10 wraps FUN_00522010(0x49,param)",
            "FUN_00591450 formats group 0x49 facility labels before group 0x4a spot labels",
        ],
    },
    0x4A: {
        "category": "spot / room labels",
        "evidence": [
            "FUN_004c8cf0 wraps FUN_00522010(0x4a,param)",
            "FUN_00591450 formats child spot labels through FUN_004c8cf0",
        ],
    },
    0x4E: {
        "category": "login / lobby / session menu text",
        "evidence": [
            "direct FUN_00522010(0x4e,subId) calls appear in lobby/session UI constructors",
            "records include game start, create character, delete character, session change",
        ],
    },
    0x5F: {
        "category": "command execution status text / NO DATA hotspot",
        "evidence": [
            "records are command execution status/error strings",
            "FUN_0057aa90 directly calls FUN_00522010(0x5f,subId); several constant subIds exceed this group range and become NO DATA candidates",
        ],
    },
}

ANCHOR_TEXTS = [
    "皇宮",
    "内閣",
    "宇宙艦隊司令部",
    "最高評議会",
    "政庁",
    "防衛司令部",
    "宇宙港",
    "旗艦工廠",
    "自治領主府",
    "警戒ロビー",
    "自由ロビー",
    "航路管理センター",
    "旗艦桟橋",
    "シミュレーションルーム",
    "黒真珠の間",
    "皇帝執務室",
    "自治領主執務室",
]

CALL_RE = re.compile(
    r"\b(FUN_00522010|FUN_005229d0|FUN_004c8b70|FUN_004c8c90|FUN_004c8cb0|FUN_004c8cd0|FUN_004c8cf0|FUN_004c8d10)\s*\(([^()]*)\)"
)


@dataclass(frozen=True)
class ConstmsgData:
    full_file: dict[str, Any]
    text_file: dict[str, Any]
    records: list[dict[str, Any]]
    offsets: list[int]


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _constmsg_file(data: dict[str, Any]) -> dict[str, Any]:
    files = data.get("files")
    if isinstance(files, dict):
        return files["constmsg.dat"]
    if isinstance(files, list):
        for entry in files:
            if entry.get("name") == "constmsg.dat" or entry.get("path") == "constmsg.dat":
                return entry
    raise KeyError("constmsg.dat")


def _offset_value(entry: Any) -> int:
    if isinstance(entry, int):
        return entry
    if isinstance(entry, dict) and isinstance(entry.get("value"), int):
        return int(entry["value"])
    raise TypeError(f"unsupported offset table entry: {entry!r}")


def load_constmsg(
    full_path: Path = FULL_MSGDAT_PATH,
    text_path: Path = CLIENT_MSGDAT_PATH,
) -> ConstmsgData:
    full_file = _constmsg_file(_read_json(full_path))
    text_file = _constmsg_file(_read_json(text_path))
    records = text_file.get("records")
    if not isinstance(records, list):
        raise TypeError("constmsg records must be a list")
    offset_table = full_file.get("layout", {}).get("offsetTable")
    if not isinstance(offset_table, list):
        raise TypeError("constmsg layout.offsetTable is missing")
    offsets = [_offset_value(entry) for entry in offset_table]
    return ConstmsgData(full_file=full_file, text_file=text_file, records=records, offsets=offsets)


def parse_int_expr(expr: str) -> int | None:
    token = expr.strip().strip("()")
    if re.fullmatch(r"0x[0-9a-fA-F]+", token):
        return int(token, 16)
    if re.fullmatch(r"\d+", token):
        return int(token, 10)
    return None


def group_for_record(offsets: list[int], record_id: int) -> int | None:
    current = None
    for index, base in enumerate(offsets):
        if base <= record_id:
            current = index
        else:
            break
    if current is None:
        return None
    next_base = offsets[current + 1] if current + 1 < len(offsets) else None
    if next_base is not None and record_id >= next_base:
        return None
    return current


def record_text(records: list[dict[str, Any]], record_id: int) -> str | None:
    if 0 <= record_id < len(records):
        value = records[record_id].get("text")
        return value if isinstance(value, str) else None
    return None


def build_groups(data: ConstmsgData) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for group, base in enumerate(data.offsets):
        next_base = data.offsets[group + 1] if group + 1 < len(data.offsets) else len(data.records)
        count = max(0, next_base - base)
        sample_ids = list(range(base, min(next_base, base + 8)))
        if count > 8:
            sample_ids.extend(range(max(base, next_base - 3), next_base))
        seen: set[int] = set()
        samples = []
        for record_id in sample_ids:
            if record_id in seen:
                continue
            seen.add(record_id)
            samples.append({"id": record_id, "text": record_text(data.records, record_id) or ""})
        note = GROUP_NOTES.get(group, {})
        groups.append(
            {
                "group": group,
                "groupHex": f"0x{group:02x}",
                "baseId": base,
                "endIdInclusive": next_base - 1 if next_base > base else None,
                "count": count,
                "firstText": record_text(data.records, base) or "",
                "lastText": record_text(data.records, next_base - 1) if next_base > base else "",
                "samples": samples,
                "inferredCategory": note.get("category"),
                "categoryEvidence": note.get("evidence", []),
            }
        )
    return groups


def build_anchors(data: ConstmsgData) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for anchor in ANCHOR_TEXTS:
        hits: list[dict[str, Any]] = []
        for index, record in enumerate(data.records):
            if record.get("text") != anchor:
                continue
            group = group_for_record(data.offsets, index)
            hits.append(
                {
                    "id": index,
                    "group": group,
                    "groupHex": f"0x{group:02x}" if group is not None else None,
                    "subId": index - data.offsets[group] if group is not None else None,
                }
            )
        out[anchor] = hits
    return out


def _split_args(raw: str) -> list[str]:
    return [arg.strip() for arg in raw.split(",") if arg.strip()]


def _call_line(c: str, offset: int) -> int:
    return c.count("\n", 0, offset) + 1


def _constant_record(data: ConstmsgData, group: int | None, sub_id: int | None) -> tuple[int | None, str | None]:
    if group is None or sub_id is None or group >= len(data.offsets):
        return None, None
    record_id = data.offsets[group] + sub_id
    next_base = data.offsets[group + 1] if group + 1 < len(data.offsets) else len(data.records)
    if record_id >= next_base:
        return None, "NO DATA"
    return record_id, record_text(data.records, record_id)


def _match_line(c: str, offset: int) -> str:
    start = c.rfind("\n", 0, offset) + 1
    end = c.find("\n", offset)
    if end == -1:
        end = len(c)
    return c[start:end].strip()


def _is_function_declaration(fn: dict[str, Any], callee: str, c: str, offset: int) -> bool:
    if fn.get("name") != callee:
        return False
    line = _match_line(c, offset)
    return re.match(
        rf"^(?:void|undefined\d*|uint|int|char|byte|bool|short|long|float|double|LPCSTR|[A-Za-z_][\w:<>]*\s*\*)\s+(?:__\w+\s+)?{re.escape(callee)}\b",
        line,
    ) is not None


def extract_callsites(data: ConstmsgData, functions_path: Path = FUNCTIONS_JSONL_PATH) -> list[dict[str, Any]]:
    callsites: list[dict[str, Any]] = []
    if not functions_path.exists():
        return callsites
    for raw in functions_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not raw.strip():
            continue
        try:
            fn = json.loads(raw)
        except json.JSONDecodeError:
            continue
        c = fn.get("c") or ""
        if "FUN_00522010" not in c and "FUN_005229d0" not in c and "FUN_004c8" not in c:
            continue
        for match in CALL_RE.finditer(c):
            callee = match.group(1)
            if _is_function_declaration(fn, callee, c, match.start()):
                continue
            args = _split_args(match.group(2))
            group: int | None = None
            sub_expr: str | None = None
            sub_id: int | None = None
            kind = "wrapperLookup" if callee in WRAPPER_GROUPS else "directLookup"
            if callee == "FUN_00522010":
                if len(args) >= 2:
                    group = parse_int_expr(args[0])
                    sub_expr = args[1]
                    sub_id = parse_int_expr(args[1])
                elif len(args) == 1:
                    group = parse_int_expr(args[0])
            elif callee == "FUN_005229d0":
                kind = "groupFirstString"
                if args:
                    group = parse_int_expr(args[0])
                    sub_expr = "0"
                    sub_id = 0
            else:
                group = WRAPPER_GROUPS.get(callee)
                if args:
                    sub_expr = args[0]
                    sub_id = parse_int_expr(args[0])
            record_id, text = _constant_record(data, group, sub_id)
            callsites.append(
                {
                    "functionVa": fn.get("addr"),
                    "functionName": fn.get("name"),
                    "callee": callee,
                    "kind": kind,
                    "group": group,
                    "groupHex": f"0x{group:02x}" if group is not None else None,
                    "subIdExpr": sub_expr,
                    "subId": sub_id,
                    "recordId": record_id,
                    "text": text,
                    "line": _call_line(c, match.start()),
                    "snippet": " ".join(match.group(0).split()),
                }
            )
    return callsites


def group_consumers(callsites: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for site in callsites:
        group_hex = site.get("groupHex")
        if group_hex is None:
            continue
        bucket = grouped.setdefault(group_hex, [])
        compact = {
            "functionVa": site["functionVa"],
            "functionName": site["functionName"],
            "callee": site["callee"],
            "kind": site["kind"],
            "line": site["line"],
            "subIdExpr": site["subIdExpr"],
            "recordId": site["recordId"],
            "text": site["text"],
        }
        if compact not in bucket:
            bucket.append(compact)
    for entries in grouped.values():
        entries.sort(key=lambda e: (str(e["functionVa"]), int(e["line"] or 0), str(e["callee"])))
    return grouped


def codegraph_summary(db_path: Path = CODEGRAPH_DB_PATH) -> dict[str, Any]:
    if not db_path.exists():
        return {"available": False, "path": str(db_path)}
    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        out_edges = [
            {
                "kind": row[0],
                "source": row[1],
                "target": row[2],
                "targetFile": row[3],
                "line": row[4],
                "metadata": json.loads(row[5]) if row[5] else None,
            }
            for row in cur.execute(
                """
                select e.kind, sn.name, tn.name, tn.file_path, e.line, e.metadata
                from edges e
                join nodes sn on e.source = sn.id
                join nodes tn on e.target = tn.id
                where sn.file_path = 'server/src/server/logh7-inferred-content.mjs'
                  and sn.name = 'buildInferredCatalogs'
                order by e.kind, e.line
                """
            )
        ]
        in_edges = [
            {
                "kind": row[0],
                "source": row[1],
                "sourceFile": row[2],
                "target": row[3],
                "line": row[4],
                "metadata": json.loads(row[5]) if row[5] else None,
            }
            for row in cur.execute(
                """
                select e.kind, sn.name, sn.file_path, tn.name, e.line, e.metadata
                from edges e
                join nodes sn on e.source = sn.id
                join nodes tn on e.target = tn.id
                where tn.file_path = 'server/src/server/logh7-inferred-content.mjs'
                  and tn.name = 'buildInferredCatalogs'
                order by e.kind, e.line
                """
            )
        ]
    finally:
        con.close()
    return {
        "available": True,
        "path": str(db_path),
        "serverBuildInferredCatalogs": {
            "incoming": in_edges,
            "outgoing": out_edges,
        },
    }


def build_audit() -> dict[str, Any]:
    data = load_constmsg()
    groups = build_groups(data)
    callsites = extract_callsites(data)
    consumers = group_consumers(callsites)
    for group in groups:
        group["exeConsumers"] = consumers.get(group["groupHex"], [])
    return {
        "generatedAt": datetime.now(UTC).isoformat(),
        "authority": {
            "rawLayout": str(FULL_MSGDAT_PATH.relative_to(REPO_ROOT)),
            "canonicalText": str(CLIENT_MSGDAT_PATH.relative_to(REPO_ROOT)),
            "exeIndex": str(FUNCTIONS_JSONL_PATH.relative_to(REPO_ROOT)),
            "excludedAuthority": ["schema.json", "visual image classification"],
        },
        "layout": {
            "textPointerCount": data.full_file.get("layout", {}).get("textPointerCount"),
            "offsetTableCount": data.full_file.get("layout", {}).get("offsetTableCount"),
            "recordCount": len(data.records),
        },
        "wrappers": [
            {
                "function": name,
                "group": group,
                "groupHex": f"0x{group:02x}" if group is not None else None,
                "status": "resolved" if group is not None else "variable-or-unresolved",
            }
            for name, group in WRAPPER_GROUPS.items()
        ],
        "groups": groups,
        "anchors": build_anchors(data),
        "callSites": callsites,
        "codegraph": codegraph_summary(),
    }


def _sample_texts(group: dict[str, Any], limit: int = 4) -> str:
    texts = [f"{sample['id']}:{sample['text']}" for sample in group["samples"] if sample.get("text")]
    return "<br>".join(texts[:limit])


def render_markdown(audit: dict[str, Any]) -> str:
    groups_by_hex = {group["groupHex"]: group for group in audit["groups"]}
    important = ["0x03", "0x04", "0x06", "0x18", "0x49", "0x4a", "0x4e", "0x5f"]
    lines = [
        "# LOGH VII constmsg.dat RE audit (2026-06-30)",
        "",
        "## Scope",
        "",
        "This audit backtraces `constmsg.dat` from raw MsgDat layout to EXE consumers. It deliberately excludes `schema.json` and visual image classification as authority.",
        "",
        "Authoritative inputs:",
        f"- raw layout: `{audit['authority']['rawLayout']}`",
        f"- canonical text: `{audit['authority']['canonicalText']}`",
        f"- EXE decompile index: `{audit['authority']['exeIndex']}`",
        f"- CodeGraph DB: `{audit['codegraph'].get('path')}`",
        "",
        "## Loader and lookup",
        "",
        "- `FUN_004e9bb0` calls `FUN_00521dc0(\"../data/MsgDat/constmsg.dat\")`.",
        "- `FUN_00521dc0` loads `constmsg.dat`, `messages_%d.dat`, `messages_com_%d.dat`, and `messages_tac_%d.dat`.",
        "- `FUN_00522010(group, subId)` resolves a string by offset-table group plus sub-id. Out-of-range group returns `NO TABLE`; crossing a group boundary returns `NO DATA`.",
        "- `FUN_005229d0(group)` returns the first string for groups `0x00..0x0e`, otherwise `NO DATA`.",
        "",
        "## Key groups",
        "",
        "| Group | Record ids | Count | Evidence-backed meaning | Samples |",
        "|---:|---:|---:|---|---|",
    ]
    for group_hex in important:
        group = groups_by_hex[group_hex]
        meaning = group.get("inferredCategory") or ""
        evidence = "; ".join(group.get("categoryEvidence") or [])
        lines.append(
            f"| `{group_hex}` | {group['baseId']}-{group['endIdInclusive']} | {group['count']} | {meaning}<br>{evidence} | {_sample_texts(group)} |"
        )
    lines.extend(
        [
            "",
            "## Anchor strings",
            "",
            "| Text | constmsg positions |",
            "|---|---|",
        ]
    )
    for text, hits in audit["anchors"].items():
        pos = ", ".join(
            f"id {hit['id']} / group `{hit['groupHex']}` sub {hit['subId']}" for hit in hits
        )
        lines.append(f"| {text} | {pos or 'not found'} |")
    lines.extend(
        [
            "",
            "## EXE consumer backtrace",
            "",
            "| Group | Consumer evidence |",
            "|---:|---|",
        ]
    )
    for group_hex in ["0x18", "0x49", "0x4a", "0x03", "0x06", "0x4e", "0x5f"]:
        group = groups_by_hex[group_hex]
        consumers = group.get("exeConsumers") or []
        snippets = []
        for consumer in consumers[:8]:
            sub = consumer.get("subIdExpr")
            text = consumer.get("text")
            suffix = f" sub `{sub}`" if sub is not None else ""
            if text:
                suffix += f" -> {text}"
            snippets.append(
                f"`{consumer['functionVa']}` {consumer['functionName']} -> `{consumer['callee']}`{suffix}"
            )
        if len(consumers) > 8:
            snippets.append(f"... {len(consumers) - 8} more in JSON")
        lines.append(f"| `{group_hex}` | {'<br>'.join(snippets)} |")
    codegraph = audit["codegraph"]
    incoming = codegraph.get("serverBuildInferredCatalogs", {}).get("incoming", []) if codegraph.get("available") else []
    outgoing = codegraph.get("serverBuildInferredCatalogs", {}).get("outgoing", []) if codegraph.get("available") else []
    lines.extend(
        [
            "",
            "## CodeGraph server path",
            "",
            f"- CodeGraph available: `{bool(codegraph.get('available'))}`.",
            f"- `loadInferredCatalogs` -> `buildInferredCatalogs` incoming edges: {len(incoming)}.",
            f"- `buildInferredCatalogs` outgoing calls/references: {len(outgoing)}.",
            "- Server-side exposure must keep using raw constmsg ids/ranges for institutions, facilities, spots, and rooms. `schema.json` remains a hint at most, not authority.",
            "",
            "## Derived client patch",
            "",
            "- `RE/tools/client_patches/command-panel-msgdat-groupfix.json` is derived from this audit plus raw disassembly.",
            "- It leaves valid group `0x5f` subIds `0..3` on command-status strings, and repoints only `FUN_0057aa90` subIds `4..0x12` from group `0x5f` to group `0x60`.",
            "- The patch is same-length (`push 0x5f` -> `push 0x60`, `6a5f -> 6a60`) and is included in `RE/tools/logh7_build_playable_client.py` default stack.",
            "",
            "## Current limits",
            "",
            "- Place/facility/spot names are now constmsg-backed, but location-to-background mapping is not recovered here.",
            "- Prior RE confirms spot record `S+0x08` is passed to `FUN_004d4f10`, which formats `../data/image/spot/bg%03d.jpg`; this audit does not assign background ids without data/EXE evidence.",
            "- Constant lookups that cross a group boundary are recorded as `text: \"NO DATA\"` in JSON. Group `0x5f` currently has such static candidates in `FUN_0057aa90` and should be chased before treating panel text as complete.",
            "- Tactical `NO DATA` should be chased through the same pattern: find the lookup group and the record field feeding sub-id, then fix the server record or client patch according to that evidence.",
            "",
            "Generated artifacts:",
            f"- `{DEFAULT_JSON_OUT.relative_to(REPO_ROOT)}`",
            f"- `{DEFAULT_MD_OUT.relative_to(REPO_ROOT)}`",
            "",
        ]
    )
    return "\n".join(lines)


def write_audit(json_out: Path = DEFAULT_JSON_OUT, md_out: Path = DEFAULT_MD_OUT) -> dict[str, Any]:
    audit = build_audit()
    json_out.parent.mkdir(parents=True, exist_ok=True)
    md_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_out.write_text(render_markdown(audit), encoding="utf-8")
    return audit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT)
    args = parser.parse_args(argv)
    audit = write_audit(args.json_out, args.md_out)
    print(
        json.dumps(
            {
                "json": str(args.json_out),
                "markdown": str(args.md_out),
                "groups": len(audit["groups"]),
                "callsites": len(audit["callSites"]),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
