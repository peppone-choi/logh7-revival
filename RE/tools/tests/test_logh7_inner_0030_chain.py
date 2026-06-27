import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_client_exe import VANILLA_REFERENCE_EXE
from tools.logh7_inner_0030_chain import build_inner_0030_chain_index
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = VANILLA_REFERENCE_EXE


@unittest.skipUnless(CLIENT_EXE.exists(), "vanilla reference G7MTClient.exe is required")
class Logh7Inner0030ChainTests(unittest.TestCase):
    def test_indexes_keysetup_to_pending_chain(self) -> None:
        index = build_inner_0030_chain_index(CLIENT_EXE)

        router = index["transportRouter"]
        self.assertEqual(router["entryVirtualAddressHex"], "0x006130a0")
        self.assertEqual(router["opcodeReadCallHex"], "0x006130f3")
        self.assertEqual(router["fastPathTransportHex"], "0x0030")
        self.assertEqual(router["non0030MapRoot"], "manager+0x14")
        self.assertEqual(router["emptyMapCleanupHex"], "0x00613150")

        inner = index["innerFastPath"]
        self.assertEqual(inner["entryVirtualAddressHex"], "0x00613169")
        self.assertEqual(inner["keysetupInnerHex"], "0x0031")
        self.assertEqual(inner["keysetupCallHex"], "0x00613202")
        self.assertEqual(inner["recursiveRouterCallHex"], "0x00613212")

        pending = index["non31PendingPath"]
        self.assertEqual(pending["entryVirtualAddressHex"], "0x00613222")
        self.assertEqual(pending["pendingReaderField"], "manager+0x24")
        self.assertEqual(pending["pendingPtrField"], "manager+0x28")
        self.assertEqual(pending["pendingLenField"], "manager+0x2c")
        self.assertEqual(pending["pendingFlagField"], "manager+0x30")

        loop = index["consumerLoop"]
        self.assertEqual(loop["entryVirtualAddressHex"], "0x006122c0")
        self.assertEqual(loop["initialRouterCallHex"], "0x00612309")
        self.assertEqual(loop["loopRouterCallHex"], "0x00612393")
        self.assertEqual(loop["handlerLookupCallHex"], "0x00612343")
        self.assertEqual(loop["handlerDispatchCallHex"], "0x00612357")

        lobby = index["postKeyLobbyParser"]
        self.assertEqual(lobby["loginProcessorHandleVirtualAddressHex"], "0x004ac700")
        self.assertEqual(lobby["handlerVtableVirtualAddressHex"], "0x0066e080")
        self.assertEqual(lobby["supportedInnerMessageHexes"], ["0x7001", "0x7002"])
        self.assertEqual(lobby["messageInputCallHex"], "0x00612357")
        self.assertIn("uint16", lobby["g118RuntimeNegative"])

        experiment = index["nextRuntimeExperiment"]
        self.assertEqual(experiment["name"], "chained-0030-after-keysetup")
        self.assertIn("same socket write", experiment["writePolicy"])
        self.assertIn("handler-input", experiment["expectedProbe"])

    def test_cli_writes_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "inner-0030-chain.json"
            result = subprocess.run(
                [sys.executable, "tools/logh7_inner_0030_chain.py", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["innerFastPath"]["keysetupInnerHex"], "0x0031")


if __name__ == "__main__":
    unittest.main()
