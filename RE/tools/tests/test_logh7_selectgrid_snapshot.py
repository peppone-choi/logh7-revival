from __future__ import annotations

import subprocess
import sys
import unittest


class Logh7SelectGridSnapshotTests(unittest.TestCase):
    def test_build_js_reads_command_and_selection_state_without_hooks(self) -> None:
        from tools.logh7_selectgrid_snapshot import build_js

        script = build_js(label="테스트", sample_bytes=32)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x009d2a30", script)
        self.assertIn("0x00c9e768", script)
        self.assertIn("0x00c9eac4", script)
        self.assertIn("0x00c9eabc", script)
        self.assertIn("0x00c9eac0", script)
        self.assertIn("0x3416d8", script)
        self.assertIn("0x36a5dc", script)
        self.assertIn("0x41a364", script)
        self.assertIn("payloadWord274", script)
        self.assertIn("hudModeF4", script)
        self.assertIn("hudState14e0", script)
        self.assertIn("selectionRows()", script)
        self.assertIn("0x22 + i", script)
        self.assertIn("0x32 + i", script)
        self.assertIn("send(snapshot())", script)
        self.assertNotIn("Interceptor.attach", script)

    def test_cli_help(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_selectgrid_snapshot.py", "--help"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("without installing hooks", result.stdout)


if __name__ == "__main__":
    unittest.main()
