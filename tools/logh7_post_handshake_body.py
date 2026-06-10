from __future__ import annotations

import json
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_child_codec import ChildCodecStaticTables, child_codec_decode, child_codec_key_schedule
    from .logh7_child_codec import extract_child_codec_static_tables
    from .logh7_cipher import parse_phase1_decoded_payload
else:
    from logh7_child_codec import ChildCodecStaticTables, child_codec_decode, child_codec_key_schedule
    from logh7_child_codec import extract_child_codec_static_tables
    from logh7_cipher import parse_phase1_decoded_payload

PHASE1_TRANSPORT_CODE: Final[int] = 0x0034
POST_HANDSHAKE_TRANSPORT_CODE: Final[int] = 0x0030
ACCOUNT_LENGTH_OFFSET: Final[int] = 18
ACCOUNT_TEXT_OFFSET: Final[int] = 20
PASSWORD_LENGTH_OFFSET: Final[int] = 34
PASSWORD_TEXT_OFFSET: Final[int] = 36


def decode_post_handshake_0030_frame(
    tables: ChildCodecStaticTables,
    *,
    transport_key: bytes,
    request_frame: bytes,
    post_handshake_frame: bytes,
) -> dict[str, object]:
    request_body = _validated_body(request_frame, PHASE1_TRANSPORT_CODE)
    post_handshake_body = _validated_body(post_handshake_frame, POST_HANDSHAKE_TRANSPORT_CODE)

    transport_schedule = child_codec_key_schedule(tables, transport_key)
    decoded_phase1 = child_codec_decode(transport_schedule, request_body)
    phase1 = parse_phase1_decoded_payload(decoded_phase1)

    phase1_schedule = child_codec_key_schedule(tables, phase1.key)
    decoded_body = child_codec_decode(phase1_schedule, post_handshake_body)
    parsed = _parse_decoded_0030_body(decoded_body)
    return {
        "transportHex": "0x0030",
        "requestTransportHex": "0x0034",
        "bodyKeySource": "phase1 key decoded from same connection 0x0034 request",
        "phase1KeyHex": phase1.key.hex(),
        "phase1Sequence": phase1.sequence,
        "encodedBodyLength": len(post_handshake_body),
        "decodedBodyLength": len(decoded_body),
        "decodedBodyHex": decoded_body.hex(),
        **parsed,
    }


def build_post_handshake_body_decode(
    source: Path,
    *,
    transport_key_hex: str,
    request_frame_hex: str,
    post_handshake_frame_hex: str,
) -> dict[str, object]:
    tables = extract_child_codec_static_tables(source)
    return {
        "source": str(source),
        **decode_post_handshake_0030_frame(
            tables,
            transport_key=bytes.fromhex(transport_key_hex),
            request_frame=bytes.fromhex(request_frame_hex),
            post_handshake_frame=bytes.fromhex(post_handshake_frame_hex),
        ),
        "evidence": "child codec decode using phase1 key from same connection request",
    }


def write_post_handshake_body_decode(
    source: Path,
    destination: Path,
    *,
    transport_key_hex: str,
    request_frame_hex: str,
    post_handshake_frame_hex: str,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            build_post_handshake_body_decode(
                source,
                transport_key_hex=transport_key_hex,
                request_frame_hex=request_frame_hex,
                post_handshake_frame_hex=post_handshake_frame_hex,
            ),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def _validated_body(frame: bytes, expected_code: int) -> bytes:
    if len(frame) < 4:
        raise ValueError("LOGH VII transport frame is truncated")
    declared = int.from_bytes(frame[:2], "big")
    if declared + 2 != len(frame):
        raise ValueError("LOGH VII transport frame length mismatch")
    code = int.from_bytes(frame[2:4], "big")
    if code != expected_code:
        raise ValueError(f"expected transport code 0x{expected_code:04x}")
    return frame[4:]


def _parse_decoded_0030_body(decoded_body: bytes) -> dict[str, object]:
    if len(decoded_body) < PASSWORD_TEXT_OFFSET:
        raise ValueError("decoded 0x0030 body is truncated")
    account_length = int.from_bytes(decoded_body[ACCOUNT_LENGTH_OFFSET : ACCOUNT_LENGTH_OFFSET + 2], "big")
    account_bytes = _fixed_interleaved_text(decoded_body, ACCOUNT_TEXT_OFFSET, account_length)
    password_cursor = ACCOUNT_TEXT_OFFSET + account_length * 2
    if password_cursor != PASSWORD_LENGTH_OFFSET:
        raise ValueError("decoded 0x0030 account field length does not match observed layout")
    password_length = int.from_bytes(decoded_body[PASSWORD_LENGTH_OFFSET : PASSWORD_LENGTH_OFFSET + 2], "little")
    password_bytes = _fixed_interleaved_text(decoded_body, PASSWORD_TEXT_OFFSET, password_length)
    return {
        "prefixHex": decoded_body[:8].hex(),
        "marker": {
            "offset": 8,
            "hex": decoded_body[8:14].hex(),
            "asciiPreview": _ascii_preview(decoded_body[8:14]),
        },
        "accountLengthField": account_length,
        "accountLowByteText": _low_byte_text(account_bytes),
        "passwordLengthField": password_length,
        "passwordEvenByteText": _even_byte_text(password_bytes),
        "layoutStatus": "stable decoded 48-byte body across observed runs; field names remain semantic hypotheses",
    }


def _fixed_interleaved_text(decoded_body: bytes, offset: int, length: int) -> bytes:
    end = offset + length * 2
    if len(decoded_body) < end:
        raise ValueError("decoded 0x0030 interleaved text field is truncated")
    return decoded_body[offset:end]


def _low_byte_text(raw: bytes) -> str:
    return bytes(raw[index] for index in range(1, len(raw), 2)).decode("ascii")


def _even_byte_text(raw: bytes) -> str:
    return bytes(raw[index] for index in range(0, len(raw), 2)).decode("ascii")


def _ascii_preview(raw: bytes) -> str:
    return "".join(chr(item) if 0x20 <= item <= 0x7E else "." for item in raw)
