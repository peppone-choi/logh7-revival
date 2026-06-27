from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

CHILD_CODEC_IMAGE_BASE: Final[int] = 0x00400000
CHILD_CODEC_P_ARRAY_VA: Final[int] = 0x007B6AE4
CHILD_CODEC_S_BOXES_VA: Final[int] = 0x007B6BA8
CHILD_CODEC_TABLE_MASK: Final[int] = 0x91
CHILD_CODEC_P_ARRAY_DWORDS: Final[int] = 18
CHILD_CODEC_S_BOX_COUNT: Final[int] = 4
CHILD_CODEC_S_BOX_DWORDS: Final[int] = 256
CHILD_CODEC_BLOCK_SIZE: Final[int] = 8
UINT32_MASK: Final[int] = 0xFFFFFFFF


@dataclass(frozen=True, slots=True)
class PeSection:
    virtual_address: int
    virtual_size: int
    raw_pointer: int
    raw_size: int


@dataclass(frozen=True, slots=True)
class PeImage:
    image_base: int
    sections: tuple[PeSection, ...]


@dataclass(frozen=True, slots=True)
class ChildCodecStaticTables:
    p_array: tuple[int, ...]
    s_boxes: tuple[tuple[int, ...], ...]


def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def _parse_pe_image(data: bytes) -> PeImage:
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise ValueError("child codec source is not a PE image")
    pe_offset = _u32(data, 0x3C)
    if len(data) < pe_offset + 0x18 or data[pe_offset : pe_offset + 4] != b"PE\0\0":
        raise ValueError("child codec source is not a PE image")

    section_count = _u16(data, pe_offset + 6)
    optional_header_size = _u16(data, pe_offset + 20)
    optional_header = pe_offset + 24
    image_base = _u32(data, optional_header + 28)
    section_table = optional_header + optional_header_size
    sections: list[PeSection] = []
    for index in range(section_count):
        section_offset = section_table + index * 40
        if len(data) < section_offset + 40:
            raise ValueError("child codec source has a truncated section table")
        virtual_size = _u32(data, section_offset + 8)
        virtual_address = _u32(data, section_offset + 12)
        raw_size = _u32(data, section_offset + 16)
        raw_pointer = _u32(data, section_offset + 20)
        sections.append(
            PeSection(
                virtual_address=virtual_address,
                virtual_size=virtual_size,
                raw_pointer=raw_pointer,
                raw_size=raw_size,
            )
        )
    return PeImage(image_base=image_base, sections=tuple(sections))


def _virtual_address_to_offset(image: PeImage, virtual_address: int) -> int:
    rva = virtual_address - image.image_base
    for section in image.sections:
        section_size = max(section.virtual_size, section.raw_size)
        section_start = section.virtual_address
        if section_start <= rva < section_start + section_size:
            return section.raw_pointer + (rva - section_start)
    raise ValueError(f"virtual address is not mapped in PE sections: 0x{virtual_address:08x}")


def pe_virtual_address_to_file_offset(source: Path, virtual_address: int) -> int:
    return _virtual_address_to_offset(_parse_pe_image(source.read_bytes()), virtual_address)


def _masked_dwords(data: bytes, offset: int, count: int) -> tuple[int, ...]:
    byte_count = count * 4
    if len(data) < offset + byte_count:
        raise ValueError("child codec static table is truncated")
    unmasked = bytes(item ^ CHILD_CODEC_TABLE_MASK for item in data[offset : offset + byte_count])
    return struct.unpack(f"<{count}I", unmasked)


def extract_child_codec_static_tables(source: Path) -> ChildCodecStaticTables:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    if image.image_base != CHILD_CODEC_IMAGE_BASE:
        raise ValueError("child codec source has an unexpected image base")

    p_offset = _virtual_address_to_offset(image, CHILD_CODEC_P_ARRAY_VA)
    s_offset = _virtual_address_to_offset(image, CHILD_CODEC_S_BOXES_VA)
    s_boxes = tuple(
        _masked_dwords(data, s_offset + index * CHILD_CODEC_S_BOX_DWORDS * 4, CHILD_CODEC_S_BOX_DWORDS)
        for index in range(CHILD_CODEC_S_BOX_COUNT)
    )
    return ChildCodecStaticTables(
        p_array=_masked_dwords(data, p_offset, CHILD_CODEC_P_ARRAY_DWORDS),
        s_boxes=s_boxes,
    )


