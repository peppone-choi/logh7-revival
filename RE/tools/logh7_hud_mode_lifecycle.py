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


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
MODE_GATE_VA: Final[int] = 0x004FD100
MODE_SET_VA: Final[int] = 0x004FD7A0
MODE_TABLE_VA: Final[int] = 0x006703C0
MODE_TABLE_MODES: Final[int] = 9
MODE_TABLE_ENTRIES: Final[int] = 10


@dataclass(frozen=True, slots=True)
class InstructionView:
    address: int
    mnemonic: str
    op_str: str


@dataclass(frozen=True, slots=True)
class ActivationHitTest:
    role: str
    target_offset: int
    hit_test_call_va: int
    return_va: int
    success_mode: int
    mode_set_call_va: int
    requires_current_mode: int | None = None

    def to_json(self) -> dict[str, JsonValue]:
        result: dict[str, JsonValue] = {
            "role": self.role,
            "targetOffsetHex": f"0x{self.target_offset:04x}",
            "hitTestCallVirtualAddressHex": f"0x{self.hit_test_call_va:08x}",
            "returnVirtualAddressHex": f"0x{self.return_va:08x}",
            "successMode": self.success_mode,
            "modeSetCallVirtualAddressHex": f"0x{self.mode_set_call_va:08x}",
        }
        if self.requires_current_mode is not None:
            result["requiresCurrentMode"] = self.requires_current_mode
        return result


ACTIVATION_HIT_TESTS: Final[tuple[ActivationHitTest, ...]] = (
    ActivationHitTest("hudMode2Primary", 0x14, 0x004FD48D, 0x004FD492, 2, 0x004FD49C),
    ActivationHitTest("hudMode4Primary", 0x18, 0x004FD4BB, 0x004FD4C0, 4, 0x004FD4CA),
    ActivationHitTest("hudMode2Fallback", 0x28, 0x004FD4E9, 0x004FD4EE, 2, 0x004FD501, 1),
    ActivationHitTest("hudMode6Fallback", 0x24, 0x004FD520, 0x004FD525, 6, 0x004FD538, 1),
)


def build_hud_mode_lifecycle_index(source: Path) -> dict[str, JsonValue]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    gate_instructions = _instructions(data, image, MODE_GATE_VA, 0x460)
    mode_set_instructions = _instructions(data, image, MODE_SET_VA, 0x520)
    _require_activation_markers(gate_instructions)
    _require_mode_set_markers(mode_set_instructions)
    _require_initial_mode_set(data, image)
    mode_table = _read_mode_table(data, image)
    return {
        "source": str(source),
        "modeGateFunction": {
            "virtualAddressHex": f"0x{MODE_GATE_VA:08x}",
            "role": "per-frame HUD gate; mode hit-test success calls FUN_004fd7a0",
        },
        "modeSetFunction": {
            "virtualAddressHex": f"0x{MODE_SET_VA:08x}",
            "activatesOwnerGate": "FUN_005024b0(1)",
            "deactivatesOwnerGate": "FUN_005024b0(0)",
            "modeTableVirtualAddressHex": f"0x{MODE_TABLE_VA:08x}",
        },
        "initFunction": {
            "virtualAddressHex": "0x004fc4e0",
            "initialModeSet": "FUN_004fd7a0(1,0)",
            "zeroArgumentSource": "ebx is zeroed before push",
            "callsiteVirtualAddressHex": "0x004fcfc9",
        },
        "modeActivationHitTests": [hit_test.to_json() for hit_test in ACTIVATION_HIT_TESTS],
        "modeTable": mode_table,
        "c002Implication": (
            "FUN_004fd100 performs pre-activation hit-test calls on HUD+0x14/+0x18/+0x28/+0x24; "
            "only a successful hit-test reaches FUN_004fd7a0(2/4/6,1), and FUN_004fd7a0 is the "
            "path that activates the owner gate through FUN_005024b0(1)."
        ),
        "nextRuntimeProbe": (
            "Hook FUN_004fc4e0/FUN_004fc4a0/FUN_004fd560/FUN_004fd7a0 and FUN_005024b0 to prove "
            "which natural lifecycle call, if any, enables the HUD mode targets before the "
            "FUN_004fd100 pre-activation hit-tests."
        ),
    }


