from __future__ import annotations

import argparse
import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


OUTBOUND_DISPATCH_VA: Final[int] = 0x004B78A0
OUTBOUND_JUMP_TABLE_VA: Final[int] = 0x004B864C
OUTBOUND_TAIL_VA: Final[int] = 0x004B78EF
OUTBOUND_FAIL_VA: Final[int] = 0x004B8516
OUTBOUND_QUEUE_VA: Final[int] = 0x004B8552
OUTBOUND_IMMEDIATE_SEND_VA: Final[int] = 0x004B8611
SELECTOR_COUNT: Final[int] = 0x80
IMMEDIATE_RE: Final[re.Pattern[str]] = re.compile(r"-?0x[0-9a-f]+|-?\d+")
GATE_RE: Final[re.Pattern[str]] = re.compile(r"byte ptr \[edi \+ 0x([0-9a-f]+)\]")
CLIENT_DWORD_WRITE_RE: Final[re.Pattern[str]] = re.compile(r"dword ptr \[edi \+ 0x([0-9a-f]+)\]")

KNOWN_REQUEST_NAMES: Final[dict[int, str]] = {
    0x0200: "RequestSSLogin",
    0x0203: "RequestSSGameLogin",
    0x0300: "RequestStaticInformationSynchronize",
    0x0304: "RequestStaticInformationSession",
    0x0312: "RequestStaticInformationGridType",
    0x0314: "RequestStaticInformationGrid",
    0x0316: "RequestStaticInformationGridSelector",
    0x031C: "RequestStaticInformationBase",
    0x031E: "RequestInformationBase",
    0x0320: "RequestInformationInstitution",
    0x0322: "RequestInformationCharacter",
    0x0324: "RequestInformationUnit",
    0x033A: "RequestTacticsInformationUnitShip",
    0x0348: "RequestTacticsCharacter",
    0x0400: "CommandMoveShip",
    0x0401: "CommandTurnShip",
    0x0403: "CommandReverseShip",
    0x0405: "CommandAttackShip",
    0x0406: "CommandShootShip",
    0x040A: "CommandStopShip",
    0x040E: "CommandAirBattle",
    0x0411: "CommandChangeMode",
    0x0B01: "CommandSelectGrid",
    0x0B04: "CommandGridInformation",
    0x0B06: "CommandSwitchMode",
    0x0F08: "RequestInformationText",
    0x0F1C: "CommandChat",
    0x0F1D: "CommandSpotChat",
    0x0F1E: "CommandSpotUnicastChat",
    0x1008: "CommandCreateCharacter",
    0x2009: "CommandSelectSession",
}

KNOWN_RESPONSE_NAMES: Final[dict[int, str]] = {
    0x0201: "SSLoginOK",
    0x0204: "NotifyWorldPlayer",
    0x0206: "SSGameLoginOK",
    0x0301: "ResponseStaticInformationSynchronize",
    0x0305: "ResponseStaticInformationSession",
    0x0307: "ResponseStaticInformationCardCommand",
    0x030B: "ResponseStaticUnitShip",
    0x030D: "ResponseStaticUnitTroop",
    0x030F: "ResponseStaticFighters",
    0x0311: "ResponseStaticArms",
    0x0313: "ResponseStaticInformationGridType",
    0x0315: "ResponseStaticInformationGrid",
    0x0317: "ResponseStaticInformationGridSelector",
    0x031D: "ResponseStaticInformationBase",
    0x031F: "ResponseInformationBase",
    0x0321: "ResponseInformationInstitution",
    0x0323: "ResponseInformationCharacter",
    0x0325: "ResponseInformationUnit",
    0x033B: "TacticsInformationUnitShip",
    0x0349: "ResponseTacticsCharacter",
    0x040C: "ResponseBattleSetup",
    0x0421: "NotifyUnknown0421",
    0x0430: "NotifyUnknown0430",
    0x0B07: "NotifyMovedGrid",
    0x0B0B: "NotifyGridInformation",
    0x0F09: "ResponseInformationText",
    0x1201: "NotifySimpleInformationEnd",
    0x2001: "ResponseLogin",
    0x2004: "ResponseSessionList",
    0x2006: "ResponseSessionLogin",
    0x200A: "ResponseSelectSession",
}


