import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketDispatcherBranchPredicatePatchTests(unittest.TestCase):
    def test_writes_dispatcher_branch_predicate_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-dispatcher-branch-predicate.exe"
            metadata = Path(temp) / "socket-dispatcher-branch-predicate-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_socket_dispatcher_branch_predicate_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "53504231")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "socketDispatcherBranchPredicate")
            self.assertEqual(hook["virtualAddressHex"], "0x00613142")
            self.assertEqual(hook["falseContinuationHex"], "0x00613147")
            self.assertEqual(hook["trueTargetHex"], "0x00613150")
            self.assertEqual(hook["originalHex"], "3938740a5f")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x213142], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SPB1", cave_window)


if __name__ == "__main__":
    unittest.main()
