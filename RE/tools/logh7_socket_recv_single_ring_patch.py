from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Final

TOOLS_ROOT: Final[Path] = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

from logh7_socket_boundary import JsonValue, build_socket_boundary_index
from logh7_socket_recv_phase_ring_patch import (
    PHASE3_RING_BUFFER_OFFSET,
    PHASE_RING_OVERWRITE_BYTES,
    PhaseRingHook,
    SocketRecvPhaseRingPatch,
    _apply_socket_recv_phase_ring_patch,
)


def apply_socket_recv_single_ring_patch(
    source: Path,
    destination: Path,
    manifest_out: Path,
    *,
    virtual_address: int,
    site_id: int,
) -> SocketRecvPhaseRingPatch:
    return _apply_socket_recv_phase_ring_patch(
        source,
        destination,
        manifest_out,
        hooks=_single_recv_hook(source, virtual_address=virtual_address, site_id=site_id),
        buffer_offset=PHASE3_RING_BUFFER_OFFSET,
    )


def _single_recv_hook(source: Path, *, virtual_address: int, site_id: int) -> tuple[PhaseRingHook, ...]:
    index = build_socket_boundary_index(source)
    for site in _recv_sites(index):
        if int(site["virtualAddress"]) == virtual_address:
            return (
                PhaseRingHook(
                    virtual_address=virtual_address,
                    file_offset=int(site["fileOffset"]),
                    original_hex=str(site["originalHex"])[: PHASE_RING_OVERWRITE_BYTES * 2],
                    role=str(site["role"]),
                    site_id=site_id,
                ),
            )
    raise ValueError(f"recv hook missing from socket boundary index: 0x{virtual_address:08x}")


def _recv_sites(index: dict[str, JsonValue]) -> list[dict[str, JsonValue]]:
    direct_callsites = index["directCallsites"]
    if not isinstance(direct_callsites, dict):
        raise ValueError("socket boundary index directCallsites is not a mapping")
    recv_sites = direct_callsites["recv"]
    if not isinstance(recv_sites, list):
        raise ValueError("socket boundary index recv callsites is not a list")
    for site in recv_sites:
        if not isinstance(site, dict):
            raise ValueError("socket boundary recv callsite is not a mapping")
    return recv_sites


def _parse_int(raw: str) -> int:
    return int(raw, 0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch one LOGH VII recv callsite with an SRP1 ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--virtual-address-hex", type=_parse_int, required=True)
    parser.add_argument("--site-id", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_socket_recv_single_ring_patch(
        args.source,
        args.out,
        args.manifest_out,
        virtual_address=args.virtual_address_hex,
        site_id=args.site_id,
    )
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
