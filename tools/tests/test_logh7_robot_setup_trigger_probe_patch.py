import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RobotSetupTriggerProbePatchTests(unittest.TestCase):
    def test_writes_robot_setup_trigger_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.robot-setup-trigger.exe"
            metadata = Path(temp) / "robot-setup-trigger-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_robot_setup_trigger_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "52535431")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            self.assertEqual(
                [hook["virtualAddressHex"] for hook in patch["hooks"]],
                ["0x0051bd70", "0x004b6480", "0x004ad3e6"],
            )
            self.assertEqual(patch["hooks"][0]["originalHex"], "8b0dfccf7c00")
            self.assertEqual(patch["hooks"][1]["originalHex"], "b908ee7600")
            self.assertEqual(patch["hooks"][2]["originalHex"], "e825030000")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x11BD70], 0xE9)
            self.assertEqual(raw[0x0B6480], 0xE9)
            self.assertEqual(raw[0x0AD3E6], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"RST1", cave_window)


if __name__ == "__main__":
    unittest.main()
