import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244
RECV_CALLSITE_OFFSETS = (0x211AA5, 0x211BA5, 0x211BF6, 0x2454D1, 0x245992, 0x245E2B)


class Logh7SocketRecvRingPatchTests(unittest.TestCase):
    def test_writes_in_memory_ring_probe_for_all_direct_recv_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-recv-ring.exe"
            metadata = Path(temp) / "socket-recv-ring-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-socket-recv-ring-log-patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "53525231")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertEqual(len(patch["hooks"]), 6)

            raw = patched.read_bytes()
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            for offset in RECV_CALLSITE_OFFSETS:
                self.assertEqual(raw[offset], 0xE8)
                self.assertEqual(raw[offset + 5], 0x90)
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SRR1", cave_window)
            self.assertIn(bytes.fromhex("c21000"), cave_window)
            self.assertNotIn(b"CreateFileA", cave_window)


if __name__ == "__main__":
    unittest.main()
