import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_ctor_probe_patch import decode_ctor_probe_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _ring(records: list[tuple[int, int, int, int]]) -> bytes:
    buffer = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for call_index, descriptor, count, manager in records:
        record = bytearray(64)
        record[0:4] = b"CPB1"
        struct.pack_into("<IIII", record, 4, call_index, descriptor, count, manager)
        buffer += record
    return bytes(buffer)


class Logh7CtorProbeRingTests(unittest.TestCase):
    def test_flags_empty_map_on_zero_count(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([(0, 0x00681000, 4, 0x053B3994), (1, 0x00681000, 0, 0x053B3434)]))
            decoded = decode_ctor_probe_ring(ring)
        first, second = decoded["records"][0], decoded["records"][1]
        self.assertFalse(first["buildsEmptyMap"])
        self.assertEqual(first["count"], 4)
        self.assertTrue(second["buildsEmptyMap"])
        self.assertEqual(second["count"], 0)

    def test_flags_empty_map_on_null_descriptor(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([(0, 0, 8, 0x053B3994)]))
            decoded = decode_ctor_probe_ring(ring)
        self.assertTrue(decoded["records"][0]["buildsEmptyMap"])


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7CtorProbePatchTests(unittest.TestCase):
    def test_writes_ctor_descriptor_count_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.ctor-probe.exe"
            metadata = Path(temp) / "ctor-probe-patch.json"
            result = subprocess.run(
                [sys.executable, "-m", "tools.logh7_ctor_probe_patch", "patch", str(CLIENT_EXE),
                 "--out", str(patched), "--manifest-out", str(metadata)],
                cwd=REPO_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["magic"], "43504231")  # "CPB1"
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "handlerMapCtorDescriptorCount")
            self.assertEqual(hook["virtualAddressHex"], "0x006128f5")
            self.assertEqual(hook["continuationHex"], "0x006128fb")
            self.assertEqual(hook["originalHex"], "8b4424443bc5")
            raw = patched.read_bytes()
            self.assertEqual(raw[0x2128F5], 0xE9)
            self.assertIn(b"CPB1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_ctor_bytes_unchanged_in_source(self) -> None:
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        off = _virtual_address_to_offset(image, 0x006128F5)
        self.assertEqual(data[off : off + 6].hex(), "8b4424443bc5")


if __name__ == "__main__":
    unittest.main()
