import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_session_setup_trigger import build_session_setup_trigger_index

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7SessionSetupTriggerTests(unittest.TestCase):
    def test_indexes_robot_path_that_triggers_full_session_setup(self) -> None:
        index = build_session_setup_trigger_index(CLIENT_EXE)

        self.assertEqual(index["targetInstructionVirtualAddressHex"], "0x004ad7e0")
        self.assertEqual(index["setupConstructor"]["entryVirtualAddressHex"], "0x004ad780")
        self.assertEqual(index["setupConstructor"]["directCallers"][0]["callVirtualAddressHex"], "0x004ad756")
        self.assertEqual(index["allocatorWrapper"]["entryVirtualAddressHex"], "0x004ad710")
        self.assertEqual(index["allocatorWrapper"]["directCallers"][0]["callVirtualAddressHex"], "0x004ad3e6")
        self.assertEqual(index["sessionBootstrap"]["entryVirtualAddressHex"], "0x004ad120")
        self.assertEqual(index["sessionBootstrap"]["directCallers"][0]["callVirtualAddressHex"], "0x004b64a7")
        self.assertEqual(index["robotBootstrap"]["entryVirtualAddressHex"], "0x004b6480")
        self.assertEqual(index["robotBootstrap"]["directCallers"][0]["jumpVirtualAddressHex"], "0x0051bdad")
        self.assertEqual(index["robotApiEntry"]["entryVirtualAddressHex"], "0x0051bd70")
        self.assertEqual(
            [caller["callVirtualAddressHex"] for caller in index["robotApiEntry"]["directCallers"]],
            ["0x0051a798", "0x0051b942"],
        )

        self.assertEqual(index["robotBootstrap"]["argcLiteral"], 5)
        self.assertEqual(index["robotBootstrap"]["argvTableVirtualAddressHex"], "0x0076ee04")
        self.assertEqual(
            [entry["text"] for entry in index["robotBootstrap"]["staticArgv"]],
            ["G7MTClient.exe", "127.0.0.1", "47900", "ginei00", "1", "dummy"],
        )

        self.assertEqual(index["fullHandlerMap"]["factoryCallVirtualAddressHex"], "0x004ad864")
        self.assertEqual(index["fullHandlerMap"]["factoryTargetVirtualAddressHex"], "0x00612030")
        self.assertEqual(index["fullHandlerMap"]["handlerCount"], 3)
        self.assertEqual(index["fullHandlerMap"]["handlerTableVtableHex"], "0x0066e0f0")
        self.assertEqual(index["fullHandlerMap"]["descriptorExpression"], "ebp+0x14")
        self.assertEqual(index["sessionMapGlobal"]["globalVirtualAddressHex"], "0x007c2478")
        self.assertEqual(index["sessionMapGlobal"]["storeVirtualAddressHex"], "0x004ad3f0")
        self.assertEqual(index["sessionMapGlobal"]["cleanupCallVirtualAddressHex"], "0x0051b91a")

        self.assertEqual(index["emptyMapContrast"]["functionEntryVirtualAddressHex"], "0x004ac070")
        self.assertEqual(index["emptyMapContrast"]["factoryCallVirtualAddressHex"], "0x004ac0c9")
        self.assertEqual(index["emptyMapContrast"]["handlerCount"], 4)
        self.assertEqual(index["conclusion"], "0x004ad7e0 is reached by the robot/autoclient bootstrap chain, not by a direct post-login response handler.")
        self.assertIn("G113", index["currentRuntimeStatus"])
        self.assertIn("0x00612357", index["nextRuntimeProbe"])

    def test_cli_writes_session_setup_trigger_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "session-setup-trigger.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_session_setup_trigger",
                    str(CLIENT_EXE),
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["triggerChain"][0]["fromVirtualAddressHex"], "0x0051bd70")
            self.assertEqual(index["triggerChain"][-1]["toVirtualAddressHex"], "0x004ad780")


if __name__ == "__main__":
    unittest.main()
