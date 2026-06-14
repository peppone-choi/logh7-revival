import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_inner_keysetup_result_probe_patch import decode_inner_keysetup_result_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _ring(records: list[tuple[int, int, int, int, int, int, int, int, int, int, int]]) -> bytes:
    buffer = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for record_values in records:
        record = bytearray(64)
        record[0:4] = b"IKR1"
        struct.pack_into("<IIIIIIIIIII", record, 4, *record_values)
        buffer += record
    return bytes(buffer)


class Logh7InnerKeysetupResultRingTests(unittest.TestCase):
    def test_empty_ring_means_inner_keysetup_not_observed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(64 * 8))
            decoded = decode_inner_keysetup_result_ring(ring)
        self.assertFalse(decoded["innerKeysetupObserved"])
        self.assertEqual(decoded["acceptedResults"], [])

    def test_decodes_success_result_and_router_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(
                _ring(
                    [
                        (
                            0,
                            1,
                            0x05492A10,
                            0x149B5D80,
                            0x12C53020,
                            0x99,
                            0,
                            0x054A0000,
                            0x12345678,
                            0x149B5DA0,
                            0x30,
                        )
                    ]
                )
            )
            decoded = decode_inner_keysetup_result_ring(ring)
        self.assertTrue(decoded["innerKeysetupObserved"])
        self.assertEqual(decoded["acceptedResults"], [True])
        self.assertEqual(decoded["records"][0]["resultAl"], 1)
        self.assertEqual(decoded["records"][0]["managerListRootHex"], "0x054a0000")
        self.assertEqual(decoded["records"][0]["contextOpcodeHex"], "0x0030")


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7InnerKeysetupResultPatchTests(unittest.TestCase):
    def test_writes_inner_keysetup_result_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.inner-keysetup-result.exe"
            metadata = Path(temp) / "inner-keysetup-result-patch.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_inner_keysetup_result_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "494b5231")
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "innerKeysetupResult")
            self.assertEqual(hook["virtualAddressHex"], "0x00613205")
            self.assertEqual(hook["originalHex"], "84c07407c7472000000000")
            self.assertEqual(patched.read_bytes()[0x213205], 0xE9)

    def test_inner_result_bytes_unchanged_in_source(self) -> None:
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        offset = _virtual_address_to_offset(image, 0x00613205)
        self.assertEqual(data[offset : offset + 11].hex(), "84c07407c7472000000000")


if __name__ == "__main__":
    unittest.main()
