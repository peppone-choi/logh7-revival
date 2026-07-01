from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image
    from .logh7_disasm_range import _bounded_file_slice, load_function_ranges
    from .logh7_inbound_response_dispatch import build_inbound_response_dispatch_index
    from .logh7_message_family_maps import build_message_family_index
    from .logh7_outbound_request_dispatch import build_outbound_request_dispatch_index
    from .logh7_transport_dispatch import build_transport_dispatch_index
else:
    from logh7_child_codec import _parse_pe_image
    from logh7_disasm_range import _bounded_file_slice, load_function_ranges
    from logh7_inbound_response_dispatch import build_inbound_response_dispatch_index
    from logh7_message_family_maps import build_message_family_index
    from logh7_outbound_request_dispatch import build_outbound_request_dispatch_index
    from logh7_transport_dispatch import build_transport_dispatch_index


SCHEMA_VERSION: Final[int] = 1
OUTBOUND_DISPATCH_VA: Final[int] = 0x004B78A0
RECENT_INSTRUCTION_WINDOW: Final[int] = 16
PUSH_ARG_COUNT: Final[int] = 3
IMMEDIATE_TEXT_RE: Final[re.Pattern[str]] = re.compile(r"^-?(?:0x[0-9a-f]+|\d+)$", re.IGNORECASE)


def build_opcode_index(source: Path, *, redex_export: Path | None = None) -> dict[str, object]:
    """Build a normalized first-pass opcode routing index.

    This intentionally joins the already proofed indexers instead of replacing
    them. The send-side spine is FUN_004b78a0; receive coverage is still the
    tracked subset from logh7_inbound_response_dispatch.py until the inbound
    dispatcher is fully enumerated.
    """
    outbound = build_outbound_request_dispatch_index(source)
    inbound = build_inbound_response_dispatch_index(source)
    transport = build_transport_dispatch_index(source)
    families = build_message_family_index(source)
    inbound_by_hex = {entry["internalHex"]: entry for entry in inbound["trackedResponses"]}
    normalized_outbound_routes = [
        _normalize_outbound_route(route, inbound_by_hex)
        for route in outbound["trackedRoutes"]
        if route["requestHex"] is not None
    ]
    outbound_by_selector = {
        int(route["selectorHex"], 16): route
        for route in normalized_outbound_routes
    }
    callsites, callsite_note = _build_outbound_callsites(
        source,
        redex_export=redex_export,
        outbound_by_selector=outbound_by_selector,
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": str(source),
        "outboundDispatch": _summarize_outbound(outbound),
        "inboundDispatch": _summarize_inbound(inbound),
        "transportDispatch": _summarize_transport(transport),
        "messageFamilies": families["families"],
        "normalizedOutboundRoutes": normalized_outbound_routes,
        "outboundCallsites": callsites,
        "c002Route": outbound["c002Route"],
        "c002Callsites": [
            callsite for callsite in callsites if callsite.get("requestInternalHex") == "0x0b01"
        ],
        "coverage": {
            "outboundSelectorRoutes": len(outbound["trackedRoutes"]),
            "outboundCallsites": len(callsites),
            "resolvedOutboundCallsites": sum(1 for callsite in callsites if callsite.get("selectorHex") is not None),
            "trackedInboundResponses": len(inbound["trackedResponses"]),
            "trackedTransportRoutes": len(transport["entries"]),
            "messageFamilies": len(families["families"]),
            "inboundLimitation": "tracked subset only; full inbound case enumeration remains pending",
            "callsiteLimitation": callsite_note,
        },
        "evidence": "joined static PE indexes: outbound selector table, tracked inbound response dispatcher, transport dispatch, message families",
    }


