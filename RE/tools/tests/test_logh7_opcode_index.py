import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_opcode_index import build_opcode_index

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "ghidra" / "bin" / "G7MTClient.exe"


class Logh7OpcodeIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = build_opcode_index(CLIENT_EXE)

    def test_joins_outbound_receive_and_transport_indexes(self) -> None:
        index = self.index

        self.assertEqual(index["schemaVersion"], 1)
        self.assertEqual(index["outboundDispatch"]["dispatchVirtualAddressHex"], "0x004b78a0")
        self.assertEqual(index["inboundDispatch"]["dispatchEntryVirtualAddressHex"], "0x004ba316")
        self.assertIn("0x0030", index["transportDispatch"]["trackedTransportHexes"])
        self.assertEqual(index["coverage"]["outboundSelectorRoutes"], 0x80)
        self.assertGreaterEqual(index["coverage"]["outboundCallsites"], 100)
        self.assertGreaterEqual(index["coverage"]["resolvedOutboundCallsites"], 100)
        self.assertEqual(index["coverage"]["trackedInboundResponses"], 7)

    def test_c002_route_is_normalized_without_claiming_receive_handler(self) -> None:
        index = self.index
        route = next(row for row in index["normalizedOutboundRoutes"] if row["requestInternalHex"] == "0x0b01")

        self.assertEqual(index["c002Route"]["selectorHex"], "0x003b")
        self.assertEqual(route["caseIndexHex"], "0x003a")
        self.assertEqual(route["pairedResponseInternalHex"], "0x0b07")
        self.assertEqual(route["sendStateGateOffsets"], ["client+0x35837e"])
        self.assertIsNone(route["trackedReceiveHandlerVirtualAddressHex"])

    def test_c002_callsite_resolves_selector_0x003b(self) -> None:
        index = self.index
        self.assertEqual(len(index["c002Callsites"]), 1)

        callsite = index["c002Callsites"][0]
        self.assertEqual(callsite["functionName"], "FUN_004b48d0")
        self.assertEqual(callsite["callVirtualAddressHex"], "0x004b490e")
        self.assertEqual(callsite["modeArg"], 1)
        self.assertEqual(callsite["sendMode"], "queued")
        self.assertEqual(callsite["selectorHex"], "0x003b")
        self.assertEqual(callsite["requestInternalHex"], "0x0b01")
        self.assertEqual(callsite["pairedResponseInternalHex"], "0x0b07")
        self.assertEqual(callsite["payloadArg"], "eax")

    def test_selector_0x003a_callsite_is_not_c002(self) -> None:
        index = self.index
        callsite = next(row for row in index["outboundCallsites"] if row.get("selectorHex") == "0x003a")

        self.assertEqual(callsite["functionName"], "FUN_004b4600")
        self.assertEqual(callsite["callVirtualAddressHex"], "0x004b4642")
        self.assertEqual(callsite["modeArg"], 0)
        self.assertEqual(callsite["requestInternalHex"], "0x0412")
        self.assertNotEqual(callsite["requestInternalHex"], "0x0b01")

    def test_known_world_init_route_joins_tracked_receive_handler(self) -> None:
        index = self.index
        route = next(row for row in index["normalizedOutboundRoutes"] if row["requestInternalHex"] == "0x0f02")

        self.assertEqual(route["pairedResponseInternalHex"], "0x0f03")
        self.assertEqual(route["trackedReceiveHandlerVirtualAddressHex"], "0x004bd121")
        self.assertEqual(route["trackedReceiveStateWrites"], ["client+0x35f357"])

    def test_pipeline_cli_writes_opcode_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "opcode-index.json"
            result = subprocess.run(
                [sys.executable, str(TOOL), "opcode-index", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(payload["c002Route"]["requestHex"], "0x0b01")
            self.assertEqual(payload["c002Callsites"][0]["callVirtualAddressHex"], "0x004b490e")


if __name__ == "__main__":
    unittest.main()
