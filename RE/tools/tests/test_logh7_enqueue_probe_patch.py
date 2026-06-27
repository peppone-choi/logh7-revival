import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_enqueue_probe_patch import decode_enqueue_probe_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _ring(records: list[tuple[int, int, int, int]]) -> bytes:
    buffer = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for call_index, code, body, client in records:
        record = bytearray(64)
        record[0:4] = b"EQB1"
        struct.pack_into("<IIII", record, 4, call_index, code, body, client)
        buffer += record
    return bytes(buffer)


class Logh7EnqueueProbeRingTests(unittest.TestCase):
    def test_empty_ring_means_no_response_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(64 * 8))
            decoded = decode_enqueue_probe_ring(ring)
        self.assertFalse(decoded["responsesAccepted"])
        self.assertEqual(decoded["acceptedInternalCodes"], [])

    def test_decodes_accepted_internal_codes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([(0, 0x0200, 0x12340000, 0x12C53020), (1, 0x0205, 0x12340040, 0x12C53020)]))
            decoded = decode_enqueue_probe_ring(ring)
        self.assertTrue(decoded["responsesAccepted"])
        self.assertEqual(decoded["acceptedInternalCodes"], ["0x0200", "0x0205"])


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7EnqueueProbePatchTests(unittest.TestCase):
    def test_writes_enqueue_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.enqueue-probe.exe"
            metadata = Path(temp) / "enqueue-probe-patch.json"
            result = subprocess.run(
                [sys.executable, "-m", "tools.logh7_enqueue_probe_patch", "patch", str(CLIENT_EXE),
                 "--out", str(patched), "--manifest-out", str(metadata)],
                cwd=REPO_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["magic"], "45514231")  # "EQB1"
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "decodedMessageEnqueue")
            self.assertEqual(hook["virtualAddressHex"], "0x004b8850")
            self.assertEqual(hook["originalHex"], "515355568b742418")
            raw = patched.read_bytes()
            self.assertEqual(raw[0xB8850], 0xE9)

    def test_enqueue_bytes_unchanged_in_source(self) -> None:
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        off = _virtual_address_to_offset(image, 0x004B8850)
        self.assertEqual(data[off : off + 8].hex(), "515355568b742418")


if __name__ == "__main__":
    unittest.main()