def write_opcode_index(source: Path, destination: Path, *, redex_export: Path | None = None) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_opcode_index(source, redex_export=redex_export), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _summarize_outbound(outbound: dict[str, object]) -> dict[str, object]:
    return {
        "dispatchVirtualAddressHex": outbound["dispatchVirtualAddressHex"],
        "jumpTableVirtualAddressHex": outbound["jumpTableVirtualAddressHex"],
        "tailVirtualAddressHex": outbound["tailVirtualAddressHex"],
        "queueVirtualAddressHex": outbound["queueVirtualAddressHex"],
        "queueLayout": outbound["queueLayout"],
    }


def _summarize_inbound(inbound: dict[str, object]) -> dict[str, object]:
    return {
        "dispatchEntryVirtualAddressHex": inbound["dispatchEntryVirtualAddressHex"],
        "dispatchTailVirtualAddressHex": inbound["dispatchTailVirtualAddressHex"],
        "unhandledVirtualAddressHex": inbound["unhandledVirtualAddressHex"],
        "stateBlockRange": inbound["stateBlockRange"],
        "stateBlockWriterCandidateCount": len(inbound["stateBlockWriterCandidates"]),
    }


def _summarize_transport(transport: dict[str, object]) -> dict[str, object]:
    return {
        "jumpTableVirtualAddressHex": transport["jumpTableVirtualAddressHex"],
        "dispatchTailVirtualAddressHex": transport["dispatchTailVirtualAddressHex"],
        "trackedTransportHexes": [entry["transportHex"] for entry in transport["entries"]],
    }


def _normalize_outbound_route(route: dict[str, object], inbound_by_hex: dict[str, dict[str, object]]) -> dict[str, object]:
    paired_response_hex = route["expectedResponseHex"]
    receive_route = inbound_by_hex.get(paired_response_hex) if paired_response_hex is not None else None
    return {
        "selectorHex": route["selectorHex"],
        "caseIndexHex": route["caseIndexHex"],
        "requestInternalHex": route["requestHex"],
        "requestName": route["requestName"],
        "pairedResponseInternalHex": paired_response_hex,
        "pairedResponseName": route["expectedResponseName"],
        "sendTargetVirtualAddressHex": route["targetVirtualAddressHex"],
        "sendStateGateOffsets": route["stateGateOffsets"],
        "sendSideEffects": route["sideEffects"],
        "sendRouteKind": route["routeKind"],
        "trackedReceiveHandlerVirtualAddressHex": None
        if receive_route is None
        else receive_route["handlerVirtualAddressHex"],
        "trackedReceiveRouteKind": None if receive_route is None else receive_route["routeKind"],
        "trackedReceiveStateWrites": [] if receive_route is None else receive_route["stateWrites"],
    }


def _build_outbound_callsites(
    source: Path,
    *,
    redex_export: Path | None,
    outbound_by_selector: dict[int, dict[str, object]],
) -> tuple[list[dict[str, object]], str]:
    export = redex_export or _default_redex_export_for_source(source)
    if not export.exists():
        return [], f"redex export not found; expected {export}"

    data = source.read_bytes()
    image = _parse_pe_image(data)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    callsites: list[dict[str, object]] = []
    for function in load_function_ranges(export):
        try:
            offset, bounded_size = _bounded_file_slice(data, image, function.start_va, function.size)
        except ValueError:
            continue
        recent: list[tuple[int, str, str]] = []
        for instruction in disassembler.disasm(data[offset : offset + bounded_size], function.start_va):
            if instruction.mnemonic == "call" and _parse_direct_call_target(instruction.op_str) == OUTBOUND_DISPATCH_VA:
                callsites.append(
                    _outbound_callsite_json(
                        function_start_va=function.start_va,
                        function_name=function.name,
                        call_va=instruction.address,
                        recent=recent,
                        outbound_by_selector=outbound_by_selector,
                    )
                )
            recent.append((instruction.address, instruction.mnemonic, instruction.op_str))
            if len(recent) > RECENT_INSTRUCTION_WINDOW:
                recent = recent[-RECENT_INSTRUCTION_WINDOW:]
    callsites.sort(key=lambda row: (str(row["functionStartVaHex"]), str(row["callVirtualAddressHex"])))
    return (
        callsites,
        "raw x86 direct-call scan; selector/mode resolved from the two latest immediate push args before call",
    )


