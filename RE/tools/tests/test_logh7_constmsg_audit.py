from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


RE_ROOT = Path(__file__).resolve().parents[2]
if str(RE_ROOT) not in sys.path:
    sys.path.insert(0, str(RE_ROOT))

from tools import logh7_constmsg_audit as audit  # noqa: E402


@unittest.skipUnless(
    audit.FULL_MSGDAT_PATH.exists()
    and audit.CLIENT_MSGDAT_PATH.exists()
    and audit.FUNCTIONS_JSONL_PATH.exists(),
    "constmsg audit inputs are not present",
)
class ConstmsgAuditTest(unittest.TestCase):
    def test_build_audit_separates_facility_and_spot_groups(self) -> None:
        built = audit.build_audit()
        groups = {entry["groupHex"]: entry for entry in built["groups"]}

        self.assertEqual(groups["0x49"]["baseId"], 2271)
        self.assertEqual(groups["0x49"]["endIdInclusive"], 2309)
        self.assertEqual(groups["0x49"]["inferredCategory"], "place / facility labels")
        self.assertEqual(groups["0x4a"]["baseId"], 2310)
        self.assertEqual(groups["0x4a"]["endIdInclusive"], 2414)
        self.assertEqual(groups["0x4a"]["inferredCategory"], "spot / room labels")

        palace_hits = built["anchors"]["皇宮"]
        self.assertIn({"id": 451, "group": 4, "groupHex": "0x04", "subId": 0}, palace_hits)
        self.assertIn({"id": 2293, "group": 73, "groupHex": "0x49", "subId": 22}, palace_hits)

        wrapper_pairs = {(site["callee"], site["groupHex"]) for site in built["callSites"]}
        self.assertIn(("FUN_004c8d10", "0x49"), wrapper_pairs)
        self.assertIn(("FUN_004c8cf0", "0x4a"), wrapper_pairs)
        self.assertIn(("FUN_004c8c90", "0x18"), wrapper_pairs)

    def test_write_audit_emits_json_and_markdown(self) -> None:
        with TemporaryDirectory() as raw_dir:
            out_dir = Path(raw_dir)
            json_out = out_dir / "constmsg-groups.json"
            md_out = out_dir / "constmsg.md"

            built = audit.write_audit(json_out=json_out, md_out=md_out)

            self.assertTrue(json_out.exists())
            self.assertTrue(md_out.exists())
            loaded = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(loaded["layout"]["recordCount"], 3199)
            self.assertEqual(len(loaded["groups"]), len(built["groups"]))
            markdown = md_out.read_text(encoding="utf-8")
            self.assertIn("0x49", markdown)
            self.assertIn("schema.json", markdown)


if __name__ == "__main__":
    unittest.main()
