from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from .logh7_runtime_manager_state_dispatcher import build_runtime_manager_state_dispatcher_schema
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from logh7_runtime_manager_state_dispatcher import build_runtime_manager_state_dispatcher_schema


CALLBACK_VA: Final[int] = 0x004ADD60
CALLBACK_GATE_READ_VA: Final[int] = 0x004ADD81
CALLBACK_ZERO_BRANCH_VA: Final[int] = 0x004ADD8E
CONSTRUCTOR_GATE_ZERO_VA: Final[int] = 0x004AD95A
CALLBACK_RESET_VA: Final[int] = 0x004ADDB0
POST_RESET_CALLBACK_VA: Final[int] = 0x004ADE85
EVENT_CALLBACK_VA, EVENT_CALLBACK_PUSH_VA, EVENT_CALLBACK_STATE_SET_VA = 0x004ADF60, 0x004AD9C1, 0x004ADF6E
FOLLOWUP_CALLBACK_VA, FOLLOWUP_CALLBACK_PUSH_VA = 0x004ADFD0, 0x004ADC1B
FOLLOWUP_CALLBACK_STATE_SET_VA: Final[int] = 0x004ADFE3
CALLBACK_STATE_CLEAR_VA: Final[int] = 0x004ADC12
SIMPLE_SET_ONE_NEEDLES: Final[tuple[bytes, ...]] = (bytes.fromhex("c6453001"), bytes.fromhex("c6473001"), bytes.fromhex("c6403001"))


@dataclass(frozen=True, slots=True)
class InstructionView:
    address: int
    mnemonic: str
    op_str: str


def _instructions(source: Path, virtual_address: int, size: int) -> list[InstructionView]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        InstructionView(address=ins.address, mnemonic=ins.mnemonic, op_str=ins.op_str)
        for ins in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _require_instruction(
    instructions: list[InstructionView],
    *,
    address: int,
    mnemonic: str,
    op_str: str,
) -> None:
    for instruction in instructions:
        if instruction.address == address and instruction.mnemonic == mnemonic and instruction.op_str == op_str:
            return
    raise ValueError(f"callback gate instruction missing at 0x{address:08x}: {mnemonic} {op_str}")


def _simple_direct_set_to_one_candidates(source: Path) -> list[str]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    candidates: list[str] = []
    for needle in SIMPLE_SET_ONE_NEEDLES:
        offset = data.find(needle)
        while offset >= 0:
            for section in image.sections:
                start = section.pointer_to_raw_data
                end = start + section.size_of_raw_data
                if start <= offset < end:
                    candidates.append(f"0x{section.virtual_address + image.image_base + offset - start:08x}")
                    break
            offset = data.find(needle, offset + 1)
    return sorted(candidates)


