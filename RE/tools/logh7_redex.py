"""logh7_redex -- query the LOGH VII RE index (Ghidra full export) so modding/protocol work is a
grep, not a manual disasm. Loads functions.jsonl (decompiled C), strings.tsv, symbols.tsv from a
binary's export dir (default .omo/ghidra/export/G7MTClient).

Commands:
  func  <hexaddr>            decompiled C of the function AT or CONTAINING <hexaddr>
  grep  <regex> [--c|--names] functions whose decompiled C matches (default: list addr+name; --c prints C)
  name  <regex>             functions whose name matches
  str   <regex>             strings matching (addr + text)
  xref  <substr>            functions whose C references a string at the address of any string containing <substr>
  calls <hexaddr|name>      functions whose C contains a call to FUN_<addr> / name

Usage:
  python -m tools.logh7_redex func 0x6130a0
  python -m tools.logh7_redex grep "edx \+ 0x18" --names
  python -m tools.logh7_redex str -i medal
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

DEFAULT_EXPORT: Final[Path] = Path(".omo/ghidra/export/G7MTClient")


@dataclass(slots=True)
class Func:
    addr: int
    name: str
    sig: str
    c: str


def _load_funcs(export: Path) -> list[Func]:
    funcs: list[Func] = []
    path = export / "functions.jsonl"
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        funcs.append(Func(int(d["addr"], 16), d["name"], d.get("sig", ""), d.get("c", "")))
    funcs.sort(key=lambda f: f.addr)
    return funcs


def _containing(funcs: list[Func], addr: int) -> Func | None:
    best: Func | None = None
    for f in funcs:
        if f.addr <= addr:
            best = f
        else:
            break
    return best


def cmd_func(funcs: list[Func], args: argparse.Namespace) -> int:
    addr = int(args.addr, 16)
    exact = next((f for f in funcs if f.addr == addr), None)
    f = exact or _containing(funcs, addr)
    if f is None:
        print(f"no function at/containing 0x{addr:08x}")
        return 1
    tag = "EXACT" if exact else f"CONTAINING (entry 0x{f.addr:08x})"
    print(f"// {tag}  0x{f.addr:08x}  {f.name}  {f.sig}")
    print(f.c)
    return 0


def cmd_grep(funcs: list[Func], args: argparse.Namespace) -> int:
    flags = re.IGNORECASE if args.i else 0
    rx = re.compile(args.regex, flags)
    n = 0
    for f in funcs:
        if rx.search(f.c):
            n += 1
            if args.c:
                print(f"\n// ===== 0x{f.addr:08x}  {f.name}  {f.sig} =====")
                print(f.c)
            else:
                lines = [ln.strip() for ln in f.c.splitlines() if rx.search(ln)]
                print(f"0x{f.addr:08x}  {f.name}  ({len(lines)} hit)  e.g. {lines[0][:90] if lines else ''}")
    print(f"\n// {n} functions matched")
    return 0


def cmd_name(funcs: list[Func], args: argparse.Namespace) -> int:
    rx = re.compile(args.regex, re.IGNORECASE if args.i else 0)
    for f in funcs:
        if rx.search(f.name):
            print(f"0x{f.addr:08x}  {f.name}  {f.sig}")
    return 0


def cmd_str(export: Path, args: argparse.Namespace) -> int:
    rx = re.compile(args.regex, re.IGNORECASE if args.i else 0)
    for line in (export / "strings.tsv").read_text(encoding="utf-8", errors="replace").splitlines():
        if rx.search(line):
            print(line)
    return 0


def cmd_xref(export: Path, funcs: list[Func], args: argparse.Namespace) -> int:
    # find string addresses whose text contains substr, then functions referencing those addrs
    addrs: list[str] = []
    for line in (export / "strings.tsv").read_text(encoding="utf-8", errors="replace").splitlines():
        if "\t" not in line:
            continue
        a, text = line.split("\t", 1)
        if args.substr.lower() in text.lower():
            addrs.append(a.lower().replace("0x", ""))
    if not addrs:
        print(f"no string contains {args.substr!r}")
        return 1
    print(f"// {len(addrs)} matching strings; functions referencing them:")
    for f in funcs:
        cl = f.c.lower()
        if any(a in cl for a in addrs):
            print(f"0x{f.addr:08x}  {f.name}")
    return 0


def cmd_calls(funcs: list[Func], args: argparse.Namespace) -> int:
    token = args.target
    if token.startswith("0x"):
        token = "FUN_" + token[2:].lower().zfill(8)
    rx = re.compile(re.escape(token), re.IGNORECASE)
    for f in funcs:
        if rx.search(f.c):
            print(f"0x{f.addr:08x}  {f.name}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("-i", action="store_true", help="case-insensitive")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("func"); p.add_argument("addr")
    p = sub.add_parser("grep"); p.add_argument("regex"); p.add_argument("--c", action="store_true"); p.add_argument("--names", action="store_true")
    p = sub.add_parser("name"); p.add_argument("regex")
    p = sub.add_parser("str"); p.add_argument("regex")
    p = sub.add_parser("xref"); p.add_argument("substr")
    p = sub.add_parser("calls"); p.add_argument("target")
    args = parser.parse_args()

    if args.command == "str":
        return cmd_str(args.export, args)
    funcs = _load_funcs(args.export)
    if args.command == "func":
        return cmd_func(funcs, args)
    if args.command == "grep":
        return cmd_grep(funcs, args)
    if args.command == "name":
        return cmd_name(funcs, args)
    if args.command == "xref":
        return cmd_xref(args.export, funcs, args)
    if args.command == "calls":
        return cmd_calls(funcs, args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
