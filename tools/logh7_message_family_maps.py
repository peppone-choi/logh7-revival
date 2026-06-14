from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


@dataclass(frozen=True, slots=True)
class MessageFamilySpec:
    name: str
    size_virtual_address: int
    base_virtual_address: int
    count_virtual_address: int
    lookup_virtual_address: int
    tracked_internal_codes: tuple[int, ...]
    role: str


@dataclass(frozen=True, slots=True)
class MessageFamily:
    spec: MessageFamilySpec
    object_size: int
    base_internal_code: int
    message_count: int

    def to_json(self) -> dict[str, object]:
        return {
            "name": self.spec.name,
            "role": self.spec.role,
            "objectSize": self.object_size,
            "objectSizeHex": f"0x{self.object_size:04x}",
            "baseInternalCode": self.base_internal_code,
            "baseInternalHex": f"0x{self.base_internal_code:04x}",
            "messageCount": self.message_count,
            "sizeVirtualAddressHex": f"0x{self.spec.size_virtual_address:08x}",
            "baseVirtualAddressHex": f"0x{self.spec.base_virtual_address:08x}",
            "countVirtualAddressHex": f"0x{self.spec.count_virtual_address:08x}",
            "lookupVirtualAddressHex": f"0x{self.spec.lookup_virtual_address:08x}",
            "trackedInternalHexes": [f"0x{code:04x}" for code in self.spec.tracked_internal_codes],
        }


MESSAGE_FAMILIES: Final[tuple[MessageFamilySpec, ...]] = (
    MessageFamilySpec(
        name="session-bootstrap",
        size_virtual_address=0x0044EFF0,
        base_virtual_address=0x0044F000,
        count_virtual_address=0x0044F010,
        lookup_virtual_address=0x0044F060,
        tracked_internal_codes=(0x0200, 0x0205),
        role="SSLoginOK/SSGameLoginOK internal response family",
    ),
    MessageFamilySpec(
        name="post-handshake",
        size_virtual_address=0x004AA4C0,
        base_virtual_address=0x004AA4D0,
        count_virtual_address=0x004AA4E0,
        lookup_virtual_address=0x004AA530,
        tracked_internal_codes=(0x0400, 0x0401, 0x0402, 0x040C),
        role="post-handshake command and phase4 internal response family",
    ),
    MessageFamilySpec(
        name="world-grid",
        size_virtual_address=0x0048CCB0,
        base_virtual_address=0x0048CCC0,
        count_virtual_address=0x0048CCD0,
        lookup_virtual_address=0x0048CD20,
        tracked_internal_codes=(0x0F01, 0x0F03),
        role="world/grid initialization internal response family",
    ),
)


def build_message_family_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    families = [_family_from_spec(data, image, spec) for spec in MESSAGE_FAMILIES]
    return {
        "source": str(source),
        "families": [family.to_json() for family in families],
        "lookupSemantics": (
            "lookup returns object+4+(internal-base)*4 when 0 <= internal-base < count; "
            "a null slot or out-of-range index is treated as missing"
        ),
        "serverImplication": (
            "0x0200/0x0205 and 0x0f01/0x0f03 are not ad-hoc packet bodies; they belong to "
            "registered internal message families with object-backed lookup tables"
        ),
        "evidence": "direct PE family base/count/lookup disassembly",
    }


def write_message_family_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_message_family_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _family_from_spec(data: bytes, image: PeImage, spec: MessageFamilySpec) -> MessageFamily:
    object_size = _read_mov_return(data, image, spec.size_virtual_address, "eax")
    base_internal_code = _read_mov_return(data, image, spec.base_virtual_address, "ax")
    message_count = _read_mov_return(data, image, spec.count_virtual_address, "eax")
    _expect_lookup(data, image, spec.lookup_virtual_address, base_internal_code, message_count)
    _expect_tracked_codes_in_range(spec, base_internal_code, message_count)
    return MessageFamily(spec, object_size, base_internal_code, message_count)


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(item.mnemonic, item.op_str) for item in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _read_mov_return(data: bytes, image: PeImage, virtual_address: int, register: str) -> int:
    instructions = _instructions(data, image, virtual_address, 16)
    if len(instructions) < 2:
        raise ValueError(f"message family return stub is too short: 0x{virtual_address:08x}")
    mnemonic, op_str = instructions[0]
    if mnemonic != "mov" or not op_str.startswith(f"{register}, "):
        raise ValueError(f"message family return stub drifted at 0x{virtual_address:08x}: {instructions[:2]}")
    if instructions[1] != ("ret", ""):
        raise ValueError(f"message family return stub does not return at 0x{virtual_address:08x}")
    return int(op_str.split(", ", 1)[1], 0)


def _expect_lookup(data: bytes, image: PeImage, virtual_address: int, base: int, count: int) -> None:
    instructions = _instructions(data, image, virtual_address, 128)
    expected_count = f"ecx, {count}" if count < 10 else f"ecx, 0x{count:x}"
    checks = {
        "loads internal code argument": ("mov", "eax, dword ptr [ebp + 0xc]") in instructions,
        "masks internal code to u16": ("and", "eax, 0xffff") in instructions,
        "subtracts family base": ("sub", f"eax, 0x{base:x}") in instructions,
        "checks family count": ("cmp", expected_count) in instructions,
        "reads object slot table": any(
            mnemonic == "mov" and "*4 + 4]" in op_str and "dword ptr [" in op_str
            for mnemonic, op_str in instructions
        ),
        "returns stdcall two args": ("ret", "8") in instructions,
    }
    missing = sorted(label for label, present in checks.items() if not present)
    if missing:
        raise ValueError(f"message family lookup markers missing at 0x{virtual_address:08x}: {missing}")


def _expect_tracked_codes_in_range(spec: MessageFamilySpec, base: int, count: int) -> None:
    for code in spec.tracked_internal_codes:
        if not (base <= code < base + count):
            raise ValueError(f"tracked code 0x{code:04x} is outside {spec.name} range")
