import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudEventQueueWatchTests(unittest.TestCase):
    def test_build_js_hooks_event_queue_and_fallback_gates(self) -> None:
        from tools.logh7_hud_event_queue_watch import build_js

        script = build_js(poll_ms=125)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x00501e30", script)
        self.assertIn("0x00501ed0", script)
        self.assertIn("0x00502780", script)
        self.assertIn("0x00502770", script)
        self.assertIn("0x005025c0", script)
        self.assertIn("gate05", script)
        self.assertIn("eventQueueEnqueue-enter-00501e30", script)
        self.assertIn("eventQueueDequeue-leave-00501ed0", script)
        self.assertIn("uiObjectLookup-leave-00502780", script)
        self.assertIn("queueGlobalGate-leave-00502770", script)
        self.assertIn("targetGate15-leave-005025c0", script)
        self.assertIn("const POLL_MS = 125;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_event_queue_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--pid", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--seconds", result.stdout)
        self.assertIn("--poll-ms", result.stdout)


if __name__ == "__main__":
    unittest.main()
