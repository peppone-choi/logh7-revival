import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudModeActivationWatchTests(unittest.TestCase):
    def test_build_js_labels_mode_activation_hit_tests(self) -> None:
        from tools.logh7_hud_mode_activation_watch import build_js

        script = build_js(sample_bytes=52, poll_ms=175)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x004fd100", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("0x004fd7a0", script)
        self.assertIn("0x004fc4e0", script)
        self.assertIn("0x004fc4a0", script)
        self.assertIn("0x004fd560", script)
        self.assertIn("0x005024b0", script)
        self.assertIn("0x00502ea0", script)
        self.assertIn("returnSiteName", script)
        self.assertIn("outInfoBytes", script)
        self.assertIn("hudMode2Primary", script)
        self.assertIn("hudMode4Primary", script)
        self.assertIn("hudMode2Fallback", script)
        self.assertIn("hudMode6Fallback", script)
        self.assertIn("modeRouteMap006703c0", script)
        self.assertIn("hudInitializer-enter-004fc4e0", script)
        self.assertIn("hudRestoreMode-enter-004fc4a0", script)
        self.assertIn("hudHistoryPop-enter-004fd560", script)
        self.assertIn("modeActivationHitTest", script)
        self.assertIn("uiActivationGate-enter-005024b0", script)
        self.assertIn("uiAdmitGate-enter-00502ea0", script)
        self.assertIn("const SAMPLE_BYTES = 52;", script)
        self.assertIn("const POLL_MS = 175;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_mode_activation_watch.py", "--help"],
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
        self.assertIn("--sample-bytes", result.stdout)
        self.assertIn("--poll-ms", result.stdout)


if __name__ == "__main__":
    unittest.main()
