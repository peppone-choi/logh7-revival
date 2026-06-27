import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7CurrentGridWatchTests(unittest.TestCase):
    def test_build_js_hooks_current_grid_fields_and_consumers(self) -> None:
        from tools.logh7_current_grid_watch import build_js

        script = build_js(sample_bytes=32, poll_ms=250)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x007cd04c", script)
        self.assertIn("0x11178", script)
        self.assertIn("0x1117c", script)
        self.assertIn("0x11180", script)
        self.assertIn("0x004d3a40", script)
        self.assertIn("0x004d4e90", script)
        self.assertIn("0x004d5030", script)
        self.assertIn("0x0057bbc0", script)
        self.assertIn("currentGridSnapshot", script)
        self.assertIn("rawChanged", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_current_grid_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)


if __name__ == "__main__":
    unittest.main()
