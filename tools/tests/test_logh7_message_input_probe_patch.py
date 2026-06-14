import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_message_input_probe_patch import decode_message_input_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _ring() -> bytes:
    record = bytearray(64)
    record[0:4] = b"MIP1"
    struct.pack_into(
        "<IIIIIIIIIII",
        record,
        4,
        0,
        0x054A1000,
        0x0066E080,
        0x004AC700,
        0x0012F000,
        0x681F1C,
        0x0012F020,
        0x00000003,
        0x00000000,
        0x054A2000,
        0x7002,
    )
    return struct.pack("<I", 1) + b"\0\0\0\0" + bytes(record)


class Logh7MessageInputProbePatchTests(unittest.TestCase):
    def test_decodes_message_input_ring(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "message-input-ring.bin"
            ring.write_bytes(_ring())
            decoded = decode_message_input_ring(ring)

        self.assertEqual(decoded["counter"], 1)
        self.assertEqual(decoded["inputMethods"], ["0x004ac700"])
        record = decoded["records"][0]
        self.assertEqual(record["messageThisHex"], "0x054a1000")
        self.assertEqual(record["vtableHex"], "0x0066e080")
        self.assertEqual(record["innerCodeHex"], "0x7002")
        self.assertTrue(record["inputPreviewHex"].startswith("1c1f6800"))

    @unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
    def test_writes_message_input_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.message-input.exe"
            metadata = temp_path / "message-input-patch.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_message_input_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "4d495031")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["hooks"][0]["virtualAddressHex"], "0x00612357")
            self.assertEqual(patch["hooks"][0]["originalHex"], "ff52088b4e04")
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            hook_offset = _virtual_address_to_offset(image, 0x00612357)
            self.assertEqual(raw[hook_offset], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )


if __name__ == "__main__":
    unittest.main()
