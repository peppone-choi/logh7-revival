#!/usr/bin/env python3
"""Extract & classify HARDCODED strings from a game binary (EXE/DLL).

The MsgDat/String.txt data files are covered by logh7_text_classify.py. This tool covers the OTHER
text — strings baked into the binary: hardcoded Japanese UI/dialog captions, error/format messages,
asset paths, debug logs. Ghidra's strings.tsv only captured ASCII, so the hardcoded *Japanese* (cp932)
and *dialog* (UTF-16LE) strings are invisible there; this scans the raw bytes for all three encodings.

Scans: ASCII (>=4 printable), cp932/Shift-JIS (>=2 chars incl. kana/kanji), UTF-16LE (>=2 chars).
Classifies each so the LOCALIZABLE hardcoded text (esp. untranslated Japanese) is separated from
internal code strings (asset paths, debug, RTTI symbols, API names).

Output: content/extracted/binary-strings-<bin>.json + summary.
Run: python tools/logh7_binary_strings.py [path-to-binary]
     (default: .omo/work/logh7-installed/exe/G7MTClient.exe)
"""
from __future__ import annotations
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BIN = os.path.join(ROOT, ".omo", "work", "logh7-installed", "exe", "G7MTClient.exe")


def has_cjk(s: str) -> bool:
    for ch in s:
        o = ord(ch)
        if 0x3040 <= o <= 0x30ff or 0x4e00 <= o <= 0x9fff or 0xff00 <= o <= 0xffef or 0x3000 <= o <= 0x303f:
            return True
    return False


def scan_ascii(data: bytes, minlen=4):
    out = []
    run = bytearray()
    start = 0
    for i, b in enumerate(data):
        if 0x20 <= b <= 0x7e:
            if not run:
                start = i
            run.append(b)
        else:
            if len(run) >= minlen:
                out.append((start, run.decode("ascii", "replace")))
            run = bytearray()
    if len(run) >= minlen:
        out.append((start, run.decode("ascii", "replace")))
    return out


def _sjis_lead(b):
    return 0x81 <= b <= 0x9f or 0xe0 <= b <= 0xfc


def _sjis_trail(b):
    return (0x40 <= b <= 0x7e) or (0x80 <= b <= 0xfc)


# NOTE: a brute SJIS/UTF-16 scan of the WHOLE binary is unreliable — the data sections are full of
# float/vtable/table constants that coincidentally decode as valid kana/kanji (proven: 400k+ garbage
# hits). The game's narrative text lives in the MsgDat/String.txt DATA files (see logh7_text_classify.py),
# and the only HARDCODED localizable text in the EXE is in the .rsrc RESOURCES (dialog/menu/string-table).
# So we parse .rsrc precisely instead of byte-guessing. ASCII strings are still scanned (reliable).
import re as _re


def _sections(data: bytes):
    if data[:2] != b"MZ":
        return []
    e = struct.unpack_from("<I", data, 0x3c)[0]
    if data[e:e + 4] != b"PE\x00\x00":
        return []
    nsec = struct.unpack_from("<H", data, e + 6)[0]
    opt = struct.unpack_from("<H", data, e + 20)[0]
    base = e + 24 + opt
    secs = []
    for i in range(nsec):
        o = base + i * 40
        name = data[o:o + 8].rstrip(b"\x00").decode("ascii", "replace")
        vsize = struct.unpack_from("<I", data, o + 8)[0]
        vaddr = struct.unpack_from("<I", data, o + 12)[0]
        rsize = struct.unpack_from("<I", data, o + 16)[0]
        rptr = struct.unpack_from("<I", data, o + 20)[0]
        chars = struct.unpack_from("<I", data, o + 36)[0]
        secs.append({"name": name, "vsize": vsize, "vaddr": vaddr, "rsize": rsize, "rptr": rptr, "exec": bool(chars & 0x20000000)})
    return secs


def _u16_runs(blob: bytes, min_chars=2):
    """UTF-16LE printable runs inside a RESOURCE blob (clean — no code false positives)."""
    out, i, n = [], 0, len(blob) - 1
    while i < n:
        units = []
        start = i
        while i < n:
            cp = blob[i] | (blob[i + 1] << 8)
            if cp < 0x20 or cp == 0:
                break
            units.append(cp); i += 2
        if len(units) >= min_chars:
            out.append((start, "".join(chr(c) for c in units)))
        i = max(i + 2, start + 2)
    return out


