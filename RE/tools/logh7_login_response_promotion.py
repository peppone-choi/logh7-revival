#!/usr/bin/env python3
from __future__ import annotations

from typing import Final

DECODE_ROUTER_VA: Final[int] = 0x004AE0D0
DECODE_ROUTER_APPEND_CALL_VA: Final[int] = 0x004AE0FF
DECODE_ROUTER_CLIENT_GLOBAL_VA: Final[int] = 0x007CCFFC
DECODE_ROUTER_0202_BRANCH_VA: Final[int] = 0x004AE0E9
DECODE_ROUTER_0202_TARGET_VA: Final[int] = 0x004AE163
DECODE_ROUTER_0204_BRANCH_VA: Final[int] = 0x004AE0EE
DECODE_ROUTER_0204_TARGET_VA: Final[int] = 0x004AE10E
DECODE_ROUTER_0204_APPEND_CALL_VA: Final[int] = 0x004AE127


def _expect(present: bool, label: str, missing: list[str]) -> None:
    if not present:
        missing.append(label)


def expect_decode_router_markers(
    router_instructions: list[tuple[int, str, str]],
    missing: list[str],
    *,
    enqueue_va: int,
) -> None:
    router = {(m, o) for _, m, o in router_instructions}
    router_by_address = {address: (mnemonic, op_str) for address, mnemonic, op_str in router_instructions}
    _expect(
        router_by_address.get(DECODE_ROUTER_0202_BRANCH_VA) == ("je", f"0x{DECODE_ROUTER_0202_TARGET_VA:x}"),
        "decode router branches 0x0202 to special path",
        missing,
    )
    _expect(
        router_by_address.get(DECODE_ROUTER_0204_BRANCH_VA) == ("je", f"0x{DECODE_ROUTER_0204_TARGET_VA:x}"),
        "decode router branches 0x0204 to gate path",
        missing,
    )
    _expect(
        router_by_address.get(DECODE_ROUTER_APPEND_CALL_VA) == ("call", f"0x{enqueue_va:x}"),
        "decode router default append call address",
        missing,
    )
    _expect(
        router_by_address.get(DECODE_ROUTER_0204_APPEND_CALL_VA) == ("call", f"0x{enqueue_va:x}"),
        "decode router gated 0x0204 append call address",
        missing,
    )
    _expect(("mov", "al, byte ptr [ecx + 0x35837e]") in router, "0x0204 route gates on client+0x35837e", missing)
    _expect(("push", "0x205") in router, "0x0204 ungated route notifies runtime manager with 0x0205", missing)
    _expect(("call", "dword ptr [eax + 0x18]") in router, "0x0204 ungated route calls runtime-manager vtable +0x18", missing)


def decode_router_json(*, enqueue_va: int) -> dict[str, object]:
    return {
        "virtualAddressHex": f"0x{DECODE_ROUTER_VA:08x}",
        "internalCodeArgument": "[esp+4] low16",
        "bodyPointerArgument": "[esp+0x0c]",
        "clientGlobalPointerHex": f"0x{DECODE_ROUTER_CLIENT_GLOBAL_VA:08x}",
        "defaultRouteInternalCodes": "all except 0x0202 and 0x0204",
        "defaultAppendCallHex": f"0x{DECODE_ROUTER_APPEND_CALL_VA:08x}",
        "defaultAppendTargetHex": f"0x{enqueue_va:08x}",
        "specialRoutes": [
            {
                "internalHex": "0x0202",
                "branchVirtualAddressHex": f"0x{DECODE_ROUTER_0202_BRANCH_VA:08x}",
                "targetVirtualAddressHex": f"0x{DECODE_ROUTER_0202_TARGET_VA:08x}",
                "route": "special text/control path; does not take the default queue append",
            },
            {
                "internalHex": "0x0204",
                "branchVirtualAddressHex": f"0x{DECODE_ROUTER_0204_BRANCH_VA:08x}",
                "targetVirtualAddressHex": f"0x{DECODE_ROUTER_0204_TARGET_VA:08x}",
                "route": (
                    "if client+0x35837e is set, appends at 0x004ae127; otherwise stores "
                    "session context and calls runtime-manager vtable +0x18 with 0x0205"
                ),
            },
        ],
    }


def promotion_gap_json(*, enqueue_va: int, dispatch_call_va: int, dispatch_entry_va: int) -> dict[str, object]:
    return {
        "negativeRuntimeEvidence": (
            "G077/G078 real-client probes showed server candidates preserved packet flow but never "
            "called decoded-response outer 0x004ba2e6 or inner 0x004ba316; flags stayed zero."
        ),
        "nextRuntimeTracePoints": [
            f"0x{DECODE_ROUTER_VA:08x}",
            f"0x{DECODE_ROUTER_APPEND_CALL_VA:08x}",
            f"0x{DECODE_ROUTER_0204_APPEND_CALL_VA:08x}",
            f"0x{enqueue_va:08x}",
            f"0x{dispatch_call_va:08x}",
            "0x004ba2e6",
            f"0x{dispatch_entry_va:08x}",
            "0x00645e2b",
        ],
        "interpretation": (
            "Finding more high-level response bytes is insufficient until a live server frame is "
            "observed entering this decode-router/append chain."
        ),
    }
