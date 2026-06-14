import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_login_response_layout import (
    DISPATCH_ENTRY_VA,
    build_login_response_layout,
)

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7LoginResponseLayoutTests(unittest.TestCase):
    def test_reconstructs_login_response_path(self) -> None:
        layout = build_login_response_layout(CLIENT_EXE)

        queue = layout["queue"]
        self.assertEqual(queue["codeOffsetHex"], "0x003552bc")
        self.assertEqual(queue["bodyPointerOffsetHex"], "0x003552c8")
        self.assertEqual(queue["entryStride"], 0x14)
        self.assertEqual(queue["capacity"], 0x1F4)
        self.assertEqual(queue["enqueueVirtualAddressHex"], "0x004b8850")
        self.assertEqual(queue["decodeRouterVirtualAddressHex"], "0x004ae0d0")

        dispatch = layout["dispatch"]
        self.assertEqual(dispatch["functionVirtualAddressHex"], "0x004ba2b0")
        self.assertEqual(dispatch["entryVirtualAddressHex"], "0x004ba316")
        self.assertEqual(dispatch["smallTableVirtualAddressHex"], "0x004bde7c")

        router = layout["decodeRouter"]
        self.assertEqual(router["virtualAddressHex"], "0x004ae0d0")
        self.assertEqual(router["defaultAppendCallHex"], "0x004ae0ff")
        self.assertEqual(router["defaultAppendTargetHex"], "0x004b8850")
        self.assertEqual(router["clientGlobalPointerHex"], "0x007ccffc")
        self.assertEqual(router["internalCodeArgument"], "[esp+4] low16")
        self.assertEqual(router["bodyPointerArgument"], "[esp+0x0c]")
        self.assertEqual(router["defaultRouteInternalCodes"], "all except 0x0202 and 0x0204")
        self.assertEqual(
            router["specialRoutes"],
            [
                {
                    "internalHex": "0x0202",
                    "branchVirtualAddressHex": "0x004ae0e9",
                    "targetVirtualAddressHex": "0x004ae163",
                    "route": "special text/control path; does not take the default queue append",
                },
                {
                    "internalHex": "0x0204",
                    "branchVirtualAddressHex": "0x004ae0ee",
                    "targetVirtualAddressHex": "0x004ae10e",
                    "route": (
                        "if client+0x35837e is set, appends at 0x004ae127; otherwise stores "
                        "session context and calls runtime-manager vtable +0x18 with 0x0205"
                    ),
                },
            ],
        )

        promotion_gap = layout["promotionGap"]
        self.assertIn("G077/G078", promotion_gap["negativeRuntimeEvidence"])
        self.assertEqual(
            promotion_gap["nextRuntimeTracePoints"][:4],
            ["0x004ae0d0", "0x004ae0ff", "0x004ae127", "0x004b8850"],
        )

        by_code = {r["internalHex"]: r for r in layout["loginResponses"]}

        login = by_code["0x0200"]
        self.assertEqual(login["messageName"], "SSLoginOK")
        self.assertEqual(login["handlerVirtualAddressHex"], "0x004ba347")
        self.assertEqual(login["debugLabel"], "SSLoginOK OK")
        self.assertEqual(login["minBodyLength"], 1)
        self.assertEqual(login["bodyReads"], [{"bodyOffset": 0, "size": 1}])
        self.assertIn("client+0x358375", login["loginFlagsSet"])
        self.assertIn("client+0x35837d", login["loginFlagsSet"])

        game = by_code["0x0205"]
        self.assertEqual(game["messageName"], "SSGameLoginOK")
        self.assertEqual(game["handlerVirtualAddressHex"], "0x004ba3af")
        self.assertEqual(game["debugLabel"], "SSGameLoginOK OK")
        self.assertEqual(game["minBodyLength"], 1)
        self.assertIn("client+0x35837e", game["loginFlagsSet"])

    def test_chain_marker_drift_is_detected(self) -> None:
        # Flip one byte at the dispatch entry so a structural marker no longer matches;
        # the reconstruction must refuse rather than emit a wrong layout.
        data = bytearray(CLIENT_EXE.read_bytes())
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        image = _parse_pe_image(bytes(data))
        off = _virtual_address_to_offset(image, DISPATCH_ENTRY_VA)
        data[off] ^= 0xFF
        with tempfile.TemporaryDirectory() as temp:
            broken = Path(temp) / "broken.exe"
            broken.write_bytes(bytes(data))
            with self.assertRaises(ValueError):
                build_login_response_layout(broken)

    def test_cli_writes_login_response_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "login-response-layout.json"
            result = subprocess.run(
                [sys.executable, "tools/logh7_login_response_layout.py", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            layout = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(layout["loginResponses"][0]["messageName"], "SSLoginOK")
            self.assertIn("0x0200", layout["acceptanceSpec"])


if __name__ == "__main__":
    unittest.main()
