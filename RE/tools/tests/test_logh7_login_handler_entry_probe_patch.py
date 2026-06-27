import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_login_handler_entry_probe_patch import decode_login_handler_entry_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _ring() -> bytes:
    record = bytearray(96)
    record[0:4] = b"LHE1"
    struct.pack_into(
        "<IIIIIIIIIIIIIIIIIIIII",
        record,
        4,
        0,
        0x05501000,
        0x12345678,
        0x7001,
        0,
        0,
        0x05502000,
        0x0066C000,
        0x05503000,
        0x00000010,
        0x05504000,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    )
    return struct.pack("<I", 1) + b"\0\0\0\0" + bytes(record)


class Logh7LoginHandlerEntryProbePatchTests(unittest.TestCase):
    def test_decodes_login_handler_entry_ring(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "login-handler-entry-ring.bin"
            ring.write_bytes(_ring())
            decoded = decode_login_handler_entry_ring(ring)

        self.assertEqual(decoded["counter"], 1)
        record = decoded["records"][0]
        self.assertEqual(record["handlerThisHex"], "0x05501000")
        self.assertEqual(record["param2Hex"], "0x7001")
        self.assertEqual(record["param5PtrHex"], "0x05502000")
        self.assertEqual(record["param5DwordsHex"][1], "0x05503000")
        self.assertEqual(record["param5Plus4TargetHex"], "00000000000000000000000000000000")
        self.assertEqual(record["param5PlusCTargetHex"], "00000000000000000000000000000000")

    @unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
    def test_writes_login_handler_entry_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.login-handler-entry.exe"
            manifest = temp_path / "login-handler-entry.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_login_handler_entry_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "4c484531")
            self.assertEqual(patch["hooks"][0]["virtualAddressHex"], "0x004ac726")
            self.assertEqual(patch["hooks"][0]["originalHex"], "8b44244025ffff0000")

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            hook_offset = _virtual_address_to_offset(image, 0x004AC726)
            self.assertEqual(raw[hook_offset], 0xE9)


if __name__ == "__main__":
    unittest.main()
