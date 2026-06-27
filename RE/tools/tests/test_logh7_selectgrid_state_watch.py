import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7SelectGridStateWatchTests(unittest.TestCase):
    def test_build_js_observes_selectgrid_projection_and_send_path(self) -> None:
        from tools.logh7_selectgrid_state_watch import build_js

        script = build_js(sample_bytes=32, poll_ms=200)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x009d2a30", script)
        self.assertIn("0x007cd04c", script)
        self.assertIn("0x022143dc", script)
        self.assertIn("0x022143e0", script)
        self.assertIn("0x004d7b13", script)
        self.assertIn("0x004d6310", script)
        self.assertIn("0x00570a10", script)
        self.assertIn("0x005737d0", script)
        self.assertIn("0x004b48d0", script)
        self.assertIn("selectGridSnapshot", script)
        self.assertIn("projectionWriter", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_selectgrid_state_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--sample-bytes", result.stdout)
        self.assertIn("--poll-ms", result.stdout)


if __name__ == "__main__":
    unittest.main()
