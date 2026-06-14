"""Offline decryptor for captured LOGH VII 0x0030 frames.

Given a probe trace (jsonl) with handshake (0x0034) + app (0x0030) payload events,
recover the per-connection encipherKey from the 0x0034 phase1 request (decoded with
the fixed GUID transport key) and decrypt every client 0x0030 body to plaintext.

Plaintext 0x0030 body layout (validated against real client capture):
    [u16 BE checksum][u32 BE id][u16 BE innerLen][inner]
    inner = [u16 BE innerCode][payload]

Confirmed inner codes from real capture:
    login conn  : 0x7000  -> GIN7 credential blob (account + password) == login request
    lobby conn  : 0x0020  -> lobby join (payload u32 = 1)

Usage:
    python -m tools.logh7_decode_0030_capture <trace.jsonl> --client-exe <G7MTClient.exe>
    python -m tools.logh7_decode_0030_capture <trace.jsonl>   # uses default installed exe
"""
from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import (
    child_codec_decode,
    child_codec_key_schedule,
    extract_child_codec_static_tables,
)

# Fixed handshake transport key used by the probe harness (a GUID string).
GUID_TRANSPORT_KEY_HEX: Final[str] = (
    "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
)
DEFAULT_CLIENT_EXE: Final[Path] = Path(".omo/work/logh7-installed/exe/G7MTClient.exe")
PHASE1_CODE: Final[int] = 0x0034
TRANSPORT_0030: Final[int] = 0x0030


def checksum16(data: bytes) -> int:
    value = 0
    offset = 0
    while offset + 4 <= len(data):
        value ^= struct.unpack_from("<I", data, offset)[0]
        offset += 4
    while offset < len(data):
        value ^= data[offset]
        offset += 1
    return ((value >> 16) ^ value) & 0xFFFF


def parse_phase1(decoded: bytes) -> tuple[bytes, int]:
    """Return (encipherKey, sequence) from a decoded 0x0034 phase1 payload."""
    key_length = struct.unpack_from(">H", decoded, 2)[0]
    cursor = 4 + key_length
    return decoded[4:cursor], struct.unpack_from(">I", decoded, cursor)[0]


def decode_0030_body(plaintext: bytes) -> dict:
    body_checksum = struct.unpack_from(">H", plaintext, 0)[0]
    message_id = struct.unpack_from(">I", plaintext, 2)[0]
    inner_length = struct.unpack_from(">H", plaintext, 6)[0]
    inner = plaintext[8 : 8 + inner_length]
    inner_code = struct.unpack_from(">H", inner, 0)[0] if len(inner) >= 2 else None
    return {
        "checksumStored": body_checksum,
        "checksumCalc": checksum16(plaintext[2:]),
        "id": message_id,
        "innerLen": inner_length,
        "innerCode": inner_code,
        "innerCodeHex": None if inner_code is None else f"0x{inner_code:04x}",
        "inner": inner.hex(),
        "innerPayload": inner[2:].hex(),
        "plaintext": plaintext.hex(),
    }


def iter_payloads(trace_path: Path):
    for line in trace_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("event") != "payload":
            continue
        raw = event.get("hex")
        if not isinstance(raw, str) or len(raw) < 8:
            continue
        code = int(raw[4:8], 16)
        yield code, bytes.fromhex(raw[8:])  # strip [u16 len][u16 code]


def decode_trace(trace_path: Path, client_exe: Path, transport_key: bytes) -> list[dict]:
    tables = extract_child_codec_static_tables(client_exe)
    scheduled_transport = child_codec_key_schedule(tables, transport_key)
    connections: list[dict] = []
    current: dict | None = None
    for code, body in iter_payloads(trace_path):
        if code == PHASE1_CODE:
            decoded = child_codec_decode(scheduled_transport, body)
            encipher_key, sequence = parse_phase1(decoded)
            current = {
                "encipherKeyHex": encipher_key.hex(),
                "sequence": sequence,
                "scheduled": child_codec_key_schedule(tables, encipher_key),
                "messages": [],
            }
            connections.append(current)
        elif code == TRANSPORT_0030 and current is not None:
            plaintext = child_codec_decode(current["scheduled"], body)
            current["messages"].append(decode_0030_body(plaintext))
    for connection in connections:
        connection.pop("scheduled", None)
    return connections


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace", type=Path)
    parser.add_argument("--client-exe", type=Path, default=DEFAULT_CLIENT_EXE)
    parser.add_argument("--transport-key-hex", default=GUID_TRANSPORT_KEY_HEX)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    connections = decode_trace(
        args.trace, args.client_exe, bytes.fromhex(args.transport_key_hex)
    )
    payload = {"trace": str(args.trace), "connections": connections}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
