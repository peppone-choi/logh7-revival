from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Final

PHASE3_TRANSPORT_CODE: Final[int] = 0x0035
CHILD_CODEC_BLOCK_SIZE: Final[int] = 8
CHILD_CODEC_STORED_KEY_MASK: Final[int] = 0x17


@dataclass(frozen=True, slots=True)
class Phase1DecodedPayload:
    key: bytes
    sequence: int


@dataclass(frozen=True, slots=True)
class Phase2DecodedPayload:
    remote_key: bytes
    stored_key: bytes
    sequence: int


@dataclass(frozen=True, slots=True)
class Phase3DecodedPayload:
    encipher_key: bytes
    decipher_key: bytes
    sequence: int


def phase3_decoded_checksum(data: bytes) -> int:
    checksum = 0
    full_words = len(data) // 4
    for index in range(full_words):
        start = index * 4
        checksum ^= int.from_bytes(data[start : start + 4], "little")
    for item in data[full_words * 4 :]:
        checksum ^= item
    return ((checksum >> 16) ^ checksum) & 0xFFFF


def build_phase1_decoded_payload(payload: Phase1DecodedPayload) -> bytes:
    if payload.sequence < 0 or payload.sequence > 0xFFFFFFFF:
        raise ValueError("phase1 sequence must fit uint32")
    if len(payload.key) > 0xFFFF:
        raise ValueError("phase1 key is too long")

    body_without_checksum = b"".join(
        [
            struct.pack(">H", len(payload.key)),
            payload.key,
            struct.pack(">I", payload.sequence),
        ]
    )
    return struct.pack(">H", phase3_decoded_checksum(body_without_checksum)) + body_without_checksum


def parse_phase1_decoded_payload(data: bytes) -> Phase1DecodedPayload:
    if len(data) < 8:
        raise ValueError("phase1 decoded payload is truncated")
    stored_checksum = struct.unpack_from(">H", data, 0)[0]
    calculated_checksum = phase3_decoded_checksum(data[2:])
    if stored_checksum != calculated_checksum:
        raise ValueError("phase1 decoded payload checksum mismatch")

    key_length = struct.unpack_from(">H", data, 2)[0]
    cursor = 4
    if len(data) < cursor + key_length + 4:
        raise ValueError("phase1 decoded payload is truncated")
    key = data[cursor : cursor + key_length]
    cursor += key_length
    sequence = struct.unpack_from(">I", data, cursor)[0]
    cursor += 4
    if cursor != len(data):
        raise ValueError("phase1 decoded payload has trailing bytes")
    return Phase1DecodedPayload(key=key, sequence=sequence)


def build_phase2_decoded_payload(payload: Phase2DecodedPayload) -> bytes:
    if payload.sequence < 0 or payload.sequence > 0xFFFFFFFF:
        raise ValueError("phase2 sequence must fit uint32")
    if len(payload.remote_key) > 0xFFFF:
        raise ValueError("phase2 remote key is too long")
    if len(payload.stored_key) > 0xFFFF:
        raise ValueError("phase2 stored key is too long")

    body_without_checksum = b"".join(
        [
            struct.pack(">H", len(payload.remote_key)),
            payload.remote_key,
            struct.pack(">H", len(payload.stored_key)),
            payload.stored_key,
            struct.pack(">I", payload.sequence),
        ]
    )
    return struct.pack(">H", phase3_decoded_checksum(body_without_checksum)) + body_without_checksum


