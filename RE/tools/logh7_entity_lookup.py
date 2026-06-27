from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


LOOKUP_VA: Final[int] = 0x004C7CD0


@dataclass(frozen=True, slots=True)
class EntityPool:
    selector: int
    pool_base: str
    filter_fields: tuple[str, str, str]
    record_count: int
    record_stride_bytes: int
    markers: tuple[tuple[str, str], ...]

    def to_json(self) -> dict[str, int | str | list[str]]:
        return {
            "selector": self.selector,
            "poolBase": self.pool_base,
            "activeFlagField": "record+0x00 byte",
            "keyField": "record+0x04 dword",
            "filterFields": list(self.filter_fields),
            "recordCount": self.record_count,
            "recordStrideBytes": self.record_stride_bytes,
            "returnPointer": "record base",
        }


POOLS: Final[tuple[EntityPool, ...]] = (
    EntityPool(
        0,
        "client+0x126718+0x174124",
        ("record+0x0d byte", "record+0x0e byte", "record+0x0f byte"),
        10,
        0x8CC,
        (("lea", "esi, [edi + 0x174128]"), ("add", "esi, 0x8cc"), ("cmp", "eax, 0xa")),
    ),
    EntityPool(
        1,
        "client+0x126718+0x0004",
        ("record+0x09 byte", "record+0x0a byte", "record+0x0b byte"),
        600,
        0x9EC,
        (("lea", "eax, [edi + 8]"), ("add", "eax, 0x9ec"), ("cmp", "ecx, 0x258")),
    ),
    EntityPool(
        2,
        "client+0x126718+0x17991c",
        ("record+0x0d byte", "record+0x0e byte", "record+0x0f byte"),
        10,
        0x8E0,
        (("lea", "esi, [edi + 0x179920]"), ("add", "esi, 0x8e0"), ("cmp", "eax, 0xa")),
    ),
)


def build_entity_lookup_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    instructions = _instructions(data, image, LOOKUP_VA, 416)
    _expect_dispatch(instructions)
    for pool in POOLS:
        _expect_pool_markers(pool, instructions)
    return {
        "source": str(source),
        "lookupVirtualAddressHex": f"0x{LOOKUP_VA:08x}",
        "activationRoot": "client+0x126718",
        "commandOkSelector": 1,
        "pools": [pool.to_json() for pool in POOLS],
        "commandOkEntityKeySource": "selector 1 keyField: client+0x126718+0x0008 plus recordStrideBytes*n",
        "evidence": "direct PE disassembly of entity lookup routine 0x004c7cd0",
        "nextTracePoint": "capture selector 1 live keys after activation gate is set",
    }


def write_entity_lookup_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(build_entity_lookup_index(source), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(instruction.mnemonic, instruction.op_str) for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _expect_dispatch(instructions: list[tuple[str, str]]) -> None:
    for marker in (("mov", "eax, dword ptr [esp + 0xc]"), ("dec", "eax"), ("jne", "0x4c7d48")):
        if marker not in instructions:
            raise ValueError(f"entity lookup dispatch marker missing: {marker[0]} {marker[1]}")


def _expect_pool_markers(pool: EntityPool, instructions: list[tuple[str, str]]) -> None:
    missing = [f"{mnemonic} {op_str}" for mnemonic, op_str in pool.markers if (mnemonic, op_str) not in instructions]
    if missing:
        raise ValueError(f"entity lookup selector {pool.selector} markers missing: {missing}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII entity lookup pools.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_entity_lookup_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
