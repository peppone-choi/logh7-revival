from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_child_codec import (
    CHILD_CODEC_BLOCK_SIZE,
    ChildCodecStaticTables,
    child_codec_decode,
    child_codec_key_schedule,
    extract_child_codec_static_tables,
)
from tools.logh7_cipher import (
    Phase1DecodedPayload,
    Phase2DecodedPayload,
    Phase3DecodedPayload,
    parse_phase1_decoded_payload,
    parse_phase2_decoded_payload,
    parse_phase3_decoded_payload,
)

ParsedPhasePayload = Phase1DecodedPayload | Phase2DecodedPayload | Phase3DecodedPayload
PhaseParser = Callable[[bytes], ParsedPhasePayload]


@dataclass(frozen=True, slots=True)
class PhaseParseMatch:
    phase: str
    trimmed_zero_padding: int
    payload: ParsedPhasePayload


@dataclass(frozen=True, slots=True)
class RequestBodyClassification:
    key_label: str
    key_hex: str
    aligned: bool
    decoded_hex: str | None
    parsed_payload: PhaseParseMatch | None
    parse_errors: tuple[str, ...]

    def to_json(self) -> dict[str, object]:
        parsed: dict[str, object] | None = None
        if self.parsed_payload is not None:
            parsed = {
                "phase": self.parsed_payload.phase,
                "trimmedZeroPadding": self.parsed_payload.trimmed_zero_padding,
                "payload": _payload_to_json(self.parsed_payload.payload),
            }
        return {
            "keyLabel": self.key_label,
            "keyHex": self.key_hex,
            "aligned": self.aligned,
            "decodedHex": self.decoded_hex,
            "parsedPayload": parsed,
            "parseErrors": list(self.parse_errors),
        }


def classify_child_codec_request_body(
    tables: ChildCodecStaticTables,
    request_body: bytes,
    candidate_keys: tuple[bytes, ...],
) -> tuple[RequestBodyClassification, ...]:
    if len(request_body) % CHILD_CODEC_BLOCK_SIZE != 0:
        return tuple(
            RequestBodyClassification(
                key_label=_key_label(key),
                key_hex=key.hex(),
                aligned=False,
                decoded_hex=None,
                parsed_payload=None,
                parse_errors=("child codec encoded data must be 8-byte aligned",),
            )
            for key in candidate_keys
        )

    results: list[RequestBodyClassification] = []
    for key in candidate_keys:
        decoded = child_codec_decode(child_codec_key_schedule(tables, key), request_body)
        parsed_payload, parse_errors = _parse_any_phase_payload(decoded)
        results.append(
            RequestBodyClassification(
                key_label=_key_label(key),
                key_hex=key.hex(),
                aligned=True,
                decoded_hex=decoded.hex(),
                parsed_payload=parsed_payload,
                parse_errors=tuple(parse_errors),
            )
        )
    return tuple(results)


def _parse_any_phase_payload(decoded: bytes) -> tuple[PhaseParseMatch | None, list[str]]:
    parsers: tuple[tuple[str, PhaseParser], ...] = (
        ("phase1", parse_phase1_decoded_payload),
        ("phase2", parse_phase2_decoded_payload),
        ("phase3", parse_phase3_decoded_payload),
    )
    errors: list[str] = []
    for phase, parser in parsers:
        last_error = ""
        for trim in range(CHILD_CODEC_BLOCK_SIZE):
            if trim != 0 and decoded[-trim:] != bytes(trim):
                continue
            candidate = decoded[:-trim] if trim != 0 else decoded
            try:
                return PhaseParseMatch(phase=phase, trimmed_zero_padding=trim, payload=parser(candidate)), []
            except ValueError as exc:
                last_error = str(exc)
        errors.append(last_error)
    return None, errors


def _payload_to_json(payload: ParsedPhasePayload) -> dict[str, object]:
    if isinstance(payload, Phase1DecodedPayload):
        return {"keyHex": payload.key.hex(), "sequence": payload.sequence}
    if isinstance(payload, Phase2DecodedPayload):
        return {
            "remoteKeyHex": payload.remote_key.hex(),
            "storedKeyHex": payload.stored_key.hex(),
            "sequence": payload.sequence,
        }
    return {
        "encipherKeyHex": payload.encipher_key.hex(),
        "decipherKeyHex": payload.decipher_key.hex(),
        "sequence": payload.sequence,
    }


def _key_label(key: bytes) -> str:
    try:
        decoded = key.decode("ascii")
    except UnicodeDecodeError:
        return key.hex()
    if all(0x20 <= item <= 0x7E for item in key):
        return decoded
    return key.hex()


def _parse_key_argument(value: str) -> bytes:
    if value.startswith("hex:"):
        return bytes.fromhex(value.removeprefix("hex:"))
    return value.encode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser(description="Classify LOGH VII child-codec request bodies.")
    parser.add_argument("--client-exe", required=True, type=Path)
    parser.add_argument("--body-hex", required=True)
    parser.add_argument("--key", action="append", required=True, help="ASCII key, or hex:<bytes>")
    args = parser.parse_args()

    tables = extract_child_codec_static_tables(args.client_exe)
    classifications = classify_child_codec_request_body(
        tables,
        bytes.fromhex(args.body_hex),
        tuple(_parse_key_argument(item) for item in args.key),
    )
    print(json.dumps([item.to_json() for item in classifications], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