def _default_redex_export_for_source(source: Path) -> Path:
    resolved = source.resolve()
    if resolved.parent.name.lower() == "bin" and resolved.parent.parent.name.lower() == "ghidra":
        return resolved.parent.parent / "export" / "G7MTClient"
    return Path(".omo") / "ghidra" / "export" / "G7MTClient"


def _outbound_callsite_json(
    *,
    function_start_va: int,
    function_name: str,
    call_va: int,
    recent: list[tuple[int, str, str]],
    outbound_by_selector: dict[int, dict[str, object]],
) -> dict[str, object]:
    pushes = _recent_push_args(recent)
    mode = pushes[0]["immediate"] if len(pushes) >= 1 else None
    selector = pushes[1]["immediate"] if len(pushes) >= 2 else None
    route = outbound_by_selector.get(selector) if selector is not None else None
    result: dict[str, object] = {
        "functionStartVaHex": f"0x{function_start_va:08x}",
        "functionName": function_name,
        "callVirtualAddressHex": f"0x{call_va:08x}",
        "modeArg": mode,
        "modeArgHex": None if mode is None else f"0x{mode:08x}",
        "sendMode": _send_mode_name(mode),
        "selector": selector,
        "selectorHex": None if selector is None else f"0x{selector:04x}",
        "payloadArg": pushes[2]["opStr"] if len(pushes) >= 3 else None,
        "pushArgsNewestFirst": [
            {
                "addressHex": f"0x{push['address']:08x}",
                "opStr": push["opStr"],
                "immediate": push["immediate"],
                "immediateHex": None if push["immediate"] is None else f"0x{push['immediate']:08x}",
            }
            for push in pushes
        ],
        "confidence": _callsite_confidence(mode, selector, route),
    }
    if route is not None:
        result.update(
            {
                "requestInternalHex": route["requestInternalHex"],
                "requestName": route["requestName"],
                "pairedResponseInternalHex": route["pairedResponseInternalHex"],
                "pairedResponseName": route["pairedResponseName"],
                "sendTargetVirtualAddressHex": route["sendTargetVirtualAddressHex"],
                "sendStateGateOffsets": route["sendStateGateOffsets"],
            }
        )
    return result


def _recent_push_args(recent: list[tuple[int, str, str]]) -> list[dict[str, object]]:
    pushes: list[dict[str, object]] = []
    for address, mnemonic, op_str in reversed(recent):
        if mnemonic != "push":
            continue
        pushes.append({"address": address, "opStr": op_str, "immediate": _parse_immediate_text(op_str)})
        if len(pushes) == PUSH_ARG_COUNT:
            break
    return pushes


def _parse_direct_call_target(op_str: str) -> int | None:
    return _parse_immediate_text(op_str.strip())


def _parse_immediate_text(text: str) -> int | None:
    stripped = text.strip()
    if IMMEDIATE_TEXT_RE.match(stripped) is None:
        return None
    return int(stripped, 0) & 0xFFFFFFFF


def _send_mode_name(mode: int | None) -> str:
    if mode == 0:
        return "immediate"
    if mode == 1:
        return "queued"
    return "unknown"


def _callsite_confidence(mode: int | None, selector: int | None, route: dict[str, object] | None) -> str:
    if mode is None or selector is None:
        return "unresolved-push-window"
    if route is None:
        return "raw-push-selector-unmapped"
    return "raw-push-selector"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a normalized LOGH VII opcode routing index.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--redex-export",
        type=Path,
        default=None,
        help="Ghidra redex export directory containing functions.jsonl",
    )
    args = parser.parse_args()
    write_opcode_index(args.source, args.out, redex_export=args.redex_export)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
