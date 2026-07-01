from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


RE_ROOT = Path(__file__).resolve().parents[2]
if str(RE_ROOT) not in sys.path:
    sys.path.insert(0, str(RE_ROOT))

from tools import logh7_build_playable_client as builder  # noqa: E402
from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset  # noqa: E402


PATCH_PATH = RE_ROOT / "tools" / "client_patches" / "command-panel-msgdat-groupfix.json"
INSTALLED_EXE = RE_ROOT.parent / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


@unittest.skipUnless(PATCH_PATH.exists() and INSTALLED_EXE.exists(), "command panel patch inputs are not present")
class CommandPanelMsgdatGroupfixTest(unittest.TestCase):
    def test_descriptor_patches_verified_group_immediates(self) -> None:
        patch = json.loads(PATCH_PATH.read_text(encoding="utf-8"))
        self.assertEqual(patch["name"], "command-panel-msgdat-groupfix")
        self.assertIn("command-panel-msgdat-groupfix", builder.DEFAULT_STACK)

        raw = INSTALLED_EXE.read_bytes()
        image = _parse_pe_image(raw)
        self.assertGreaterEqual(len(patch["patches"]), 15)

        for site in patch["patches"]:
            va = int(site["va"], 16)
            original = bytes.fromhex(site["originalHex"])
            patched = bytes.fromhex(site["patchedHex"])
            offset = _virtual_address_to_offset(image, va)
            self.assertEqual(raw[offset : offset + len(original)], original, site["va"])
            self.assertEqual(original, b"\x6a\x5f", site["va"])
            self.assertEqual(patched, b"\x6a\x60", site["va"])


if __name__ == "__main__":
    unittest.main()
