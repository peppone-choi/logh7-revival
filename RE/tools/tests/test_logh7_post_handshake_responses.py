import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_post_handshake_responses import build_post_handshake_response_candidates

from test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7PostHandshakeResponsesTests(unittest.TestCase):
    def test_indexes_candidate_server_responses_after_decoded_0030(self) -> None:
        index = build_post_handshake_response_candidates(CLIENT_EXE)

        self.assertEqual(index["trigger"], "decoded client 0x0030 login/session-like body")
        self.assertEqual(
            index["candidates"],
            [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "transportTargetVirtualAddressHex": "0x004b7dde",
                    "internalHandlerVirtualAddressHex": "0x004bb5d9",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "transportTargetVirtualAddressHex": "0x004b7df6",
                    "internalHandlerVirtualAddressHex": "0x004bb63a",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "transportTargetVirtualAddressHex": "0x004b7e0e",
                    "internalHandlerVirtualAddressHex": "0x004bb670",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
            ],
        )

    def test_pipeline_cli_writes_post_handshake_response_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "responses.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "post-handshake-response-candidates",
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
            self.assertEqual(index["candidates"][0]["transportHex"], "0x0031")
            self.assertEqual(index["nextTracePoint"], "reverse payload layout for internal 0x0400/0x0401/0x0402")


if __name__ == "__main__":
    unittest.main()
