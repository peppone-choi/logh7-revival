import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import extract_child_codec_static_tables
from tools.logh7_post_handshake_body import decode_post_handshake_0030_frame

from test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
GUID_TRANSPORT_KEY = b"{A4C13748-0159-4c54-AEB3-1D68575761B3}"
G013_REQUEST = "001a00345f01cbef3174ecd32d76704509ef162c268ea3b677430ca6"
G013_POST_HANDSHAKE = (
    "00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0"
    "a2d83d54a1fcb9bcd135d389f3b40cdb78ef"
)
G015_REQUEST = "001a0034540aa2baff90c94895f8a4ef0c23e8f87e38a8fb21da916e"
G015_POST_HANDSHAKE = (
    "0032003079fd0b4ee9fe4d5309b360fc850c8ecfd503d44d8c88aaa2f9f1cd5e2d"
    "b03eb4b9b37d158d5f969bc1297e2e27f8bf7b"
)
DECODED_0030 = (
    "5517000000010027700047494e370001000000070069006e006500690030003000000600640075006d006d0079000000"
)


class Logh7PostHandshakeBodyTests(unittest.TestCase):
    def test_decodes_observed_0030_body_with_phase1_key(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)

        decoded = decode_post_handshake_0030_frame(
            tables,
            transport_key=GUID_TRANSPORT_KEY,
            request_frame=bytes.fromhex(G013_REQUEST),
            post_handshake_frame=bytes.fromhex(G013_POST_HANDSHAKE),
        )

        self.assertEqual(decoded["phase1Sequence"], 1)
        self.assertEqual(decoded["phase1KeyHex"], "32f512783e74ec29b4c045adba3497e8")
        self.assertEqual(decoded["decodedBodyHex"], DECODED_0030)
        self.assertEqual(decoded["marker"]["offset"], 8)
        self.assertEqual(decoded["marker"]["asciiPreview"], "p.GIN7")
        self.assertEqual(decoded["accountLowByteText"], "inei00\x00")
        self.assertEqual(decoded["passwordEvenByteText"], "dummy\x00")
        self.assertEqual(decoded["bodyKeySource"], "phase1 key decoded from same connection 0x0034 request")

    def test_decoded_0030_plaintext_is_stable_across_runs(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)

        first = decode_post_handshake_0030_frame(
            tables,
            transport_key=GUID_TRANSPORT_KEY,
            request_frame=bytes.fromhex(G013_REQUEST),
            post_handshake_frame=bytes.fromhex(G013_POST_HANDSHAKE),
        )
        second = decode_post_handshake_0030_frame(
            tables,
            transport_key=GUID_TRANSPORT_KEY,
            request_frame=bytes.fromhex(G015_REQUEST),
            post_handshake_frame=bytes.fromhex(G015_POST_HANDSHAKE),
        )

        self.assertNotEqual(first["phase1KeyHex"], second["phase1KeyHex"])
        self.assertEqual(first["decodedBodyHex"], second["decodedBodyHex"])

    def test_pipeline_cli_writes_post_handshake_body_decode(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "post-handshake-body.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "post-handshake-body-decode",
                    str(CLIENT_EXE),
                    "--transport-key-hex",
                    GUID_TRANSPORT_KEY.hex(),
                    "--request-frame-hex",
                    G013_REQUEST,
                    "--post-handshake-frame-hex",
                    G013_POST_HANDSHAKE,
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
            decoded = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(decoded["decodedBodyHex"], DECODED_0030)
            self.assertEqual(decoded["transportHex"], "0x0030")


if __name__ == "__main__":
    unittest.main()
