import struct
import tempfile
import unittest
from pathlib import Path

from tools.logh7_socket_dispatcher_null_list_ring import decode_socket_dispatcher_null_list_ring


def _record(*, loaded_esi: int, branch_taken: int) -> bytes:
    record = bytearray(64)
    record[0:4] = b"SNL1"
    struct.pack_into("<BBBB", record, 4, 1, 1, branch_taken, 0)
    struct.pack_into("<II", record, 8, 0x0061310F, 0x00613150)
    struct.pack_into(
        "<IIIIIIIIIIII",
        record,
        16,
        loaded_esi,
        0x053321F0,
        0x000009E8,
        2,
        0,
        0x05333CE0,
        0,
        0x05332A10,
        0x12C53020,
        1,
        0x16A05046,
        0x053324B0,
    )
    return bytes(record)


def _ring(records: list[bytes], capacity: int = 4) -> bytes:
    body = bytearray(struct.pack("<I", len(records)) + b"\0\0\0\0")
    for record in records:
        body.extend(record)
    body.extend(bytes(64 * (capacity - len(records))))
    return bytes(body)


class Logh7SocketDispatcherNullListRingTests(unittest.TestCase):
    def test_decodes_blank_ring_as_no_null_list_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([]))
            decoded = decode_socket_dispatcher_null_list_ring(ring)

        self.assertEqual(decoded["counter"], 0)
        self.assertEqual(decoded["populatedRecords"], 0)
        self.assertIn("not observed", decoded["verdict"])

    def test_decodes_null_list_cleanup_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "ring.bin"
            ring.write_bytes(_ring([_record(loaded_esi=0, branch_taken=1)]))
            decoded = decode_socket_dispatcher_null_list_ring(ring)

        self.assertEqual(decoded["populatedRecords"], 1)
        self.assertIn("cleanup", decoded["verdict"])
        record = decoded["records"][0]
        self.assertEqual(record["loadedEsiHex"], "0x00000000")
        self.assertEqual(record["branchTaken"], 1)
        self.assertEqual(record["stackCode"], 1)


if __name__ == "__main__":
    unittest.main()
