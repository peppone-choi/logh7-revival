"""Task D-1: re-encode integrity regression for tools/logh7_msgdat_encode.py.

Proves the HFWR localizer is length-safe: an empty translation map is byte-exact,
a translation that GROWS a record preserves record count / order / NUL termination
and re-parses cleanly, and unsafe inputs (embedded NUL, out-of-range id,
non-CP949 text) are rejected rather than silently corrupting the offset table.
"""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # repo/tools

from logh7_msgdat_encode import (  # noqa: E402
    MsgDatEncodeError,
    build_hfwr,
    localize_hfwr,
    parse_hfwr,
)


def _aligned(count: int) -> int:
    return (count + 3) & ~3


def make_hfwr(records_cp932: list[bytes], offset_table: list[int] | None = None) -> bytes:
    """Build a minimal valid HFWR container around the given CP932 record payloads."""
    n = len(records_cp932)
    if offset_table is None:
        # record-index style table the decoder proved: monotonic, last == count
        offset_table = list(range(1, n + 1))
    aligned = _aligned(len(offset_table))
    header = b"HFWR" + b"\x00\x00\x00\x00" + struct.pack("<I", n) + struct.pack("<I", len(offset_table))
    table = b"".join(struct.pack("<I", v) for v in offset_table)
    table += b"\x00" * ((aligned - len(offset_table)) * 4)
    payload = b"".join(r + b"\x00" for r in records_cp932)
    return header + table + payload


class RoundTripIdentity(unittest.TestCase):
    def setUp(self) -> None:
        self.records = ["決定".encode("cp932"), "テスト".encode("cp932"), b"ABC", "防御".encode("cp932")]
        self.raw = make_hfwr(self.records)

    def test_parse_counts(self) -> None:
        c = parse_hfwr(self.raw)
        self.assertEqual(c.text_pointer_count, 4)
        self.assertEqual(c.records, tuple(self.records))

    def test_empty_translations_is_byte_identical(self) -> None:
        out = localize_hfwr(self.raw, {})
        self.assertEqual(out, self.raw)

    def test_translation_that_grows_is_length_safe(self) -> None:
        # KO "캐릭터를 삭제하시겠습니까?" is far longer than the JP slot -> must still be safe.
        long_ko = "캐릭터를 삭제하시겠습니까?"
        out = localize_hfwr(self.raw, {0: long_ko})
        re = parse_hfwr(out)
        # count + order preserved, NUL termination intact (parse would have raised otherwise)
        self.assertEqual(re.text_pointer_count, 4)
        self.assertEqual(re.records[0].decode("cp949"), long_ko)
        self.assertEqual(re.records[1:], tuple(self.records[1:]))
        # the offset-table region is preserved verbatim even though byte length changed
        self.assertEqual(parse_hfwr(out).offset_table_region, parse_hfwr(self.raw).offset_table_region)
        self.assertGreater(len(out), len(self.raw))

    def test_all_records_translated_roundtrip(self) -> None:
        ko = {0: "결정", 1: "테스트", 2: "에이비씨", 3: "방어"}
        out = localize_hfwr(self.raw, ko)
        re = parse_hfwr(out)
        for rid, text in ko.items():
            self.assertEqual(re.records[rid].decode("cp949"), text)


class UnsafeInputsRejected(unittest.TestCase):
    def setUp(self) -> None:
        self.raw = make_hfwr(["あ".encode("cp932"), "い".encode("cp932")])

    def test_embedded_nul_rejected(self) -> None:
        with self.assertRaises(MsgDatEncodeError):
            localize_hfwr(self.raw, {0: "a\x00b"})

    def test_out_of_range_id_rejected(self) -> None:
        with self.assertRaises(MsgDatEncodeError):
            localize_hfwr(self.raw, {99: "x"})

    def test_non_cp949_text_rejected(self) -> None:
        # CP949 (UHC) is a SUPERSET that includes kana + many kanji, so Japanese
        # text re-encodes (to different glyphs) rather than failing. Use an emoji,
        # which is genuinely unrepresentable -> must raise, not corrupt the container.
        with self.assertRaises(MsgDatEncodeError):
            localize_hfwr(self.raw, {0: "\U0001f600"})

    def test_build_rejects_record_count_change(self) -> None:
        container = parse_hfwr(self.raw)
        with self.assertRaises(MsgDatEncodeError):
            build_hfwr(container, [b"only-one"])


if __name__ == "__main__":
    unittest.main()
