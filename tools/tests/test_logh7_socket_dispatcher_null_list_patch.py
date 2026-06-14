import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketDispatcherNullListPatchTests(unittest.TestCase):
    def test_writes_dispatcher_null_list_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-dispatcher-null-list.exe"
            metadata = Path(temp) / "socket-dispatcher-null-list-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_socket_dispatcher_null_list_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "534e4c31")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "socketDispatcherNullListPredicate")
            self.assertEqual(hook["virtualAddressHex"], "0x00613108")
            self.assertEqual(hook["falseContinuationHex"], "0x0061310f")
            self.assertEqual(hook["trueTargetHex"], "0x00613150")
            self.assertEqual(hook["originalHex"], "8b761485f67441")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x213108], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SNL1", cave_window)


if __name__ == "__main__":
    unittest.main()
