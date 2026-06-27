import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7DecodedResponsePromotionPatchTests(unittest.TestCase):
    def test_writes_decoded_response_promotion_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.decoded-response-promotion.exe"
            metadata = Path(temp) / "decoded-response-promotion-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_decoded_response_promotion_patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["magic"], "44525031")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 2)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            by_target = {hook["target"]: hook for hook in patch["hooks"]}
            self.assertEqual(by_target["decodedResponsePromotionRouterEntry"]["virtualAddressHex"], "0x004ae0d0")
            self.assertEqual(by_target["decodedResponsePromotionRouterEntry"]["continuationHex"], "0x004ae0d6")
            self.assertEqual(by_target["decodedResponsePromotionRouterEntry"]["originalHex"], "8b5424048bc2")
            self.assertEqual(by_target["decodedResponsePromotionDefaultAppend"]["virtualAddressHex"], "0x004ae0ff")
            self.assertEqual(by_target["decodedResponsePromotionDefaultAppend"]["continuationHex"], "0x004ae104")
            self.assertEqual(by_target["decodedResponsePromotionDefaultAppend"]["originalHex"], "e84ca70000")
            self.assertEqual(by_target["decodedResponsePromotionGameLoginAppend"]["virtualAddressHex"], "0x004ae127")
            self.assertEqual(by_target["decodedResponsePromotionGameLoginAppend"]["continuationHex"], "0x004ae12c")
            self.assertEqual(by_target["decodedResponsePromotionGameLoginAppend"]["originalHex"], "e824a70000")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0AE0D0], 0xE9)
            self.assertEqual(raw[0x0AE0FF], 0xE9)
            self.assertEqual(raw[0x0AE127], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"DRP1", cave_window)
            self.assertIn(bytes.fromhex("8b5424048bc2"), cave_window)


if __name__ == "__main__":
    unittest.main()
