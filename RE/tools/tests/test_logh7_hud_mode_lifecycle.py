import json
import subprocess
import sys
import unittest

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7HudModeLifecycleTests(unittest.TestCase):
    def test_indexes_hud_mode_lifecycle_from_real_client(self) -> None:
        from tools.logh7_hud_mode_lifecycle import build_hud_mode_lifecycle_index

        index = build_hud_mode_lifecycle_index(CLIENT_EXE)

        self.assertEqual(index["modeGateFunction"]["virtualAddressHex"], "0x004fd100")
        by_role = {entry["role"]: entry for entry in index["modeActivationHitTests"]}
        self.assertEqual(by_role["hudMode2Primary"]["targetOffsetHex"], "0x0014")
        self.assertEqual(by_role["hudMode2Primary"]["successMode"], 2)
        self.assertEqual(by_role["hudMode4Primary"]["targetOffsetHex"], "0x0018")
        self.assertEqual(by_role["hudMode4Primary"]["successMode"], 4)
        self.assertEqual(by_role["hudMode2Fallback"]["targetOffsetHex"], "0x0028")
        self.assertEqual(by_role["hudMode2Fallback"]["requiresCurrentMode"], 1)
        self.assertEqual(by_role["hudMode6Fallback"]["targetOffsetHex"], "0x0024")
        self.assertEqual(by_role["hudMode6Fallback"]["successMode"], 6)
        self.assertEqual(index["modeSetFunction"]["activatesOwnerGate"], "FUN_005024b0(1)")
        self.assertEqual(index["initFunction"]["initialModeSet"], "FUN_004fd7a0(1,0)")
        self.assertIn("pre-activation hit-test", index["c002Implication"])

    def test_module_cli_writes_hud_mode_lifecycle_index(self) -> None:
        out = REPO_ROOT / ".omo" / "ulw-loop" / "evidence" / "g006-c002-hud-mode-lifecycle-cli-test.json"

        result = subprocess.run(
            [sys.executable, "-m", "tools.logh7_hud_mode_lifecycle", str(CLIENT_EXE), "--out", str(out)],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        index = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(index["source"], str(CLIENT_EXE))
        self.assertEqual(len(index["modeActivationHitTests"]), 4)


if __name__ == "__main__":
    unittest.main()