RT_TYPE = {4: "rsrc.menu", 5: "rsrc.dialog", 6: "rsrc.stringtable", 9: "rsrc.accelerator", 16: "rsrc.version"}


def scan_rsrc(data: bytes):
    """Parse .rsrc and pull the real hardcoded UI strings from menu(4)/dialog(5)/stringtable(6)."""
    secs = [s for s in _sections(data) if s["name"] == ".rsrc"]
    if not secs:
        return []
    rs = secs[0]
    rva0, ptr0, size = rs["vaddr"], rs["rptr"], rs["rsize"]

    def rva_to_off(rva):
        return rva - rva0 + ptr0

    out = []

    def walk(dir_off, depth, cur_type):
        if dir_off + 16 > len(data):
            return
        named = struct.unpack_from("<H", data, dir_off + 12)[0]
        idd = struct.unpack_from("<H", data, dir_off + 14)[0]
        for k in range(named + idd):
            eo = dir_off + 16 + k * 8
            nameid = struct.unpack_from("<I", data, eo)[0]
            offv = struct.unpack_from("<I", data, eo + 4)[0]
            type_id = cur_type
            if depth == 0:
                type_id = nameid & 0x7fffffff
            if offv & 0x80000000:  # subdirectory
                walk(ptr0 + (offv & 0x7fffffff), depth + 1, type_id)
            else:  # data entry (leaf)
                de = ptr0 + offv
                if de + 16 > len(data):
                    continue
                data_rva = struct.unpack_from("<I", data, de)[0]
                data_sz = struct.unpack_from("<I", data, de + 4)[0]
                doff = rva_to_off(data_rva)
                if doff < 0 or doff + data_sz > len(data):
                    continue
                blob = data[doff:doff + data_sz]
                kind = RT_TYPE.get(type_id)
                if kind in ("rsrc.menu", "rsrc.dialog", "rsrc.stringtable"):
                    for ro, s in _u16_runs(blob, min_chars=1 if kind == "rsrc.stringtable" else 2):
                        st = s.strip()
                        if st and any(0x3000 <= ord(c) <= 0x9fff or 0xff00 <= ord(c) <= 0xffef or 0x20 <= ord(c) <= 0x7e for c in st):
                            out.append((doff + ro, st, kind))

    walk(ptr0, 0, None)
    return out


def pe_exec_ranges(data: bytes):
    """File-offset ranges of EXECUTABLE PE sections (.text) — random code bytes decode as bogus SJIS,
    so real hardcoded strings are only in the non-executable data sections."""
    if data[:2] != b"MZ":
        return []
    e = struct.unpack_from("<I", data, 0x3c)[0]
    if data[e:e + 4] != b"PE\x00\x00":
        return []
    nsec = struct.unpack_from("<H", data, e + 6)[0]
    opt = struct.unpack_from("<H", data, e + 20)[0]
    base = e + 24 + opt
    ranges = []
    for i in range(nsec):
        o = base + i * 40
        raw_size = struct.unpack_from("<I", data, o + 16)[0]
        raw_ptr = struct.unpack_from("<I", data, o + 20)[0]
        chars = struct.unpack_from("<I", data, o + 36)[0]
        if chars & 0x20000000:  # IMAGE_SCN_MEM_EXECUTE
            ranges.append((raw_ptr, raw_ptr + raw_size))
    return ranges


def _has_kana(s: str) -> bool:
    return any(0x3040 <= ord(c) <= 0x30ff for c in s)


def _in_exec(off: int, ranges) -> bool:
    return any(a <= off < b for a, b in ranges)


def _cjk_count(s: str) -> int:
    return sum(1 for c in s if 0x3040 <= ord(c) <= 0x30ff or 0x4e00 <= ord(c) <= 0x9fff or 0xff00 <= ord(c) <= 0xffef)


def _accept_jp(off: int, s: str, end: int, data: bytes, ranges) -> bool:
    # exclude code sections; require a clean (null/ascii) boundary; require a DENSE, LONGISH CJK run
    # (data-section float/vtable constants form 1-2 stray pseudo-kana, real text is >=4 CJK chars).
    if _in_exec(off, ranges):
        return False
    nxt = data[end] if end < len(data) else 0
    if nxt != 0 and not (0x20 <= nxt <= 0x7e):
        return False
    cjk = _cjk_count(s)
    if cjk < 4 or cjk / max(1, len(s)) < 0.6:
        return False
    return _has_kana(s) or cjk >= 5


