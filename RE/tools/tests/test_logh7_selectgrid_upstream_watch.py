import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7SelectGridUpstreamWatchTests(unittest.TestCase):
    def test_build_js_observes_upstream_projection_boundaries(self) -> None:
        from tools.logh7_selectgrid_upstream_watch import build_js

        # Given: a SelectGrid upstream watcher script with non-default sampling knobs.
        # When: the Frida JavaScript is rendered.
        script = build_js(sample_bytes=48, poll_ms=125)

        # Then: the script hooks the verified projection addresses and emits stable tags.
        self.assertIn("G7MTClient.exe", script)
        self.assertIn("0x004b25a0", script)
        self.assertIn("0x004d359c", script)
        self.assertIn("0x004d35a6", script)
        self.assertIn("0x004d7a7b", script)
        self.assertIn("0x004d7a80", script)
        self.assertIn("worldProjector-enter-004b25a0", script)
        self.assertIn("worldProjector-leave-004b25a0", script)
        self.assertIn("gridProjector-write-x-004d359c", script)
        self.assertIn("gridProjector-write-y-prep-004d35a6", script)
        self.assertIn("projection-call-before-004d7a7b", script)
        self.assertIn("projection-call-after-004d7a80", script)
        self.assertIn("callArg1GridXOut", script)
        self.assertIn("callArg2GridYOut", script)
        self.assertIn("callArg3WorldVector", script)
        self.assertIn("const SAMPLE_BYTES = 48;", script)
        self.assertIn("const POLL_MS = 125;", script)

    def test_build_js_uses_verified_argument_slots(self) -> None:
        from tools.logh7_selectgrid_upstream_watch import build_js

        # Given: the SelectGrid upstream watcher script.
        # When: the Frida JavaScript is rendered.
        script = build_js()

        # Then: it treats FUN_004b25a0 arg4 as the world out-vector and 0x004d3580
        # callsite stack[0..2] as gridX out, gridY out, and world vector.
        self.assertIn("const outVec = stackPtr(this.context, 4);", script)
        self.assertIn("const xOut = readPointer(context.esp);", script)
        self.assertIn("const yOut = readPointer(context.esp.add(4));", script)
        self.assertIn("const worldVector = readPointer(context.esp.add(8));", script)
        self.assertNotIn("argAtEsp0AsVector", script)
        self.assertNotIn("argAtEsp4AsOut", script)

    def test_build_js_observes_grid_projector_internal_writes(self) -> None:
        from tools.logh7_selectgrid_upstream_watch import build_js

        # Given: Frida function-entry hooks can perturb 0x004d3580 stack inspection.
        # When: the watcher observes the verified write instructions instead.
        script = build_js()

        # Then: it records X/Y target pointers and values from registers at the writes.
        self.assertIn("0x004d359c", script)
        self.assertIn("0x004d35a6", script)
        self.assertIn("gridProjector-write-x-004d359c", script)
        self.assertIn("gridProjector-write-y-prep-004d35a6", script)
        self.assertIn("targetPtr: hex(this.context.ecx)", script)
        self.assertIn("const target = stackPtr(this.context, 3);", script)
        self.assertNotIn("install('0x004d35aa'", script)
        self.assertNotIn("install('0x004d35ac'", script)
        self.assertNotIn("install('0x004d3580'", script)

    def test_build_js_gates_projection_events_to_active_mouse_input(self) -> None:
        from tools.logh7_selectgrid_upstream_watch import build_js

        # Given: a watcher that can run while the strategic map repaints every frame.
        # When: the Frida JavaScript is rendered.
        script = build_js()

        # Then: high-volume projection hooks emit only while a mouse button is active.
        self.assertIn("function interestingMouseState()", script)
        self.assertIn("if (!this.enabled) return;", script)
        self.assertIn("if (interestingMouseState()) emit('projection-call-before-004d7a7b'", script)
        self.assertIn("flags: flagSnapshot()", script)

    def test_build_js_reads_projection_inputs_without_memory_writes(self) -> None:
        from tools.logh7_selectgrid_upstream_watch import build_js

        # Given: the default SelectGrid upstream watcher script.
        # When: the Frida JavaScript is rendered.
        script = build_js()

        # Then: it uses read-only helpers for pointers, floats, ints, and sampled bytes.
        self.assertIn("readPointer", script)
        self.assertIn("readFloat", script)
        self.assertIn("readS32", script)
        self.assertIn("readByteArray", script)
        self.assertIn("safe", script)
        self.assertIn("try", script)
        self.assertIn("catch", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)
        self.assertNotIn("writePointer(", script)
        self.assertNotIn("Memory.write", script)

    def test_cli_script_runs_as_direct_file(self) -> None:
        # Given: the watcher module path as a direct Python script.
        # When: help is requested.
        result = subprocess.run(
            [sys.executable, "tools/logh7_selectgrid_upstream_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        # Then: argparse renders the expected watcher options without importing Frida.
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--session", result.stdout)
        self.assertIn("--pid", result.stdout)
        self.assertIn("--out", result.stdout)
        self.assertIn("--seconds", result.stdout)
        self.assertIn("--sample-bytes", result.stdout)
        self.assertIn("--poll-ms", result.stdout)


if __name__ == "__main__":
    unittest.main()
