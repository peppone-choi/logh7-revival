import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_ui_hit_probe_patch import (
    MAGIC,
    RECORD_BYTES,
    decode_ui_hit_probe_ring,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _record(
    call_index: int,
    *,
    object_ptr: int,
    flags_a: int,
    flags_b: int,
    rect: tuple[int, int, int, int] = (152, 103, 408, 142),
    object_id: int = 0x112,
    object_offset_x: int = 0,
    object_offset_y: int = 0,
    mouse_d0: int = 0x001B0000,
    mouse_b8: int = 0x00000001,
) -> bytes:
    record = bytearray(64)
    record[0:4] = MAGIC
    struct.pack_into(
        "<IIIIIIIIIIIIIII",
        record,
        4,
        call_index,
        2,
        object_ptr,
        1,
        flags_a,
        flags_b,
        mouse_d0,
        mouse_b8,
        rect[0],
        rect[1],
        rect[2],
        rect[3],
        object_id,
        object_offset_x,
        object_offset_y,
    )
    return bytes(record)


class Logh7UiHitProbeRingTests(unittest.TestCase):
    def test_decodes_mode2_ui_hit_records(self) -> None:
        self.assertEqual(RECORD_BYTES, 64)
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ui-hit-ring.bin"
            ring.write_bytes(
                struct.pack("<I", 3)
                + b"\0\0\0\0"
                + _record(2, object_ptr=0x12FA977C, flags_a=0x04030201, flags_b=0x00070605)
                + _record(1, object_ptr=0x12FA9AE8, flags_a=0x00000001, flags_b=0x00000000)
            )

            decoded = decode_ui_hit_probe_ring(ring)

        self.assertEqual(decoded["counter"], 3)
        self.assertEqual(decoded["records"][0]["callIndex"], 1)
        self.assertEqual(decoded["records"][1]["objectPtrHex"], "0x12fa977c")
        self.assertEqual(decoded["records"][1]["objectActive8"], 1)
        self.assertEqual(decoded["records"][1]["objectVisible14"], 2)
        self.assertEqual(decoded["records"][1]["objectEnabled15"], 3)
        self.assertEqual(decoded["records"][1]["objectInput18"], 4)
        self.assertEqual(decoded["records"][1]["objectFlagB00"], 5)
        self.assertEqual(decoded["records"][1]["objectFlagB02"], 6)
        self.assertEqual(decoded["records"][1]["objectFlagB10"], 7)
        self.assertEqual(decoded["records"][1]["objectFlagB14"], 0)
        self.assertEqual(decoded["records"][1]["rect"], {"x": 152, "y": 103, "w": 408, "h": 142})
        self.assertEqual(decoded["records"][1]["objectIdB04Hex"], "0x0112")
        self.assertEqual(decoded["records"][0]["mouseD0Hex"], "0x001b0000")

    def test_empty_ring_reports_empty_slots(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ui-hit-ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(RECORD_BYTES * 2))
            decoded = decode_ui_hit_probe_ring(ring)

        self.assertEqual(decoded["counter"], 0)
        self.assertEqual(decoded["records"][0], {"index": 0, "empty": True})


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7UiHitProbePatchTests(unittest.TestCase):
    def test_writes_ui_hit_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.ui-hit.exe"
            manifest = temp_path / "ui-hit.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_ui_hit_probe_patch",
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
            self.assertEqual(patch["ringBuffer"]["recordBytes"], 64)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x005015f0")

            raw = patched.read_bytes()
            image = _parse_pe_image(raw)
            self.assertEqual(raw[_virtual_address_to_offset(image, 0x005015F0)], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )


if __name__ == "__main__":
    unittest.main()
