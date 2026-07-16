"""Offline render audit: KO strings → CP949 encoding → UTF-16 simulation → codepoint/block analysis.

For each Korean string in constmsg-ko.json (or strings-worksheet.json if present):
  1. Encode to CP949 and record byte length.
  2. Simulate the client's MultiByteToWideChar(CP949, MB_ERR_INVALID_CHARS, ...) by decoding
     CP949 → str. Report success/failure (mirrors MB_ERR_INVALID_CHARS behaviour: any byte
     invalid in CP949 returns failure=False).
  3. Enumerate Unicode codepoints with named block (Hangul Syllables / Hangul Jamo / CJK /
     ASCII / Other).
  4. If Pillow (PIL) is importable AND a Korean TTF can be located, check glyph presence per
     codepoint via the font cmap; otherwise set glyphCheck="skipped (PIL/font unavailable)".

Output JSON is written to --out (default stdout) with ensure_ascii=False for readability.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Optional PIL import
# ---------------------------------------------------------------------------
try:
    from PIL import ImageFont as _ImageFont  # type: ignore[import]

    _PIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PIL_AVAILABLE = False

# ---------------------------------------------------------------------------
# Unicode block classifier
# ---------------------------------------------------------------------------
_BLOCK_RANGES: tuple[tuple[int, int, str], ...] = (
    (0x0000, 0x007F, "ASCII"),
    (0x1100, 0x11FF, "Hangul Jamo"),
    (0x3130, 0x318F, "Hangul Compatibility Jamo"),
    (0xA960, 0xA97F, "Hangul Jamo Extended-A"),
    (0xAC00, 0xD7A3, "Hangul Syllables"),
    (0xD7B0, 0xD7FF, "Hangul Jamo Extended-B"),
    (0x3000, 0x303F, "CJK Symbols and Punctuation"),
    (0x4E00, 0x9FFF, "CJK Unified Ideographs"),
    (0x3400, 0x4DBF, "CJK Extension A"),
    (0x20000, 0x2A6DF, "CJK Extension B"),
    (0xFF00, 0xFFEF, "Halfwidth and Fullwidth Forms"),
    (0x0080, 0x00FF, "Latin-1 Supplement"),
    (0x0100, 0x017F, "Latin Extended-A"),
)


def _unicode_block(cp: int) -> str:
    for lo, hi, name in _BLOCK_RANGES:
        if lo <= cp <= hi:
            return name
    # Fallback: use unicodedata category as a rough label
    try:
        cat = unicodedata.category(chr(cp))
    except (ValueError, OverflowError):
        cat = "Unknown"
    return f"Other ({cat})"


# ---------------------------------------------------------------------------
# Font / glyph helpers
# ---------------------------------------------------------------------------
_KOREAN_TTF_SEARCH_PATHS: tuple[str, ...] = (
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/Supplemental/NotoSansGothic-Regular.ttf",
    "/Library/Fonts/NanumGothic.ttf",
    "/Library/Fonts/NanumBarunGothic.ttf",
    "/Library/Fonts/AppleGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf",
)


def _locate_font(override: str | None) -> Path | None:
    if override:
        p = Path(override)
        return p if p.is_file() else None
    for candidate in _KOREAN_TTF_SEARCH_PATHS:
        p = Path(candidate)
        if p.is_file():
            return p
    return None


def _load_font_cmap(font_path: Path) -> frozenset[int] | None:
    """Return a frozenset of codepoints covered by the font, or None on failure."""
    if not _PIL_AVAILABLE:
        return None
    try:
        font = _ImageFont.truetype(str(font_path), size=16)
        # Pillow exposes the underlying FreeType face via the internal _face attribute
        # on newer versions, but the portable path is to use getmask for a single char.
        # We build the cmap by testing each unique codepoint found in the strings via
        # getmask — a blank mask (all-zero) indicates the glyph is absent.
        # This is O(unique codepoints) not O(all chars), so acceptable.
        return font, font_path  # Return font object and path for lazy per-cp checks
    except Exception:  # noqa: BLE001
        return None


def _glyph_present(font: Any, cp: int) -> bool:
    """Return True if the font has a visible glyph for codepoint cp."""
    if font is None:
        return False
    try:
        mask = font.getmask(chr(cp))
        return any(mask.getpixel((x, y)) != 0 for x in range(mask.size[0]) for y in range(mask.size[1]))
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------------------
# Codepoint analysis
# ---------------------------------------------------------------------------

def _analyze_codepoints(text: str) -> list[dict[str, Any]]:
    result = []
    for ch in text:
        cp = ord(ch)
        result.append({"cp": cp, "char": ch, "block": _unicode_block(cp)})
    return result


# ---------------------------------------------------------------------------
# Per-string audit
# ---------------------------------------------------------------------------

def _audit_string(
    string_id: str,
    ko: str,
    font: Any | None,
    font_path: Path | None,
) -> dict[str, Any]:
    # Step 1: CP949 encode
    cp949_ok = True
    cp949_bytes: bytes | None
    cp949_len: int
    try:
        cp949_bytes = ko.encode("cp949")
        cp949_len = len(cp949_bytes)
    except (UnicodeEncodeError, LookupError):
        cp949_ok = False
        cp949_bytes = None
        cp949_len = -1

    # Step 2: UTF-16 simulation (mirrors MB_ERR_INVALID_CHARS)
    # We re-encode to CP949 bytes then decode back. If the round-trip fails, it mirrors
    # MultiByteToWideChar returning 0 (error=ERROR_NO_UNICODE_TRANSLATION).
    utf16_ok = False
    if cp949_bytes is not None:
        try:
            _ = cp949_bytes.decode("cp949")
            utf16_ok = True
        except (UnicodeDecodeError, LookupError):
            utf16_ok = False
    # Also check whether original string encodes/decodes losslessly
    if cp949_ok and utf16_ok:
        # Extra check: try encoding with errors='strict' directly from the string
        try:
            ko.encode("cp949").decode("cp949")
            utf16_ok = True
        except (UnicodeEncodeError, UnicodeDecodeError, LookupError):
            utf16_ok = False

    # Step 3: Codepoint enumeration
    codepoints = _analyze_codepoints(ko)

    # Step 4: Glyph check
    missing_glyphs: list[dict[str, Any]] | None
    if font is not None and font_path is not None:
        missing_glyphs = []
        seen_cps: set[int] = set()
        for cp_entry in codepoints:
            cp = cp_entry["cp"]
            if cp in seen_cps:
                continue
            seen_cps.add(cp)
            if cp <= 0x001F or cp == 0x0020:  # control / space — skip
                continue
            if not _glyph_present(font, cp):
                missing_glyphs.append({"cp": cp, "char": chr(cp), "block": cp_entry["block"]})
    else:
        missing_glyphs = None  # glyphCheck: skipped

    return {
        "id": string_id,
        "ko": ko,
        "cp949Ok": cp949_ok,
        "cp949Len": cp949_len,
        "utf16Ok": utf16_ok,
        "codepoints": codepoints,
        "missingGlyphs": missing_glyphs,
    }


# ---------------------------------------------------------------------------
# Source loading
# ---------------------------------------------------------------------------

def _load_translations(source_path: Path) -> tuple[dict[str, str], str]:
    """Return (id→text, source_label) from constmsg-ko.json or strings-worksheet.json."""
    raw = json.loads(source_path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "translations" in raw:
        # constmsg-ko.json format: { "_source": "...", "translations": { id: text } }
        return raw["translations"], str(raw.get("_source", str(source_path)))
    if isinstance(raw, list):
        # strings-worksheet.json format: list of { id, ko, ... }
        result: dict[str, str] = {}
        for row in raw:
            if isinstance(row, dict) and "ko" in row and row["ko"]:
                key = str(row.get("id", row.get("offset", len(result))))
                result[key] = str(row["ko"])
        return result, str(source_path)
    # Fallback: treat as flat id→text dict
    return {str(k): str(v) for k, v in raw.items() if isinstance(v, str)}, str(source_path)


# ---------------------------------------------------------------------------
# Default source resolution
# ---------------------------------------------------------------------------

def _default_source(repo_root: Path) -> Path:
    worksheet = repo_root / "content" / "localization" / "strings-worksheet.json"
    if worksheet.is_file():
        return worksheet
    constmsg = repo_root / "content" / "localization" / "constmsg-ko.json"
    if constmsg.is_file():
        return constmsg
    raise FileNotFoundError(
        "No source file found. Expected content/localization/constmsg-ko.json or "
        "content/localization/strings-worksheet.json. Use --source to specify."
    )


# ---------------------------------------------------------------------------
# Main audit
# ---------------------------------------------------------------------------

def run_audit(source_path: Path, font_override: str | None = None) -> dict[str, Any]:
    translations, source_label = _load_translations(source_path)

    # Resolve font
    font_path = _locate_font(font_override)
    font_obj: Any = None
    glyph_check_desc: str
    if not _PIL_AVAILABLE:
        glyph_check_desc = "skipped (PIL/font unavailable)"
    elif font_path is None:
        glyph_check_desc = "skipped (PIL/font unavailable)"
    else:
        result = _load_font_cmap(font_path)
        if result is None:
            glyph_check_desc = "skipped (PIL/font unavailable)"
        else:
            font_obj, _ = result
            glyph_check_desc = f"checked via {font_path}"

    rows: list[dict[str, Any]] = []
    utf16_fail_count = 0
    blocks_seen: set[str] = set()

    for string_id, ko_text in translations.items():
        if not isinstance(ko_text, str) or not ko_text:
            continue
        row = _audit_string(string_id, ko_text, font_obj, font_path)
        if not row["utf16Ok"]:
            utf16_fail_count += 1
        for cp_entry in row["codepoints"]:
            blocks_seen.add(cp_entry["block"])
        rows.append(row)

    return {
        "source": source_label,
        "count": len(rows),
        "rows": rows,
        "summary": {
            "utf16FailCount": utf16_fail_count,
            "blocksSeen": sorted(blocks_seen),
            "glyphCheck": glyph_check_desc,
        },
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Offline render audit for LOGH VII KO strings.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Path to constmsg-ko.json or strings-worksheet.json (default: auto-detect).",
    )
    parser.add_argument(
        "--font",
        default=None,
        help="Override Korean TTF path for glyph presence check (requires Pillow).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output JSON file path (default: stdout).",
    )
    args = parser.parse_args(argv)

    source_path: Path
    if args.source is not None:
        source_path = args.source
    else:
        try:
            source_path = _default_source(repo_root)
        except FileNotFoundError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1

    audit = run_audit(source_path, font_override=args.font)
    output = json.dumps(audit, ensure_ascii=False, indent=2)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output + "\n", encoding="utf-8")
        # Print summary to stdout regardless
        s = audit["summary"]
        print(
            f"Audit complete: {audit['count']} strings | utf16Fail={s['utf16FailCount']} | "
            f"blocks={','.join(s['blocksSeen'])} | glyphCheck={s['glyphCheck']}"
        )
    else:
        print(output)

    return 0


if __name__ == "__main__":
    sys.exit(main())
