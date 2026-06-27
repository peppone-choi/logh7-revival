import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudClickPulseWatchTests(unittest.TestCase):
    def test_build_js_hooks_click_pulse_lifecycle(self) -> None:
        from tools.logh7_hud_click_pulse_watch import build_js

        script = build_js(poll_ms=125)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x00507b10", script)
        self.assertIn("0x00507f20", script)
        self.assertIn("0x005024e0", script)
        self.assertIn("0x005025a0", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("gateB00", script)
        self.assertIn("gateB01", script)
        self.assertIn("gateB02", script)
        self.assertIn("uiUpdateLoop-enter-00507b10", script)
        self.assertIn("uiObjectUpdate-mode-00507f20", script)
        self.assertIn("flag15Write-mode-005024e0", script)
        self.assertIn("clickPulseClear-mode-005025a0", script)
        self.assertIn("inputHitTest-mode-005015f0", script)
        self.assertIn("const POLL_MS = 125;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_click_pulse_watch.py", "--help"],
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
