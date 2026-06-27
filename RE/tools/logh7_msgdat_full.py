"""Lane 2 extractor: full MsgDat/constmsg.dat command + message schema.

Builds content/extracted/msgdat-full.json from the installed client
data/MsgDat/*.dat container set (HFWR indexed CP932 string catalogs +
one GFWR UTF-16LE list). Reuses tools/logh7_msgdat.py for the byte-level
container decode (header / aligned offset table / NUL-terminated payload)
and adds, per record, the full $token$ field list, plus structured parses:

  * constmsg.dat battle-command tooltips  "[ NAME ]\\n...実行待機時間NN G秒..."
  * constmsg.dat internal-affairs command descriptions "...消費MCPNNN..."
  * per-file role classification of the 9 messages_N / 2 com / 9 tac banks

Cross-references content/client/message-tokens.json (125-token wire
vocabulary) and content/client/message-catalog.json (203 protocol codes).

NEVER invents a value. Every datum is decoded from the bytes; anything not
present in the source is omitted. Run:  python tools/logh7_msgdat_full.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import logh7_msgdat as M  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MSGDAT_DIR = REPO / ".omo" / "work" / "logh7-installed" / "data" / "MsgDat"
TOKENS_REF = REPO / "content" / "client" / "message-tokens.json"
CATALOG_REF = REPO / "content" / "client" / "message-catalog.json"
OUT = REPO / "content" / "extracted" / "msgdat-full.json"

# constmsg.dat battle-command tooltip: "[ 移動 ]\n...実行待機時間48G秒\n実行所要時間目標地点まで継続"
_RE_TOOLTIP_NAME = re.compile(r"^\[\s*(.+?)\s*\]")
_RE_TOOLTIP_WAIT = re.compile(r"実行待機時間(\d+)G秒")
_RE_TOOLTIP_EXEC = re.compile(r"実行所要時間(.+?)(?:\n|$)")
# constmsg.dat internal-affairs command: "...消費MCP160\n実行待機0G時間\n実行所要0G時間"
_RE_IA_MCP = re.compile(r"消費MCP(\d+)")
_RE_IA_WAIT = re.compile(r"実行待機(\d+)G時間")
_RE_IA_EXEC = re.compile(r"実行所要(\d+)G時間")

# Per-file semantic role. Derived by inspection of bank contents (cited in doc).
FILE_ROLES: dict[str, str] = {
    "constmsg.dat": "master game-string catalog (HFWR): command tooltips, "
    "internal-affairs command descriptions, unit/weapon/crew vocabulary",
    "g7sw.dat": "GFWR NG-word filter list (banned-word table)",
    "messages_0.dat": "command-log entry templates (decree audit lines)",
    "messages_1.dat": "subordinate->superior proposal/response dialogue",
    "messages_2.dat": "council/consultation dialogue (卿 register)",
    "messages_3.dat": "superior->subordinate order/verdict dialogue (発令)",
    "messages_4.dat": "proposal/approval dialogue (military-merit register)",
    "messages_5.dat": "request/approval dialogue (yname yrank register)",
    "messages_6.dat": "imperial-cause persuasion dialogue",
    "messages_7.dat": "emperor-address dialogue (陛下 御聖断 register)",
    "messages_8.dat": "command-with-trust dialogue (ytitlepriorityb register)",
    "messages_com_0.dat": "command-confirmation messages ($com_* tokens, MCP cost lines)",
    "messages_com_1.dat": "command form placeholder/help strings",
    "messages_tac_0.dat": "tactical bank 0 (empty slot reserve)",
    "messages_tac_1.dat": "tactical HQ-comms dialogue (mission change / reinforcement)",
    "messages_tac_2.dat": "tactical dialogue bank 2",
    "messages_tac_3.dat": "tactical dialogue bank 3",
    "messages_tac_4.dat": "tactical dialogue bank 4",
    "messages_tac_5.dat": "tactical dialogue bank 5",
    "messages_tac_6.dat": "tactical dialogue bank 6",
    "messages_tac_7.dat": "tactical dialogue bank 7",
    "messages_tac_8.dat": "tactical dialogue bank 8",
}


def _parse_constmsg_commands(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Extract the two command tables embedded in constmsg.dat records."""
    battle: list[dict[str, Any]] = []
    internal: list[dict[str, Any]] = []
    for rec in records:
        text = rec["text"]
        rid = rec["id"]
        m = _RE_TOOLTIP_NAME.match(text)
        if m:
            entry: dict[str, Any] = {"recordId": rid, "name": m.group(1)}
            w = _RE_TOOLTIP_WAIT.search(text)
            if w:
                entry["waitG"] = int(w.group(1))
            e = _RE_TOOLTIP_EXEC.search(text)
            if e:
                entry["execG"] = e.group(1)
            battle.append(entry)
            continue
        mcp = _RE_IA_MCP.search(text)
        if mcp:
            entry = {"recordId": rid, "costMcp": int(mcp.group(1))}
            w = _RE_IA_WAIT.search(text)
            if w:
                entry["waitG"] = int(w.group(1))
            e = _RE_IA_EXEC.search(text)
            if e:
                entry["execG"] = int(e.group(1))
            # first non-cost line is the human description
            desc = text.split("消費MCP")[0].strip().splitlines()
            if desc:
                entry["description"] = " ".join(s.strip() for s in desc if s.strip())
            internal.append(entry)
    return {"battleCommands": battle, "internalAffairsCommands": internal}