def write_hud_mode_lifecycle_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_hud_mode_lifecycle_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[InstructionView]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        InstructionView(address=instruction.address, mnemonic=instruction.mnemonic, op_str=instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _require_activation_markers(instructions: list[InstructionView]) -> None:
    observed = {(instruction.address, instruction.mnemonic, instruction.op_str) for instruction in instructions}
    required = [
        (hit_test.hit_test_call_va, "call", "0x5015f0")
        for hit_test in ACTIVATION_HIT_TESTS
    ] + [
        (hit_test.return_va, "test", "al, al")
        for hit_test in ACTIVATION_HIT_TESTS
    ] + [
        (hit_test.mode_set_call_va, "call", "0x4fd7a0")
        for hit_test in ACTIVATION_HIT_TESTS
    ]
    missing = [
        f"0x{address:08x}: {mnemonic} {op_str}"
        for address, mnemonic, op_str in required
        if (address, mnemonic, op_str) not in observed
    ]
    if missing:
        raise ValueError(f"HUD mode activation markers missing: {missing}")


def _require_mode_set_markers(instructions: list[InstructionView]) -> None:
    observed = {(instruction.address, instruction.mnemonic, instruction.op_str) for instruction in instructions}
    required = [
        (0x004FDB51, "cmp", "dword ptr [eax + 0x6703c0], -1"),
        (0x004FDB67, "push", "0"),
        (0x004FDB69, "call", "0x5024b0"),
        (0x004FDB7D, "push", "1"),
        (0x004FDB89, "call", "0x5024b0"),
        (0x004FDBDC, "mov", "ecx, dword ptr [eax + 0x6703c0]"),
    ]
    missing = [
        f"0x{address:08x}: {mnemonic} {op_str}"
        for address, mnemonic, op_str in required
        if (address, mnemonic, op_str) not in observed
    ]
    if missing:
        raise ValueError(f"HUD mode-set markers missing: {missing}")


def _require_initial_mode_set(data: bytes, image: PeImage) -> None:
    instructions = _instructions(data, image, 0x004FCFBC, 0x20)
    observed = {(instruction.address, instruction.mnemonic, instruction.op_str) for instruction in instructions}
    required = {
        (0x004FCFBF, "call", "0x506280"),
        (0x004FCFC4, "push", "ebx"),
        (0x004FCFC5, "push", "1"),
        (0x004FCFC9, "call", "0x4fd7a0"),
    }
    missing = [
        f"0x{address:08x}: {mnemonic} {op_str}"
        for address, mnemonic, op_str in required
        if (address, mnemonic, op_str) not in observed
    ]
    if missing:
        raise ValueError(f"HUD init mode-set markers missing: {missing}")


def _read_mode_table(data: bytes, image: PeImage) -> list[JsonValue]:
    offset = _virtual_address_to_offset(image, MODE_TABLE_VA)
    modes: list[JsonValue] = []
    for mode in range(MODE_TABLE_MODES):
        entries: list[JsonValue] = []
        for index in range(MODE_TABLE_ENTRIES):
            row_offset = offset + ((mode * MODE_TABLE_ENTRIES) + index) * 8
            action = int.from_bytes(data[row_offset : row_offset + 4], "little", signed=True)
            target_slot = int.from_bytes(data[row_offset + 4 : row_offset + 8], "little", signed=True)
            if action == -1:
                break
            entries.append({"action": action, "targetSlot": target_slot})
        modes.append({"mode": mode, "entries": entries})
    return modes


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII HUD mode lifecycle markers.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_hud_mode_lifecycle_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
