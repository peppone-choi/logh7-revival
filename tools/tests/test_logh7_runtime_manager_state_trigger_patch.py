import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerStateTriggerPatchTests(unittest.TestCase):
    def test_writes_guarded_state_trigger_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-state-trigger.exe"
            metadata = Path(temp) / "runtime-manager-state-trigger-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-state-trigger-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_state_trigger.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "524d5431")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 52)
            self.assertEqual(patch["hook"]["target"], "runtimeManagerStateTriggerCallback")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004ac430")
            self.assertEqual(patch["hook"]["originalHex"], "8b44240885c0")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x004ac436")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0AC430], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_state_trigger.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMT1", raw[0x26ACD5 : 0x26ACD5 + 811])


if __name__ == "__main__":
    unittest.main()