def child_codec_round_function(s_boxes: tuple[tuple[int, ...], ...], value: int) -> int:
    if len(s_boxes) != CHILD_CODEC_S_BOX_COUNT:
        raise ValueError("child codec round function requires four S-boxes")
    b0 = value & 0xFF
    b1 = (value >> 8) & 0xFF
    b2 = (value >> 16) & 0xFF
    b3 = (value >> 24) & 0xFF
    mixed = ((s_boxes[1][b2] + s_boxes[0][b3]) & UINT32_MASK) ^ s_boxes[2][b1]
    return (mixed + s_boxes[3][b0]) & UINT32_MASK


def child_codec_encrypt_block(tables: ChildCodecStaticTables, left: int, right: int) -> tuple[int, int]:
    for index in range(16):
        left ^= tables.p_array[index]
        right ^= child_codec_round_function(tables.s_boxes, left)
        left, right = right, left
    left, right = right, left
    right ^= tables.p_array[16]
    left ^= tables.p_array[17]
    return left & UINT32_MASK, right & UINT32_MASK


def child_codec_decrypt_block(tables: ChildCodecStaticTables, left: int, right: int) -> tuple[int, int]:
    for index in range(17, 1, -1):
        left ^= tables.p_array[index]
        right ^= child_codec_round_function(tables.s_boxes, left)
        left, right = right, left
    left, right = right, left
    right ^= tables.p_array[1]
    left ^= tables.p_array[0]
    return left & UINT32_MASK, right & UINT32_MASK


def _key_word(key: bytes, start: int) -> tuple[int, int]:
    cursor = start
    word = 0
    for _ in range(4):
        word = ((word << 8) | key[cursor]) & UINT32_MASK
        cursor = (cursor + 1) % len(key)
    return word, cursor


def child_codec_key_schedule(tables: ChildCodecStaticTables, key: bytes) -> ChildCodecStaticTables:
    if len(key) == 0:
        raise ValueError("child codec key must not be empty")

    p_array = list(tables.p_array)
    s_boxes = [list(s_box) for s_box in tables.s_boxes]
    cursor = 0
    for index in range(CHILD_CODEC_P_ARRAY_DWORDS):
        word, cursor = _key_word(key, cursor)
        p_array[index] ^= word

    scheduled = ChildCodecStaticTables(
        p_array=tuple(p_array),
        s_boxes=tuple(tuple(s_box) for s_box in s_boxes),
    )
    left = 0
    right = 0
    for index in range(0, CHILD_CODEC_P_ARRAY_DWORDS, 2):
        left, right = child_codec_encrypt_block(scheduled, left, right)
        p_array[index] = left
        p_array[index + 1] = right
        scheduled = ChildCodecStaticTables(
            p_array=tuple(p_array),
            s_boxes=tuple(tuple(s_box) for s_box in s_boxes),
        )

    for box_index in range(CHILD_CODEC_S_BOX_COUNT):
        for entry_index in range(0, CHILD_CODEC_S_BOX_DWORDS, 2):
            left, right = child_codec_encrypt_block(scheduled, left, right)
            s_boxes[box_index][entry_index] = left
            s_boxes[box_index][entry_index + 1] = right
            scheduled = ChildCodecStaticTables(
                p_array=tuple(p_array),
                s_boxes=tuple(tuple(s_box) for s_box in s_boxes),
            )
    return scheduled


def _encode_block_pair(left: int, right: int) -> bytes:
    return left.to_bytes(4, "little") + right.to_bytes(4, "little")


def _block_words(block: bytes) -> tuple[int, int]:
    return int.from_bytes(block[:4], "little"), int.from_bytes(block[4:], "little")


def child_codec_encode(tables: ChildCodecStaticTables, data: bytes) -> bytes:
    remainder = len(data) % CHILD_CODEC_BLOCK_SIZE
    if remainder != 0:
        data = data + bytes(CHILD_CODEC_BLOCK_SIZE - remainder)
    output = bytearray()
    for offset in range(0, len(data), CHILD_CODEC_BLOCK_SIZE):
        left, right = _block_words(data[offset : offset + CHILD_CODEC_BLOCK_SIZE])
        output.extend(_encode_block_pair(*child_codec_encrypt_block(tables, left, right)))
    return bytes(output)


def child_codec_decode(tables: ChildCodecStaticTables, data: bytes) -> bytes:
    if len(data) % CHILD_CODEC_BLOCK_SIZE != 0:
        raise ValueError("child codec encoded data must be 8-byte aligned")
    output = bytearray()
    for offset in range(0, len(data), CHILD_CODEC_BLOCK_SIZE):
        left, right = _block_words(data[offset : offset + CHILD_CODEC_BLOCK_SIZE])
        output.extend(_encode_block_pair(*child_codec_decrypt_block(tables, left, right)))
    return bytes(output)
