"""Tests for the canon face-index registry (tools/logh7_canon_face_registry.py).

Covers the deterministic O/G classification + player-face validation contract
(the authoritative gate the create handler uses). Roster-dependent build is
checked only when the installed Face tree is present.
"""

from __future__ import annotations

import unittest

from tools.logh7_canon_face_registry import (
    atlas_group,
    is_canon_face,
    is_player_selectable_face,
    validate_player_face,
)
from tools.logh7_face_id_decode import encode


class AtlasGroupTest(unittest.TestCase):
    def test_o_group_is_canon(self) -> None:
        for a in ("oem", "oam", "o"):
            self.assertEqual(atlas_group(a), "O")

    def test_g_group_is_player(self) -> None:
        for a in ("gem", "gef", "gam", "gaf"):
            self.assertEqual(atlas_group(a), "G")


class FaceClassificationTest(unittest.TestCase):
    def test_g_face_is_player_selectable(self) -> None:
        self.assertTrue(is_player_selectable_face(encode("gem", 5)))
        self.assertFalse(is_canon_face(encode("gem", 5)))

    def test_o_face_is_canon_only(self) -> None:
        self.assertTrue(is_canon_face(encode("oam", 79)))  # Yang anchor space
        self.assertFalse(is_player_selectable_face(encode("oam", 79)))


class ValidatePlayerFaceTest(unittest.TestCase):
    def test_accepts_matching_g_face(self) -> None:
        r = validate_player_face(encode("gam", 3), faction="alliance", sex="male")
        self.assertTrue(r["ok"], r)
        self.assertEqual((r["atlas"], r["index"]), ("gam", 3))

    def test_rejects_o_group_face(self) -> None:
        r = validate_player_face(encode("oem", 8), faction="empire", sex="male")
        self.assertFalse(r["ok"])
        self.assertIn("canon", r["reason"])

    def test_rejects_faction_mismatch(self) -> None:
        r = validate_player_face(encode("gem", 1), faction="alliance", sex="male")
        self.assertFalse(r["ok"])
        self.assertIn("faction", r["reason"])

    def test_rejects_sex_mismatch(self) -> None:
        r = validate_player_face(encode("gem", 1), faction="empire", sex="female")
        self.assertFalse(r["ok"])
        self.assertIn("sex", r["reason"])

    def test_rejects_undecodable(self) -> None:
        r = validate_player_face(999999999, faction="empire", sex="male")
        self.assertFalse(r["ok"])


if __name__ == "__main__":
    unittest.main()
