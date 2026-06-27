import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HeapSlotWatchTests(unittest.TestCase):
    def test_build_js_hooks_heap_allocators_and_slot_snapshot(self) -> None:
        from tools.logh7_heap_slot_watch import build_js

        script = build_js(poll_ms=25, min_size=0x10000, max_size=0x20000)

        self.assertIn("HeapAlloc", script)
        self.assertIn("VirtualAlloc", script)
        self.assertIn("0x00648d42", script)
        self.assertIn("0x005ffab7", script)
        self.assertIn("0x007cd04c", script)
        self.assertIn("slotSnapshot", script)
        self.assertIn("allocation", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_heap_slot_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--min-size", result.stdout)
        self.assertIn("--max-size", result.stdout)


if __name__ == "__main__":
    unittest.main()
