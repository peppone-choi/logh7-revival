from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.logh7_build_playable_client import CANONICAL_KOREAN_EXE
from tools.logh7_confirm_dialog_inset_patch import (
    FINAL_REGISTER_RETURN_VA,
    HOOK_ORIGINAL_HEX,
    HOOK_VA,
    X_INSET,
    apply_confirm_dialog_inset_patch,
)
from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


class Logh7ConfirmDialogInsetPatchTests(unittest.TestCase):
    def test_appends_return_site_hook_for_type5_confirm_dialog(self) -> None:
        source = CANONICAL_KOREAN_EXE
        image = _parse_pe_image(source.read_bytes())
        hook_offset = _virtual_address_to_offset(image, HOOK_VA)
        self.assertEqual(source.read_bytes()[hook_offset : hook_offset + 7].hex(), HOOK_ORIGINAL_HEX)

        with TemporaryDirectory() as temp:
            out = Path(temp) / "G7MTClient.confirm-dialog-inset.exe"
            manifest = Path(temp) / "confirm-dialog-inset.json"

            patch = apply_confirm_dialog_inset_patch(source, out, manifest)

            raw = out.read_bytes()
            self.assertEqual(raw[hook_offset], 0xE9)
            self.assertEqual(raw[hook_offset + 5 : hook_offset + 7], b"\x90\x90")
            trampoline = raw[patch.section_raw : patch.section_raw + patch.section_vsize]
            self.assertTrue(trampoline.startswith(bytes.fromhex("837c240c05")))
            self.assertIn(b"\x81\x7c\x24\x08" + FINAL_REGISTER_RETURN_VA.to_bytes(4, "little"), trampoline)
            self.assertIn(bytes.fromhex("8186bc0d0000") + X_INSET.to_bytes(4, "little"), trampoline)
            self.assertIn(bytes.fromhex("8186c40d0000") + X_INSET.to_bytes(4, "little"), trampoline)
            self.assertIn(bytes.fromhex("81400c") + X_INSET.to_bytes(4, "little"), trampoline)
            self.assertTrue(trampoline.endswith(bytes.fromhex(HOOK_ORIGINAL_HEX)))

            receipt = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(receipt["hook"]["virtualAddressHex"], "0x0054ed41")
            self.assertTrue(receipt["hook"]["returnsViaOriginalRet"])
            self.assertEqual(receipt["section"]["name"], ".lg7c")
            self.assertEqual(receipt["behavior"]["gate"], "type == 5")
            self.assertEqual(receipt["behavior"]["callerReturnHex"], "0x00595bc0")
            self.assertEqual(receipt["behavior"]["xInsetPixels"], X_INSET)


if __name__ == "__main__":
    unittest.main()
