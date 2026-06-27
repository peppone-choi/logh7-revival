import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_object_enable_probe_patch import (
    MAGIC,
    RECORD_BYTES,
    decode_object_enable_ring,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _record(
    call_index: int,
    *,
    return_address: int,
    object_ptr: int,
    new_enable: int,
    flags_a: int,
    object_id: int,
    dword_cd0: int,
) -> bytes:
    record = bytearray(RECORD_BYTES)
    record[0:4] = MAGIC
    struct.pack_into(
        "<IIIIIII",
        record,
        4,
        call_index,
        return_address,
        object_ptr,
        new_enable,
        flags_a,
        object_id,
        dword_cd0,
    )
    return bytes(record)


class Logh7ObjectEnableRingTests(unittest.TestCase):
    def test_decodes_object_enable_writer_records(self) -> None:
        self.assertEqual(RECORD_BYTES, 32)
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "object-enable-ring.bin"
            ring.write_bytes(
                struct.pack("<I", 2)
                + b"\0\0\0\0"
                + _record(
                    1,
                    return_address=0x0050896E,
                    object_ptr=0x1369E064,
                    new_enable=0,
                    flags_a=0x04030201,
                    object_id=0x112,
                    dword_cd0=2,
                )
            )

            decoded = decode_object_enable_ring(ring)

        record = decoded["records"][0]
        self.assertEqual(record["callIndex"], 1)
        self.assertEqual(record["returnAddressHex"], "0x0050896e")
        self.assertEqual(record["objectPtrHex"], "0x1369e064")
        self.assertEqual(record["newEnable"], 0)
        self.assertEqual(record["objectActive8"], 1)
        self.assertEqual(record["objectVisible14"], 2)
        self.assertEqual(record["objectEnabledBefore15"], 3)
        self.assertEqual(record["objectInput18"], 4)
        self.assertEqual(record["objectIdB04Hex"], "0x0112")
        self.assertEqual(record["dwordCD0"], 2)


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7ObjectEnablePatchTests(unittest.TestCase):
    def test_writes_object_enable_probe_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.object-enable.exe"
            manifest = Path(temp) / "object-enable.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_object_enable_probe_patch",
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
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x005024e0")
            self.assertEqual(patch["hook"]["originalHex"], "8b4424048a4808")
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 16)
            self.assertEqual(patch["recordFormat"]["magic"], MAGIC.hex())
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)

            raw = patched.read_bytes()
            self.assertEqual(raw[0x1024E0], 0xE9)
            image = _parse_pe_image(raw)
            trampoline_va = int(patch["trampoline"]["virtualAddressHex"], 16)
            trampoline = _virtual_address_to_offset(image, trampoline_va)
            self.assertEqual(raw[trampoline + 9 : trampoline + 12], bytes.fromhex("7505e9"))
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )


if __name__ == "__main__":
    unittest.main()
