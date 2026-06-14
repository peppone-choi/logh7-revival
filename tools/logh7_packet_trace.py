from __future__ import annotations

import json
from pathlib import Path
from typing import Final

JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
HEADER_BYTES: Final[int] = 4


def write_gameplay_trace_analysis(source: Path, destination: Path) -> None:
    events = _read_events(source)
    packets = [_packet_from_event(event) for event in events if event.get("event") in {"payload", "response"}]
    command_ok_responses = [packet for packet in packets if packet["frame"]["kind"] == "command-ok-response-candidate"]
    session_bootstrap_responses = [
        packet for packet in packets if packet["frame"]["kind"] == "session-bootstrap-response-candidate"
    ]
    world_init_responses = [
        packet for packet in packets if packet["frame"]["kind"] == "world-grid-init-response-candidate"
    ]
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "source": str(source),
                "summary": {
                    "connections": sum(1 for event in events if event.get("event") == "connection"),
                    "payloadPackets": sum(1 for packet in packets if packet["direction"] == "client-to-server"),
                    "responsePackets": sum(1 for packet in packets if packet["direction"] == "server-to-client"),
                    "commandOkResponseCandidates": len(command_ok_responses),
                    "postCommandOkClientPackets": _post_command_ok_client_packets(packets),
                    "sessionBootstrapResponseCandidates": len(session_bootstrap_responses),
                    "postSessionBootstrapClientPackets": _post_candidate_client_packets(
                        packets,
                        "session-bootstrap-response-candidate",
                    ),
                    "worldInitResponseCandidates": len(world_init_responses),
                    "postWorldInitClientPackets": _post_candidate_client_packets(
                        packets,
                        "world-grid-init-response-candidate",
                    ),
                    "closes": sum(1 for event in events if event.get("event") == "close"),
                },
                "probeFindings": {
                    "commandOkCandidateRuntimeProbe": _command_ok_probe_finding(packets),
                    "sessionBootstrapCandidateRuntimeProbe": _candidate_probe_finding(
                        packets,
                        "session-bootstrap-response-candidate",
                        "session bootstrap candidate",
                    ),
                    "worldInitCandidateRuntimeProbe": _candidate_probe_finding(
                        packets,
                        "world-grid-init-response-candidate",
                        "world/grid init candidate",
                    ),
                },
                "packets": packets,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def _read_events(source: Path) -> list[dict[str, JsonValue]]:
    events: list[dict[str, JsonValue]] = []
    for line in source.read_text(encoding="utf-8").splitlines():
        if line.strip() == "":
            continue
        loaded = json.loads(line)
        if not isinstance(loaded, dict):
            raise ValueError("gameplay trace lines must be JSON objects")
        events.append(loaded)
    return events


def _packet_from_event(event: dict[str, JsonValue]) -> dict[str, JsonValue]:
    event_kind = str(event["event"])
    packet = bytes.fromhex(_packet_hex(event))
    return {
        "connectionId": _connection_id(event),
        "direction": _direction(event_kind),
        "byteLength": len(packet),
        "hex": packet.hex(),
        "frame": _frame(packet),
    }


def _connection_id(event: dict[str, JsonValue]) -> int:
    match event.get("connectionId"):
        case int(connection_id):
            return connection_id
    return 0


def _packet_hex(event: dict[str, JsonValue]) -> str:
    match event.get("hex"):
        case str(hex_text):
            return hex_text
    match event.get("response"):
        case {"hex": str(hex_text)}:
            return hex_text
    raise ValueError("gameplay trace packet event is missing hex bytes")


def _direction(event_kind: str) -> str:
    if event_kind == "payload":
        return "client-to-server"
    return "server-to-client"


def _frame(packet: bytes) -> dict[str, JsonValue]:
    if len(packet) < HEADER_BYTES:
        return {"kind": "malformed", "reason": "packet shorter than 4-byte LOGH VII frame header"}
    declared = int.from_bytes(packet[:2], "big")
    code = int.from_bytes(packet[2:4], "big")
    body = packet[4:]
    length_matches = len(packet) == declared + 2
    return {
        "kind": _frame_kind(declared, code, length_matches),
        "declaredPayloadLength": declared,
        "messageCode": code,
        "messageCodeHex": f"0x{code:04x}",
        "bodyLength": len(body),
        "bodyHex": body.hex(),
        "lengthMatches": length_matches,
        **_command_ok_fields(declared, code, length_matches),
        **_session_bootstrap_fields(code, length_matches),
        **_world_init_fields(code, length_matches),
    }


