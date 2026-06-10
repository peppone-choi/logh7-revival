import unittest

from tools.logh7_live_entity_scan import (
    build_selector1_scan_result,
    parse_selector1_records,
    parse_transport_queue_entries,
)


class Logh7LiveEntityScanTests(unittest.TestCase):
    def test_parses_transport_queue_entries(self) -> None:
        data = bytearray(12 * 3)
        data[0:4] = (0x0200).to_bytes(4, "little")
        data[4:8] = (0x0201).to_bytes(4, "little")
        data[8:12] = (0x12345678).to_bytes(4, "little")
        data[12:16] = (0x0205).to_bytes(4, "little")
        data[16:20] = (0x0206).to_bytes(4, "little")
        data[20:24] = (0x87654321).to_bytes(4, "little")

        entries = parse_transport_queue_entries(bytes(data), queued_count=2)

        self.assertEqual(
            entries,
            [
                {
                    "index": 0,
                    "queuedInternalCode": 0x0200,
                    "queuedInternalHex": "0x0200",
                    "pairedInternalCode": 0x0201,
                    "pairedInternalHex": "0x0201",
                    "payloadOrContextPointerHex": "0x12345678",
                },
                {
                    "index": 1,
                    "queuedInternalCode": 0x0205,
                    "queuedInternalHex": "0x0205",
                    "pairedInternalCode": 0x0206,
                    "pairedInternalHex": "0x0206",
                    "payloadOrContextPointerHex": "0x87654321",
                },
            ],
        )

    def test_parses_active_selector1_record_keys(self) -> None:
        data = bytearray(0x9EC * 3)
        data[0] = 1
        data[4:8] = (0x11111111).to_bytes(4, "little")
        data[0x9EC] = 0
        data[0x9EC + 4 : 0x9EC + 8] = (0x22222222).to_bytes(4, "little")
        data[0x9EC * 2] = 1
        data[0x9EC * 2 + 4 : 0x9EC * 2 + 8] = (0x33333333).to_bytes(4, "little")

        records = parse_selector1_records(bytes(data), record_count=3)

        self.assertEqual(
            records,
            [
                {"index": 0, "key": 0x11111111, "keyHex": "0x11111111"},
                {"index": 2, "key": 0x33333333, "keyHex": "0x33333333"},
            ],
        )

    def test_builds_selector1_scan_result_with_activation_flags(self) -> None:
        records = [{"index": 0, "key": 0x11111111, "keyHex": "0x11111111"}]

        result = build_selector1_scan_result(
            pid=1234,
            client_object=0x12C23020,
            activation_gate=1,
            cipher_gate=1,
            ss_login_ok_flag=1,
            ss_game_login_ok_flag=1,
            selector1_request_gate=0,
            selector1_mode=0,
            response_world_initialized=1,
            response_grid_initialized=0,
            runtime_manager_pointer=0x09ABCDEF,
            transport_queue_count=2,
            transport_queue_entries=[
                {
                    "index": 0,
                    "queuedInternalCode": 0x0200,
                    "queuedInternalHex": "0x0200",
                    "pairedInternalCode": 0x0201,
                    "pairedInternalHex": "0x0201",
                    "payloadOrContextPointerHex": "0x12345678",
                },
            ],
            records=records,
        )

        self.assertEqual(result["activationGate"], 1)
        self.assertEqual(result["cipherGate"], 1)
        self.assertEqual(result["ssLoginOkFlag"], 1)
        self.assertEqual(result["ssGameLoginOkFlag"], 1)
        self.assertEqual(result["selector1RequestGate"], 0)
        self.assertEqual(result["selector1Mode"], 0)
        self.assertEqual(result["responseWorldInitialized"], 1)
        self.assertEqual(result["responseGridInitialized"], 0)
        self.assertEqual(result["runtimeManagerPointerHex"], "0x09abcdef")
        self.assertEqual(result["transportQueueCount"], 2)
        self.assertEqual(result["transportQueueEntries"][0]["queuedInternalHex"], "0x0200")
        self.assertEqual(result["firstActiveKeyHex"], "0x11111111")


if __name__ == "__main__":
    unittest.main()
