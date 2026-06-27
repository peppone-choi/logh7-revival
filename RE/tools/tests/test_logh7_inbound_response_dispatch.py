import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_inbound_response_dispatch import build_inbound_response_dispatch_index

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7InboundResponseDispatchTests(unittest.TestCase):
    def test_indexes_inbound_decoded_response_routes(self) -> None:
        index = build_inbound_response_dispatch_index(CLIENT_EXE)

        by_internal = {entry["internalHex"]: entry for entry in index["trackedResponses"]}
        self.assertEqual(index["dispatchEntryVirtualAddressHex"], "0x004ba316")
        self.assertEqual(index["dispatchTailVirtualAddressHex"], "0x004bdd33")
        self.assertEqual(index["unhandledVirtualAddressHex"], "0x004bdcee")
        self.assertEqual(by_internal["0x0200"]["routeKind"], "small-direct-table")
        self.assertEqual(by_internal["0x0200"]["handlerVirtualAddressHex"], "0x004ba347")
        self.assertEqual(by_internal["0x0200"]["stateWrites"], ["client+0x35f252", "client+0x358375", "client+0x35837d"])
        self.assertEqual(by_internal["0x0205"]["handlerVirtualAddressHex"], "0x004ba3af")
        self.assertEqual(by_internal["0x0400"]["routeKind"], "large-index-table")
        self.assertEqual(by_internal["0x0400"]["handlerVirtualAddressHex"], "0x004bb5d9")
        self.assertEqual(by_internal["0x0f01"]["routeKind"], "range-compare")
        self.assertEqual(by_internal["0x0f01"]["handlerVirtualAddressHex"], "0x004bd0c9")
        self.assertEqual(by_internal["0x0f01"]["stateWrites"], ["client+0x35f356"])
        self.assertEqual(by_internal["0x0f03"]["handlerVirtualAddressHex"], "0x004bd121")
        self.assertEqual(by_internal["0x0f03"]["stateWrites"], ["client+0x35f357"])
        self.assertEqual(
            index["nextTracePoint"],
            "hook decoded-response dispatch entry 0x004ba316 or its caller with accepted internal code and body pointer",
        )

    def test_cli_writes_inbound_response_dispatch_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "inbound-response-dispatch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "tools/logh7_inbound_response_dispatch.py",
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
            self.assertEqual(index["trackedResponses"][-1]["messageName"], "ResponseGridInitialize")


if __name__ == "__main__":
    unittest.main()