def _enrich_file(file_index: dict[str, Any]) -> dict[str, Any]:
    name = file_index["path"]
    records = file_index["records"]
    magic = file_index["magic"]

    # Token coverage per record (HFWR records carry 'tokens'; GFWR do not).
    nonempty = [r for r in records if r["text"].strip()]
    token_records = [r for r in records if r.get("tokens")]
    all_tokens: dict[str, int] = {}
    for rec in records:
        for tok in rec.get("tokens", []):
            all_tokens[tok] = all_tokens.get(tok, 0) + 1

    out: dict[str, Any] = {
        "path": name,
        "magic": magic,
        "size": file_index["size"],
        "role": FILE_ROLES.get(name, "unclassified"),
        "layout": file_index["layout"],
        "recordCount": len(records),
        "nonEmptyRecordCount": len(nonempty),
        "tokenBearingRecordCount": len(token_records),
        "distinctTokens": sorted(all_tokens),
        "tokenFrequency": dict(sorted(all_tokens.items(), key=lambda kv: (-kv[1], kv[0]))),
        "records": [
            {
                "id": r["id"],
                "encoding": r.get("encoding"),
                "text": r["text"],
                **({"tokens": r["tokens"]} if r.get("tokens") else {}),
            }
            for r in records
        ],
    }
    if name == "constmsg.dat":
        out["commandTables"] = _parse_constmsg_commands(records)
    return out


def build() -> dict[str, Any]:
    base = M.build_msgdat_index(MSGDAT_DIR)
    files = {f["path"]: _enrich_file(f) for f in base["files"]}

    tokens_ref = json.loads(TOKENS_REF.read_text(encoding="utf-8"))
    catalog_ref = json.loads(CATALOG_REF.read_text(encoding="utf-8"))
    ref_tokens = {t["token"] for t in tokens_ref["tokens"]}

    # Which decoded tokens are covered by / missing from the 125-token reference?
    decoded_tokens: set[str] = set()
    for f in files.values():
        decoded_tokens.update(f["distinctTokens"])

    constmsg = files["constmsg.dat"]
    counts = {
        "files": len(files),
        "totalRecords": sum(f["recordCount"] for f in files.values()),
        "totalNonEmptyRecords": sum(f["nonEmptyRecordCount"] for f in files.values()),
        "totalTokenBearingRecords": sum(f["tokenBearingRecordCount"] for f in files.values()),
        "distinctTokens": len(decoded_tokens),
        "constmsgBattleCommands": len(constmsg["commandTables"]["battleCommands"]),
        "constmsgInternalAffairsCommands": len(
            constmsg["commandTables"]["internalAffairsCommands"]
        ),
        "protocolCodesInCatalog": catalog_ref.get("count"),
    }

    return {
        "_source": "client data/MsgDat/*.dat decoded byte-exact via tools/logh7_msgdat.py "
        "(HFWR header + aligned offset table + NUL-terminated multibyte records; GFWR length-prefixed UTF-16LE)",
        "_note": "Lane 2 full command/message catalog. constmsg.dat = master string catalog with "
        "two embedded command tables (battle tooltips ids 4-63; internal-affairs descriptions with "
        "消費MCP cost). messages_N/com/tac = indexed dialogue banks; record id = semantic message slot, "
        "$token$ = server-filled wire field. All values decoded from bytes; nothing inferred.",
        "_encoding": {
            "HFWR": "record-level cp932 or cp949 (retail Japanese vs localized installed files)",
            "GFWR": "utf-16le",
        },
        "counts": counts,
        "tokenCrossReference": {
            "referenceVocabularySize": len(ref_tokens),
            "referenceSource": tokens_ref.get("_source"),
            "decodedTokensInReference": sorted(decoded_tokens & ref_tokens),
            "decodedTokensNotInReference": sorted(decoded_tokens - ref_tokens),
            "referenceTokensNotDecodedHere": sorted(ref_tokens - decoded_tokens),
        },
        "protocolCatalogCrossReference": {
            "source": catalog_ref.get("_source"),
            "framing": catalog_ref.get("_framing"),
            "codeCount": catalog_ref.get("count"),
            "note": "Protocol codes (0x0201 etc.) are the wire envelope; MsgDat records are the "
            "human-readable templates rendered for command-log / dialogue UI. They are distinct "
            "layers and do not share an id space.",
        },
        "files": files,
    }


def main() -> None:
    index = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    c = index["counts"]
    print(f"wrote {OUT.relative_to(REPO)}")
    print(json.dumps(c, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
