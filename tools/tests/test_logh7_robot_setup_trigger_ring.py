import struct
import tempfile
import unittest
from pathlib import Path

from tools.logh7_robot_setup_trigger_ring import decode_robot_setup_trigger_ring


def _record(event: int, saved_eax: int = 0x12345678) -> bytes:
    record = bytearray(64)
    record[0:4] = b"RST1"
    struct.pack_into("<BB", record, 4, event, event)
    struct.pack_into("<III", record, 8, 0x004AD3E6, 0x004AD3EB, 0x004AD710)
    struct.pack_into("<8I", record, 20, saved_eax, 2, 3, 4, 5, 6, 7, 8)
    struct.pack_into("<III", record, 52, 0x11111111, 0x22222222, 0x33333333)
    return bytes(record)


def _ring(records: list[bytes], capacity: int = 8) -> bytes:
    body = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for record in records:
        body.extend(record)
    body.extend(bytes(64 * (capacity - len(records))))
    return bytes(body)


class Logh7RobotSetupTriggerRingTests(unittest.TestCase):
    def test_reports_bootstrap_not_reached_when_ring_is_blank(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([]))
            decoded = decode_robot_setup_trigger_ring(ring)

        self.assertEqual(decoded["counter"], 0)
        self.assertEqual(decoded["populatedRecords"], 0)
        self.assertIn("not reached", decoded["verdict"])
        self.assertTrue(all(record.get("empty") for record in decoded["records"]))

    def test_decodes_full_setup_return_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([_record(3), _record(4, saved_eax=0x00ABCDEF)]))
            decoded = decode_robot_setup_trigger_ring(ring)

        self.assertEqual(decoded["populatedRecords"], 2)
        self.assertIn("sessionBootstrapSetupCall.afterCall", decoded["events"])
        self.assertIn("returned", decoded["verdict"])
        after = decoded["records"][1]
        self.assertEqual(after["savedRegisters"]["eax"], "0x00abcdef")
        self.assertEqual(after["runtimeManagerGlobalHex"], "0x22222222")


if __name__ == "__main__":
    unittest.main()
