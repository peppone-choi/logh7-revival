"""Tests for the HFWR MsgDat re-encoder (tools/logh7_msgdat_encode.py).

A synthetic HFWR fixture exercises the byte-safe contract unconditionally; the
real installed MsgDat tree, when present, is additionally checked for byte-exact
identity round-trips (skipped on machines without the extracted client data).
"""

from __future__ import annotations

import struct
import unittest
from pathlib import Path

from tools.logh7_msgdat_encode import (
    HEADER_BYTES,
    MsgDatEncodeError,
    build_hfwr,
    localize_hfwr,
    parse_hfwr,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
INSTALLED_MSGDAT = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "data" / "MsgDat"


def _make_hfwr(records: list[bytes], offset_table: list[int]) -> bytes:
    """Build a minimal valid HFWR container around the given records."""
    aligned = (len(offset_table) + 3) & ~3
    header = bytearray(HEADER_BYTES)
    header[0:4] = b"HFWR"
    struct.pack_into("<I", header, 8, len(records))  # textPointerCount
    struct.pack_into("<I", header, 12, len(offset_table))  # offsetTableCount
    body = bytearray()
    for value in offset_table:
        body += struct.pack("<I", value)
    body += b"\x00\x00\x00\x00" * (aligned - len(offset_table))  # padding
    for record in records:
        body += record + b"\x00"
    return bytes(header) + bytes(body)


class HfwrIdentityTest(unittest.TestCase):
    def test_empty_translation_is_byte_exact(self) -> None:
        raw = _make_hfwr([b"\x82\xa0\x82\xa2", b"start", b"$xname$"], [0, 1, 3])
        self.assertEqual(localize_hfwr(raw, {}), raw)

    def test_parse_round_trip_via_build(self) -> None:
        raw = _make_hfwr([b"abc", b"", b"def"], [0, 2, 3])
        container = parse_hfwr(raw)
        self.assertEqual(container.text_pointer_count, 3)
        self.assertEqual(container.records, (b"abc", b"", b"def"))
        self.assertEqual(build_hfwr(container, list(container.records)), raw)


class HfwrTranslationTest(unittest.TestCase):
    def test_translation_changes_only_target_record(self) -> None:
        raw = _make_hfwr([b"keep", b"\x8c\xb4\x95\xb6", b"tail"], [0, 1, 2])
        out = localize_hfwr(raw, {1: "한글"}, encoding="cp949")
        container = parse_hfwr(out)
        self.assertEqual(container.records[0], b"keep")
        self.assertEqual(container.records[1], "한글".encode("cp949"))
        self.assertEqual(container.records[2], b"tail")
        # header + offset table untouched
        self.assertEqual(parse_hfwr(out).text_pointer_count, parse_hfwr(raw).text_pointer_count)
        self.assertEqual(out[:HEADER_BYTES], raw[:HEADER_BYTES])

    def test_length_change_preserves_record_count_and_order(self) -> None:
        raw = _make_hfwr([b"a", b"b", b"c"], [0, 1, 2])
        out = localize_hfwr(raw, {1: "긴 한국어 메시지로 교체"}, encoding="cp949")
        container = parse_hfwr(out)
        self.assertEqual([container.records[0], container.records[2]], [b"a", b"c"])
        self.assertEqual(container.text_pointer_count, 3)


class HfwrGuardTest(unittest.TestCase):
    def test_rejects_out_of_range_record_id(self) -> None:
        raw = _make_hfwr([b"a", b"b"], [0, 1])
        with self.assertRaises(MsgDatEncodeError):
            localize_hfwr(raw, {9: "x"})

    def test_rejects_unencodable_text(self) -> None:
        raw = _make_hfwr([b"a"], [0])
        with self.assertRaises(MsgDatEncodeError):
            localize_hfwr(raw, {0: "😀"}, encoding="cp949")

    def test_rejects_non_hfwr(self) -> None:
        with self.assertRaises(MsgDatEncodeError):
            parse_hfwr(b"GFWR" + b"\x00" * 32)


@unittest.skipUnless(INSTALLED_MSGDAT.is_dir(), "installed MsgDat tree not present")
class HfwrRealFileIdentityTest(unittest.TestCase):
    def test_all_hfwr_files_identity_round_trip(self) -> None:
        checked = 0
        for path in sorted(INSTALLED_MSGDAT.glob("*.dat")):
            raw = path.read_bytes()
            if raw[:4] != b"HFWR":
                continue
            checked += 1
            self.assertEqual(
                localize_hfwr(raw, {}), raw, f"{path.name} identity round-trip drifted"
            )
        self.assertGreater(checked, 0, "expected at least one HFWR file")


if __name__ == "__main__":
    unittest.main()
