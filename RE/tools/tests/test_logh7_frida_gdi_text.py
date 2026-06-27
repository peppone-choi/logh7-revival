import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7FridaGdiTextTests(unittest.TestCase):
    def test_build_js_hooks_gdi_text_calls(self) -> None:
        from tools.logh7_frida_gdi_text import build_js

        script = build_js(sample_limit=12, backtrace_depth=7)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("previewWide", script)
        self.assertIn("ExtTextOutA", script)
        self.assertIn("TextOutA", script)
        self.assertIn("DrawTextA", script)
        self.assertIn("GetTextExtentPoint32A", script)
        self.assertIn("ExtTextOutW", script)
        self.assertIn("TextOutW", script)
        self.assertIn("DrawTextW", script)
        self.assertIn("GetTextExtentPoint32W", script)
        self.assertIn("utf16le", script)
        self.assertIn("NO DATA", script)
        self.assertIn("pathLike", script)
        self.assertIn("Thread.backtrace", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_frida_gdi_text.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--scenario", result.stdout)


if __name__ == "__main__":
    unittest.main()
