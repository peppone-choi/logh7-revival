import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7SelectGridClickCorrelationWatchTests(unittest.TestCase):
    def test_build_js_correlates_click_projection_and_validator_state(self) -> None:
        from tools.logh7_selectgrid_click_correlation_watch import build_js

        script = build_js(sample_bytes=40, poll_ms=150)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x007cd04c", script)
        self.assertIn("0x009d2a30", script)
        self.assertIn("0x00c9e768", script)
        self.assertIn("0x004b25a0", script)
        self.assertIn("0x004d359c", script)
        self.assertIn("0x004d35a6", script)
        self.assertIn("0x004d3581", script)
        self.assertIn("0x004d7a80", script)
        self.assertIn("0x004d7aa9", script)
        self.assertIn("click-start", script)
        self.assertIn("worldProjector-leave-004b25a0", script)
        self.assertIn("projection-callee-entry-004d3581", script)
        self.assertIn("gridProjector-write-x-004d359c", script)
        self.assertIn("gridProjector-write-y-prep-004d35a6", script)
        self.assertIn("projection-state-written-after-004d7aa9", script)
        self.assertIn("clickId", script)
        self.assertIn("projectionSerial", script)
        self.assertIn("returnAddressMatchesSelectGridProjection", script)
        self.assertIn("projectionStack", script)
        self.assertIn("projectorWriteArgs", script)
        self.assertIn("currentLocation", script)
        self.assertIn("commandState", script)
        self.assertIn("selectedCell", script)
        self.assertIn("const SAMPLE_BYTES = 40;", script)
        self.assertIn("const POLL_MS = 150;", script)
        self.assertNotIn("0x004d7a7b", script)
        self.assertNotIn("0x004d7bb8", script)
        self.assertNotIn("0x004d7bba", script)
        self.assertNotIn("0x004d7bbf", script)
        self.assertNotIn("0x004d7bc3", script)
        self.assertNotIn("0x004d6310", script)

    def test_build_js_is_read_only(self) -> None:
        from tools.logh7_selectgrid_click_correlation_watch import build_js

        script = build_js()

        self.assertIn("readPointer", script)
        self.assertIn("readByteArray", script)
        self.assertIn("safe", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)
        self.assertNotIn("writePointer(", script)
        self.assertNotIn("Memory.write", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_selectgrid_click_correlation_watch.py", "--help"],
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
