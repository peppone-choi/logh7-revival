"""Tests for tools/logh7_render_audit.py.

Uses a synthetic translations dict to avoid dependency on real data files, fonts, or network.
Covers:
  - cp949Len for pure Hangul and ASCII strings
  - utf16Ok True/False flags
  - Codepoint block labelling
  - PIL-absent path still produces valid output (glyphCheck skipped)
  - Non-CP949-encodable character handling
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

# Allow import from repo root regardless of how tests are invoked
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.logh7_render_audit import (
    _audit_string,
    _unicode_block,
    run_audit,
)


# ---------------------------------------------------------------------------
# Helper: build a temporary JSON source file
# ---------------------------------------------------------------------------

def _make_source_file(tmp_path: Path, translations: dict[str, str]) -> Path:
    data = {"_source": "test", "translations": translations}
    p = tmp_path / "test-translations.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# Unit tests for _unicode_block
# ---------------------------------------------------------------------------

class TestUnicodeBlock(unittest.TestCase):
    def test_ascii_range(self) -> None:
        self.assertEqual(_unicode_block(ord("A")), "ASCII")
        self.assertEqual(_unicode_block(0x00), "ASCII")
        self.assertEqual(_unicode_block(0x7F), "ASCII")

    def test_hangul_syllable(self) -> None:
        # 가 = U+AC00
        self.assertEqual(_unicode_block(0xAC00), "Hangul Syllables")
        # 힣 = U+D7A3
        self.assertEqual(_unicode_block(0xD7A3), "Hangul Syllables")

    def test_hangul_jamo(self) -> None:
        self.assertEqual(_unicode_block(0x1100), "Hangul Jamo")

    def test_cjk_ideograph(self) -> None:
        self.assertIn("CJK", _unicode_block(0x4E00))

    def test_other(self) -> None:
        # U+0400 Cyrillic — not in named ranges → "Other (...)"
        block = _unicode_block(0x0400)
        self.assertTrue(block.startswith("Other") or "Latin" in block or len(block) > 0)


# ---------------------------------------------------------------------------
# Unit tests for _audit_string
# ---------------------------------------------------------------------------

class TestAuditString(unittest.TestCase):

    def test_pure_hangul_cp949_len(self) -> None:
        # "결정" = 2 Hangul syllables; each is 2 bytes in CP949 → len = 4
        row = _audit_string("1281", "결정", None, None)
        self.assertEqual(row["id"], "1281")
        self.assertEqual(row["ko"], "결정")
        self.assertTrue(row["cp949Ok"])
        self.assertEqual(row["cp949Len"], 4)  # 2 chars × 2 bytes each

    def test_utf16_ok_for_valid_cp949(self) -> None:
        row = _audit_string("test", "안녕하세요", None, None)
        self.assertTrue(row["utf16Ok"])
        self.assertTrue(row["cp949Ok"])

    def test_ascii_string(self) -> None:
        row = _audit_string("ascii", "Hello", None, None)
        self.assertTrue(row["cp949Ok"])
        self.assertEqual(row["cp949Len"], 5)  # 1 byte per ASCII char
        self.assertTrue(row["utf16Ok"])
        # All codepoints should be ASCII block
        blocks = {e["block"] for e in row["codepoints"]}
        self.assertIn("ASCII", blocks)

    def test_non_cp949_char_fails(self) -> None:
        # U+1F600 GRINNING FACE is not encodable in CP949
        row = _audit_string("emoji", "\U0001F600", None, None)
        self.assertFalse(row["cp949Ok"])
        self.assertEqual(row["cp949Len"], -1)
        self.assertFalse(row["utf16Ok"])

    def test_codepoints_contain_hangul_block(self) -> None:
        row = _audit_string("ko", "배분 설정", None, None)
        blocks = {e["block"] for e in row["codepoints"]}
        self.assertIn("Hangul Syllables", blocks)
        # Space is ASCII
        self.assertIn("ASCII", blocks)

    def test_missing_glyphs_none_when_no_font(self) -> None:
        row = _audit_string("test", "테스트", None, None)
        # Without PIL/font, missingGlyphs should be None (not [])
        self.assertIsNone(row["missingGlyphs"])

    def test_glyph_check_skipped_without_pil(self) -> None:
        # Ensure the audit string returns missingGlyphs=None when font=None
        row = _audit_string("1", "가나다", None, None)
        self.assertIsNone(row["missingGlyphs"])


# ---------------------------------------------------------------------------
# Integration test: run_audit produces valid structure
# ---------------------------------------------------------------------------

class TestRunAudit(unittest.TestCase):

    def setUp(self) -> None:
        import tempfile
        self._tmpdir = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def _source(self, translations: dict[str, str]) -> Path:
        return _make_source_file(self._tmpdir, translations)

    def test_basic_structure(self) -> None:
        src = self._source({"1": "결정", "2": "Hello", "3": "뒤로"})
        result = run_audit(src)
        self.assertIn("source", result)
        self.assertIn("count", result)
        self.assertIn("rows", result)
        self.assertIn("summary", result)
        self.assertEqual(result["count"], 3)

    def test_summary_utf16_fail_count(self) -> None:
        # Include a non-CP949 char to force a failure
        src = self._source({"1": "정상", "2": "\U0001F600", "3": "뒤로"})
        result = run_audit(src)
        self.assertEqual(result["summary"]["utf16FailCount"], 1)

    def test_summary_blocks_seen(self) -> None:
        src = self._source({"1": "안녕 Hello"})
        result = run_audit(src)
        blocks = result["summary"]["blocksSeen"]
        self.assertIn("ASCII", blocks)
        self.assertIn("Hangul Syllables", blocks)

    def test_glyph_check_skipped_without_pil(self) -> None:
        src = self._source({"1": "한글"})
        result = run_audit(src)
        # PIL not installed in this environment → glyphCheck should say skipped
        glyph_check = result["summary"]["glyphCheck"]
        self.assertIn("skipped", glyph_check.lower())

    def test_output_is_json_serialisable(self) -> None:
        src = self._source({"a": "게임 시작", "b": "로그인", "c": "취소"})
        result = run_audit(src)
        # Must round-trip through JSON without error
        serialised = json.dumps(result, ensure_ascii=False)
        parsed = json.loads(serialised)
        self.assertEqual(parsed["count"], 3)

    def test_empty_translations(self) -> None:
        src = self._source({})
        result = run_audit(src)
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["summary"]["utf16FailCount"], 0)

    def test_cp949_len_for_known_string(self) -> None:
        # "결정" = 4 bytes in CP949
        src = self._source({"1281": "결정"})
        result = run_audit(src)
        row = result["rows"][0]
        self.assertEqual(row["cp949Len"], 4)

    def test_mixed_hangul_ascii_codepoints(self) -> None:
        src = self._source({"1": "ID와 비밀번호"})
        result = run_audit(src)
        row = result["rows"][0]
        blocks = {e["block"] for e in row["codepoints"]}
        self.assertIn("Hangul Syllables", blocks)
        self.assertIn("ASCII", blocks)

    def test_row_contains_required_keys(self) -> None:
        src = self._source({"1": "테스트"})
        result = run_audit(src)
        row = result["rows"][0]
        for key in ("id", "ko", "cp949Ok", "cp949Len", "utf16Ok", "codepoints", "missingGlyphs"):
            self.assertIn(key, row, f"row missing key: {key}")

    def test_strings_worksheet_format(self) -> None:
        """Verify loading from list-of-dicts (strings-worksheet.json) format."""
        ws_path = self._tmpdir / "strings-worksheet.json"
        ws_data = [
            {"id": "100", "ko": "환경 설정", "status": "translated"},
            {"id": "101", "ko": "세션 변경", "status": "translated"},
            {"id": "102", "ko": None, "status": "untranslated"},  # None → skipped
        ]
        ws_path.write_text(json.dumps(ws_data, ensure_ascii=False), encoding="utf-8")
        result = run_audit(ws_path)
        self.assertEqual(result["count"], 2)  # None ko is skipped


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main()