@dataclass(frozen=True, slots=True)
class OutboundRequestRoute:
    selector: int
    case_index: int
    table_virtual_address: int
    target_virtual_address: int
    request_code: int | None
    expected_response_code: int | None
    state_gate_offsets: tuple[int, ...]
    side_effects: tuple[str, ...]
    route_kind: str

    def to_json(self) -> dict[str, object]:
        request_code = self.request_code
        response_code = self.expected_response_code
        return {
            "selector": self.selector,
            "selectorHex": f"0x{self.selector:04x}",
            "caseIndex": self.case_index,
            "caseIndexHex": f"0x{self.case_index:04x}",
            "tableVirtualAddress": self.table_virtual_address,
            "tableVirtualAddressHex": f"0x{self.table_virtual_address:08x}",
            "targetVirtualAddress": self.target_virtual_address,
            "targetVirtualAddressHex": f"0x{self.target_virtual_address:08x}",
            "requestCode": request_code,
            "requestHex": None if request_code is None else f"0x{request_code:04x}",
            "requestName": None if request_code is None else KNOWN_REQUEST_NAMES.get(request_code),
            "expectedResponseCode": response_code,
            "expectedResponseHex": None if response_code is None else f"0x{response_code:04x}",
            "expectedResponseName": None if response_code is None else KNOWN_RESPONSE_NAMES.get(response_code),
            "stateGateOffsets": [f"client+0x{offset:06x}" for offset in self.state_gate_offsets],
            "sideEffects": list(self.side_effects),
            "routeKind": self.route_kind,
        }


def build_outbound_request_dispatch_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _expect_outbound_markers(data, image)
    routes = [_route_for_selector(data, image, selector) for selector in range(1, SELECTOR_COUNT + 1)]
    return {
        "source": str(source),
        "dispatchVirtualAddress": OUTBOUND_DISPATCH_VA,
        "dispatchVirtualAddressHex": f"0x{OUTBOUND_DISPATCH_VA:08x}",
        "jumpTableVirtualAddress": OUTBOUND_JUMP_TABLE_VA,
        "jumpTableVirtualAddressHex": f"0x{OUTBOUND_JUMP_TABLE_VA:08x}",
        "tailVirtualAddress": OUTBOUND_TAIL_VA,
        "tailVirtualAddressHex": f"0x{OUTBOUND_TAIL_VA:08x}",
        "queueVirtualAddress": OUTBOUND_QUEUE_VA,
        "queueVirtualAddressHex": f"0x{OUTBOUND_QUEUE_VA:08x}",
        "immediateSendVirtualAddress": OUTBOUND_IMMEDIATE_SEND_VA,
        "immediateSendVirtualAddressHex": f"0x{OUTBOUND_IMMEDIATE_SEND_VA:08x}",
        "queueLayout": {
            "payload": "client+0x357ecc + queueIndex*0x0c",
            "requestCode": "client+0x357ec4 + queueIndex*0x0c",
            "expectedResponseCode": "client+0x357ec8 + queueIndex*0x0c",
            "queueCount": "client+0x357ec0",
        },
        "trackedRoutes": [route.to_json() for route in routes],
        "c002Route": _c002_summary(routes),
        "evidence": "direct PE disassembly of FUN_004b78a0 selector jump table and queue tail",
        "nextTracePoint": "hook FUN_004b78a0 at 0x004b78a0 and queue tail 0x004b8552 to prove selector/request/response at runtime",
    }


