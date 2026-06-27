import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7GlobalPageWriteWatchTests(unittest.TestCase):
    def test_build_js_hooks_memory_copy_and_overlap_range(self) -> None:
        from tools.logh7_global_page_write_watch import build_js

        script = build_js(poll_ms=25, max_events=128)

        self.assertIn("0x007cd040", script)
        self.assertIn("0x007cd060", script)
        self.assertIn("memcpy", script)
        self.assertIn("memmove", script)
        self.assertIn("memset", script)
        self.assertIn("0x00602a70", script)
        self.assertIn("lstrcpyA", script)
        self.assertIn("lstrcpynA", script)
        self.assertIn("RtlMoveMemory", script)
        self.assertIn("overlap-write", script)
        self.assertIn("slotSnapshot", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_global_page_write_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--max-events", result.stdout)


if __name__ == "__main__":
    unittest.main()
