"""LANE 4 — enumerate & decode every data/*.dat (HFWR/GFWR string tables), the .tcf portrait-atlas
headers (+ tcf.hed index), and identify the single .db file. Writes content/extracted/dat-tables.json.

Builds on tools/logh7_msgdat.py (HFWR/GFWR record decoder) and tools/logh7_tcf_decode.py (TCF region
decoder + tcf.hed index reader). Every datum here is read from the bytes — nothing is invented.

Containers found under .omo/work/logh7-installed/data/:
  * 22 MsgDat/*.dat: 21 HFWR (magic 'HFWR' = 0x48465752) + 1 GFWR (g7sw.dat, magic 'GFWR' = 0x47465752)
    - HFWR = header(16B: textPointerCount@8, offsetTableCount@12) + dword offset table + NUL-term CP932
    - GFWR = header(16B: recordCount@12) + length-prefixed UTF-16LE strings
  * 7 image/Face/*.tcf portrait atlases + image/Face/tcf.hed (8-byte [u32 offset][u32 size] index)
  * 1 image/lens/Thumbs.db = OLE2 compound file = Windows Explorer thumbnail cache (NOT game data)

Usage:  python tools/logh7_dat_tables.py
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import logh7_msgdat as msgdat  # noqa: E402
import logh7_tcf_decode as tcf  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
INSTALLED = REPO / ".omo" / "work" / "logh7-installed"
MSGDAT_DIR = INSTALLED / "data" / "MsgDat"
FACE_DIR = INSTALLED / "data" / "image" / "Face"
THUMBS_DB = INSTALLED / "data" / "image" / "lens" / "Thumbs.db"
OUT = REPO / "content" / "extracted" / "dat-tables.json"

OLE2_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")

# Human-readable role of each MsgDat bank, inferred ONLY from decoded record content (cited in notes).
DAT_ROLE = {
    "constmsg.dat": "Master game-schema / UI catalog (flagship & squadron commands, facility blurbs, "
    "rank descriptions, screen labels). 3199 slots — the full client command/string schema.",
    "g7sw.dat": "NG-word (swear/slur) filter list for chat/naming — 14 UTF-16 entries.",
    "messages_0.dat": "Command-execution log templates ($xcommand/$xdate/$xproposer promotion & appointment logs).",
    "messages_1.dat": "Subordinate proposal/assent dialogue ($yname$ytitleprioritya register).",
    "messages_2.dat": "Council/opinion-exchange dialogue (卿はどう思うか / 卿の言うとおり).",
    "messages_3.dat": "Order-issuing dialogue ($yname$yrank に以下の命令を発令する).",
    "messages_4.dat": "Proposal-approval dialogue (軍にとって有意義 register).",
    "messages_5.dat": "Request/consult dialogue (実行をお願いしたい register).",
    "messages_6.dat": "Imperial-cause persuasion dialogue (帝国のため register).",
    "messages_7.dat": "Emperor-audience honorific dialogue (陛下の御聖断 / 御意 highest register).",
    "messages_8.dat": "Command-with-trust dialogue ($yname$ytitlepriorityb に命ずる register).",
    "messages_com_0.dat": "Strategic-map / command-mode messages (com bank 0, 174 slots).",
    "messages_com_1.dat": "Strategic-map / command-mode messages (com bank 1, sparse).",
    "messages_tac_0.dat": "Tactical (space-battle) messages, tac bank 0 (all 75 slots empty in this build).",
    "messages_tac_1.dat": "Tactical (space-battle) messages, tac bank 1.",
    "messages_tac_2.dat": "Tactical (space-battle) messages, tac bank 2.",
    "messages_tac_3.dat": "Tactical (space-battle) messages, tac bank 3.",
    "messages_tac_4.dat": "Tactical (space-battle) messages, tac bank 4.",
    "messages_tac_5.dat": "Tactical (space-battle) messages, tac bank 5.",
    "messages_tac_6.dat": "Tactical (space-battle) messages, tac bank 6.",
    "messages_tac_7.dat": "Tactical (space-battle) messages, tac bank 7.",
    "messages_tac_8.dat": "Tactical (space-battle) messages, tac bank 8.",
}

# Atlas naming decode (from project memory logh7-portrait-pool): [rank g将/o士][faction e帝/a同][gender m/f].
ATLAS_NOTE = {
    "gem.tcf": "rank=general(g/将) faction=empire(e/帝) gender=male",
    "gef.tcf": "rank=general(g/将) faction=empire(e/帝) gender=female",
    "gam.tcf": "rank=general(g/将) faction=alliance(a/同盟) gender=male",
    "gaf.tcf": "rank=general(g/将) faction=alliance(a/同盟) gender=female",
    "o.tcf": "rank=officer/soldier(o/士) generic pool",
    "oam.tcf": "rank=officer(o/士) faction=alliance(a/同盟) gender=male",
    "oem.tcf": "rank=officer(o/士) faction=empire(e/帝) gender=male",
}


def decode_msgdat() -> tuple[list[dict], int]:
    """Decode all *.dat via the existing HFWR/GFWR parser. Returns (file-entries, total record count)."""
    files: list[dict] = []
    total = 0
    for path in sorted(MSGDAT_DIR.glob("*.dat")):
        parsed = msgdat.index_msgdat_file(path)
        records = parsed["records"]
        nonempty = sum(1 for r in records if r.get("text"))
        # Keep full records but trim the heavy textCandidates/tokens fields out of the per-file blob.
        slim_records = []
        for r in records:
            entry = {"id": r["id"], "text": r["text"]}
            toks = r.get("tokens")
            if toks:
                entry["tokens"] = toks
            slim_records.append(entry)
        files.append(
            {
                "name": path.name,
                "size": parsed["size"],
                "magic": parsed["magic"],
                "container": "HFWR-cp932" if parsed["magic"] == "HFWR" else "GFWR-utf16le",
                "recordCount": len(records),
                "nonEmptyRecords": nonempty,
                "layout": parsed["layout"],
                "role": DAT_ROLE.get(path.name, "unclassified"),
                "records": slim_records,
            }
        )
        total += len(records)
    return files, total


def catalog_tcf() -> dict:
    """Catalog tcf.hed + the 7 .tcf atlas headers. We catalog headers/region geometry, not pixels."""
    hed = tcf.load_hed(FACE_DIR)
    nonzero = [(i, o, s) for i, (o, s) in enumerate(hed) if s > 0]
    atlas_data = {a: (FACE_DIR / a).read_bytes() for a in tcf.ATLASES if (FACE_DIR / a).exists()}

    # Per-index: which atlases the [offset,size] region actually DECODES in (validated geometry).
    decode_map: dict[int, list[str]] = {}
    for idx, (off, sz) in enumerate(hed):
        if sz == 0:
            continue
        hits = []
        for a, data in atlas_data.items():
            if off + sz <= len(data) and tcf.decode_region(data[off : off + sz]) is not None:
                hits.append(a)
        if hits:
            decode_map[idx] = hits

    atlases = []
    for a in tcf.ATLASES:
        data = atlas_data.get(a)
        if data is None:
            continue
        # Regions whose first valid decode is this atlas (dumpall-style assignment).
        first_here = [idx for idx, hits in decode_map.items() if hits[0] == a]
        dims = set()
        for idx in first_here:
            off, sz = hed[idx]
            w = struct.unpack_from("<H", data, off + 0x0C)[0]
            h = struct.unpack_from("<H", data, off + 0x0E)[0]
            dims.add((w, h))
        atlases.append(
            {
                "name": a,
                "size": len(data),
                "naming": ATLAS_NOTE.get(a, ""),
                "regionHeaderBytes": 18,
                "paletteBytes": 1024,
                "paletteEntries": 256,
                "paletteFormat": "BGRA",
                "pixelFormat": "8bpp palette index, stored bottom-up",
                "portraitsFirstAssigned": len(first_here),
                "dimensions": sorted(dims),
            }
        )

    return {
        "hed": {
            "name": "tcf.hed",
            "size": (FACE_DIR / "tcf.hed").stat().st_size,
            "entryBytes": 8,
            "entryFormat": "[u32 offset][u32 size] into a virtual concatenation of the .tcf atlases",
            "totalEntries": len(hed),
            "nonZeroEntries": len(nonzero),
            "decodableIndices": len(decode_map),
            "ambiguousIndices": sum(1 for hits in decode_map.values() if len(hits) > 1),
            "indexIsGlobalFaceId": True,
            "minDecodableIndex": min(decode_map) if decode_map else None,
            "maxDecodableIndex": max(decode_map) if decode_map else None,
        },
        "atlases": atlases,
        "notes": [
            "tcf.hed index == global face id (official picture/chara/NNN.jpg numbering); see "
            "logh7-face-id-encoding / logh7_tcf_decode.py.",
            "Region = 18B header (w@0x0c,h@0x0e u16) + 256*BGRA palette (1024B) + w*h palette indices "
            "(bottom-up). Typical 64x80.",
            "173 of the decodable indices' [offset,size] also fit a second atlas (ambiguous); the atlas "
            "filename ([rank][faction][gender]) is the authoritative owner. Full per-character decode "
            "already lives in content/character-portraits-complete.json + tools/logh7_tcf_decode.py.",
        ],
    }


def catalog_db() -> dict:
    raw = THUMBS_DB.read_bytes()
    return {
        "name": "Thumbs.db",
        "path": "data/image/lens/Thumbs.db",
        "size": len(raw),
        "magic": raw[:8].hex(),
        "format": "OLE2 / Microsoft Compound File Binary",
        "identification": "Windows Explorer thumbnail cache for the image/lens folder — a filesystem "
        "artifact, NOT game data. Contains no extractable game records.",
        "isGameData": False,
    }


def main() -> int:
    msgdat_files, total_records = decode_msgdat()
    tcf_catalog = catalog_tcf()
    db = catalog_db()

    doc = {
        "_source": ".omo/work/logh7-installed/data — *.dat (MsgDat string tables), *.tcf portrait "
        "atlases (+ tcf.hed), *.db",
        "_method": "Bytes-only. HFWR/GFWR decoded via tools/logh7_msgdat.py; TCF headers via "
        "tools/logh7_tcf_decode.py. No values invented.",
        "summary": {
            "datFiles": len(msgdat_files),
            "datRecordsTotal": total_records,
            "datNonEmptyTotal": sum(f["nonEmptyRecords"] for f in msgdat_files),
            "hfwrFiles": sum(1 for f in msgdat_files if f["magic"] == "HFWR"),
            "gfwrFiles": sum(1 for f in msgdat_files if f["magic"] == "GFWR"),
            "tcfAtlases": len(tcf_catalog["atlases"]),
            "tcfHedEntries": tcf_catalog["hed"]["totalEntries"],
            "tcfDecodablePortraits": tcf_catalog["hed"]["decodableIndices"],
            "dbFiles": 1,
        },
        "datTables": msgdat_files,
        "tcf": tcf_catalog,
        "db": db,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    print(json.dumps(doc["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
