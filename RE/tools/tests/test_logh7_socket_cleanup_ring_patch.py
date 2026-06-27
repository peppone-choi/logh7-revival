import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketCleanupRingPatchTests(unittest.TestCase):
    def test_writes_socket_cleanup_entry_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-cleanup-ring.exe"
            metadata = Path(temp) / "socket-cleanup-ring-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_socket_cleanup_ring_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "53435531")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)

            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "socketCleanupEntry")
            self.assertEqual(hook["virtualAddressHex"], "0x006151d0")
            self.assertEqual(hook["continuationHex"], "0x006151d6")
            self.assertEqual(hook["originalHex"], "568bf15733ff")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2151D0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SCU1", cave_window)


if __name__ == "__main__":
    unittest.main()
