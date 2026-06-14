import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketRecvPhase4RingPatchTests(unittest.TestCase):
    def test_writes_single_site_phase4_prepost_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-recv-phase4-ring.exe"
            metadata = Path(temp) / "socket-recv-phase4-ring-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_socket_recv_phase4_ring_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "53525031")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["scratchBytes"], 4)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 552)
            self.assertEqual([hook["virtualAddressHex"] for hook in patch["hooks"]], ["0x00645e2b"])
            self.assertEqual([hook["siteId"] for hook in patch["hooks"]], [3])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2454D1 : 0x2454D1 + 6].hex(), "ff15b0b66600")
            self.assertEqual(raw[0x245992 : 0x245992 + 6].hex(), "ff15b0b66600")
            self.assertEqual(raw[0x245E2B], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SRP1", cave_window)
            self.assertNotIn(bytes.fromhex("f3a4"), cave_window)


if __name__ == "__main__":
    unittest.main()
