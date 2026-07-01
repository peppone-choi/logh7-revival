import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudLifecycleWatchTests(unittest.TestCase):
    def test_build_js_observes_hud_lifecycle_read_only(self) -> None:
        from tools.logh7_hud_lifecycle_watch import build_js

        script = build_js(sample_bytes=40, poll_ms=150)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x004fc4e0", script)
        self.assertIn("0x004fc4a0", script)
        self.assertIn("0x004fd560", script)
        self.assertIn("0x004fd7a0", script)
        self.assertIn("0x004f6040", script)
        self.assertIn("0x004f6680", script)
        self.assertIn("0x004fe890", script)
        self.assertIn("0x0050cf40", script)
        self.assertIn("0x005024b0", script)
        self.assertIn("0x006703c0", script)
        self.assertIn("hudInit-leave-004fc4e0", script)
        self.assertIn("hudModeSet-leave-004fd7a0", script)
        self.assertIn("unitListPanelBuild-leave-004f6040", script)
        self.assertIn("selectionModeSet-leave-004f6680", script)
        self.assertIn("widgetListCreate-leave-004fe890-slot67", script)
        self.assertIn("widgetSlotLookup-leave-0050cf40-slot67", script)
        self.assertIn("objectGateSet-leave-005024b0", script)
        self.assertIn("requestedModeRows", script)
        self.assertIn("count270U8", script)
        self.assertIn("slot67ByFormula", script)
        self.assertIn("slot67ByLegacyOffset", script)
        self.assertIn("hudMode2Primary", script)
        self.assertIn("hudMode4Primary", script)
        self.assertIn("hudMode6Fallback", script)
        self.assertIn("hudMode2Fallback", script)
        self.assertIn("const SAMPLE_BYTES = 40;", script)
        self.assertIn("const POLL_MS = 150;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writePointer(", script)
        self.assertNotIn("Memory.write", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_lifecycle_watch.py", "--help"],
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
