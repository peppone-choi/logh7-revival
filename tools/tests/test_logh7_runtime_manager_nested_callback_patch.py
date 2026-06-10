import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerNestedCallbackPatchTests(unittest.TestCase):
    def test_writes_guarded_nested_callback_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-nested-callback.exe"
            metadata = Path(temp) / "runtime-manager-nested-callback-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-nested-callback-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_nested_callback.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "524d5731")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 52)
            self.assertEqual(patch["hook"]["target"], "runtimeManagerNestedCallbackWalker")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004ab6a0")
            self.assertEqual(patch["hook"]["originalHex"], "83ec145355")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x004ab6a5")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0AB6A0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_nested_callback.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMW1", raw[0x26ACD5 : 0x26ACD5 + 811])


if __name__ == "__main__":
    unittest.main()
