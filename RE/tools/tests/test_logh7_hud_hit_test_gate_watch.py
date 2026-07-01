import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudHitTestGateWatchTests(unittest.TestCase):
    def test_build_js_hooks_hit_test_gate_helpers(self) -> None:
        from tools.logh7_hud_hit_test_gate_watch import build_js

        script = build_js(poll_ms=125)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("0x00501e30", script)
        self.assertIn("0x00501ed0", script)
        self.assertIn("0x005025f0", script)
        self.assertIn("0x0050c180", script)
        self.assertIn("0x00501d60", script)
        self.assertIn("0x005024b0", script)
        self.assertIn("0x00502ea0", script)
        self.assertIn("0x005024e0", script)
        self.assertIn("0x00507f20", script)
        self.assertIn("0x00506280", script)
        self.assertIn("0x004fc4a0", script)
        self.assertIn("0x004fd100", script)
        self.assertIn("0x004f68f0", script)
        self.assertIn("0x004f6680", script)
        self.assertIn("0x004f59e0", script)
        self.assertIn("0x004fd7a0", script)
        self.assertIn("DAT_022142b0", script)
        self.assertIn("DAT_022142c0", script)
        self.assertIn("0x00c9eac4", script)
        self.assertIn("0x00c9e768", script)
        self.assertIn("controllerGate05", script)
        self.assertIn("currentTab187", script)
        self.assertIn("currentTabD3", script)
        self.assertIn("selection-primary-", script)
        self.assertIn("selection-secondary-", script)
        self.assertIn("selection-root", script)
        self.assertIn("command-row-", script)
        self.assertIn("command-root", script)
        self.assertIn("eventQueueCount3f4", script)
        self.assertIn("modeTargetSummary", script)
        self.assertIn("rectW2c", script)
        self.assertIn("eventKeys470", script)
        self.assertIn("hasEvent0b", script)
        self.assertIn("readBytesHex", script)
        self.assertIn("payloadBytes34", script)
        self.assertIn("payloadArgState", script)
        self.assertIn("count270S32", script)
        self.assertIn("inputHitTest-gate-005015f0", script)
        self.assertIn("eventQueueEnqueue-enter-00501e30", script)
        self.assertIn("eventQueueEnqueue-leave-00501e30", script)
        self.assertIn("eventQueueDequeue-enter-00501ed0", script)
        self.assertIn("eventQueueDequeue-leave-00501ed0", script)
        self.assertIn("pointRectHit-gate-005025f0", script)
        self.assertIn("occlusionPrimary-gate-0050c180", script)
        self.assertIn("occlusionPeer-gate-00501d60", script)
        self.assertIn("controllerGateWrite-005024b0", script)
        self.assertIn("hudInformationRefresh-leave-004fc4a0", script)
        self.assertIn("selectionImportApply-leave-004f68f0", script)
        self.assertIn("selectionTabApply-leave-004f6680", script)
        self.assertIn("commandTabApply-leave-004f59e0", script)
        self.assertIn("hudModeSet-leave-004fd7a0", script)
        self.assertIn("activeGateWrite-leave-00502ea0", script)
        self.assertIn("targetGate15Write-leave-005024e0", script)
        self.assertIn("layoutOpenUpdate-leave-00506280", script)
        self.assertIn("hudFrameConsumer-change-004fd100", script)
        self.assertIn("interactionLatchLoop-leave-00507f20", script)
        self.assertIn("const POLL_MS = 125;", script)
        self.assertIn("const MAX_EVENTS = 30000;", script)
        self.assertIn("const INCLUDE_HIT_TESTS = true;", script)
        self.assertIn("const INCLUDE_LATCH = true;", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU32(", script)

    def test_lifecycle_only_mode_disables_noisy_hooks(self) -> None:
        from tools.logh7_hud_hit_test_gate_watch import build_js

        script = build_js(poll_ms=500, max_events=120000, lifecycle_only=True)

        self.assertIn("const POLL_MS = 500;", script)
        self.assertIn("const MAX_EVENTS = 120000;", script)
        self.assertIn("const INCLUDE_HIT_TESTS = false;", script)
        self.assertIn("const INCLUDE_LATCH = false;", script)
        self.assertIn("selectionImportApply-enter-004f68f0", script)
        self.assertIn("selectionTabApply-enter-004f6680", script)
        self.assertIn("hudInformationRefresh-enter-004fc4a0", script)
        self.assertIn("eventQueueEnqueue-enter-00501e30", script)
        self.assertIn("hudFrameConsumer-change-004fd100", script)
        self.assertIn("activeGateWrite-enter-00502ea0", script)
        self.assertIn("controllerGateWrite-005024b0", script)
        self.assertIn("layoutOpenUpdate-enter-00506280", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_hit_test_gate_watch.py", "--help"],
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
        self.assertIn("--max-events", result.stdout)
        self.assertIn("--lifecycle-only", result.stdout)


if __name__ == "__main__":
    unittest.main()