def _frame_kind(declared: int, code: int, length_matches: bool) -> str:
    if not length_matches:
        return "malformed-length"
    if declared == 26 and code == 0x0034:
        return "observed-login-request"
    if code == 0x0035:
        return "phase3-response-candidate"
    if declared == 10 and code == 0x0036:
        return "observed-post-phase3-client-packet"
    if declared == 50 and code == 0x0030:
        return "observed-post-handshake-client-packet"
    if code in {0x0031, 0x0032, 0x0033} and _command_ok_decoded_bytes(declared, code) is not None:
        return "command-ok-response-candidate"
    if code in {0x0001, 0x0003}:
        return "session-bootstrap-response-candidate"
    if code in {0x0013, 0x0014}:
        return "world-grid-init-response-candidate"
    return "unknown-observed-frame"


def _command_ok_fields(declared: int, code: int, length_matches: bool) -> dict[str, JsonValue]:
    if not length_matches:
        return {}
    decoded_bytes = _command_ok_decoded_bytes(declared, code)
    if decoded_bytes is None:
        return {}
    return {
        "decodedBodyBytes": decoded_bytes,
        "candidateStatus": "constructed command OK response; runtime advancement must be observed separately",
    }


def _command_ok_decoded_bytes(declared: int, code: int) -> int | None:
    if declared == 1058 and code in {0x0031, 0x0033}:
        return 1052
    if declared == 282 and code == 0x0032:
        return 276
    return None


def _session_bootstrap_fields(code: int, length_matches: bool) -> dict[str, JsonValue]:
    if not length_matches:
        return {}
    match code:
        case 0x0001:
            return {
                "messageName": "SSLoginOK",
                "handlerInternalHex": "0x0200",
                "pairedInternalHex": "0x0201",
                "candidateStatus": "constructed session bootstrap response; handler execution must be observed separately",
            }
        case 0x0003:
            return {
                "messageName": "SSGameLoginOK",
                "handlerInternalHex": "0x0205",
                "pairedInternalHex": "0x0206",
                "candidateStatus": "constructed session bootstrap response; handler execution must be observed separately",
            }
        case _:
            return {}


def _world_init_fields(code: int, length_matches: bool) -> dict[str, JsonValue]:
    if not length_matches:
        return {}
    match code:
        case 0x0013:
            return {
                "messageName": "ResponseWorldInitialize",
                "queuedInternalHex": "0x0f00",
                "handlerInternalHex": "0x0f01",
                "candidateStatus": "constructed world init response; handler execution must be observed separately",
            }
        case 0x0014:
            return {
                "messageName": "ResponseGridInitialize",
                "queuedInternalHex": "0x0f02",
                "handlerInternalHex": "0x0f03",
                "candidateStatus": "constructed grid init response; handler execution must be observed separately",
            }
        case _:
            return {}


def _post_command_ok_client_packets(packets: list[dict[str, JsonValue]]) -> int:
    return _post_candidate_client_packets(packets, "command-ok-response-candidate")


def _post_candidate_client_packets(packets: list[dict[str, JsonValue]], candidate_kind: str) -> int:
    seen_candidate = False
    count = 0
    for packet in packets:
        if packet["frame"]["kind"] == candidate_kind:
            seen_candidate = True
            continue
        if seen_candidate and packet["direction"] == "client-to-server":
            count += 1
    return count


def _command_ok_probe_finding(packets: list[dict[str, JsonValue]]) -> str:
    return _candidate_probe_finding(packets, "command-ok-response-candidate", "command OK candidate")


def _candidate_probe_finding(packets: list[dict[str, JsonValue]], candidate_kind: str, label: str) -> str:
    has_candidate = any(packet["frame"]["kind"] == candidate_kind for packet in packets)
    if not has_candidate:
        return f"no {label} response in trace"
    if _post_candidate_client_packets(packets, candidate_kind) == 0:
        return f"no client packet after {label}"
    return f"client packet observed after {label}"
