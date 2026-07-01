"""Build a whole-EXE function audit from LOGH VII Ghidra exports.

This is broader than the display-specific audit: every decompiled function in
every available EXE export is emitted to JSONL with evidence-based categories.
The generated catalog is intentionally machine-readable so follow-up RE can
filter all functions without re-scanning the large Ghidra JSON every time.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


RE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPORT_ROOT = RE_ROOT / ".omo" / "ghidra" / "export"
DEFAULT_PATCH_DIR = RE_ROOT / "tools" / "client_patches"
DEFAULT_OUT_DIR = RE_ROOT / ".omo" / "exe-function-audit-20260630"
DEFAULT_MD_OUT = RE_ROOT / "docs" / "logh7-exe-function-audit-2026-06-30.md"


CATEGORY_PATTERNS: dict[str, tuple[str, ...]] = {
    "text_display": (
        "FUN_00522010",
        "FUN_004eac60",
        "FUN_004ea8b0",
        "FUN_004eaaf0",
        "FUN_00503560",
        "FUN_00503610",
        "TextOut",
        "ExtTextOut",
        "DrawText",
        "SetWindowText",
        "GetWindowText",
        "MultiByteToWideChar",
        "WideCharToMultiByte",
        "CreateFont",
    ),
    "ui_layout_scene": (
        "FUN_00503a10",
        "FUN_00502780",
        "FUN_00502940",
        "FUN_00502eb0",
        "data/image",
        ".par",
        ".tga",
        "CreateWindow",
        "DialogBox",
        "GetDlgItem",
        "ShowWindow",
        "MoveWindow",
        "SetWindowPos",
        "InvalidateRect",
    ),
    "network_socket": (
        "recv",
        "send",
        "socket",
        "connect",
        "bind",
        "listen",
        "select",
        "WSA",
        "htons",
        "ntohs",
        "inet_",
        "closesocket",
    ),
    "protocol_stream": (
        "+ 0x1c",
        "+ 0x20",
        "+ 0x24",
        "0x2004",
        "0x2006",
        "0x0f",
        "0x0323",
        "0x0356",
        "0x1201",
        "0x0034",
        "0x0035",
        "0x0036",
    ),
    "render_d3d": (
        "Direct3D",
        "D3D",
        "IDirect3D",
        "DrawPrimitive",
        "SetTexture",
        "CreateTexture",
        "CreateVertexBuffer",
        "Present",
        "BeginScene",
        "EndScene",
    ),
    "input": (
        "GetAsyncKeyState",
        "GetKeyState",
        "keyboard",
        "mouse",
        "WM_KEY",
        "WM_LBUTTON",
        "WM_RBUTTON",
        "DirectInput",
    ),
    "file_resource": (
        "CreateFile",
        "ReadFile",
        "WriteFile",
        "CloseHandle",
        "fopen",
        "fread",
        "fwrite",
        "FindFirstFile",
        "LoadResource",
        "FindResource",
        "LoadLibrary",
        "GetProcAddress",
        "MsgDat",
        ".dat",
        ".ini",
        ".bmp",
        ".mdx",
        ".mds",
    ),
    "registry_config": (
        "RegOpenKey",
        "RegCreateKey",
        "RegQueryValue",
        "RegSetValue",
        "HKEY_",
        "SOFTWARE",
        "BOTHTEC",
    ),
    "process_thread": (
        "CreateProcess",
        "ShellExecute",
        "WinExec",
        "CreateThread",
        "ExitProcess",
        "TerminateProcess",
        "WaitForSingleObject",
    ),
    "crypto_codec": (
        "Blowfish",
        "cipher",
        "encrypt",
        "decrypt",
        "FUN_006140c0",
        "FUN_00614220",
        "FUN_00614",
        "XOR",
    ),
    "error_assert_log": (
        "FUN_005923a0",
        "assert",
        "Error",
        "Invalid",
        "NO DATA",
        "NO TABLE",
        "MessageBox",
    ),
    "mfc_crt_runtime": (
        "CWnd",
        "CDialog",
        "CString",
        "__Cxx",
        "operator_new",
        "FUN_0064",
        "FUN_0065",
        "MSVCRT",
    ),
}

CONST_RE = re.compile(r"0x[0-9a-fA-F]+|\b\d{3,}\b")
CALL_RE = re.compile(r"FUN_[0-9a-fA-F]{8}|[A-Za-z_][A-Za-z0-9_]*[AW]?(?=\()")
STRING_ADDR_RE = re.compile(r"(?:DAT_|PTR_[A-Za-z0-9_]*_|s_[^\s,;()]*_)([0-9a-fA-F]{8})")
CONSTMSG_RE = re.compile(r"FUN_00522010\(([^;\n)]*)\)")


@dataclass(frozen=True, slots=True)
class FunctionRow:
    exe: str
    addr: int
    name: str
    sig: str
    c: str


def load_functions(export_dir: Path) -> list[FunctionRow]:
    path = export_dir / "functions.jsonl"
    rows: list[FunctionRow] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        data = json.loads(line)
        rows.append(
            FunctionRow(
                exe=export_dir.name,
                addr=int(data["addr"], 16),
                name=str(data.get("name", "")),
                sig=str(data.get("sig", "")),
                c=str(data.get("c", "")),
            )
        )
    rows.sort(key=lambda row: row.addr)
    return rows


def load_strings(export_dir: Path) -> dict[int, str]:
    out: dict[int, str] = {}
    path = export_dir / "strings.tsv"
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


def load_symbols(export_dir: Path) -> dict[str, list[str]]:
    by_name: dict[str, list[str]] = defaultdict(list)
    path = export_dir / "symbols.tsv"
    if not path.exists():
        return by_name
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            by_name[parts[2]].append(line)
    return by_name


def function_bounds(rows: list[FunctionRow]) -> list[tuple[int, int, int]]:
    out: list[tuple[int, int, int]] = []
    for idx, row in enumerate(rows):
        end = rows[idx + 1].addr if idx + 1 < len(rows) else 0x7FFFFFFF
        out.append((row.addr, end, idx))
    return out


def load_patch_index(patch_dir: Path, rows_by_exe: dict[str, list[FunctionRow]]) -> dict[tuple[str, int], list[dict[str, str]]]:
    # Current patch descriptors target G7MTClient addresses.
    rows = rows_by_exe.get("G7MTClient", [])
    bounds = function_bounds(rows)
    index: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
    if not patch_dir.exists():
        return index
    for file in sorted(patch_dir.glob("*.json")):
        try:
            descriptor = json.loads(file.read_text(encoding="utf-8", errors="replace"))
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
            owner_idx = None
            for start, end, idx in bounds:
                if start <= va < end:
                    owner_idx = idx
                    break
            if owner_idx is None:
                continue
            owner = rows[owner_idx]
            index[(owner.exe, owner.addr)].append(
                {
                    "patch": str(descriptor.get("name", file.stem)),
                    "file": file.name,
                    "va": f"0x{va:08x}",
                    "note": str(patch.get("note", "")),
                }
            )
    return index


def compact(text: str, limit: int = 96) -> str:
    one = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    if len(one) <= limit:
        return one
    return one[: limit - 3] + "..."


def referenced_strings(c: str, strings: dict[int, str]) -> list[dict[str, str]]:
    addrs: set[int] = set()
    for match in STRING_ADDR_RE.finditer(c):
        try:
            addrs.add(int(match.group(1), 16))
        except ValueError:
            pass
    return [
        {"addr": f"0x{addr:08x}", "text": strings[addr]}
        for addr in sorted(addrs)
        if addr in strings
    ][:24]


def parse_int(value: str) -> int | None:
    token = value.strip().strip("()")
    if re.fullmatch(r"0x[0-9a-fA-F]+", token):
        return int(token, 16)
    if re.fullmatch(r"\d+", token):
        return int(token, 10)
    return None


def constmsg_calls(c: str) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for match in CONSTMSG_RE.finditer(c):
        args = [part.strip() for part in match.group(1).split(",") if part.strip()]
        group = parse_int(args[0]) if len(args) >= 1 else None
        subid = parse_int(args[1]) if len(args) >= 2 else None
        calls.append({"args": args, "group": group, "subId": subid})
    return calls


def extract_calls(c: str) -> list[str]:
    calls = []
    for match in CALL_RE.finditer(c):
        name = match.group(0)
        if name in {"if", "for", "while", "switch", "return", "sizeof"}:
            continue
        calls.append(name)
    counts = Counter(calls)
    return [name for name, _ in counts.most_common(32)]


def constants(c: str) -> list[str]:
    counts = Counter(match.group(0).lower() for match in CONST_RE.finditer(c))
    noisy = {"0x0", "0x1", "0x2", "0x3", "0x4", "0x8", "0xffffffff"}
    return [value for value, _ in counts.most_common(32) if value not in noisy]


def categories(c: str, refs: list[dict[str, str]]) -> list[str]:
    hay = c + "\n" + "\n".join(ref["text"] for ref in refs)
    out = []
    for category, patterns in CATEGORY_PATTERNS.items():
        if any(pattern in hay for pattern in patterns):
            out.append(category)
    if not out:
        out.append("uncategorized")
    return out


def role_guess(exe: str, addr: int, cats: list[str], refs: list[dict[str, str]]) -> str:
    ref_text = " ".join(ref["text"].lower().replace("\\", "/") for ref in refs)
    cat = set(cats)
    if exe == "G7MTClient":
        if addr < 0x004B0000:
            return "client core/protocol bootstrap"
        if 0x004B0000 <= addr < 0x004D0000:
            return "client network/session/protocol data"
        if 0x004D0000 <= addr < 0x00510000:
            return "client resource/text/runtime helpers"
        if 0x00510000 <= addr < 0x00522000:
            return "lobby/session/game-menu UI"
        if 0x00522000 <= addr < 0x00530000:
            return "msgdat/resources/shared UI"
        if 0x00530000 <= addr < 0x00548000:
            return "strategy map UI/data"
        if 0x00548000 <= addr < 0x00560000:
            return "world HUD/entity display"
        if 0x00560000 <= addr < 0x00592000:
            return "command/detail/HUD UI"
        if 0x00592000 <= addr < 0x005A3000:
            return "character creation/profile UI"
        if 0x005A3000 <= addr < 0x00600000:
            return "render/resource/runtime"
        return "linked runtime/library"
    if "network_socket" in cat:
        return f"{exe} network/update"
    if "registry_config" in cat:
        return f"{exe} registry/config"
    if "process_thread" in cat:
        return f"{exe} process launcher"
    if "text_display" in cat or "ui_layout_scene" in cat:
        return f"{exe} UI/dialog"
    if "data/image" in ref_text:
        return f"{exe} resource UI"
    return f"{exe} runtime/helper"


def analyze_function(
    row: FunctionRow,
    strings: dict[int, str],
    symbols: dict[str, list[str]],
    patches: list[dict[str, str]],
) -> dict[str, Any]:
    refs = referenced_strings(row.c, strings)
    cats = categories(row.c, refs)
    call_names = extract_calls(row.c)
    api_refs = [name for name in call_names if name in symbols][:24]
    return {
        "exe": row.exe,
        "addr": f"0x{row.addr:08x}",
        "name": row.name,
        "sig": row.sig,
        "roleGuess": role_guess(row.exe, row.addr, cats, refs),
        "categories": cats,
        "calls": call_names,
        "apiRefs": api_refs,
        "constmsgCalls": constmsg_calls(row.c),
        "constants": constants(row.c),
        "stringRefs": refs,
        "patches": patches,
        "sourceLineCount": len(row.c.splitlines()),
        "sourceChars": len(row.c),
    }


def write_outputs(
    rows: list[dict[str, Any]],
    out_dir: Path,
    markdown_path: Path,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    all_jsonl = out_dir / "all-functions.jsonl"
    with all_jsonl.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

    by_exe: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_exe[row["exe"]].append(row)
    for exe, exe_rows in by_exe.items():
        path = out_dir / f"{exe}.functions.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in exe_rows:
                f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        with (out_dir / f"{exe}.functions.tsv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(
                [
                    "exe",
                    "addr",
                    "name",
                    "roleGuess",
                    "categories",
                    "constmsg",
                    "apiRefs",
                    "strings",
                    "patches",
                    "sourceChars",
                ]
            )
            for row in exe_rows:
                writer.writerow(
                    [
                        row["exe"],
                        row["addr"],
                        row["name"],
                        row["roleGuess"],
                        ",".join(row["categories"]),
                        json.dumps(row["constmsgCalls"], ensure_ascii=False),
                        ",".join(row["apiRefs"]),
                        " | ".join(compact(ref["text"], 64) for ref in row["stringRefs"][:4]),
                        ",".join(p["file"] for p in row["patches"]),
                        row["sourceChars"],
                    ]
                )

    summary = summarize(rows)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(markdown(summary, all_jsonl, out_dir), encoding="utf-8")
    return {"allJsonl": str(all_jsonl), "summary": str(out_dir / "summary.json"), "markdown": str(markdown_path)}


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_exe: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_exe[row["exe"]].append(row)
    summary: dict[str, Any] = {"totalFunctions": len(rows), "executables": {}}
    for exe, exe_rows in sorted(by_exe.items()):
        cat_counts = Counter(cat for row in exe_rows for cat in row["categories"])
        role_counts = Counter(row["roleGuess"] for row in exe_rows)
        summary["executables"][exe] = {
            "functionCount": len(exe_rows),
            "categoryCounts": dict(cat_counts.most_common()),
            "roleCounts": dict(role_counts.most_common()),
            "withStrings": sum(1 for row in exe_rows if row["stringRefs"]),
            "withConstMsg": sum(1 for row in exe_rows if row["constmsgCalls"]),
            "withPatches": sum(1 for row in exe_rows if row["patches"]),
            "topPatchedFunctions": [
                {
                    "addr": row["addr"],
                    "name": row["name"],
                    "patchCount": len(row["patches"]),
                    "patches": row["patches"][:8],
                }
                for row in sorted(exe_rows, key=lambda item: len(item["patches"]), reverse=True)
                if row["patches"]
            ][:16],
        }
    return summary


def markdown(summary: dict[str, Any], all_jsonl: Path, out_dir: Path) -> str:
    lines: list[str] = []
    lines.append("# LOGH VII EXE Function Audit (2026-06-30)")
    lines.append("")
    lines.append("Scope: every function in every available Ghidra EXE export, not only text setters.")
    lines.append("")
    lines.append(f"- Full JSONL: `{all_jsonl}`")
    lines.append(f"- Per-EXE JSONL/TSV directory: `{out_dir}`")
    lines.append(f"- Total functions: {summary['totalFunctions']}")
    lines.append("")
    lines.append("## Executable Coverage")
    lines.append("")
    lines.append("| EXE/export | Functions | With strings | With ConstMsg | With patches | Top categories |")
    lines.append("|---|---:|---:|---:|---:|---|")
    for exe, data in summary["executables"].items():
        cats = ", ".join(f"{k}={v}" for k, v in list(data["categoryCounts"].items())[:8])
        lines.append(
            f"| `{exe}` | {data['functionCount']} | {data['withStrings']} | {data['withConstMsg']} | {data['withPatches']} | {cats} |"
        )
    lines.append("")
    lines.append("## G7MTClient Patched Function Owners")
    lines.append("")
    patched = summary["executables"].get("G7MTClient", {}).get("topPatchedFunctions", [])
    if patched:
        lines.append("| VA | Function | Patch count | Patch descriptors |")
        lines.append("|---|---|---:|---|")
        for item in patched:
            files = ", ".join(p["file"] for p in item["patches"])
            lines.append(f"| `{item['addr']}` | `{item['name']}` | {item['patchCount']} | {files} |")
    else:
        lines.append("- No mapped patch owners.")
    lines.append("")
    lines.append("## Category Meaning")
    lines.append("")
    for category, patterns in CATEGORY_PATTERNS.items():
        sample = ", ".join(f"`{p}`" for p in patterns[:6])
        lines.append(f"- `{category}`: {sample}")
    lines.append("")
    lines.append("## Verification Note")
    lines.append("")
    lines.append("This is a static whole-function inventory. Function semantics marked by category are evidence hints from decompile text, strings, imports, and patch ownership; gameplay-critical byte layouts still require focused RE and live client validation before changing server/client behavior.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-root", type=Path, default=DEFAULT_EXPORT_ROOT)
    parser.add_argument("--patch-dir", type=Path, default=DEFAULT_PATCH_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT)
    parser.add_argument("--exe", action="append", help="Limit to one or more export directory names.")
    args = parser.parse_args()

    export_dirs = [
        path
        for path in sorted(args.export_root.iterdir())
        if path.is_dir() and (path / "functions.jsonl").exists()
    ]
    if args.exe:
        wanted = set(args.exe)
        export_dirs = [path for path in export_dirs if path.name in wanted]

    rows_by_exe = {path.name: load_functions(path) for path in export_dirs}
    patch_index = load_patch_index(args.patch_dir, rows_by_exe)
    all_rows: list[dict[str, Any]] = []
    for path in export_dirs:
        strings = load_strings(path)
        symbols = load_symbols(path)
        for row in rows_by_exe[path.name]:
            all_rows.append(
                analyze_function(row, strings, symbols, patch_index.get((row.exe, row.addr), []))
            )
    outputs = write_outputs(all_rows, args.out_dir, args.md_out)
    print(json.dumps({"functions": len(all_rows), **outputs}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
