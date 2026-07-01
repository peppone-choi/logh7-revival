"""Audit LOGH VII client text/display candidate functions from the Ghidra export.

The goal is not to prove semantics by naming alone.  This tool builds a stable
inventory of every function that participates in the currently known UI text
pipeline, then attaches evidence: ConstMsg lookups, text setters, UI resource
strings, referenced hardcoded strings, and existing patch descriptors.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
RE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPORT = RE_ROOT / ".omo" / "ghidra" / "export" / "G7MTClient"
DEFAULT_MSGDAT_FULL = RE_ROOT / "content" / "extracted" / "msgdat-full.json"
DEFAULT_PATCH_DIR = RE_ROOT / "tools" / "client_patches"
DEFAULT_JSON_OUT = RE_ROOT / ".omo" / "display-function-audit-20260630.json"
DEFAULT_MD_OUT = RE_ROOT / "docs" / "logh7-display-function-audit-2026-06-30.md"

DISPLAY_MARKERS = (
    "FUN_00503560",  # UI control primary text setter
    "FUN_00503610",  # UI control secondary/append text setter
    "FUN_004eac60",  # ANSI text -> client wide text
    "FUN_00522010",  # ConstMsg group/subId lookup
    "FUN_00503a10",  # UI object creation
    "FUN_00502780",  # UI object lookup by kind/index
)

TEXT_SINK_MARKERS = (
    "FUN_00503560",
    "FUN_00503610",
    "FUN_004eaaf0",
    "FUN_004ea8b0",
)

CORE_PIPELINE = {
    "0x004eac60": "ansi_to_wide_text",
    "0x004ea8b0": "wide_text_buffer_copy",
    "0x004eaaf0": "wide_text_buffer_assign",
    "0x00503560": "ui_control_set_text",
    "0x00503610": "ui_control_append_or_alt_text",
    "0x00522010": "constmsg_lookup",
}


@dataclass(frozen=True, slots=True)
class FunctionRow:
    addr: int
    name: str
    sig: str
    c: str


def read_functions(export: Path) -> list[FunctionRow]:
    rows: list[FunctionRow] = []
    for line in (export / "functions.jsonl").read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        data = json.loads(line)
        rows.append(
            FunctionRow(
                addr=int(data["addr"], 16),
                name=str(data.get("name", "")),
                sig=str(data.get("sig", "")),
                c=str(data.get("c", "")),
            )
        )
    rows.sort(key=lambda row: row.addr)
    return rows


def read_strings(export: Path) -> dict[int, str]:
    out: dict[int, str] = {}
    path = export / "strings.tsv"
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "\t" not in line:
            continue
        left, text = line.split("\t", 1)
        try:
            out[int(left, 16)] = text
        except ValueError:
            continue
    return out


def function_bounds(rows: list[FunctionRow]) -> dict[int, tuple[int, int]]:
    bounds: dict[int, tuple[int, int]] = {}
    for idx, row in enumerate(rows):
        end = rows[idx + 1].addr if idx + 1 < len(rows) else 0x01000000
        bounds[row.addr] = (row.addr, end)
    return bounds


def read_patch_index(patch_dir: Path, rows: list[FunctionRow]) -> dict[int, list[dict[str, Any]]]:
    bounds = function_bounds(rows)
    patch_index: dict[int, list[dict[str, Any]]] = {}
    if not patch_dir.exists():
        return patch_index
    for patch_file in sorted(patch_dir.glob("*.json")):
        try:
            descriptor = json.loads(patch_file.read_text(encoding="utf-8", errors="replace"))
        except json.JSONDecodeError:
            continue
        for patch in descriptor.get("patches", []):
            va_text = patch.get("va")
            if not isinstance(va_text, str):
                continue
            try:
                va = int(va_text, 16)
            except ValueError:
                continue
            owner = None
            for addr, (start, end) in bounds.items():
                if start <= va < end:
                    owner = addr
                    break
            if owner is None:
                continue
            patch_index.setdefault(owner, []).append(
                {
                    "file": patch_file.name,
                    "name": descriptor.get("name", patch_file.stem),
                    "va": f"0x{va:08x}",
                    "note": patch.get("note", ""),
                }
            )
    return patch_index


def load_constmsg_counts(path: Path) -> dict[int, int]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    constmsg = data.get("files", {}).get("constmsg.dat", {})
    offsets = constmsg.get("layout", {}).get("offsetTable", [])
    counts: dict[int, int] = {}
    for idx in range(max(0, len(offsets) - 1)):
        try:
            counts[idx] = int(offsets[idx + 1]["value"]) - int(offsets[idx]["value"])
        except (KeyError, TypeError, ValueError):
            continue
    return counts


def parse_int_token(value: str) -> int | None:
    token = value.strip().strip("()")
    if re.fullmatch(r"0x[0-9a-fA-F]+", token):
        return int(token, 16)
    if re.fullmatch(r"\d+", token):
        return int(token, 10)
    return None


def extract_constmsg_calls(c: str, counts: dict[int, int]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in re.finditer(r"FUN_00522010\(([^;\n)]*)\)", c):
        args = [part.strip() for part in match.group(1).split(",") if part.strip()]
        group = parse_int_token(args[0]) if len(args) >= 1 else None
        subid = parse_int_token(args[1]) if len(args) >= 2 else None
        status = "dynamic"
        if group is not None and subid is not None and counts:
            count = counts.get(group)
            if count is None:
                status = "no-table"
            elif subid >= count:
                status = "no-data"
            else:
                status = "ok"
        elif group is not None and len(args) == 1:
            status = "group-only-or-thiscall-artifact"
        out.append(
            {
                "args": args,
                "group": group,
                "subId": subid,
                "groupCount": counts.get(group) if group is not None else None,
                "status": status,
            }
        )
    return out


def referenced_strings(c: str, strings: dict[int, str]) -> list[dict[str, Any]]:
    addrs: set[int] = set()
    for match in re.finditer(r"(?:DAT_|PTR_[A-Za-z0-9_]*_|s_[^\s,;()]*_)([0-9a-fA-F]{8})", c):
        try:
            addrs.add(int(match.group(1), 16))
        except ValueError:
            pass
    refs = [
        {"addr": f"0x{addr:08x}", "text": strings[addr]}
        for addr in sorted(addrs)
        if addr in strings
    ]
    return refs


def markers(c: str) -> dict[str, int]:
    names = sorted(set(DISPLAY_MARKERS + TEXT_SINK_MARKERS + ("FUN_00522010", "FUN_004eac60")))
    return {name: c.count(name) for name in names if name in c}


def nearby_assets(refs: list[dict[str, Any]]) -> list[str]:
    assets = []
    for ref in refs:
        text = str(ref["text"])
        low = text.lower().replace("\\", "/")
        if "data/image" in low or low.endswith(".par") or low.endswith(".tga"):
            assets.append(text)
    return assets[:12]


def screen_guess(addr: int, refs: list[dict[str, Any]], constmsg: list[dict[str, Any]]) -> str:
    texts = " ".join(str(ref["text"]).lower().replace("\\", "/") for ref in refs)
    pairs = {(call.get("group"), call.get("subId")) for call in constmsg}
    if "gamemenu/menu_par" in texts:
        if 0x00596000 <= addr < 0x0059f000:
            return "character-create/profile gamemenu"
        return "lobby/game menu"
    if "window/window_par" in texts:
        return "common window/dialog"
    if "sentaku" in texts:
        return "selection/list dialog"
    if 0x0051C000 <= addr < 0x00522000:
        return "lobby/session/character menu"
    if 0x00530000 <= addr < 0x00548000:
        return "strategy map/panels"
    if 0x00544000 <= addr < 0x00546000 or (0x17, 1) in pairs or (0x18, 1) in pairs:
        return "tactical/grid panel"
    if 0x00548000 <= addr < 0x0055A000:
        return "world HUD/entity display"
    if 0x00570000 <= addr < 0x00580000:
        return "command/selection panels"
    if 0x00580000 <= addr < 0x00592000:
        return "HUD/detail panels"
    if 0x00592000 <= addr < 0x005A2000:
        return "character creation/profile"
    if 0x004B0000 <= addr < 0x004D0000:
        return "network/session data formatting"
    return "shared/ui helper"


def risk_flags(item: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    if any(call["status"] == "no-data" for call in item["constmsgCalls"]):
        flags.append("constmsg-no-data")
    if any(call["status"] == "no-table" for call in item["constmsgCalls"]):
        flags.append("constmsg-no-table")
    if item["setTextCount"] and not item["constmsgCalls"]:
        flags.append("record-or-hardcoded-text")
    if item["constmsgCalls"] and not item["setTextCount"] and "FUN_004eac60" not in item["markers"]:
        flags.append("lookup-wrapper-or-formatter")
    if item["assetRefs"]:
        flags.append("screen-resource")
    if item["patches"]:
        flags.append("already-patched")
    if any("NO DATA" in str(ref["text"]) or "NO TABLE" in str(ref["text"]) for ref in item["stringRefs"]):
        flags.append("literal-no-data-path")
    return flags


def build_audit(export: Path, msgdat_full: Path, patch_dir: Path) -> dict[str, Any]:
    rows = read_functions(export)
    strings = read_strings(export)
    counts = load_constmsg_counts(msgdat_full)
    patch_index = read_patch_index(patch_dir, rows)
    items: list[dict[str, Any]] = []
    for row in rows:
        if not any(marker in row.c for marker in DISPLAY_MARKERS):
            continue
        refs = referenced_strings(row.c, strings)
        constmsg = extract_constmsg_calls(row.c, counts)
        marker_counts = markers(row.c)
        item = {
            "addr": f"0x{row.addr:08x}",
            "name": row.name,
            "sig": row.sig,
            "screenGuess": screen_guess(row.addr, refs, constmsg),
            "markers": marker_counts,
            "setTextCount": sum(marker_counts.get(marker, 0) for marker in TEXT_SINK_MARKERS),
            "constmsgCalls": constmsg,
            "assetRefs": nearby_assets(refs),
            "stringRefs": refs[:16],
            "patches": patch_index.get(row.addr, []),
            "sourceLineCount": len(row.c.splitlines()),
            "sourceChars": len(row.c),
        }
        item["riskFlags"] = risk_flags(item)
        items.append(item)
    return {
        "source": {
            "export": str(export),
            "msgdatFull": str(msgdat_full),
            "patchDir": str(patch_dir),
        },
        "candidateDefinition": list(DISPLAY_MARKERS),
        "corePipeline": CORE_PIPELINE,
        "counts": {
            "functions": len(items),
            "withConstMsg": sum(1 for item in items if item["constmsgCalls"]),
            "withSetText": sum(1 for item in items if item["setTextCount"]),
            "withAssetRefs": sum(1 for item in items if item["assetRefs"]),
            "withPatches": sum(1 for item in items if item["patches"]),
            "constmsgNoDataStatic": sum(
                1
                for item in items
                if any(call["status"] == "no-data" for call in item["constmsgCalls"])
            ),
            "constmsgNoTableStatic": sum(
                1
                for item in items
                if any(call["status"] == "no-table" for call in item["constmsgCalls"])
            ),
        },
        "functions": items,
    }


def compact_constmsg(calls: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for call in calls[:8]:
        group = call.get("group")
        subid = call.get("subId")
        if group is None:
            label = ",".join(call.get("args", []))
        elif subid is None:
            label = f"g{group:#x}:dynamic"
        else:
            label = f"g{group:#x}/s{subid:#x}:{call['status']}"
        parts.append(label)
    if len(calls) > 8:
        parts.append(f"+{len(calls) - 8}")
    return "<br>".join(parts) if parts else ""


def compact_refs(refs: list[dict[str, Any]]) -> str:
    out: list[str] = []
    for ref in refs[:4]:
        text = str(ref["text"]).replace("|", "\\|")
        if len(text) > 48:
            text = text[:45] + "..."
        out.append(text)
    if len(refs) > 4:
        out.append(f"+{len(refs) - 4}")
    return "<br>".join(out)


def markdown_report(audit: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# LOGH VII Display Function Audit (2026-06-30)")
    lines.append("")
    lines.append("Scope: every Ghidra-exported function that references at least one known text/display marker.")
    lines.append("")
    lines.append("Markers:")
    for marker in audit["candidateDefinition"]:
        lines.append(f"- `{marker}`")
    lines.append("")
    counts = audit["counts"]
    lines.append("Summary:")
    for key, value in counts.items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("Core Pipeline:")
    for addr, role in audit["corePipeline"].items():
        lines.append(f"- `{addr}`: {role}")
    lines.append("")
    lines.append("## All Candidate Functions")
    lines.append("")
    lines.append(
        "| # | VA | Function | Screen/role guess | Text setters | ConstMsg calls | Assets/strings | Existing patches | Risk flags |"
    )
    lines.append("|---:|---|---|---|---:|---|---|---|---|")
    for idx, item in enumerate(audit["functions"], 1):
        patches = "<br>".join(f"{p['file']}@{p['va']}" for p in item["patches"][:4])
        if len(item["patches"]) > 4:
            patches += f"<br>+{len(item['patches']) - 4}"
        refs = item["assetRefs"] or [ref["text"] for ref in item["stringRefs"]]
        refs_text = compact_refs([{"text": ref} if isinstance(ref, str) else ref for ref in refs])
        flags = ", ".join(item["riskFlags"])
        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    f"`{item['addr']}`",
                    f"`{item['name']}`",
                    item["screenGuess"],
                    str(item["setTextCount"]),
                    compact_constmsg(item["constmsgCalls"]),
                    refs_text,
                    patches,
                    flags,
                ]
            )
            + " |"
        )
    lines.append("")
    lines.append("## Static ConstMsg Boundary Failures")
    lines.append("")
    failures = [
        item
        for item in audit["functions"]
        if any(call["status"] in {"no-data", "no-table"} for call in item["constmsgCalls"])
    ]
    if failures:
        for item in failures:
            bad = [
                call
                for call in item["constmsgCalls"]
                if call["status"] in {"no-data", "no-table"}
            ]
            lines.append(f"- `{item['addr']}` `{item['name']}` ({item['screenGuess']})")
            for call in bad:
                lines.append(
                    f"  - group={call.get('group')} subId={call.get('subId')} count={call.get('groupCount')} status={call['status']}"
                )
    else:
        lines.append("- None found in literal two-argument ConstMsg lookups. Dynamic lookups still require runtime probes.")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- `dynamic` ConstMsg calls require live MsgDat lookup tracing because the group/subId is read from runtime data.")
    lines.append("- `record-or-hardcoded-text` means the function sets visible text without a literal ConstMsg call in the same function; follow its input record or caller.")
    lines.append("- Existing patches are mapped by patch VA into the Ghidra function range, so this table shows which display functions already have surgical client fixes.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--msgdat-full", type=Path, default=DEFAULT_MSGDAT_FULL)
    parser.add_argument("--patch-dir", type=Path, default=DEFAULT_PATCH_DIR)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT)
    args = parser.parse_args()

    audit = build_audit(args.export, args.msgdat_full, args.patch_dir)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.md_out.parent.mkdir(parents=True, exist_ok=True)
    args.md_out.write_text(markdown_report(audit), encoding="utf-8")
    print(json.dumps({"json": str(args.json_out), "markdown": str(args.md_out), **audit["counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
