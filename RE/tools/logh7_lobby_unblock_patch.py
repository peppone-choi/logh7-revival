"""Minimal client patch to unblock the LOGH VII lobby (user-chosen: custom client + custom server).

The lobby FSM (WSEQ02, 0x51a3a2) parks in state7 (0x51a82d) polling the success flag
*(0x7ccffc)+0x35837b, set only by the inner-0x2001 consumer 0x4bdb70. But conn2's recv pump
never reads the server's 0x2001 in time (handoff G176-G180: structural recv-pump-cadence gap),
so state7's flag stays 0 and the FSM falls to the ACCOUNT_ERROR/watchdog teardown at 0x51a844,
closing conn2 ~5ms after 0x2000. The server cannot fix this (5 payload/timing attempts failed).

This patch NOPs state7's failure branch `je 0x51a844` at 0x51a834 (74 0e -> 90 90), so the FSM
ALWAYS takes the success path (advance to state [0x2217398]) regardless of the flag. That removes
the premature teardown: conn2 stays open on the success path (which has no teardown), the recv
pump keeps polling, and the subsequent lobby RPC frames (0x2004/0x2006/0x200a from the server)
can be read so the lobby->world flow proceeds. Default server (no experimental envs) drives it.

This is a 2-byte, reversible .text patch; the e2e restores the original EXE afterward (verify
SHA 2848be76...). Additional state-wait patches (e.g. 0x2004/0x2006 waits) can be added here if
the FSM still stalls at a later state.

Usage: python -m tools.logh7_lobby_unblock_patch patch <exe> --out <patched>
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

# Each entry: (name, VA, expected original bytes hex, patched bytes hex, rationale).
#
# RANK #1 (workflow weoqlzubj, high conf): the lobby FSM FUN_0x51a370 (single caller 0x4b698a,
# lobby-only -> conn1-safe) exits EARLY at the scene-active gate 0x51a39c (`je 0x51ba7a` -> bare
# `xor eax,eax; ret`, dispatches nothing) once the scene goes dormant right after state6 sends
# 0x2000. With the FSM neutered, state7 never re-polls the 0x2001 success flag, the lobby scene
# tears down its processor/transport, and conn2 closes ~5ms after 0x2000. NOPing this je keeps the
# FSM ticking so the conn2 recv pump (0x615290) stays alive and reads 0x2001/0x2004/0x2006/0x200a.
# (Earlier state7 je-NOP at 0x51a834 was INERT because the FSM never reaches state7.)
# RANK #0 (workflow weoqlzubj + teardown-chain probe G187, the ACTUAL conn2 close): conn2 is torn
# down by the transport ROUTER 0x6130a0 at 0x613144 `je 0x613150` -> 0x613157 `call 0x614b30`
# (teardown) when the frame-processing local result [eax] is NULL. This is conn2-SPECIFIC: conn1
# closes via the login handler 0x4ac721->0x4ac726 (verified by the teardown-chain probe: conn1
# chain starts 0x612299/0x4ac726, conn2 chain starts 0x61315c). NOPing the je keeps conn2's
# transport alive on a null/unhandled frame so its recv pump keeps polling and reads the lobby
# replies. conn1 never reaches this teardown (and its normal frames have a non-null result), so the
# patch is conn1-safe. Paired with the lobby-only scene-active gate bypass so the FSM keeps ticking.
PATCHES: Final[list[tuple[str, int, str, str, str]]] = [
    (
        "router-null-result-no-teardown",
        0x00613157,
        "e8d4190000",
        "9090909090",
        "NOP `call 0x614b30` (router teardown) at 0x613150 so the frame is released but conn2 is NOT "
        "torn down on a null/unhandled frame (catches all jumps to 0x613150; conn1 closes via 0x4ac726)",
    ),
    (
        "fsm-scene-active-gate-bypass",
        0x0051A39C,
        "0f84d8160000",
        "909090909090",
        "NOP `je 0x51ba7a` (scene-active early-exit) so the lobby FSM keeps ticking past state6",
    ),
]


@dataclass(frozen=True, slots=True)
class AppliedPatch:
    name: str
    virtual_address: int
    file_offset: int
    before_hex: str
    after_hex: str
    rationale: str

    def to_json(self) -> dict[str, object]:
        return {
            "name": self.name,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "beforeHex": self.before_hex,
            "afterHex": self.after_hex,
            "rationale": self.rationale,
        }


def apply_lobby_unblock_patch(source: Path, out: Path) -> list[AppliedPatch]:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    applied: list[AppliedPatch] = []
    for name, va, original_hex, patched_hex, rationale in PATCHES:
        offset = _virtual_address_to_offset(image, va)
        length = len(bytes.fromhex(original_hex))
        actual = bytes(raw[offset : offset + length])
        if actual.hex() != original_hex:
            raise ValueError(f"patch '{name}' byte drift at 0x{va:08x}: expected {original_hex}, found {actual.hex()}")
        raw[offset : offset + length] = bytes.fromhex(patched_hex)
        applied.append(AppliedPatch(name, va, offset, original_hex, patched_hex, rationale))
    out.write_bytes(bytes(raw))
    return applied


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply the minimal LOGH VII lobby-unblock client patch.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, default=None)
    args = parser.parse_args()

    applied = apply_lobby_unblock_patch(args.source, args.out)
    payload = {"source": str(args.source), "out": str(args.out), "patches": [p.to_json() for p in applied]}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.manifest_out is not None:
        args.manifest_out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
