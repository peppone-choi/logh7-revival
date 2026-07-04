from __future__ import annotations

import subprocess
import sys
import unittest


class Logh7EndpointCacheSnapshotTests(unittest.TestCase):
    def test_build_js_reads_endpoint_caches_and_selected_system_state(self) -> None:
        from tools.logh7_endpoint_cache_snapshot import build_js

        script = build_js(label="엔드포인트", sample_records=8)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x007ccffc", script)
        self.assertIn("0x3f5ae8", script)
        self.assertIn("0x3facf4", script)
        self.assertIn("0x3fb2f8", script)
        self.assertIn("0x009d15b0", script)
        self.assertIn("0x009d15c0", script)
        self.assertIn("0x009d2f74", script)
        self.assertIn("staticMatchByGrid", script)
        self.assertIn("dynamicMatchByStaticId", script)
        self.assertIn("strategyCopyInformationBase031f", script)
        self.assertIn("spot1c", script)
        self.assertIn("playerInfo", script)
        self.assertIn("pointerAtClientBase08", script)
        self.assertIn("spotKey40FromSource20", script)
        self.assertIn("spotAux44FromSource24", script)
        self.assertIn("send(snapshot())", script)
        self.assertNotIn("Interceptor.attach", script)

    def test_cli_help(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_endpoint_cache_snapshot.py", "--help"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("endpoint caches", result.stdout)


if __name__ == "__main__":
    unittest.main()