def _state_setter_schema(source: Path) -> list[dict[str, object]]:
    constructor_instructions = _instructions(source, 0x004AD9B0, 0x30)
    event_instructions = _instructions(source, EVENT_CALLBACK_VA, 0x70)
    followup_registration = _instructions(source, 0x004ADC00, 0x40)
    followup_instructions = _instructions(source, FOLLOWUP_CALLBACK_VA, 0x80)
    _require_instruction(
        constructor_instructions,
        address=EVENT_CALLBACK_PUSH_VA,
        mnemonic="push",
        op_str="0x4adf60",
    )
    _require_instruction(
        event_instructions,
        address=0x004ADF60,
        mnemonic="mov",
        op_str="eax, dword ptr [esp + 8]",
    )
    _require_instruction(event_instructions, address=0x004ADF64, mnemonic="test", op_str="eax, eax")
    _require_instruction(event_instructions, address=0x004ADF66, mnemonic="jne", op_str="0x4adf77")
    _require_instruction(event_instructions, address=0x004ADF68, mnemonic="mov", op_str="ecx, dword ptr [esp + 4]")
    _require_instruction(event_instructions, address=0x004ADF6C, mnemonic="mov", op_str="al, 1")
    _require_instruction(
        event_instructions,
        address=EVENT_CALLBACK_STATE_SET_VA,
        mnemonic="mov",
        op_str="byte ptr [ecx + 0x30], al",
    )
    _require_instruction(
        followup_registration,
        address=FOLLOWUP_CALLBACK_PUSH_VA,
        mnemonic="push",
        op_str="0x4adfd0",
    )
    _require_instruction(
        followup_instructions,
        address=FOLLOWUP_CALLBACK_STATE_SET_VA,
        mnemonic="mov",
        op_str="byte ptr [esi + 0x30], 1",
    )
    _require_instruction(followup_instructions, address=0x004ADFE7, mnemonic="call", op_str="0x612510")
    _require_instruction(followup_instructions, address=0x004AE011, mnemonic="call", op_str="0x6123d0")
    _require_instruction(followup_instructions, address=0x004AE01A, mnemonic="call", op_str="0x612520")
    return [
        {
            "callbackVirtualAddressHex": f"0x{EVENT_CALLBACK_VA:08x}",
            "registeredPushVirtualAddressHex": f"0x{EVENT_CALLBACK_PUSH_VA:08x}",
            "setVirtualAddressHex": f"0x{EVENT_CALLBACK_STATE_SET_VA:08x}",
            "contextArgument": "[esp+0x04]",
            "flagArgument": "[esp+0x08]",
            "stateValue": 1,
            "branchWhenFlagNonzeroHex": "0x004adf77",
            "sideEffectGlobalHex": "0x007c25f1",
            "role": "sets manager+0x30 when cleanup callback flag argument is zero",
        },
        {
            "callbackVirtualAddressHex": f"0x{FOLLOWUP_CALLBACK_VA:08x}",
            "registeredPushVirtualAddressHex": f"0x{FOLLOWUP_CALLBACK_PUSH_VA:08x}",
            "setVirtualAddressHex": f"0x{FOLLOWUP_CALLBACK_STATE_SET_VA:08x}",
            "contextArgument": "[esp+0x04]",
            "flagArgument": "[esp+0x08]",
            "stateValue": 1,
            "member40HelperCalls": [
                {"callVirtualAddressHex": "0x004adfe7", "targetVirtualAddressHex": "0x00612510"},
                {"callVirtualAddressHex": "0x004ae011", "targetVirtualAddressHex": "0x006123d0"},
                {"callVirtualAddressHex": "0x004ae01a", "targetVirtualAddressHex": "0x00612520"},
            ],
            "role": "sets manager+0x30 before creating/scheduling member40 work",
        },
    ]


def _state_clearer_schema(source: Path) -> list[dict[str, object]]:
    instructions = _instructions(source, 0x004ADBE0, 0x50)
    _require_instruction(instructions, address=0x004ADC0D, mnemonic="call", op_str="0x612290")
    _require_instruction(
        instructions,
        address=CALLBACK_STATE_CLEAR_VA,
        mnemonic="mov",
        op_str="byte ptr [esi + 0x30], 0",
    )
    _require_instruction(instructions, address=0x004ADC16, mnemonic="call", op_str="0x4ab3e0")
    return [
        {
            "setVirtualAddressHex": f"0x{CALLBACK_STATE_CLEAR_VA:08x}",
            "stateValue": 0,
            "contextRegister": "esi",
            "precedingHelperCallVirtualAddressHex": "0x004adc0d",
            "precedingHelperTargetHex": "0x00612290",
            "followupCallbackPushVirtualAddressHex": f"0x{FOLLOWUP_CALLBACK_PUSH_VA:08x}",
            "role": "clears manager+0x30 before registering follow-up callback 0x004adfd0",
        }
    ]


