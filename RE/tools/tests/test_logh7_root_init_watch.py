import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7RootInitWatchTests(unittest.TestCase):
    def test_build_js_hooks_root_assignment_and_initializers(self) -> None:
        from tools.logh7_root_init_watch import build_js

        script = build_js(sample_bytes=32, poll_ms=100)

        self.assertIn("0x004c8a10", script)
        self.assertIn("0x004d3bd0", script)
        self.assertIn("0x004c8bc0", script)
        self.assertIn("0x004d3a40", script)
        self.assertIn("0x004b64c0", script)
        self.assertIn("0x004c4170", script)
        self.assertIn("0x004b5bb0", script)
        self.assertIn("0x004c45f0", script)
        self.assertIn("0x0048fb80", script)
        self.assertIn("0x0048ffd0", script)
        self.assertIn("0x0040a700", script)
        self.assertIn("0x004a49c0", script)
        self.assertIn("0x004b6000", script)
        self.assertIn("0x004b5bd0", script)
        self.assertIn("0x004b5cf0", script)
        self.assertIn("0x004b5db0", script)
        self.assertIn("0x004b5e80", script)
        self.assertIn("rootStateParam1", script)
        self.assertIn("rootParam2", script)
        self.assertIn("mainStateFields", script)
        self.assertIn("mainState+8", script)
        self.assertIn("strategyRoot2a58f8", script)
        self.assertIn("currentSourcePtr8", script)
        self.assertIn("currentSource320", script)
        self.assertIn("sourceVtable", script)
        self.assertIn("sourceIdentityTag", script)
        self.assertIn("retvalFields", script)
        self.assertIn("candidateSourceFactoryA-0040a700", script)
        self.assertIn("candidateSourceFactoryB-004a49c0", script)
        self.assertIn("commandCreateOutfitParser-0048fb80", script)
        self.assertIn("commandCreateOutfitTextParser-0048ffd0", script)
        self.assertIn("mainStateConstructor-004b6000", script)
        self.assertIn("sourceDirect31eSetter-004b5bd0", script)
        self.assertIn("sourceRelated324Setter-004b5cf0", script)
        self.assertIn("sourceRelated31eSetter-004b5db0", script)
        self.assertIn("sourceRelated358Setter-004b5e80", script)
        self.assertIn("DAT_007cd04c", script)
        self.assertIn("currentRaw11178", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_root_init_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--sample-bytes", result.stdout)


if __name__ == "__main__":
    unittest.main()
