import unittest
from pathlib import Path

from tools.logh7_child_codec import (
    child_codec_decode,
    child_codec_encode,
    child_codec_encrypt_block,
    child_codec_key_schedule,
    child_codec_round_function,
    extract_child_codec_static_tables,
)
from tools.logh7_cipher import (
    CHILD_CODEC_BLOCK_SIZE,
    CHILD_CODEC_STORED_KEY_MASK,
    PHASE3_TRANSPORT_CODE,
    Phase1DecodedPayload,
    Phase2DecodedPayload,
    Phase3DecodedPayload,
    build_phase1_decoded_payload,
    build_phase2_decoded_payload,
    build_phase3_decoded_payload,
    build_transport_frame,
    child_codec_encoded_length,
    child_codec_stored_key_image,
    parse_phase1_decoded_payload,
    parse_phase2_decoded_payload,
    parse_phase3_decoded_payload,
    phase3_decoded_checksum,
    require_child_codec_aligned_length,
)
from tools.logh7_phase3_response import build_phase3_child_codec_transport_frame
from tools.logh7_phase3_response import build_phase3_response_from_phase1_request
from tools.logh7_phase_analysis import classify_child_codec_request_body


REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7CipherTests(unittest.TestCase):
    def test_extracts_child_codec_static_tables_from_real_client(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)

        self.assertEqual(len(tables.p_array), 18)
        self.assertEqual(tables.p_array[:4], (0x25406B89, 0x86A409D4, 0x141A8B2F, 0x04717445))
        self.assertEqual(len(tables.s_boxes), 4)
        self.assertEqual(tuple(len(s_box) for s_box in tables.s_boxes), (256, 256, 256, 256))
        self.assertEqual(tables.s_boxes[0][:4], (0xD2320CA7, 0x99E0B6AD, 0x30FE73DC, 0xD11BE0B8))

    def test_child_codec_round_function_matches_disassembly_formula(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)

        self.assertEqual(child_codec_round_function(tables.s_boxes, 0x12345678), 0x3C71E1CA)

    def test_child_codec_key_schedule_matches_real_client_vectors(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        scheduled = child_codec_key_schedule(tables, b"abcd")

        self.assertEqual(scheduled.p_array[:4], (0xBCDB5D36, 0xEC7937A6, 0xB1BD998E, 0xBCA64D5C))
        self.assertEqual(scheduled.s_boxes[0][:4], (0xCD5E0B43, 0x4B8C2EEA, 0xDE6A945B, 0xE145F7FA))
        self.assertEqual(child_codec_encrypt_block(scheduled, 0, 0), (0x14DB3FA1, 0x8D0B8894))

    def test_child_codec_key_schedule_matches_live_guid_table_head(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        guid_key = bytes.fromhex(
            "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
        )
        scheduled = child_codec_key_schedule(tables, guid_key)

        self.assertEqual(
            b"".join(word.to_bytes(4, "little") for word in scheduled.p_array[:16]).hex(),
            "07ea4e160fbda36082588d5cd62ab3e31d393f2197ae7d8b"
            "29d1d7dcec84410e1f8a03a7d6c7b3b33c169a0f7d63d99e"
            "7fd1cfa050293d2526cc69a008db3c50",
        )

    def test_child_codec_replays_live_phase1_wire_body(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        transport_key = bytes.fromhex(
            "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
        )
        plain = bytes.fromhex("4fe30010dbb2f9ab333223792a6f45be98af277300000001")

        encoded = child_codec_encode(child_codec_key_schedule(tables, transport_key), plain)

        self.assertEqual(encoded.hex(), "22785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c")

    def test_child_codec_encode_zero_pads_and_decode_reverses_blocks(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        scheduled = child_codec_key_schedule(tables, b"abcd")

        encoded = child_codec_encode(scheduled, bytes.fromhex("0011223344556677aa"))

        self.assertEqual(encoded.hex(), "57aea66686368b386c66b6a16f9d3c1b")
        self.assertEqual(child_codec_decode(scheduled, encoded), bytes.fromhex("0011223344556677aa00000000000000"))

    def test_rejects_non_pe_child_codec_table_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "child codec source is not a PE image"):
            extract_child_codec_static_tables(Path(__file__))

    def test_builds_phase1_decoded_payload_checksum(self) -> None:
        payload = build_phase1_decoded_payload(Phase1DecodedPayload(key=b"abcd", sequence=1))

        self.assertEqual(payload.hex(), "020300046162636400000001")
        self.assertEqual(int.from_bytes(payload[:2], "big"), phase3_decoded_checksum(payload[2:]))

    def test_parses_phase1_decoded_payload(self) -> None:
        parsed = parse_phase1_decoded_payload(bytes.fromhex("020300046162636400000001"))

        self.assertEqual(parsed.key, b"abcd")
        self.assertEqual(parsed.sequence, 1)

    def test_rejects_truncated_phase1_decoded_payload(self) -> None:
        with self.assertRaisesRegex(ValueError, "phase1 decoded payload is truncated"):
            parse_phase1_decoded_payload(bytes.fromhex("00000004"))

    def test_builds_phase2_decoded_payload_checksum(self) -> None:
        payload = build_phase2_decoded_payload(
            Phase2DecodedPayload(remote_key=b"AB", stored_key=b"xyz", sequence=0x12345678)
        )

        self.assertEqual(payload.hex(), "7e0f00024142000378797a12345678")
        self.assertEqual(int.from_bytes(payload[:2], "big"), phase3_decoded_checksum(payload[2:]))

    def test_parses_phase2_decoded_payload(self) -> None:
        parsed = parse_phase2_decoded_payload(bytes.fromhex("7e0f00024142000378797a12345678"))

        self.assertEqual(parsed.remote_key, b"AB")
        self.assertEqual(parsed.stored_key, b"xyz")
        self.assertEqual(parsed.sequence, 0x12345678)

    def test_rejects_phase2_decoded_payload_trailing_bytes(self) -> None:
        payload = build_phase2_decoded_payload(Phase2DecodedPayload(b"AB", b"xyz", 0x12345678)) + b"\x00"

        with self.assertRaisesRegex(ValueError, "phase2 decoded payload has trailing bytes"):
            parse_phase2_decoded_payload(payload)

    def test_builds_phase3_decoded_payload_checksum(self) -> None:
        payload = build_phase3_decoded_payload(
            Phase3DecodedPayload(encipher_key=b"abcd", decipher_key=b"XY", sequence=1)
        )

        self.assertEqual(payload.hex(), "595b0004616263640002585900000001")
        self.assertEqual(int.from_bytes(payload[:2], "big"), phase3_decoded_checksum(payload[2:]))

    def test_builds_empty_key_phase3_decoded_payload(self) -> None:
        payload = build_phase3_decoded_payload(
            Phase3DecodedPayload(encipher_key=b"", decipher_key=b"", sequence=1)
        )

        self.assertEqual(payload.hex(), "01000000000000000001")

    def test_parses_phase3_decoded_payload(self) -> None:
        payload = bytes.fromhex("a7b4000800112233445566770002889912345678")

        parsed = parse_phase3_decoded_payload(payload)

        self.assertEqual(parsed.encipher_key.hex(), "0011223344556677")
        self.assertEqual(parsed.decipher_key.hex(), "8899")
        self.assertEqual(parsed.sequence, 0x12345678)

    def test_rejects_phase3_decoded_payload_bad_checksum(self) -> None:
        payload = bytearray(build_phase3_decoded_payload(Phase3DecodedPayload(b"abcd", b"XY", 1)))
        payload[0] ^= 0x01

        with self.assertRaisesRegex(ValueError, "phase3 decoded payload checksum mismatch"):
            parse_phase3_decoded_payload(bytes(payload))

    def test_rejects_truncated_phase3_decoded_payload(self) -> None:
        with self.assertRaisesRegex(ValueError, "phase3 decoded payload is truncated"):
            parse_phase3_decoded_payload(bytes.fromhex("01000004"))

    def test_wraps_phase3_transport_frame(self) -> None:
        decoded_payload = bytes.fromhex("a7b4000800112233445566770002889912345678")

        frame = build_transport_frame(PHASE3_TRANSPORT_CODE, decoded_payload)

        self.assertEqual(frame.hex(), "00160035a7b4000800112233445566770002889912345678")

    def test_calculates_child_codec_zero_padding_length(self) -> None:
        self.assertEqual(CHILD_CODEC_BLOCK_SIZE, 8)
        self.assertEqual(child_codec_encoded_length(0), 0)
        self.assertEqual(child_codec_encoded_length(1), 8)
        self.assertEqual(child_codec_encoded_length(7), 8)
        self.assertEqual(child_codec_encoded_length(8), 8)
        self.assertEqual(child_codec_encoded_length(9), 16)

    def test_rejects_unaligned_child_codec_decode_length(self) -> None:
        require_child_codec_aligned_length(0)
        require_child_codec_aligned_length(8)
        with self.assertRaisesRegex(ValueError, "child codec length must be 8-byte aligned"):
            require_child_codec_aligned_length(7)

    def test_builds_child_codec_stored_key_image(self) -> None:
        self.assertEqual(CHILD_CODEC_STORED_KEY_MASK, 0x17)
        self.assertEqual(child_codec_stored_key_image(bytes.fromhex("001722ff")).hex(), "170035e8")
        self.assertEqual(child_codec_stored_key_image(child_codec_stored_key_image(b"secret")), b"secret")

    def test_builds_phase3_child_codec_transport_frame(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        payload = Phase3DecodedPayload(encipher_key=b"abcd", decipher_key=b"XY", sequence=1)

        frame = build_phase3_child_codec_transport_frame(tables, transport_key=b"abcd", payload=payload)

        self.assertEqual(frame.hex(), "001200356783362eee69aec7e7eca218faa2b528")

    def test_builds_phase3_response_from_live_phase1_request(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        transport_key = bytes.fromhex(
            "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
        )
        request_frame = bytes.fromhex("001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c")

        frame = build_phase3_response_from_phase1_request(
            tables,
            transport_key=transport_key,
            request_frame=request_frame,
            decipher_key=b"XY",
        )

        self.assertEqual(frame.hex(), "002200352ed7f2cb65cff5e9b86fbd86cbc8cd0a7a9b9d134ad79005d3c14951975330d7")

    def test_classifies_observed_request_body_against_static_key_candidates(self) -> None:
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        request_body = bytes.fromhex("d9f907a74bd30cc043f02db12b4a2b032961c0d2c4ff104d")

        results = classify_child_codec_request_body(
            tables,
            request_body,
            candidate_keys=(b"abcd", b"ginei00", b"dummy", b"127.0.0.1", b"47900"),
        )

        self.assertEqual([result.key_label for result in results], ["abcd", "ginei00", "dummy", "127.0.0.1", "47900"])
        self.assertTrue(all(result.aligned for result in results))
        self.assertTrue(all(result.parsed_payload is None for result in results))
        self.assertEqual(results[0].decoded_hex, "16acc648d19300f793433ee2d3a310d3d4e354add83964ab")
        self.assertIn("phase1 decoded payload checksum mismatch", results[0].parse_errors)
        self.assertIn("phase2 decoded payload checksum mismatch", results[0].parse_errors)
        self.assertIn("phase3 decoded payload checksum mismatch", results[0].parse_errors)


if __name__ == "__main__":
    unittest.main()
