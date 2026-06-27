import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7SessionBootstrapGatePatchTests(unittest.TestCase):
    def test_writes_session_bootstrap_runtime_manager_gate_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.session-bootstrap-gate.exe"
            metadata = Path(temp) / "session-bootstrap-gate-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_session_bootstrap_gate_patch",
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
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004b78ef")
            self.assertEqual(patch["hook"]["continuationHex"], "0x004b78f9")
            self.assertEqual(patch["recordFormat"]["magic"], "53424731")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 544)

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0B78EF], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            cave_window = raw[0x26ACD5 : 0x26ACD5 + 811]
            self.assertIn(b"SBG1", cave_window)
            self.assertIn(bytes.fromhex("a1f4257c0085c089750c"), cave_window)


if __name__ == "__main__":
    unittest.main()
