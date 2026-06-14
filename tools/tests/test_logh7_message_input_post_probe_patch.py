import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_message_input_post_probe_patch import decode_message_input_post_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _ring() -> bytes:
    record = bytearray(64)
    record[0:4] = b"MPO1"
    struct.pack_into(
        "<IIIIIIIIIIIIIII",
        record,
        4,
        0,
        0x05453870,
        0x0066BFE8,
        0x7002,
        3,
        16,
        0x05453900,
        0,
        0,
        0x7002,
        0,
        0,
        0,
        0x05453EC0,
        0x0066E080,
    )
    return struct.pack("<I", 1) + b"\0\0\0\0" + bytes(record)


class Logh7MessageInputPostProbePatchTests(unittest.TestCase):
    def test_decodes_message_input_post_ring(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "message-input-post-ring.bin"
            ring.write_bytes(_ring())
            decoded = decode_message_input_post_ring(ring)

        self.assertEqual(decoded["counter"], 1)
        record = decoded["records"][0]
        self.assertEqual(record["messageThisHex"], "0x05453870")
        self.assertEqual(record["messageCodeHex"], "0x7002")
        self.assertEqual(record["payloadBytes"], 3)
        self.assertEqual(record["handlerObjectHex"], "0x0066e080")

    @unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
    def test_writes_message_input_post_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.message-input-post.exe"
            manifest = temp_path / "message-input-post.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_message_input_post_probe_patch",
                    "patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(manifest),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["magic"], "4d504f31")
            self.assertEqual(patch["hooks"][0]["virtualAddressHex"], "0x0061235a")
            self.assertEqual(patch["hooks"][0]["originalHex"], "8b4e0451e84d280000")

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            hook_offset = _virtual_address_to_offset(image, 0x0061235A)
            self.assertEqual(raw[hook_offset], 0xE9)


if __name__ == "__main__":
    unittest.main()
