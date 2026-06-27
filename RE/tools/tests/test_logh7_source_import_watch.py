import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7SourceImportWatchTests(unittest.TestCase):
    def test_build_js_hooks_source_import_copy_path(self) -> None:
        from tools.logh7_source_import_watch import build_js

        script = build_js(sample_bytes=32)

        self.assertIn("0x004b780e", script)
        self.assertIn("0x004c2a80", script)
        self.assertIn("0x004c2c80", script)
        self.assertIn("0x004c2f18", script)
        self.assertIn("0x004301d0", script)
        self.assertIn("0x00419ca0", script)
        self.assertIn("sourceImportCallsite-004b780e", script)
        self.assertIn("sourceImportWrapper-004c2a80", script)
        self.assertIn("sourceImportCopy-004c2c80", script)
        self.assertIn("sourceOptionalCopyAfter-004c2f18", script)
        self.assertIn("characterRecordParser-004301d0", script)
        self.assertIn("unitTableParser-00419ca0", script)
        self.assertIn("function wrapperFields", script)
        self.assertIn("installEntryExit('0x004c2a80', 'sourceImportWrapper-004c2a80', wrapperFields)", script)
        self.assertIn("installEntryExit('0x004c2c80', 'sourceImportCopy-004c2c80', importFields)", script)
        self.assertIn("optionalUnitIndex", script)
        self.assertIn("primaryUnit24", script)
        self.assertIn("unitCount41a364", script)
        self.assertIn("predictedSource320", script)
        self.assertIn("optionalRecordPlus08", script)
        self.assertIn("mainSlot8Before", script)
        self.assertIn("sourceHeadHex", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_source_import_watch.py", "--help"],
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
