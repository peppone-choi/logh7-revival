import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketCloseRingPatchTests(unittest.TestCase):
    def test_writes_closesocket_callsite_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-close-ring.exe"
            metadata = Path(temp) / "socket-close-ring-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_socket_close_ring_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "53434c31")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "closesocketWrapperCall")
            self.assertEqual(hook["virtualAddressHex"], "0x00615d75")
            self.assertEqual(hook["continuationHex"], "0x00615d7a")
            self.assertEqual(hook["originalHex"], "e804ae0200")
            self.assertEqual(hook["callTargetHex"], "0x00640b7e")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x215D75], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SCL1", cave_window)


if __name__ == "__main__":
    unittest.main()
