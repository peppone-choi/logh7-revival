import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_outbound_request_dispatch import build_outbound_request_dispatch_index


CLIENT_EXE = Path(".omo/ghidra/bin/G7MTClient.exe")


class Logh7OutboundRequestDispatchTests(unittest.TestCase):
    def test_indexes_outbound_request_selector_routes(self) -> None:
        index = build_outbound_request_dispatch_index(CLIENT_EXE)

        by_selector = {entry["selectorHex"]: entry for entry in index["trackedRoutes"]}
        self.assertEqual(index["dispatchVirtualAddressHex"], "0x004b78a0")
        self.assertEqual(index["jumpTableVirtualAddressHex"], "0x004b864c")
        self.assertEqual(index["queueLayout"]["queueCount"], "client+0x357ec0")
        self.assertEqual(len(index["trackedRoutes"]), 0x80)

        self.assertEqual(by_selector["0x0001"]["requestHex"], "0x0200")
        self.assertEqual(by_selector["0x0001"]["expectedResponseHex"], "0x0201")
        self.assertEqual(by_selector["0x0001"]["routeKind"], "queued-or-immediate")
        self.assertEqual(by_selector["0x0014"]["requestHex"], "0x0f02")
        self.assertEqual(by_selector["0x0014"]["expectedResponseHex"], "0x0f03")
        self.assertIn("client+0x35837e", by_selector["0x0014"]["stateGateOffsets"])
        self.assertEqual(by_selector["0x0021"]["requestHex"], "0x031e")
        self.assertEqual(by_selector["0x0021"]["expectedResponseHex"], "0x031f")
        self.assertEqual(by_selector["0x0030"]["requestHex"], "0x0300")
        self.assertEqual(by_selector["0x0030"]["expectedResponseHex"], "0x0301")
        self.assertTrue(any("client+0x357eac" in item for item in by_selector["0x0030"]["sideEffects"]))

    def test_c002_selectgrid_route_is_explicit(self) -> None:
        index = build_outbound_request_dispatch_index(CLIENT_EXE)
        c002 = index["c002Route"]

        self.assertEqual(c002["selectorHex"], "0x003b")
        self.assertEqual(c002["caseIndexHex"], "0x003a")
        self.assertEqual(c002["requestHex"], "0x0b01")
        self.assertEqual(c002["expectedResponseHex"], "0x0b07")
        self.assertIn("client+0x35837e", c002["stateGateOffsets"])

    def test_cli_writes_outbound_request_dispatch_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "outbound-request-dispatch.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "tools/logh7_outbound_request_dispatch.py",
                    str(CLIENT_EXE),
                    "--out",
                    str(out),
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(payload["c002Route"]["requestHex"], "0x0b01")


if __name__ == "__main__":
    unittest.main()
