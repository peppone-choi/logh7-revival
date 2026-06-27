from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


WORLD_HANDLER_VA: Final[int] = 0x004BD0C9
GRID_HANDLER_VA: Final[int] = 0x004BD121
UNIT_HANDLER_VA: Final[int] = 0x004BB110
SELECTOR_REQUEST_VA: Final[int] = 0x004B6EB8


def build_entity_pool_prerequisite_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _expect_markers(data, image, WORLD_HANDLER_VA, 80, _world_markers())
    _expect_markers(data, image, GRID_HANDLER_VA, 80, _grid_markers())
    _expect_markers(data, image, UNIT_HANDLER_VA, 160, _unit_markers())
    _expect_markers(data, image, SELECTOR_REQUEST_VA, 320, _selector_request_markers())
    return {
        "source": str(source),
        "activationRoot": "client+0x126718",
        "worldInitializationFlags": [
            {
                "messageName": "ResponseWorldInitialize",
                "internalHex": "0x0f01",
                "handlerVirtualAddressHex": f"0x{WORLD_HANDLER_VA:08x}",
                "stateWrite": "client+0x35f356 byte = body+0x00",
            },
            {
                "messageName": "ResponseGridInitialize",
                "internalHex": "0x0f03",
                "handlerVirtualAddressHex": f"0x{GRID_HANDLER_VA:08x}",
                "stateWrite": "client+0x35f357 byte = body+0x00",
            },
        ],
        "unitInformationPrerequisites": [
            {
                "messageName": "ResponseInformationUnit",
                "messageStringVirtualAddressHex": "0x00770678",
                "handlerVirtualAddressHex": f"0x{UNIT_HANDLER_VA:08x}",
                "clientStateDestination": "client+0x41a364",
                "copiedDwords": 0x3391,
                "maxCountCheck": "word body+0x00 < 0x0259",
                "postCopyCallVirtualAddressHex": "0x004c2c80",
                "postCopyClass": 1,
            },
        ],
        "selector1Request": {
            "builderVirtualAddressHex": f"0x{SELECTOR_REQUEST_VA:08x}",
            "precondition": "client+0x126718 activation gate and client+0x126710 request gate are nonzero",
            "keyEnumeration": "client+0x12671c active records, 600 entries, stride 0x9ec",
            "transportInternalHex": "0x002e",
            "sendCallVirtualAddressHex": "0x004b78a0",
        },
        "evidence": "direct PE disassembly of world/grid/unit information and selector-1 request paths",
        "nextTracePoint": "serve world/grid init and unit information before command OK probing",
    }


def write_entity_pool_prerequisite_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_entity_pool_prerequisite_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(instruction.mnemonic, instruction.op_str) for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _expect_markers(
    data: bytes,
    image: PeImage,
    virtual_address: int,
    size: int,
    markers: tuple[tuple[str, str], ...],
) -> None:
    instructions = _instructions(data, image, virtual_address, size)
    missing = [f"{mnemonic} {op_str}" for mnemonic, op_str in markers if (mnemonic, op_str) not in instructions]
    if missing:
        raise ValueError(f"entity pool prerequisite markers missing at 0x{virtual_address:08x}: {missing}")


def _world_markers() -> tuple[tuple[str, str], ...]:
    return (
        ("push", "0x76fb84"),
        ("mov", "dl, byte ptr [ebx]"),
        ("mov", "byte ptr [esi + 0x35f356], dl"),
    )


def _grid_markers() -> tuple[tuple[str, str], ...]:
    return (
        ("push", "0x76fb48"),
        ("mov", "dl, byte ptr [ebx]"),
        ("mov", "byte ptr [esi + 0x35f357], dl"),
    )


def _unit_markers() -> tuple[tuple[str, str], ...]:
    return (
        ("push", "0x770678"),
        ("add", "eax, 0x41a364"),
        ("mov", "ecx, 0x3391"),
        ("cmp", "word ptr [eax], 0x259"),
        ("call", "0x4c2c80"),
    )


def _selector_request_markers() -> tuple[tuple[str, str], ...]:
    return (
        ("mov", "ecx, 0x259"),
        ("lea", "eax, [ebx + 0x12671c]"),
        ("mov", "esi, 0x258"),
        ("add", "eax, 0x9ec"),
        ("push", "0x2e"),
        ("call", "0x4b78a0"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII entity pool prerequisites.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_entity_pool_prerequisite_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