def build_runtime_manager_callback_gate_schema(source: Path) -> dict[str, object]:
    constructor_instructions = _instructions(source, CONSTRUCTOR_GATE_ZERO_VA, 0x20)
    callback_instructions = _instructions(source, CALLBACK_VA, 0x140)
    _require_instruction(
        constructor_instructions,
        address=CONSTRUCTOR_GATE_ZERO_VA,
        mnemonic="mov",
        op_str="byte ptr [ebp + 0x30], 0",
    )
    _require_instruction(
        callback_instructions,
        address=0x004ADD7E,
        mnemonic="mov",
        op_str="edi, dword ptr [ebp + 8]",
    )
    _require_instruction(
        callback_instructions,
        address=CALLBACK_GATE_READ_VA,
        mnemonic="mov",
        op_str="al, byte ptr [edi + 0x30]",
    )
    _require_instruction(callback_instructions, address=0x004ADD86, mnemonic="test", op_str="al, al")
    _require_instruction(
        callback_instructions,
        address=CALLBACK_ZERO_BRANCH_VA,
        mnemonic="je",
        op_str="0x4ade93",
    )
    _require_instruction(callback_instructions, address=0x004ADD97, mnemonic="call", op_str="0x6122c0")
    _require_instruction(callback_instructions, address=0x004ADD9F, mnemonic="call", op_str="0x6122a0")
    _require_instruction(callback_instructions, address=0x004ADDA4, mnemonic="cmp", op_str="eax, 2")
    _require_instruction(
        callback_instructions,
        address=CALLBACK_RESET_VA,
        mnemonic="mov",
        op_str="byte ptr [edi + 0x30], 0",
    )
    _require_instruction(callback_instructions, address=0x004ADDB4, mnemonic="call", op_str="0x6122b0")
    _require_instruction(
        callback_instructions,
        address=POST_RESET_CALLBACK_VA,
        mnemonic="call",
        op_str="0x4ae050",
    )
    return {
        "role": "registered callback state gate for manager+0x30",
        "callbackVirtualAddressHex": f"0x{CALLBACK_VA:08x}",
        "contextArgument": "[ebp+0x08]",
        "stateGateOffsetHex": "0x00000030",
        "member40OffsetHex": "0x00000040",
        "gateReadVirtualAddressHex": f"0x{CALLBACK_GATE_READ_VA:08x}",
        "zeroBranchVirtualAddressHex": f"0x{CALLBACK_ZERO_BRANCH_VA:08x}",
        "zeroBranchTargetHex": "0x004ade93",
        "constructorZeroVirtualAddressHex": f"0x{CONSTRUCTOR_GATE_ZERO_VA:08x}",
        "callbackResetVirtualAddressHex": f"0x{CALLBACK_RESET_VA:08x}",
        "member40HelperCalls": _registered_callback_helper_calls(),
        "postResetCallbackVirtualAddressHex": f"0x{POST_RESET_CALLBACK_VA:08x}",
        "postResetCallbackTargetHex": "0x004ae050",
        "directSetToOneCandidates": _simple_direct_set_to_one_candidates(source),
        "stateSetters": _state_setter_schema(source),
        "stateClearers": _state_clearer_schema(source),
        "stateCallbackDispatcher": build_runtime_manager_state_dispatcher_schema(source),
        "runtimeObservation": "G051 observed callbackState30=0",
        "nextTracePoint": "instrument state callback dispatcher 0x004ac350 gates or identify prerequisite for flag-zero dispatch",
    }


def _registered_callback_helper_calls() -> list[dict[str, str]]:
    return [
        {"callVirtualAddressHex": "0x004add97", "targetVirtualAddressHex": "0x006122c0", "role": "precondition helper"},
        {"callVirtualAddressHex": "0x004add9f", "targetVirtualAddressHex": "0x006122a0", "role": "status compared with 2"},
        {"callVirtualAddressHex": "0x004addb4", "targetVirtualAddressHex": "0x006122b0", "role": "post-reset helper"},
    ]
