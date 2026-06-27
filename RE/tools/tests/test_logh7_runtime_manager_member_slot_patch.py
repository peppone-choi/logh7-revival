import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerMemberSlotPatchTests(unittest.TestCase):
    def test_writes_guarded_member_slot_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-member-slot.exe"
            metadata = Path(temp) / "runtime-manager-member-slot-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-member-slot-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_member_slot.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "524d4531")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 52)
            self.assertEqual(patch["hook"]["target"], "stateTriggerMemberSlot14")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x00402880")
            self.assertEqual(patch["hook"]["originalHex"], "64a100000000")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x00402886")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x002880], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"logh7_runtime_manager_member_slot.bin\x00", cave_window)
            self.assertIn(b"RME1", cave_window)


if __name__ == "__main__":
    unittest.main()
