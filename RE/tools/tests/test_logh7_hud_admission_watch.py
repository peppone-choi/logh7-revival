import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7HudAdmissionWatchTests(unittest.TestCase):
    def test_build_js_observes_hud_selection_and_command_admission(self) -> None:
        from tools.logh7_hud_admission_watch import build_js

        script = build_js(sample_bytes=44, poll_ms=125)

        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x00c9e638", script)
        self.assertIn("0x00c9eac4", script)
        self.assertIn("0x00c9e768", script)
        self.assertIn("0x004f68f0", script)
        self.assertIn("0x004f6600", script)
        self.assertIn("0x004fd100", script)
        self.assertIn("0x004fd7a0", script)
        self.assertIn("0x004f6b00", script)
        self.assertIn("0x004f5cb0", script)
        self.assertIn("0x004f58c0", script)
        self.assertIn("0x004f93c0", script)
        self.assertIn("0x005015f0", script)
        self.assertIn("0x00581c80", script)
        self.assertIn("MemoryAccessMonitor.enable", script)
        self.assertIn("hudModeF4", script)
        self.assertIn("hudAb0", script)
        self.assertIn("listSelected189", script)
        self.assertIn("payloadCount270U8", script)
        self.assertIn("categoryD6", script)
        self.assertIn("selectionImport-leave-004f68f0", script)
        self.assertIn("selectionHitTest-leave-004f6600", script)
        self.assertIn("hudGate-leave-004fd100", script)
        self.assertIn("hudModeSet-leave-004fd7a0", script)
        self.assertIn("categoryResolve-leave-004f6b00", script)
        self.assertIn("commandBuild-leave-004f5cb0", script)
        self.assertIn("commandRowHit-leave-004f58c0", script)
        self.assertIn("factoryDispatch-leave-004f93c0", script)
        self.assertIn("inputHitTest-leave-005015f0", script)
        self.assertIn("selectGridFactory-leave-00581c80", script)
        self.assertIn("thisState: uiObjectState(thisEcx)", script)
        self.assertIn("hudTarget14-mode2-primary", script)
        self.assertIn("hudTarget28-mode2-fallback", script)
        self.assertIn("command-row-", script)
        self.assertIn("modeTargetStates", script)
        self.assertIn("gate05", script)
        self.assertIn("flag15", script)
        self.assertIn("eventQueueCount3f4", script)
        self.assertIn("firstEvent470", script)
        self.assertIn("const SAMPLE_BYTES = 44;", script)
        self.assertIn("const POLL_MS = 125;", script)
        self.assertNotIn("__FORCE_GATE_HELPER__", script)
        self.assertNotIn("__FORCE_GATE_ON_ENTER__", script)

    def test_build_js_is_read_only(self) -> None:
        from tools.logh7_hud_admission_watch import build_js

        script = build_js()

        self.assertIn("readPointer", script)
        self.assertIn("readByteArray", script)
        self.assertIn("safe", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writePointer(", script)
        self.assertNotIn("Memory.write", script)
        self.assertNotIn("force-target-gate05", script)
        self.assertNotIn("force-this-gate05", script)

    def test_build_js_can_force_hit_test_this_gate_for_debugging(self) -> None:
        from tools.logh7_hud_admission_watch import build_js

        script = build_js(force_interaction_this_gate=True)

        self.assertIn("forceInteractionThisGate(thisEcx, target, roles, eventKind);", script)
        self.assertIn("writeU8(1)", script)
        self.assertIn("force-this-gate05", script)
        self.assertNotIn("force-target-gate05", script)
        self.assertIn("command-row-", script)

    def test_deprecated_target_gate_option_forces_this_gate(self) -> None:
        from tools.logh7_hud_admission_watch import build_js

        script = build_js(force_interaction_target_gate=True)

        self.assertIn("forceInteractionThisGate(thisEcx, target, roles, eventKind);", script)
        self.assertIn("force-this-gate05", script)

    def test_best_effort_cleanup_reports_destroyed_script(self) -> None:
        from tools.logh7_hud_admission_watch import _best_effort_cleanup

        class BrokenScript:
            def unload(self) -> None:
                raise RuntimeError("script is destroyed")

        class DetachedSession:
            def __init__(self) -> None:
                self.detached = False

            def detach(self) -> None:
                self.detached = True

        session = DetachedSession()

        errors = _best_effort_cleanup(BrokenScript(), session)

        self.assertTrue(session.detached)
        self.assertEqual(errors, ["script.unload: script is destroyed"])

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_hud_admission_watch.py", "--help"],
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
        self.assertIn("--force-interaction-target-gate", result.stdout)
        self.assertIn("--force-interaction-this-gate", result.stdout)


if __name__ == "__main__":
    unittest.main()
