import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7FridaMsgdatLookupTests(unittest.TestCase):
    def test_build_js_hooks_msgdat_lookup_functions(self) -> None:
        from tools.logh7_frida_msgdat_lookup import build_js

        script = build_js(sample_limit=17, backtrace_depth=5)

        self.assertIn("0x00522010", script)
        self.assertIn("0x005229d0", script)
        self.assertIn("NO DATA", script)
        self.assertIn("NO TABLE", script)
        self.assertIn("readCString", script)
        self.assertIn("Thread.backtrace", script)
        self.assertIn("group", script)
        self.assertIn("subId", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_frida_msgdat_lookup.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--scenario", result.stdout)


if __name__ == "__main__":
    unittest.main()
