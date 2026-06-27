import struct
import tempfile
import unittest
from pathlib import Path

from tools.logh7_factory_probe_ring import decode_factory_probe_ring


def _ring(records: list[tuple[int, list[int]]]) -> bytes:
    buffer = bytearray()
    buffer += struct.pack("<I", len(records))  # counter
    buffer += b"\0\0\0\0"  # pad
    for call_index, args in records:
        record = bytearray(64)
        record[0:4] = b"FPB1"
        struct.pack_into("<I", record, 4, call_index)
        struct.pack_into("<12I", record, 8, *args)
        buffer += record
    return bytes(buffer)


class Logh7FactoryProbeRingTests(unittest.TestCase):
    def test_decodes_guard_failure(self) -> None:
        # arg5 (index 4) == 0 -> first guard fails -> map never built.
        args = [0x11, 0x22, 0x33, 0x44, 0x00, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC]
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([(0, args)]))
            decoded = decode_factory_probe_ring(ring)

        self.assertEqual(decoded["counter"], 1)
        self.assertEqual(decoded["populatedRecords"], 1)
        record = decoded["records"][0]
        self.assertEqual(record["magic"], "FPB1")
        self.assertEqual(record["args"][4], "0x00000000")
        self.assertEqual(record["failedGuardArgs"], ["arg5"])
        self.assertIn("never built", record["verdict"])

    def test_decodes_all_guards_pass(self) -> None:
        args = [i + 1 for i in range(12)]  # all non-zero
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([(7, args)]))
            decoded = decode_factory_probe_ring(ring)

        record = decoded["records"][0]
        self.assertEqual(record["callIndex"], 7)
        self.assertEqual(record["failedGuardArgs"], [])
        self.assertIn("reaches ctor", record["verdict"])

    def test_empty_slots_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            blank = struct.pack("<I", 0) + b"\0\0\0\0" + bytes(64 * 4)
            ring.write_bytes(blank)
            decoded = decode_factory_probe_ring(ring)
        self.assertEqual(decoded["populatedRecords"], 0)
        self.assertTrue(all(r.get("empty") for r in decoded["records"]))


if __name__ == "__main__":
    unittest.main()