def parse_phase2_decoded_payload(data: bytes) -> Phase2DecodedPayload:
    if len(data) < 10:
        raise ValueError("phase2 decoded payload is truncated")
    stored_checksum = struct.unpack_from(">H", data, 0)[0]
    calculated_checksum = phase3_decoded_checksum(data[2:])
    if stored_checksum != calculated_checksum:
        raise ValueError("phase2 decoded payload checksum mismatch")

    cursor = 2
    remote_key_length = struct.unpack_from(">H", data, cursor)[0]
    cursor += 2
    if len(data) < cursor + remote_key_length + 2:
        raise ValueError("phase2 decoded payload is truncated")
    remote_key = data[cursor : cursor + remote_key_length]
    cursor += remote_key_length

    stored_key_length = struct.unpack_from(">H", data, cursor)[0]
    cursor += 2
    if len(data) < cursor + stored_key_length + 4:
        raise ValueError("phase2 decoded payload is truncated")
    stored_key = data[cursor : cursor + stored_key_length]
    cursor += stored_key_length

    sequence = struct.unpack_from(">I", data, cursor)[0]
    cursor += 4
    if cursor != len(data):
        raise ValueError("phase2 decoded payload has trailing bytes")
    return Phase2DecodedPayload(
        remote_key=remote_key,
        stored_key=stored_key,
        sequence=sequence,
    )


def build_phase3_decoded_payload(payload: Phase3DecodedPayload) -> bytes:
    if payload.sequence < 0 or payload.sequence > 0xFFFFFFFF:
        raise ValueError("phase3 sequence must fit uint32")
    if len(payload.encipher_key) > 0xFFFF:
        raise ValueError("phase3 encipher key is too long")
    if len(payload.decipher_key) > 0xFFFF:
        raise ValueError("phase3 decipher key is too long")

    body_without_checksum = b"".join(
        [
            struct.pack(">H", len(payload.encipher_key)),
            payload.encipher_key,
            struct.pack(">H", len(payload.decipher_key)),
            payload.decipher_key,
            struct.pack(">I", payload.sequence),
        ]
    )
    return struct.pack(">H", phase3_decoded_checksum(body_without_checksum)) + body_without_checksum


def parse_phase3_decoded_payload(data: bytes) -> Phase3DecodedPayload:
    if len(data) < 10:
        raise ValueError("phase3 decoded payload is truncated")
    stored_checksum = struct.unpack_from(">H", data, 0)[0]
    calculated_checksum = phase3_decoded_checksum(data[2:])
    if stored_checksum != calculated_checksum:
        raise ValueError("phase3 decoded payload checksum mismatch")

    cursor = 2
    encipher_key_length = struct.unpack_from(">H", data, cursor)[0]
    cursor += 2
    if len(data) < cursor + encipher_key_length + 2:
        raise ValueError("phase3 decoded payload is truncated")
    encipher_key = data[cursor : cursor + encipher_key_length]
    cursor += encipher_key_length

    decipher_key_length = struct.unpack_from(">H", data, cursor)[0]
    cursor += 2
    if len(data) < cursor + decipher_key_length + 4:
        raise ValueError("phase3 decoded payload is truncated")
    decipher_key = data[cursor : cursor + decipher_key_length]
    cursor += decipher_key_length

    sequence = struct.unpack_from(">I", data, cursor)[0]
    cursor += 4
    if cursor != len(data):
        raise ValueError("phase3 decoded payload has trailing bytes")
    return Phase3DecodedPayload(
        encipher_key=encipher_key,
        decipher_key=decipher_key,
        sequence=sequence,
    )


def build_transport_frame(code: int, body: bytes) -> bytes:
    if code < 0 or code > 0xFFFF:
        raise ValueError("transport code must fit uint16")
    if len(body) + 2 > 0xFFFF:
        raise ValueError("transport frame body is too long")
    return struct.pack(">HH", len(body) + 2, code) + body


def child_codec_encoded_length(data_length: int) -> int:
    if data_length < 0:
        raise ValueError("child codec length cannot be negative")
    remainder = data_length % CHILD_CODEC_BLOCK_SIZE
    if remainder == 0:
        return data_length
    return data_length + (CHILD_CODEC_BLOCK_SIZE - remainder)


def require_child_codec_aligned_length(data_length: int) -> None:
    if data_length < 0:
        raise ValueError("child codec length cannot be negative")
    if data_length % CHILD_CODEC_BLOCK_SIZE != 0:
        raise ValueError("child codec length must be 8-byte aligned")


def child_codec_stored_key_image(key: bytes) -> bytes:
    return bytes(item ^ CHILD_CODEC_STORED_KEY_MASK for item in key)
