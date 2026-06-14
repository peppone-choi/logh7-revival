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


PHASE4_RECV_VA: Final[int] = 0x00645E2B
PHASE4_SITE_ID: Final[int] = 3


def apply_socket_recv_phase4_ring_patch(
    source: Path, destination: Path, manifest_out: Path
) -> SocketRecvPhaseRingPatch:
    return _apply_socket_recv_phase_ring_patch(
        source,
        destination,
        manifest_out,
        hooks=_phase4_hook(source),
        buffer_offset=PHASE3_RING_BUFFER_OFFSET,
    )


def _phase4_hook(source: Path) -> tuple[PhaseRingHook, ...]:
    index = build_socket_boundary_index(source)
    for site in _recv_sites(index):
        if int(site["virtualAddress"]) == PHASE4_RECV_VA:
            return (
                PhaseRingHook(
                    virtual_address=PHASE4_RECV_VA,
                    file_offset=int(site["fileOffset"]),
                    original_hex=str(site["originalHex"])[: PHASE_RING_OVERWRITE_BYTES * 2],
                    role=str(site["role"]),
                    site_id=PHASE4_SITE_ID,
                ),
            )
    raise ValueError("phase4 recv hook missing from socket boundary index")


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII phase4 recv ring probe.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    args = parser.parse_args()
    apply_socket_recv_phase4_ring_patch(args.source, args.out, args.manifest_out)
    print(f"wrote {args.out}")
    print(f"wrote {args.manifest_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
