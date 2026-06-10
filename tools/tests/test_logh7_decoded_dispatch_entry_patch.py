import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7DecodedDispatchEntryPatchTests(unittest.TestCase):
    def test_writes_decoded_dispatch_function_entry_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.decoded-dispatch-entry.exe"
            metadata = Path(temp) / "decoded-dispatch-entry-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_decoded_dispatch_entry_patch",
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
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004ba2e6")
            self.assertEqual(patch["hook"]["continuationHex"], "0x004ba2ed")
            self.assertEqual(patch["hook"]["originalHex"], "897de8c6450f00")
            self.assertEqual(patch["recordFormat"]["magic"], "44444531")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 800)

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0BA2E6], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"DDE1", cave_window)
            self.assertIn(bytes.fromhex("897de8c6450f00"), cave_window)


if __name__ == "__main__":
    unittest.main()
