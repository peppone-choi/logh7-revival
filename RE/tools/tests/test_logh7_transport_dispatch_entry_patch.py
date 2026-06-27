import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7TransportDispatchEntryPatchTests(unittest.TestCase):
    def test_writes_transport_dispatch_entry_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.transport-dispatch-entry.exe"
            metadata = Path(temp) / "transport-dispatch-entry-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_transport_dispatch_entry_patch",
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
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004b78bb")
            self.assertEqual(patch["hook"]["continuationHex"], "0x004b78c5")
            self.assertEqual(patch["recordFormat"]["magic"], "54444531")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 800)

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0B78BB], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"TDE1", cave_window)
            self.assertIn(bytes.fromhex("8b450c5325ffff000056"), cave_window)


if __name__ == "__main__":
    unittest.main()
