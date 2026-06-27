import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketRecvPhaseRingPatchTests(unittest.TestCase):
    def test_writes_in_memory_ring_probe_for_phase_recv_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-recv-phase-ring.exe"
            metadata = Path(temp) / "socket-recv-phase-ring-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-socket-recv-phase-ring-log-patch",
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
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertEqual(patch["ringBuffer"]["scratchBytes"], 4)
            self.assertEqual([hook["siteId"] for hook in patch["hooks"]], [1, 2])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2454D1], 0xE9)
            self.assertEqual(raw[0x245992], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SRP1", cave_window)
            self.assertNotIn(bytes.fromhex("f3a4"), cave_window)


if __name__ == "__main__":
    unittest.main()
