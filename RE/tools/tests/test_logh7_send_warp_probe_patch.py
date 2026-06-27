from __future__ import annotations

import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_send_warp_probe_patch import (
    MAGIC,
    RECORD_BYTES,
    decode_send_warp_probe_ring,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _record(call_index: int) -> bytes:
    record = bytearray(RECORD_BYTES)
    record[0:4] = MAGIC
    struct.pack_into(
        "<IIIIIII",
        record,
        4,
        call_index,
        0x12FA1000,
        0x12FA2000,
        0x00000000,
        0x00579D60,
        3,
        0,
    )
    return bytes(record)


class Logh7SendWarpProbeRingTests(unittest.TestCase):
    def test_decodes_send_warp_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "send-warp-ring.bin"
            ring.write_bytes(struct.pack("<I", 2) + b"\0\0\0\0" + _record(1) + bytes(RECORD_BYTES))

            decoded = decode_send_warp_probe_ring(ring)

        self.assertEqual(decoded["counter"], 2)
        self.assertEqual(decoded["records"][0]["callIndex"], 1)
        self.assertEqual(decoded["records"][0]["param2PtrHex"], "0x12fa2000")
        self.assertEqual(decoded["records"][0]["returnAddressHex"], "0x00579d60")
        self.assertEqual(decoded["records"][1], {"index": 1, "empty": True})


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7SendWarpProbePatchTests(unittest.TestCase):
    def test_writes_send_warp_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.send-warp.exe"
            manifest = temp_path / "send-warp.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_send_warp_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], MAGIC.hex())
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertEqual(patch["ringBuffer"]["recordBytes"], RECORD_BYTES)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x005737d0")

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            self.assertEqual(raw[_virtual_address_to_offset(image, 0x005737D0)], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )


if __name__ == "__main__":
    unittest.main()
