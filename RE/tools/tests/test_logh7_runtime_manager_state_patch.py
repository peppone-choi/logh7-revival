import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerStatePatchTests(unittest.TestCase):
    def test_writes_guarded_runtime_manager_state_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-state.exe"
            metadata = Path(temp) / "runtime-manager-state-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-state-log-patch",
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
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_state.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "524d5331")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 36)
            by_target = {hook["target"]: hook for hook in patch["hooks"]}
            self.assertEqual(by_target["runtimeManagerStateEventCallback"]["virtualAddressHex"], "0x004adf60")
            self.assertEqual(by_target["runtimeManagerStateEventCallback"]["originalHex"], "8b44240885c0")
            self.assertEqual(by_target["runtimeManagerStateFollowupCallback"]["virtualAddressHex"], "0x004adfd0")
            self.assertEqual(by_target["runtimeManagerStateFollowupCallback"]["originalHex"], "8b44240885c0")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0ADF60], 0xE9)
            self.assertEqual(raw[0x0ADFD0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_state.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMS1", raw[0x26ACD5 : 0x26ACD5 + 811])


if __name__ == "__main__":
    unittest.main()
