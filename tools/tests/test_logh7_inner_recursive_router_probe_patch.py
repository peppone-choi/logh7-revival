import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_inner_recursive_router_probe_patch import decode_inner_recursive_router_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _ring(records: list[tuple[int, ...]]) -> bytes:
    buffer = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for values in records:
        record = bytearray(64)
        record[0:4] = b"IRR1"
        struct.pack_into("<IIIIIIIIIIIIII", record, 4, *values)
        buffer += record
    return bytes(buffer)


class Logh7InnerRecursiveRouterRingTests(unittest.TestCase):
    def test_empty_ring_means_recursion_not_observed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(64 * 4))
            decoded = decode_inner_recursive_router_ring(ring)
        self.assertFalse(decoded["recursiveRouterObserved"])
        self.assertEqual(decoded["events"], [])

    def test_decodes_before_and_after_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(
                _ring(
                    [
                        (0, 1, 0x00000001, 0x05490000, 0x054921F0, 0x149B0000, 0, 0, 0, 0x27, 1, 0x149B0000, 0x149B0029, 0x30),
                        (1, 2, 0x00000000, 0x05490000, 0x054921F0, 0x149B0000, 0, 0, 0, 0x27, 1, 0x149B0000, 0x149B0029, 0x30),
                    ]
                )
            )
            decoded = decode_inner_recursive_router_ring(ring)
        self.assertTrue(decoded["recursiveRouterObserved"])
        self.assertEqual(decoded["events"], ["before", "after"])
        self.assertEqual(decoded["afterReturnEaxHex"], "0x00000000")
        self.assertEqual(decoded["records"][0]["pendingFlag"], 1)


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7InnerRecursiveRouterPatchTests(unittest.TestCase):
    def test_writes_inner_recursive_router_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.inner-recursive-router.exe"
            metadata = Path(temp) / "inner-recursive-router-patch.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_inner_recursive_router_probe_patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], "49525231")
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            hook = patch["hooks"][0]
            self.assertEqual(hook["virtualAddressHex"], "0x00613210")
            self.assertEqual(hook["originalHex"], "5653e889feffff")
            self.assertEqual(patched.read_bytes()[0x213210], 0xE9)

    def test_recursive_router_bytes_unchanged_in_source(self) -> None:
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        offset = _virtual_address_to_offset(image, 0x00613210)
        self.assertEqual(data[offset : offset + 7].hex(), "5653e889feffff")


if __name__ == "__main__":
    unittest.main()
