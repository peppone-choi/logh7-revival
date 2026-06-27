import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudTargetGeometryWatchTests(unittest.TestCase):
    def test_build_js_hooks_target_geometry_helpers(self) -> None:
        from tools.logh7_hud_target_geometry_watch import build_js

        script = build_js(poll_ms=175)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("0x005025f0", script)
        self.assertIn("0x00502980", script)
        self.assertIn("0x00507090", script)
        self.assertIn("targetGeometry", script)
        self.assertIn("computedRect", script)
        self.assertIn("viewportBaseSamples", script)
        self.assertIn("pointRectHit-geometry-005025f0", script)
        self.assertIn("geometryPointer-00502980", script)
        self.assertIn("viewportBase-00507090", script)
        self.assertIn("const POLL_MS = 175;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_target_geometry_watch.py", "--help"],
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
