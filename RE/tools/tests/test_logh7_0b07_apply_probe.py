import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh70b07ApplyProbeTests(unittest.TestCase):
    def test_build_js_observes_apply_stages_without_writes(self) -> None:
        from tools.logh7_0b07_apply_probe import build_js

        script = build_js()

        self.assertIn("0x4bee20", script)
        self.assertIn("0x517cd0", script)
        self.assertIn("0x501e30", script)
        self.assertIn("0x7cd04c", script)
        self.assertIn("0x11178", script)
        self.assertIn("0x2a58f8", script)
        self.assertIn("0xb07", script)
        self.assertIn("0x16", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)

    def test_classifies_each_probe_stage(self) -> None:
        from tools.logh7_0b07_apply_probe import classify_probe_result

        cases = [
            ({"bee20": 0}, 10, 10, "record-missing"),
            ({"bee20": 1, "gateMax": 0}, 10, 10, "grid-gate-closed"),
            ({"bee20": 1, "gateMax": 1, "dispatch_b07": 0}, 10, 10, "dispatch-missing"),
            ({"bee20": 1, "gateMax": 1, "dispatch_b07": 1, "enq_16": 0}, 10, 10, "enqueue-missing"),
            (
                {"bee20": 1, "gateMax": 1, "dispatch_b07": 1, "enq_16": 1},
                10,
                10,
                "applied-no-owncell-change",
            ),
            (
                {"bee20": 1, "gateMax": 1, "dispatch_b07": 1, "enq_16": 1},
                10,
                11,
                "applied-owncell-changed",
            ),
        ]

        for snap, before, after, expected in cases:
            with self.subTest(expected=expected):
                result = classify_probe_result(snap, before, after)
                self.assertEqual(result["verdictCode"], expected)

    def test_cli_help_does_not_require_frida_or_live_client(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_0b07_apply_probe.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--seconds", result.stdout)
        self.assertIn("--pid", result.stdout)
        self.assertIn("--image-name", result.stdout)
        self.assertIn("--out", result.stdout)


if __name__ == "__main__":
    unittest.main()