def write_outbound_request_dispatch_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_outbound_request_dispatch_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _read_u32(data: bytes, image: PeImage, virtual_address: int) -> int:
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, virtual_address))[0]


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[int, str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(item.address, item.mnemonic, item.op_str) for item in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _expect_outbound_markers(data: bytes, image: PeImage) -> None:
    instructions = set(_instructions(data, image, OUTBOUND_DISPATCH_VA, 0x50))
    required = {
        (0x004B78BB, "mov", "eax, dword ptr [ebp + 0xc]"),
        (0x004B78DE, "jmp", "dword ptr [eax*4 + 0x4b864c]"),
    }
    missing = sorted(required - instructions)
    if missing:
        raise ValueError(f"outbound request dispatch markers missing: {missing}")


def _route_for_selector(data: bytes, image: PeImage, selector: int) -> OutboundRequestRoute:
    table_va = OUTBOUND_JUMP_TABLE_VA + (selector - 1) * 4
    target_va = _read_u32(data, image, table_va)
    request, response, gates, side_effects, route_kind = _analyze_route_target(data, image, target_va)
    return OutboundRequestRoute(
        selector=selector,
        case_index=selector - 1,
        table_virtual_address=table_va,
        target_virtual_address=target_va,
        request_code=request,
        expected_response_code=response,
        state_gate_offsets=gates,
        side_effects=side_effects,
        route_kind=route_kind,
    )


def _analyze_route_target(
    data: bytes,
    image: PeImage,
    target_va: int,
) -> tuple[int | None, int | None, tuple[int, ...], tuple[str, ...], str]:
    request_code: int | None = None
    response_code: int | None = None
    gate_offsets: list[int] = []
    side_effects: list[str] = []
    reached_tail = False
    for address, mnemonic, op_str in _instructions(data, image, target_va, 0x80):
        if address == OUTBOUND_TAIL_VA:
            reached_tail = True
            break
        if mnemonic == "jmp" and op_str == f"0x{OUTBOUND_TAIL_VA:x}":
            reached_tail = True
            break
        if mnemonic in {"ret", "retn"} or (mnemonic == "jmp" and op_str == f"0x{OUTBOUND_FAIL_VA:x}"):
            break
        if mnemonic == "mov":
            if op_str.startswith("ebx, "):
                response_code = _parse_immediate(op_str)
                continue
            if op_str.startswith("esi, "):
                rhs = op_str.split(",", 1)[1].strip()
                request_code = response_code if rhs == "ebx" else _parse_immediate(op_str)
                continue
            gate_match = GATE_RE.search(op_str)
            if gate_match is not None and op_str.startswith("al, "):
                gate_offsets.append(int(gate_match.group(1), 16))
                continue
            write_match = CLIENT_DWORD_WRITE_RE.search(op_str)
            if write_match is not None:
                offset = int(write_match.group(1), 16)
                if offset in {0x357EAC, 0x36A5DC}:
                    side_effects.append(f"writes client+0x{offset:06x} at 0x{address:08x}")
    if request_code is None:
        return None, None, tuple(dict.fromkeys(gate_offsets)), tuple(dict.fromkeys(side_effects)), "invalid-or-default"
    route_kind = "queued-or-immediate" if reached_tail else "conditional"
    return request_code, response_code, tuple(dict.fromkeys(gate_offsets)), tuple(dict.fromkeys(side_effects)), route_kind


def _parse_immediate(op_str: str) -> int:
    match = IMMEDIATE_RE.search(op_str)
    if match is None:
        raise ValueError(f"instruction has no immediate: {op_str}")
    value = int(match.group(0), 0)
    return value & 0xFFFFFFFF


def _c002_summary(routes: list[OutboundRequestRoute]) -> dict[str, object]:
    for route in routes:
        if route.request_code == 0x0B01:
            return {
                "selectorHex": f"0x{route.selector:04x}",
                "caseIndexHex": f"0x{route.case_index:04x}",
                "requestHex": "0x0b01",
                "expectedResponseHex": None
                if route.expected_response_code is None
                else f"0x{route.expected_response_code:04x}",
                "targetVirtualAddressHex": f"0x{route.target_virtual_address:08x}",
                "stateGateOffsets": [f"client+0x{offset:06x}" for offset in route.state_gate_offsets],
                "interpretation": "C002 SelectGrid must reach this selector route before a real client-originated 0x0b01 can appear",
            }
    return {"interpretation": "C002 SelectGrid route not found"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII outbound request selector routes in FUN_004b78a0.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_outbound_request_dispatch_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
