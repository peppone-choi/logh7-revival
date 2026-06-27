import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_encode_login_native_layout import build_spec


REPO_ROOT = Path(__file__).resolve().parents[2]


class Logh7EncodeLoginNativeLayoutTests(unittest.TestCase):
    def test_1920_1080_matches_native_login_values(self):
        spec = build_spec(1920, 1080)
        sites = {patch["va"]: patch["patchedHex"] for patch in spec["patches"]}
        self.assertEqual(sites["0x0051a50a"], "6838040000")
        self.assertEqual(sites["0x0051a51c"], "6880070000")
        self.assertEqual(sites["0x0051cf92"], "c744242880070000")
        self.assertEqual(sites["0x0051cf9a"], "c744242c38040000")
        self.assertEqual(sites["0x0051cff1"], "c74424181c020000")
        self.assertEqual(sites["0x0051d448"], "c7442418f1020000")
        self.assertEqual(sites["0x0051d458"], "c744242473020000")
        self.assertEqual(sites["0x0051d33d"], "c7442418d5030000")

    def test_layout_is_native_not_four_by_three_letterbox(self):
        spec = build_spec(1920, 1080)
        sites = {patch["va"]: patch["patchedHex"] for patch in spec["patches"]}
        self.assertEqual(sites["0x0051d001"], "c744242448030000")
        self.assertEqual(sites["0x0051d24b"], "c744241cc4020000")
        self.assertEqual(sites["0x0051d345"], "c744241cc4020000")

    def test_cli_writes_requested_resolution(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "login-native-layout.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_encode_login_native_layout",
                    "--width",
                    "2560",
                    "--height",
                    "1440",
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
            self.assertIn("2560x1440", proc.stdout)
            spec = json.loads(out.read_text(encoding="utf-8"))
            self.assertIn("2560x1440", spec["desc"])
            sites = {patch["va"]: patch["patchedHex"] for patch in spec["patches"]}
            self.assertEqual(sites["0x0051a50a"], "68a0050000")
            self.assertEqual(sites["0x0051a51c"], "68000a0000")


if __name__ == "__main__":
    unittest.main()
