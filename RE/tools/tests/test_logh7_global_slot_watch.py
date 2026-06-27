import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7GlobalSlotWatchTests(unittest.TestCase):
    def test_build_js_arms_memory_monitor_and_slot_snapshots(self) -> None:
        from tools.logh7_global_slot_watch import build_js

        script = build_js(sample_bytes=32, poll_ms=250, max_access_events=64)

        self.assertIn("MemoryAccessMonitor.enable", script)
        self.assertIn("0x007cd000", script)
        self.assertIn("0x007cd04c", script)
        self.assertIn("0x007cd048", script)
        self.assertIn("0x007ccffc", script)
        self.assertIn("slotSnapshot", script)
        self.assertIn("memory-access", script)
        self.assertIn("0x004c8a90", script)
        self.assertIn("0x004fef90", script)
        self.assertIn("0x004d3a40", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_global_slot_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--max-access-events", result.stdout)
        self.assertIn("--disable-memory-monitor", result.stdout)


if __name__ == "__main__":
    unittest.main()
