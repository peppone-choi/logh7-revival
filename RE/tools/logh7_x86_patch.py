from __future__ import annotations

import struct


class X86Builder:
    def __init__(self, base_va: int) -> None:
        self.base_va = base_va
        self.data = bytearray()

    @property
    def current_va(self) -> int:
        return self.base_va + len(self.data)

    def append(self, raw: bytes) -> None:
        self.data.extend(raw)

    def u8(self, value: int) -> None:
        self.data.append(value & 0xFF)

    def u32(self, value: int) -> None:
        self.data.extend(struct.pack("<I", value & 0xFFFFFFFF))

    def jmp_rel32(self, destination: int) -> None:
        source = self.current_va
        self.u8(0xE9)
        self.u32(destination - (source + 5))

    def je_rel8_placeholder(self) -> int:
        self.append(b"\x74\x00")
        return len(self.data) - 1

    def jne_rel8_placeholder(self) -> int:
        self.append(b"\x75\x00")
        return len(self.data) - 1

    def jbe_rel8_placeholder(self) -> int:
        self.append(b"\x76\x00")
        return len(self.data) - 1

    def patch_rel8(self, placeholder_offset: int, destination: int) -> None:
        source_after_instruction = self.base_va + placeholder_offset + 1
        self.data[placeholder_offset] = (destination - source_after_instruction) & 0xFF

    def append_record_data(self, path: bytes, record_va: int, written_va: int, record_bytes: int) -> None:
        while len(self.data) < record_va - self.base_va:
            self.u8(0)
        self.append(bytes(record_bytes))
        while len(self.data) < written_va - self.base_va:
            self.u8(0)
        self.append(b"\x00\x00\x00\x00")
        self.append(path)


def call_iat(builder: X86Builder, iat_hex: str) -> None:
    builder.append(b"\xff\x15")
    builder.u32(int(iat_hex, 16))


def hook_jump(source_va: int, destination_va: int, length: int) -> bytes:
    relative = destination_va - (source_va + 5)
    return b"\xe9" + struct.pack("<i", relative) + bytes([0x90] * (length - 5))


def mov_abs_from_reg(builder: X86Builder, opcode: bytes, address: int) -> None:
    builder.append(opcode)
    builder.u32(address)


def push_u32(builder: X86Builder, value: int) -> None:
    builder.u8(0x68)
    builder.u32(value)
