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


class Logh7SocketRecvAllPatchTests(unittest.TestCase):
    def test_writes_single_wrapper_for_all_direct_recv_calls_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-recv-all.exe"
            metadata = Path(temp) / "socket-recv-all-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-socket-recv-all-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_socket_recv_all.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "53524131")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 96)
            self.assertEqual(len(patch["hooks"]), 6)
            self.assertEqual(
                [hook["virtualAddressHex"] for hook in patch["hooks"]],
                [
                    "0x00611aa5",
                    "0x00611ba5",
                    "0x00611bf6",
                    "0x006454d1",
                    "0x00645992",
                    "0x00645e2b",
                ],
            )

            raw = patched.read_bytes()
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            for offset in RECV_CALLSITE_OFFSETS:
                self.assertEqual(raw[offset], 0xE8)
                self.assertEqual(raw[offset + 5], 0x90)
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"logh7_socket_recv_all.bin\x00", cave_window)
            self.assertIn(b"SRA1", cave_window)
            self.assertIn(bytes.fromhex("6a60"), cave_window)


if __name__ == "__main__":
    unittest.main()
