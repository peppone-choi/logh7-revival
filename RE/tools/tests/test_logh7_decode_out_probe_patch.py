import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_decode_out_probe_patch import decode_decode_out
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _record(*, counter: int, eax: int, transport: int, body: bytes) -> bytes:
    record = bytearray(32)
    record[0:4] = b"L7DO"
    words = struct.unpack("<III", body[:12])
    struct.pack_into("<IIIIII", record, 4, counter, eax, transport, *words)
    return bytes(record)


class Logh7DecodeOutRingTests(unittest.TestCase):
    def test_decodes_post_decode_result_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "decode-out-ring.bin"
            body = bytes.fromhex("123400000003000420010000")
            ring.write_bytes(struct.pack("<I", 1) + b"\0\0\0\0" + _record(counter=0, eax=1, transport=0x05423810, body=body))

            decoded = decode_decode_out(ring)

        self.assertEqual(decoded["counter"], 1)
        self.assertEqual(decoded["records"][0]["decodeAl"], 1)
        self.assertEqual(decoded["records"][0]["transportHex"], "0x05423810")
        self.assertEqual(decoded["records"][0]["outBodyHex"], body.hex())
        self.assertEqual(decoded["records"][0]["id"], 3)
        self.assertEqual(decoded["records"][0]["innerLen"], 4)
        self.assertEqual(decoded["records"][0]["innerCodeHex"], "0x2001")


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7DecodeOutProbePatchTests(unittest.TestCase):
    def test_writes_probe_for_actual_short_jne_decode_site(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.decode-out.exe"
            metadata = Path(temp) / "decode-out.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_decode_out_probe_patch",
                    "patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x00613196")
            self.assertEqual(patch["hook"]["originalHex"], "84c0751d8b74241c")
            self.assertEqual(patch["hook"]["continuationHex"], "0x0061319e")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 16)
            self.assertEqual(patched.read_bytes()[0x213196], 0xE9)

    def test_source_decode_site_matches_short_jne_signature(self) -> None:
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        offset = _virtual_address_to_offset(image, 0x00613196)
        self.assertEqual(data[offset : offset + 8].hex(), "84c0751d8b74241c")


if __name__ == "__main__":
    unittest.main()
