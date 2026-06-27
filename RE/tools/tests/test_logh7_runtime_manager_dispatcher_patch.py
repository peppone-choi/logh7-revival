import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerDispatcherPatchTests(unittest.TestCase):
    def test_writes_guarded_runtime_manager_dispatcher_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-dispatcher.exe"
            metadata = Path(temp) / "runtime-manager-dispatcher-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-dispatcher-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_dispatcher.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "524d4431")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 52)
            by_target = {hook["target"]: hook for hook in patch["hooks"]}
            self.assertEqual(by_target["runtimeManagerFlagThreeDispatcher"]["virtualAddressHex"], "0x004ac350")
            self.assertEqual(by_target["runtimeManagerFlagThreeDispatcher"]["originalHex"], "83ec105355")
            self.assertEqual(by_target["runtimeManagerFlagThreeDispatcher"]["returnAddressHex"], "0x004ac355")
            self.assertEqual(by_target["runtimeManagerFlagZeroDispatcher"]["virtualAddressHex"], "0x004ac2c0")
            self.assertEqual(by_target["runtimeManagerFlagZeroDispatcher"]["originalHex"], "5556578b7c2410")
            self.assertEqual(by_target["runtimeManagerFlagZeroDispatcher"]["returnAddressHex"], "0x004ac2c7")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0AC350], 0xE9)
            self.assertEqual(raw[0x0AC2C0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_dispatcher.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMD1", raw[0x26ACD5 : 0x26ACD5 + 811])


if __name__ == "__main__":
    unittest.main()