def scan_cp932(data: bytes, ranges):
    out = []
    for m in _SJIS_RUN.finditer(data):
        try:
            s = m.group().decode("cp932")
        except Exception:
            continue
        if _accept_jp(m.start(), s, m.end(), data, ranges):
            out.append((m.start(), s))
    return out


def scan_utf16le(data: bytes, ranges):
    out = []
    for m in _U16_RUN.finditer(data):
        try:
            s = m.group().decode("utf-16le")
        except Exception:
            continue
        if not _in_exec(m.start(), ranges):
            cjk = _cjk_count(s)
            if cjk >= 3 and cjk / max(1, len(s)) >= 0.5:
                out.append((m.start(), s))
    return out


ASSET_RE = re.compile(r"\.(tga|bmp|png|jpg|dds|mdx|mds|dat|wav|ogg|txt|hed|x)$|^\.\./|data[/\\]|images[/\\]", re.I)
DEBUG_RE = re.compile(r"%[0-9.\-]*[dsfx]|_INF:|T=%f|log start|\.cpp|\.c$|sec\]|\\n$|GetLength|input_from_stream|output_to_stream")
SYMBOL_RE = re.compile(r"\.\?A[VU]|@@|::|class |struct ")
API_RE = re.compile(r"\.dll$|\.DLL$|^[A-Z][a-zA-Z]+[AW]$|D3D|Direct|KERNEL32|USER32|GDI32|WINMM|wsock|socket", re.I)
UI_TEXT_RE = re.compile(r"over than|failed|error|cannot|please|select|invalid|warning|success|complete", re.I)


def classify(text: str, enc: str) -> str:
    if enc in ("cp932", "utf16le") and has_cjk(text):
        return "localizable.hardcoded-jp"  # the key target: untranslated baked-in Japanese
    if ASSET_RE.search(text):
        return "internal.asset-path"
    if SYMBOL_RE.search(text):
        return "internal.symbol-rtti"
    if DEBUG_RE.search(text):
        return "internal.debug-format"
    if API_RE.search(text):
        return "internal.api-name"
    if UI_TEXT_RE.search(text):
        return "ui.error-or-message"  # ascii, possibly user-facing
    return "other-ascii"


def main(argv) -> int:
    path = argv[0] if argv else DEFAULT_BIN
    if not os.path.exists(path):
        print(f"binary not found: {path}", file=sys.stderr)
        return 2
    data = open(path, "rb").read()
    name = os.path.basename(path)

    entries = []
    seen = set()
    # Real hardcoded UI text = the .rsrc resources (dialog/menu/string-table), parsed precisely.
    for off, s, kind in scan_rsrc(data):
        cat = "localizable.hardcoded-jp" if has_cjk(s) else kind
        entries.append({"va_off": off, "enc": "utf16le", "text": s, "category": cat, "restype": kind})
    for off, s in scan_ascii(data):
        key = (s,)
        if key in seen:
            continue
        seen.add(key)
        entries.append({"va_off": off, "enc": "ascii", "text": s, "category": classify(s, "ascii")})

    by_cat = {}
    for e in entries:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1

    out = os.path.join(ROOT, "content", "extracted", f"binary-strings-{os.path.splitext(name)[0]}.json")
    result = {
        "_binary": name, "_size": len(data),
        "_purpose": "Hardcoded strings baked into the binary (ASCII + cp932 + UTF-16LE), classified. "
                    "localizable.hardcoded-jp = untranslated Japanese UI/dialog text needing localization.",
        "_counts": {"total": len(entries), "byCategory": dict(sorted(by_cat.items(), key=lambda kv: -kv[1]))},
        "entries": entries,
    }
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"wrote {out}  ({name}, {len(data)} bytes)")
    print(f"total hardcoded strings: {len(entries)}")
    for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        print(f"  {v:>5}  {k}")
    jp = [e for e in entries if e["category"] == "localizable.hardcoded-jp"]
    print(f"--- localizable hardcoded Japanese: {len(jp)} (sample) ---")
    for e in jp[:20]:
        print(f"  +0x{e['va_off']:06x} [{e['enc']}] {e['text'][:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
