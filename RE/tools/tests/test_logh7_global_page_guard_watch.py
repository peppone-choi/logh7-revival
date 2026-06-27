import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7GlobalPageGuardWatchTests(unittest.TestCase):
    def test_build_js_uses_exception_handler_and_readonly_page(self) -> None:
        from tools.logh7_global_page_guard_watch import build_js

        script = build_js(poll_ms=25, max_faults=128)

        self.assertIn("Process.setExceptionHandler", script)
        self.assertIn("Memory.protect", script)
        self.assertIn("0x007cd000", script)
        self.assertIn("0x007cd040", script)
        self.assertIn("0x007cd060", script)
        self.assertIn("page-write-fault", script)
        self.assertIn("slotSnapshot", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_global_page_guard_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--max-faults", result.stdout)


if __name__ == "__main__":
    unittest.main()
