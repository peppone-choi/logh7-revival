import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SocketRecvWindowPatchTests(unittest.TestCase):
    def test_writes_guarded_phase3_recv_window_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.socket-recv-window.exe"
            metadata = Path(temp) / "socket-recv-window-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-socket-recv-window-log-patch",
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
            self.assertEqual(patch["logPath"], "logh7_socket_recv_window.bin")
            self.assertEqual(patch["recordFormat"]["magic"], "53525331")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 128)
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x00645992")
            self.assertEqual(patch["hook"]["siteId"], 2)
            self.assertEqual(patch["hook"]["originalHex"], "ff15b0b66600")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x00645998")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x00245992], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"logh7_socket_recv_window.bin\x00", cave_window)
            self.assertIn(b"SRS1", cave_window)
            self.assertIn(bytes.fromhex("6a80"), cave_window)


if __name__ == "__main__":
    unittest.main()
