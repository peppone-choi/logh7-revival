import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_post_0030_payload_layout import build_post_0030_payload_layout

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7Post0030PayloadLayoutTests(unittest.TestCase):
    def test_indexes_candidate_handler_copy_layouts(self) -> None:
        index = build_post_0030_payload_layout(CLIENT_EXE)

        self.assertEqual(index["trigger"], "decoded client 0x0030 login/session-like body")
        self.assertEqual(
            index["entries"],
            [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "handlerVirtualAddressHex": "0x004bb5d9",
                    "messageName": "CommandMoveShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x4327cc",
                    "copiedDwords": 263,
                    "copiedBytes": 1052,
                    "followupCallVirtualAddressHex": "0x004be8f0",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "handlerVirtualAddressHex": "0x004bb63a",
                    "messageName": "CommandTurnShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x432be8",
                    "copiedDwords": 69,
                    "copiedBytes": 276,
                    "followupCallVirtualAddressHex": "0x004bef70",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "handlerVirtualAddressHex": "0x004bb670",
                    "messageName": "CommandParallelMoveShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x432cfc",
                    "copiedDwords": 263,
                    "copiedBytes": 1052,
                    "followupCallVirtualAddressHex": "0x004bf320",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
            ],
        )
        self.assertEqual(index["nextTracePoint"], "derive encrypted body construction for 0x0031/0x0032/0x0033")

    def test_pipeline_cli_writes_post_0030_payload_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "payload-layout.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "post-0030-payload-layout",
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
            self.assertEqual(index["entries"][0]["messageName"], "CommandMoveShip OK")


if __name__ == "__main__":
    unittest.main()
