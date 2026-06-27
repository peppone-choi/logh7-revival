import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7SelectGridSp70SourceWatchTests(unittest.TestCase):
    def test_build_js_observes_sp70_source_boundaries(self) -> None:
        from tools.logh7_selectgrid_sp70_source_watch import build_js

        script = build_js(sample_bytes=52, poll_ms=175)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x004b25a0", script)
        self.assertIn("0x004d3581", script)
        self.assertIn("0x004d7a80", script)
        self.assertIn("0x004d7aa9", script)
        self.assertIn("0x004d359c", script)
        self.assertIn("0x004d35a6", script)
        self.assertIn("projection-callee-entry-004d3581", script)
        self.assertIn("projection-copy-after-004d7aa9", script)
        self.assertIn("gridProjector-write-x-004d359c", script)
        self.assertIn("gridProjector-write-y-prep-004d35a6", script)
        self.assertIn("const SAMPLE_BYTES = 52;", script)
        self.assertIn("const POLL_MS = 175;", script)

    def test_build_js_captures_xout_and_stack_slot_relationship(self) -> None:
        from tools.logh7_selectgrid_sp70_source_watch import build_js

        script = build_js()

        self.assertIn("sp70Address", script)
        self.assertIn("sp6cAddress", script)
        self.assertIn("sp70Value", script)
        self.assertIn("sp6cValue", script)
        self.assertIn("xOutPtrEqualsSp70Address", script)
        self.assertIn("yOutPtrEqualsSp6cAddress", script)
        self.assertIn("lastGridXWrite", script)
        self.assertIn("lastGridYWrite", script)
        self.assertIn("stateAtStack5c", script)
        self.assertIn("stackWindow", script)
        self.assertIn("returnAddressMatchesSelectGridProjection", script)
        self.assertNotIn("0x004d7a70", script)
        self.assertNotIn("0x004d7a75", script)
        self.assertNotIn("0x004d7a7a", script)
        self.assertNotIn("0x004d7a7b", script)
        self.assertNotIn("0x004d7a84", script)
        self.assertNotIn("0x004d7a8c", script)
        self.assertNotIn("0x004d7a9c", script)

    def test_build_js_is_read_only(self) -> None:
        from tools.logh7_selectgrid_sp70_source_watch import build_js

        script = build_js()

        self.assertIn("readPointer", script)
        self.assertIn("readByteArray", script)
        self.assertIn("readS32", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)
        self.assertNotIn("writePointer(", script)
        self.assertNotIn("Memory.write", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_selectgrid_sp70_source_watch.py", "--help"],
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
