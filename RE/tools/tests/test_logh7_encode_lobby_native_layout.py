import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_encode_lobby_native_layout import build_spec


REPO_ROOT = Path(__file__).resolve().parents[2]


class Logh7EncodeLobbyNativeLayoutTests(unittest.TestCase):
    def test_1920_1080_matches_checked_in_anchor_values(self):
        spec = build_spec(1920, 1080)
        sites = {patch["va"]: patch["patchedHex"] for patch in spec["patches"]}
        self.assertEqual(sites["0x0051c983"], "b8bc000000")
        self.assertEqual(sites["0x0051c990"], "b860050000")
        self.assertEqual(sites["0x0051c995"], "b970040000")
        self.assertEqual(sites["0x0051c9d2"], "c744241030020000")
        self.assertEqual(sites["0x0051ca12"], "c744245471020000")

    def test_scaled_rows_are_truncated_not_rounded(self):
        spec = build_spec(1920, 1080)
        sites = {patch["va"]: patch["patchedHex"] for patch in spec["patches"]}
        self.assertEqual(sites["0x0051c9da"], "c744241c21010000")
        self.assertEqual(sites["0x0051c9f2"], "c7442434af010000")
        self.assertEqual(sites["0x0051c9fa"], "c744243cd9010000")

    def test_cli_writes_requested_resolution(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "lobby-native-layout.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_encode_lobby_native_layout",
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
            self.assertEqual(spec["patches"][0]["patchedHex"], "b8fb000000")


if __name__ == "__main__":
    unittest.main()
