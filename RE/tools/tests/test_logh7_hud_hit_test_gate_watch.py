import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudHitTestGateWatchTests(unittest.TestCase):
    def test_build_js_hooks_hit_test_gate_helpers(self) -> None:
        from tools.logh7_hud_hit_test_gate_watch import build_js

        script = build_js(poll_ms=125)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("0x005025f0", script)
        self.assertIn("0x0050c180", script)
        self.assertIn("0x00501d60", script)
        self.assertIn("0x005024b0", script)
        self.assertIn("DAT_022142b0", script)
        self.assertIn("DAT_022142c0", script)
        self.assertIn("controllerGate05", script)
        self.assertIn("inputHitTest-gate-005015f0", script)
        self.assertIn("pointRectHit-gate-005025f0", script)
        self.assertIn("occlusionPrimary-gate-0050c180", script)
        self.assertIn("occlusionPeer-gate-00501d60", script)
        self.assertIn("controllerGateWrite-005024b0", script)
        self.assertIn("const POLL_MS = 125;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_hit_test_gate_watch.py", "--help"],
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
