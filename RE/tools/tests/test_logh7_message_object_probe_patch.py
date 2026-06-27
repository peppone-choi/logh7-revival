import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_message_object_probe_patch import (
    MESSAGE_OBJECT_MAGIC,
    MESSAGE_OBJECT_RECORD_BYTES,
    decode_message_object_probe_ring,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _record(call_index: int, site_id: int, values: tuple[int, int, int, int, int]) -> bytes:
    record = bytearray(MESSAGE_OBJECT_RECORD_BYTES)
    record[0:4] = MESSAGE_OBJECT_MAGIC
    struct.pack_into("<IIIIIII", record, 4, call_index, site_id, *values)
    return bytes(record)


class Logh7MessageObjectProbeRingTests(unittest.TestCase):
    def test_decodes_2001_message_object_flow(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "message-object-ring.bin"
            records = [
                _record(0, 1, (1, 0x054A100C, 0x054B2000, 0x054A1000, 0x00082001)),
                _record(1, 2, (0x054B2000, 0x0066D020, 0x0049B000, 0x054C3000, 0x00082001)),
                _record(2, 3, (0, 0x054B2000, 0x0066D020, 0x054C3000, 0x00082001)),
                _record(3, 4, (0x054B2000, 0x0066D020, 0x0049B008, 0x0066E080, 0x0066E084)),
                _record(4, 5, (1, 0x054B2000, 0x0066D020, 0x054C3000, 0x00082001)),
            ]
            ring.write_bytes(struct.pack("<I", len(records)) + b"\0\0\0\0" + b"".join(records))

            decoded = decode_message_object_probe_ring(ring)

        self.assertEqual(decoded["counter"], 5)
        self.assertEqual(
            decoded["sitesSeen"],
            ["lookupResult", "inputBefore", "inputAfter", "handlerBefore", "handlerAfter"],
        )
        self.assertEqual(decoded["verdict"], "handler returned")
        self.assertEqual(decoded["records"][0]["resultAl"], 1)
        self.assertEqual(decoded["records"][0]["appCodeHex"], "0x2001")
        self.assertEqual(decoded["records"][1]["streamLen"], 8)
        self.assertEqual(decoded["records"][3]["handlerMethodHex"], "0x0049b008")

    def test_empty_ring_reports_no_2001_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "message-object-ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(MESSAGE_OBJECT_RECORD_BYTES * 2))
            decoded = decode_message_object_probe_ring(ring)

        self.assertEqual(decoded["sitesSeen"], [])
        self.assertEqual(decoded["verdict"], "no filtered message-object evidence")

    def test_decodes_wrapped_records_chronologically(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "message-object-ring.bin"
            records = [
                _record(6, 3, (0, 0x054B2000, 0x0066D020, 0x054C3000, 0x00082001)),
                _record(7, 4, (0x054B2000, 0x0066D020, 0x0049B008, 0x0066E080, 0x0066E084)),
                _record(2, 1, (1, 0x054A100C, 0x054B2000, 0x054A1000, 0x00082001)),
                _record(3, 2, (0x054B2000, 0x0066D020, 0x0049B000, 0x054C3000, 0x00082001)),
                _record(4, 3, (0, 0x054B2000, 0x0066D020, 0x054C3000, 0x00082001)),
                _record(5, 5, (1, 0x054B2000, 0x0066D020, 0x054C3000, 0x00082001)),
            ]
            ring.write_bytes(struct.pack("<I", 8) + b"\0\0\0\0" + b"".join(records))

            decoded = decode_message_object_probe_ring(ring)

        self.assertEqual([record["callIndex"] for record in decoded["records"]], [2, 3, 4, 5, 6, 7])
        self.assertEqual(decoded["records"][0]["site"], "lookupResult")
        self.assertEqual(decoded["records"][-1]["site"], "handlerBefore")


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7MessageObjectProbePatchTests(unittest.TestCase):
    def test_writes_message_object_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.message-object.exe"
            manifest = temp_path / "message-object.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_message_object_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], MESSAGE_OBJECT_MAGIC.hex())
            self.assertEqual(patch["recordFormat"]["appCodeHex"], "0x2001")
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 6)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            self.assertEqual(
                [hook["target"] for hook in patch["hooks"]],
                ["lookupAppCodeResult", "messageAppCodeInput", "messageAppCodeHandler"],
            )
            self.assertEqual(
                [hook["virtualAddressHex"] for hook in patch["hooks"]],
                ["0x0040467b", "0x004046b5", "0x004046c7"],
            )

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            for va in (0x0040467B, 0x004046B5, 0x004046C7):
                self.assertEqual(raw[_virtual_address_to_offset(image, va)], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )

    def test_writes_wrapping_message_object_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.message-object-wrap.exe"
            manifest = temp_path / "message-object-wrap.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_message_object_probe_patch",
                    "patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(manifest),
                    "--app-code",
                    "0x2006",
                    "--wrap",
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["appCodeHex"], "0x2006")
            self.assertEqual(patch["ringBuffer"]["mode"], "wrap")
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)


if __name__ == "__main__":
    unittest.main()
