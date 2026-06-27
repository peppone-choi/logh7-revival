from __future__ import annotations

from tools.logh7_child_codec import ChildCodecStaticTables, child_codec_encode, child_codec_key_schedule
from tools.logh7_child_codec import child_codec_decode
from tools.logh7_cipher import PHASE3_TRANSPORT_CODE
from tools.logh7_cipher import Phase3DecodedPayload
from tools.logh7_cipher import build_phase3_decoded_payload
from tools.logh7_cipher import build_transport_frame
from tools.logh7_cipher import parse_phase1_decoded_payload

PHASE1_TRANSPORT_CODE = 0x0034


def build_phase3_child_codec_transport_frame(
    tables: ChildCodecStaticTables,
    transport_key: bytes,
    payload: Phase3DecodedPayload,
) -> bytes:
    decoded_payload = build_phase3_decoded_payload(payload)
    scheduled = child_codec_key_schedule(tables, transport_key)
    encoded_body = child_codec_encode(scheduled, decoded_payload)
    return build_transport_frame(PHASE3_TRANSPORT_CODE, encoded_body)


def build_phase3_response_from_phase1_request(
    tables: ChildCodecStaticTables,
    *,
    transport_key: bytes,
    request_frame: bytes,
    decipher_key: bytes,
) -> bytes:
    if len(request_frame) < 4:
        raise ValueError("phase1 request frame is truncated")
    declared_length = int.from_bytes(request_frame[:2], "big")
    if declared_length + 2 != len(request_frame):
        raise ValueError("phase1 request frame length mismatch")
    code = int.from_bytes(request_frame[2:4], "big")
    if code != PHASE1_TRANSPORT_CODE:
        raise ValueError("phase1 request frame must use transport code 0x0034")

    scheduled = child_codec_key_schedule(tables, transport_key)
    decoded_phase1 = child_codec_decode(scheduled, request_frame[4:])
    phase1 = parse_phase1_decoded_payload(decoded_phase1)
    return build_phase3_child_codec_transport_frame(
        tables,
        transport_key,
        Phase3DecodedPayload(encipher_key=phase1.key, decipher_key=decipher_key, sequence=phase1.sequence),
    )
