from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypedDict

from logh7_iso import PipelineError


ASCII_PATTERN: Final[re.Pattern[bytes]] = re.compile(rb"[\x20-\x7e]{4,}")
MESSAGE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(?:Lobby|SS|Sys|Request|Response|Command|Notify|CHANGESERVER|LB_|ACCOUNT_)[A-Za-z0-9_]+$"
)
CipherHandshakeValue = (
    list[dict[str, int | str | list[int] | list[str]]] | dict[str, str | list[int] | list[str]]
)


class ProtocolDefaultsJson(TypedDict):
    account: str | None
    loginServerPort: int | None
    loginServerAddress: str | None


class CommandLineModeJson(TypedDict):
    mode: str
    usage: str


class ClientProtocolIndexJson(TypedDict):
    source: str
    defaults: ProtocolDefaultsJson
    commandLineModes: list[CommandLineModeJson]
    messageGroups: dict[str, list[str]]
    messageCodes: dict[str, list[dict[str, int | str]]]
    cipherHandshake: dict[str, CipherHandshakeValue]
    evidence: dict[str, str]


@dataclass(frozen=True, slots=True)
class ProtocolDefaults:
    account: str | None
    login_server_port: int | None
    login_server_address: str | None

    def to_json(self) -> ProtocolDefaultsJson:
        return {
            "account": self.account,
            "loginServerPort": self.login_server_port,
            "loginServerAddress": self.login_server_address,
        }


def _ascii_strings(raw: bytes) -> list[str]:
    return [match.group().decode("ascii") for match in ASCII_PATTERN.finditer(raw)]


def _first_present(strings: list[str], candidates: set[str]) -> str | None:
    for item in strings:
        if item in candidates:
            return item
    return None


def _defaults(strings: list[str]) -> ProtocolDefaults:
    port_text = _first_present(strings, {"47900"})
    return ProtocolDefaults(
        account=_first_present(strings, {"ginei00"}),
        login_server_port=int(port_text) if port_text is not None else None,
        login_server_address=_first_present(strings, {"127.0.0.1", "202.8.80.179"}),
    )


def _command_line_modes(strings: list[str]) -> list[CommandLineModeJson]:
    modes: list[CommandLineModeJson] = []
    for item in strings:
        if item.startswith("usage : >robot "):
            modes.append({"mode": "robot", "usage": item})
    return modes


def _message_group(symbol: str) -> str | None:
    if symbol.startswith(("Lobby", "SysLobby", "SysLogin", "LG", "LB_", "ACCOUNT_")):
        return "login"
    if symbol.startswith(("SS", "SysSession", "CHANGESERVER")):
        return "session"
    if symbol.startswith(("RequestWorld", "ResponseWorld", "RequestGrid", "ResponseGrid")):
        return "world"
    if symbol.startswith(("Request", "Response", "Command", "Notify", "Sys")):
        return "game"
    return None


def _message_groups(strings: list[str]) -> dict[str, list[str]]:
    groups: dict[str, set[str]] = {"login": set(), "session": set(), "world": set(), "game": set()}
    for item in strings:
        if MESSAGE_PATTERN.match(item) is None:
            continue
        group = _message_group(item)
        if group is not None:
            groups[group].add(item)
    return {group: sorted(values) for group, values in groups.items() if values}


LOGIN_MESSAGE_ORDER: Final[tuple[str, ...]] = (
    "LobbyLoginRequest",
    "LobbyLoginOK",
    "LobbyLoginNG",
    "LobbyRequestInformationCharacterCharge",
    "LobbyResponseInformationCharacterCharge",
    "LobbyRequestInformationSession",
    "LobbyResponseInformationSession",
    "LobbyCommandExtensionCharacterCharge",
    "LobbyCommandDeleteCharacter",
    "LobbySessionLoginRequest",
    "LobbySessionLoginOK",
    "LobbySessionLoginNG",
)


def _message_codes(strings: list[str]) -> dict[str, list[dict[str, int | str]]]:
    if not all(name in strings for name in LOGIN_MESSAGE_ORDER):
        return {}
    return {
        "login": [
            {"code": 0x2000 + index, "hex": f"0x{0x2000 + index:04x}", "name": name}
            for index, name in enumerate(LOGIN_MESSAGE_ORDER)
        ]
    }


def _cipher_handshake(strings: list[str]) -> dict[str, CipherHandshakeValue]:
    phases: dict[str, set[str]] = {}
    prefix = "[mpsCipherManager] "
    for item in strings:
        if not item.startswith(prefix):
            continue
        phase, separator, diagnostic = item.removeprefix(prefix).partition(": ")
        if separator == "":
            continue
        phases.setdefault(phase, set()).add(diagnostic)
    handshake: dict[str, CipherHandshakeValue] = {}
    if phases:
        handshake["phases"] = [
            {"phase": phase, "diagnostics": sorted(diagnostics)}
            for phase, diagnostics in sorted(phases.items())
        ]
    if "exchange_key_phase3" in phases:
        handshake["transportCodes"] = [
            {
                "code": 0x0034,
                "hex": "0x0034",
                "direction": "client-to-server",
                "role": "observed 28-byte generated-client login/cipher request",
            },
            {
                "code": 0x0035,
                "hex": "0x0035",
                "direction": "server-to-client",
                "role": "runtime-routed exchange_key_phase3 param2 response",
            },
        ]
        handshake["transportDispatch"] = [
            {
                "transportCode": 0x0030,
                "transportHex": "0x0030",
                "internalCode": 0x0300,
                "internalHex": "0x0300",
                "pairedInternalCode": 0x0301,
                "pairedInternalHex": "0x0301",
                "targetVirtualAddress": "0x004b7d6d",
                "stateGate": "cipher-enabled flag at client offset 0x35837e",
                "sideEffects": ["stores timestamp/gettick result at client+0x357eac"],
                "evidence": "g014-transport-dispatch-index.json",
            },
            {
                "transportCode": 0x0034,
                "transportHex": "0x0034",
                "internalCode": 0x0405,
                "internalHex": "0x0405",
                "pairedInternalCode": None,
                "pairedInternalHex": None,
                "targetVirtualAddress": "0x004b7e26",
                "stateGate": "cipher-enabled flag at client offset 0x35837e",
                "sideEffects": [],
                "evidence": "g014-transport-dispatch-index.json",
            },
            {
                "transportCode": 0x0035,
                "transportHex": "0x0035",
                "internalCode": 0x0406,
                "internalHex": "0x0406",
                "pairedInternalCode": None,
                "pairedInternalHex": None,
                "targetVirtualAddress": "0x004b7e3e",
                "stateGate": "cipher-enabled flag at client offset 0x35837e",
                "sideEffects": [],
                "evidence": "g014-transport-dispatch-index.json",
            },
            {
                "transportCode": 0x0036,
                "transportHex": "0x0036",
                "internalCode": 0x040C,
                "internalHex": "0x040c",
                "pairedInternalCode": 0x040C,
                "pairedInternalHex": "0x040c",
                "targetVirtualAddress": "0x004b7e56",
                "stateGate": "cipher-enabled flag at client offset 0x35837e",
                "sideEffects": [],
                "evidence": "g014-transport-dispatch-index.json",
            },
        ]
        handshake["phase3Param2Observations"] = [
            {
                "bodyLengths": [0],
                "diagnostic": "param2 length is illegal(checksum)",
                "evidence": "g005-code0035-length-sweep.qa.txt",
            },
            {
                "bodyLengths": [1, 2, 3, 4, 5, 6, 7, 12, 20],
                "diagnostic": "illegal param2",
                "evidence": "g005-code0035-length-sweep.qa.txt",
            },
            {
                "bodyLengths": [8, 16, 24, 32, 48, 64],
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-code0035-length-sweep.qa.txt",
            },
        ]
        handshake["adjacentTransportProbe"] = {
            "codes": ["0x0034", "0x0036"],
            "bodyLengths": [0, 8, 32],
            "result": "one login request then EOF, no mpsCipherManager stderr",
            "evidence": "g005-adjacent-transport-probes.qa.txt",
        }
        handshake["requestDerivedPhase3Probe"] = [
            {
                "body": "request_body24",
                "diagnostic": "broken data",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body24_pad8",
                "diagnostic": "broken data",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body_twice48",
                "diagnostic": "broken data",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body24_sum_be",
                "diagnostic": "illegal param2",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body24_sum_le",
                "diagnostic": "illegal param2",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body24_xorff",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_body24_reverse",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_first8",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_first16",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
            {
                "body": "request_last16",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-request-derived-phase3-probes.qa.txt",
            },
        ]
        handshake["phase3DecodedPayloadLayout"] = [
            {
                "offset": 0,
                "field": "checksum",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "offset": 2,
                "field": "encipherKeyLength",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "offset": 4,
                "field": "encipherKeyData",
                "size": "encipherKeyLength",
                "byteOrder": "raw",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "offset": "4 + encipherKeyLength",
                "field": "decipherKeyLength",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "offset": "6 + encipherKeyLength",
                "field": "decipherKeyData",
                "size": "decipherKeyLength",
                "byteOrder": "raw",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "offset": "6 + encipherKeyLength + decipherKeyLength",
                "field": "sequence",
                "size": 4,
                "byteOrder": "network",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
        ]
        handshake["phase3ChecksumAlgorithm"] = {
            "storedField": "decodedPayload[0:2] network-order checksum",
            "coverage": "decodedPayload[2:] through sequence dword",
            "reduction": "xor little-endian dwords and trailing bytes, then fold high16 xor low16",
            "compareAddress": "0x645905",
            "evidence": "g005-cipher-phase-disasm.txt",
        }
        handshake["phase3WireEncoding"] = {
            "status": "unresolved",
            "reason": "phase3 parser first calls the cipher vtable decode path before applying this layout",
            "decodeEntryAddress": "0x64568e",
            "evidence": "g005-cipher-phase-disasm.txt",
        }
        handshake["phase3DecodedPayloadRawWireProbe"] = [
            {
                "body": "decoded_empty_keys_seq1",
                "diagnostic": "illegal param2",
                "evidence": "g005-decoded-phase3-raw-wire-probes.qa.txt",
            },
            {
                "body": "decoded_short_keys_seq1",
                "diagnostic": "param2 length is illegal(encipher)",
                "evidence": "g005-decoded-phase3-raw-wire-probes.qa.txt",
            },
        ]
        handshake["phase1DecodedPayloadLayout"] = [
            {
                "offset": 0,
                "field": "checksum",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": 2,
                "field": "keyLength",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": 4,
                "field": "keyData",
                "size": "keyLength",
                "byteOrder": "raw",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": "4 + keyLength",
                "field": "sequence",
                "size": 4,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
        ]
        handshake["phase2DecodedPayloadLayout"] = [
            {
                "offset": 0,
                "field": "checksum",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": 2,
                "field": "remoteKeyLength",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": 4,
                "field": "remoteKeyData",
                "size": "remoteKeyLength",
                "byteOrder": "raw",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": "4 + remoteKeyLength",
                "field": "storedKeyLength",
                "size": 2,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": "6 + remoteKeyLength",
                "field": "storedKeyData",
                "size": "storedKeyLength",
                "byteOrder": "raw",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
            {
                "offset": "6 + remoteKeyLength + storedKeyLength",
                "field": "sequence",
                "size": 4,
                "byteOrder": "network",
                "evidence": "g005-phase1-phase2-layouts.txt",
            },
        ]
        handshake["decodedPayloadImplementation"] = {
            "helpers": [
                "build_phase1_decoded_payload",
                "parse_phase1_decoded_payload",
                "build_phase2_decoded_payload",
                "parse_phase2_decoded_payload",
                "build_phase3_decoded_payload",
                "parse_phase3_decoded_payload",
            ],
            "checksumHelper": "phase3_decoded_checksum",
            "wireCodecStatus": "phase3 decoded payload can be wrapped in child-codec encrypted transport frames; live phase keys pending",
            "evidence": "g005-phase3-child-codec-response-python-green.txt",
        }
        handshake["phase3ProcessingPipeline"] = [
            {
                "step": "decodeRawParam2",
                "objectOffset": "manager+0x04",
                "vtableSlot": "0x10",
                "callAddress": "0x64568e",
                "resolvedTarget": "0x614460",
                "failureDiagnostic": "illegal param2",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "step": "compareEncipherKey",
                "objectOffset": "manager+0x08",
                "vtableSlot": "0x08",
                "callAddress": "0x645792",
                "failureDiagnostic": "disagree with encipher key length/data",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "step": "applyDecipherKey",
                "objectOffset": "manager+0x0c",
                "vtableSlot": "0x04",
                "callAddress": "0x64593f",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
            {
                "step": "encodePhase3Reply",
                "objectOffset": "manager+0x04",
                "vtableSlot": "0x0c",
                "callAddress": "0x645a53",
                "resolvedTarget": "0x614100",
                "evidence": "g005-cipher-phase-disasm.txt",
            },
        ]
        handshake["phase3ChildCodecVtable"] = {
            "constructor": "0x613fc0",
            "vtableAddress": "0x681fc8",
            "injectedIntoManagerFields": ["manager+0x04", "manager+0x08", "manager+0x0c"],
            "evidence": "g005-child-codec-vtable.txt",
            "slots": [
                {
                    "slot": "0x0c",
                    "target": "0x614100",
                    "role": "encode output buffer with bit/byte packing",
                },
                {
                    "slot": "0x10",
                    "target": "0x614460",
                    "role": "decode raw 8-byte-aligned input through block transform",
                },
            ],
        }
        handshake["phase3ChildCodecBlockTransform"] = {
            "family": "Blowfish-like Feistel block cipher",
            "blockSizeBytes": 8,
            "rounds": 16,
            "pArrayDwords": 18,
            "sBoxes": 4,
            "sBoxEntriesPerBox": 256,
            "staticTableMask": "xor 0x91",
            "decodeLengthRule": "input length must be 8-byte aligned",
            "encodePaddingRule": "zero-pad to the next 8-byte boundary",
            "roundFunction": "((S1[b2] + S0[b3]) xor S2[b1]) + S3[b0]",
            "keyScheduleEntry": "0x613ad0",
            "roundFunctionEntry": "0x613f20",
            "decodeEntry": "0x614460",
            "encodeEntry": "0x614100",
            "evidence": "g005-child-codec-block-transform.txt",
        }
        handshake["childCodecStaticTableImplementation"] = {
            "helpers": [
                "extract_child_codec_static_tables",
                "child_codec_round_function",
                "child_codec_key_schedule",
                "child_codec_encode",
                "child_codec_decode",
                "build_phase3_child_codec_transport_frame",
            ],
            "pArrayVirtualAddress": "0x007b6ae4",
            "sBoxesVirtualAddress": "0x007b6ba8",
            "tableMask": "xor 0x91",
            "pArrayDwords": 18,
            "sBoxes": 4,
            "sBoxEntriesPerBox": 256,
            "blockCodecStatus": (
                "static tables, key schedule, block encode/decode, phase3 encrypted frame builder, "
                "and live phase1 replay implemented"
            ),
            "evidence": "g012-live-replay-after-codec-fix.json",
        }
        handshake["phase3ConfiguredResponseSchema"] = {
            "manifestPath": "server.gameplay.loginResponse",
            "requestCode": 0x0034,
            "responseFrameCode": 0x0035,
            "frameHex": "full LOGH transport frame, not body-only",
            "policy": "server emits this candidate only when manifest explicitly configures it",
            "evidence": "g005-phase3-child-codec-response-server-green.txt",
        }
        handshake["phase3ChildCodecKeyFlow"] = {
            "keySetupWrapper": "0x6140c0",
            "keyScheduleEntry": "0x613ad0",
            "storedKeyHelper": "0x614810",
            "keyReadHelper": "0x6148a0",
            "storedKeyMask": "xor 0x17",
            "storedKeyFields": {
                "dataPointer": "codec+0x04",
                "lengthWord": "codec+0x08",
            },
            "keySetupInputs": [
                "P-array pointer at codec+0x0c",
                "S-box pointer array at codec+0x10",
                "raw key bytes",
                "raw key length",
            ],
            "managerInjection": [
                {
                    "field": "manager+0x04",
                    "role": "raw transport codec for phase payload decode/encode",
                },
                {
                    "field": "manager+0x08",
                    "role": "encipher-key source used by phase3 comparison",
                },
                {
                    "field": "manager+0x0c",
                    "role": "decipher-key target applied by phase2/phase3",
                },
            ],
            "phase2InboundApply": "0x645478 calls manager+0x0c slot 0x04 with decoded key bytes",
            "phase3Compare": "0x645792 calls manager+0x08 slot 0x08 to compare stored encipher key",
            "phase3Apply": "0x64593f calls manager+0x0c slot 0x04 with decoded decipher key",
            "evidence": "g005-child-codec-key-flow.txt",
        }
        handshake["requestBodyKeyAnalysis"] = {
            "helper": "classify_child_codec_request_body",
            "observedRequestCode": "0x0034",
            "observedBodyLengthBytes": 24,
            "rejectedStaticKeys": ["abcd", "ginei00", "dummy", "127.0.0.1", "47900"],
            "rejectedRuntimeKeys": [
                "keySetupWrapper login GUID raw key",
                "keySetupWrapper login session raw key",
                "keyReadHelper phase1 outbound stored image",
                "keyReadHelper phase1 outbound raw xor-0x17 key",
            ],
            "rejectionReason": (
                "child-codec decode with each static/runtime candidate fails "
                "phase1/phase2/phase3 decoded-payload checksums"
            ),
            "postCallOutputStatus": (
                "0x6452cc post-call trace captures the exact encoded 0x0034 body before "
                "the caller frees or reuses the output holder"
            ),
            "pythonReplayStatus": (
                "corrected block round order reproduces the live 0x0034 body from captured plaintext "
                "and active transport key"
            ),
            "nextTracePoint": "classify and respond to post-handshake 0x0036 and 0x0030 client packets",
            "evidence": "g012-live-replay-after-codec-fix.json",
        }
        handshake["phase1DerivedResponseProbe"] = {
            "method": "phase1-derived-guid response built from live 0x0034 request",
            "responseMode": "phase1-derived-guid",
            "requestFrameHex": (
                "001a00345f01cbef3174ecd32d76704509ef162c268ea3b677430ca6"
            ),
            "responseFrameHex": (
                "002200357bdb991d9bdb890d2d76704509ef162c792503075087dea4d3c14951975330d7"
            ),
            "observedFollowupFrames": [
                {
                    "code": 0x0036,
                    "hex": "0x0036",
                    "frameHex": "000a003629af89de470c6280",
                    "declaredPayloadLength": 10,
                    "bodyLength": 8,
                },
                {
                    "code": 0x0030,
                    "hex": "0x0030",
                    "frameHex": (
                        "00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0"
                        "a2d83d54a1fcb9bcd135d389f3b40cdb78ef"
                    ),
                    "declaredPayloadLength": 50,
                    "bodyLength": 48,
                },
            ],
            "stderr": "",
            "result": "advances past phase3 encipher failure and emits post-handshake packets",
            "evidence": "g013-phase1-derived-real-client-probe.txt",
        }
        handshake["postHandshakeDispatchFindings"] = {
            "helper": "transport-dispatch-index",
            "jumpTableVirtualAddress": "0x004b864c",
            "dispatchTailVirtualAddress": "0x004b78ef",
            "observedClientPackets": ["0x0036", "0x0030"],
            "mappings": [
                {
                    "transportHex": "0x0036",
                    "internalHex": "0x040c",
                    "pairedInternalHex": "0x040c",
                    "targetVirtualAddress": "0x004b7e56",
                },
                {
                    "transportHex": "0x0030",
                    "internalHex": "0x0300",
                    "pairedInternalHex": "0x0301",
                    "targetVirtualAddress": "0x004b7d6d",
                    "sideEffects": ["stores timestamp/gettick result at client+0x357eac"],
                },
            ],
            "nextTracePoint": "instrument or reverse internal 0x040c and 0x0300/0x0301 handlers",
            "evidence": "g014-transport-dispatch-index.json",
        }
        handshake["postHandshakeHandlerFindings"] = {
            "helper": "post-handshake-handler-index",
            "entries": [
                {
                    "name": "internal-0x0300-dispatch-route",
                    "virtualAddressHex": "0x004ba316",
                    "internalHex": "0x0300",
                    "transportHex": "0x0030",
                    "pairedAckInternalHex": "0x0301",
                    "directHandlerVirtualAddressHex": None,
                    "routeConclusion": "queued request side; no direct 0x0300 payload handler in internal dispatch",
                },
                {
                    "name": "internal-0x0301-ack-handler",
                    "virtualAddressHex": "0x004ba457",
                    "internalHex": "0x0301",
                    "transportHex": "0x0030",
                    "payloadReads": ["body+0x00 dword"],
                    "stateWrites": [
                        "client+0x432418",
                        "client+0x357eb0",
                        "client+0x357ea8",
                    ],
                },
                {
                    "name": "internal-0x040c-phase4-builder",
                    "virtualAddressHex": "0x00511ae0",
                    "internalHex": "0x040c",
                    "transportHex": "0x0036",
                    "serializedClientOffsets": [
                        "0x30a",
                        "0x30b",
                        "0x312",
                        "0x313",
                        "0x314",
                        "0x30c",
                        "0x30d",
                        "0x30e",
                        "0x310",
                        "0xd14",
                    ],
                },
                {
                    "name": "internal-0x040c-send-trigger",
                    "virtualAddressHex": "0x004c1949",
                    "transportHex": "0x0036",
                    "queuedInternalHex": "0x040c",
                },
            ],
            "nextTracePoint": "decode client 0x0030 body and derive the next proven response body",
            "evidence": "g016-post-handshake-handler-index.json",
        }
        handshake["postHandshakeFollowupAckProbe"] = {
            "method": "send raw 0x0030 dword ack after observed client 0x0036",
            "triggerRequestCode": "0x0036",
            "responseFrameHex": "0006003000000000",
            "observedAfterResponseFrameHex": (
                "0032003079fd0b4ee9fe4d5309b360fc850c8ecfd503d44d8c88aaa2f9f1cd5e2d"
                "b03eb4b9b37d158d5f969bc1297e2e27f8bf7b"
            ),
            "stderr": "",
            "result": "no mpsCipherManager stderr; client still emits 0x0030 then EOF",
            "evidence": "g015-followup-0030-ack-probe.txt",
            "nextTracePoint": "decode client 0x0030 body and determine server response to internal 0x0300/0x0301",
        }
        handshake["postHandshakeBodyDecode"] = {
            "helper": "post-handshake-body-decode",
            "transportHex": "0x0030",
            "requestTransportHex": "0x0034",
            "bodyKeySource": "phase1 key decoded from same connection 0x0034 request",
            "encodedBodyLength": 48,
            "decodedBodyLength": 48,
            "decodedBodyHex": (
                "5517000000010027700047494e370001000000070069006e00650069003000300000"
                "0600640075006d006d0079000000"
            ),
            "stableAcrossRuns": True,
            "observedPhase1Keys": [
                "32f512783e74ec29b4c045adba3497e8",
                "5538753cdec795bcffc0d6b61b8b52ec",
            ],
            "marker": {"offset": 8, "hex": "700047494e37", "asciiPreview": "p.GIN7"},
            "accountLengthField": 7,
            "accountLowByteText": "inei00\x00",
            "passwordLengthField": 6,
            "passwordEvenByteText": "dummy\x00",
            "layoutStatus": "stable decoded 48-byte body across observed runs; field names remain semantic hypotheses",
            "evidence": [
                "g017-post-handshake-body-decode-g013.json",
                "g017-post-handshake-body-decode-g015.json",
            ],
            "nextTracePoint": "derive the server response to decoded 0x0030 login/session body",
        }
        handshake["postHandshakeResponseCandidates"] = {
            "helper": "post-handshake-response-candidates",
            "trigger": "decoded client 0x0030 login/session-like body",
            "candidates": [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "transportTargetVirtualAddressHex": "0x004b7dde",
                    "internalHandlerVirtualAddressHex": "0x004bb5d9",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "transportTargetVirtualAddressHex": "0x004b7df6",
                    "internalHandlerVirtualAddressHex": "0x004bb63a",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "transportTargetVirtualAddressHex": "0x004b7e0e",
                    "internalHandlerVirtualAddressHex": "0x004bb670",
                    "stateGate": "cipher-enabled flag at client offset 0x35837e",
                    "responseStatus": "candidate only; payload schema not yet proven",
                },
            ],
            "evidence": "g018-post-handshake-response-candidates.json",
            "nextTracePoint": "reverse payload layout for internal 0x0400/0x0401/0x0402",
        }
        handshake["post0030PayloadLayout"] = {
            "helper": "post-0030-payload-layout",
            "trigger": "decoded client 0x0030 login/session-like body",
            "entries": [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "handlerVirtualAddressHex": "0x004bb5d9",
                    "messageName": "CommandMoveShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x4327cc",
                    "copiedDwords": 263,
                    "copiedBytes": 1052,
                    "followupCallVirtualAddressHex": "0x004be8f0",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "handlerVirtualAddressHex": "0x004bb63a",
                    "messageName": "CommandTurnShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x432be8",
                    "copiedDwords": 69,
                    "copiedBytes": 276,
                    "followupCallVirtualAddressHex": "0x004bef70",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "handlerVirtualAddressHex": "0x004bb670",
                    "messageName": "CommandParallelMoveShip OK",
                    "decodedBodySource": "decoded body pointer in ebx",
                    "lengthOrStatusRead": "body+0x08 dword",
                    "clientStateDestination": "client+0x432cfc",
                    "copiedDwords": 263,
                    "copiedBytes": 1052,
                    "followupCallVirtualAddressHex": "0x004bf320",
                    "dispatchFlag": 0,
                    "responseStatus": "layout only; body field semantics not yet proven",
                },
            ],
            "evidence": "g019-post-0030-payload-layout.json",
            "nextTracePoint": "derive encrypted body construction for 0x0031/0x0032/0x0033",
        }
        handshake["post0030FollowupEffects"] = {
            "helper": "post-0030-followup-effects",
            "trigger": "candidate post-0x0030 command OK decoded bodies",
            "entries": [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "messageName": "CommandMoveShip OK",
                    "followupVirtualAddressHex": "0x004be8f0",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 2,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 2"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 20,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "body+0x0290 dword",
                        "normalizer scratch vector",
                        "body+0x0298 byte secondary count",
                        "body+0x029c secondary array",
                        "body+0x0294 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "messageName": "CommandTurnShip OK",
                    "followupVirtualAddressHex": "0x004bef70",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 3,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 3"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 8,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "literal 0x3f800000 float",
                        "stack vector from entity+0x14/entity+0x18/entity+0x1c",
                        "literal waypoint count 1",
                        "normalizer scratch vector",
                        "body+0x0110 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "messageName": "CommandParallelMoveShip OK",
                    "followupVirtualAddressHex": "0x004bf320",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 4,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 4"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 20,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "body+0x0290 dword",
                        "normalizer scratch vector",
                        "body+0x0298 byte secondary count",
                        "body+0x029c secondary array",
                        "body+0x0294 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
            ],
            "evidence": "g020-post-0030-followup-effects.json",
            "nextTracePoint": "derive command OK decoded body fields before enabling responses",
        }
        handshake["commandOkDecodedLayouts"] = {
            "helper": "command-ok-layout",
            "trigger": "candidate 0x0031/0x0032/0x0033 command OK decoded bodies",
            "entries": [
                {
                    "transportHex": "0x0031",
                    "messageName": "CommandMoveShip OK",
                    "decodedBodyBytes": 1052,
                    "outputToStreamVirtualAddressHex": "0x00492930",
                    "inputFromStreamVirtualAddressHex": "0x0049a680",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 20,
                        "streamSlots": ["0x20", "0x1c", "0x1c", "0x1c", "0x1c"],
                    },
                    "postArrayScalars": [{"offset": "0x0290", "streamSlot": "0x1c"}, {"offset": "0x0294", "streamSlot": "0x1c"}],
                    "secondaryArray": {
                        "countOffset": "0x0298",
                        "maxCount": 32,
                        "entryOffset": "0x029c",
                        "entrySizeBytes": 12,
                        "streamSlots": ["0x1c", "0x1c", "0x1c"],
                    },
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "messageName": "CommandTurnShip OK",
                    "decodedBodyBytes": 276,
                    "outputToStreamVirtualAddressHex": "0x00493030",
                    "inputFromStreamVirtualAddressHex": "0x0049b040",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 8,
                        "streamSlots": ["0x1c", "0x0c"],
                    },
                    "postArrayScalars": [{"offset": "0x0110", "streamSlot": "0x0c"}],
                    "secondaryArray": None,
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "messageName": "CommandParallelMoveShip OK",
                    "decodedBodyBytes": 1052,
                    "outputToStreamVirtualAddressHex": "0x00493570",
                    "inputFromStreamVirtualAddressHex": "0x0049b6c0",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 20,
                        "streamSlots": ["0x20", "0x1c", "0x1c", "0x1c", "0x1c"],
                    },
                    "postArrayScalars": [{"offset": "0x0290", "streamSlot": "0x1c"}, {"offset": "0x0294", "streamSlot": "0x1c"}],
                    "secondaryArray": {
                        "countOffset": "0x0298",
                        "maxCount": 32,
                        "entryOffset": "0x029c",
                        "entrySizeBytes": 12,
                        "streamSlots": ["0x1c", "0x1c", "0x1c"],
                    },
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
            ],
            "evidence": "g021-command-ok-layout.json",
            "nextTracePoint": "construct and runtime-probe encrypted command OK bodies",
        }
        handshake["commandOkConfiguredResponseSchema"] = {
            "manifestPath": "server.gameplay.commandOkResponses",
            "requestCode": 0x0030,
            "candidateResponseFrameCodes": [0x0031, 0x0032, 0x0033],
            "frameHex": "full LOGH transport frame, not body-only",
            "policy": "server emits command OK candidates only when manifest explicitly configures them",
            "builder": "command-ok-response-candidates",
            "candidateStatus": "constructed from proven decoded layouts; runtime probe required",
            "evidence": "g022-command-ok-response-candidates.json",
        }
        handshake["commandOkRuntimeTraceAnalysis"] = {
            "helper": "gameplay-trace-analyze",
            "classifiedResponseCodes": ["0x0031", "0x0032", "0x0033"],
            "signals": ["commandOkResponseCandidates", "postCommandOkClientPackets"],
            "probeFindingField": "probeFindings.commandOkCandidateRuntimeProbe",
            "currentTcpQaFinding": "no client packet after command OK candidate",
            "evidence": "g023-g022-gameplay-trace-analysis.json",
            "nextTracePoint": "run configured command OK candidates against the real client and inspect post-command packets",
        }
        handshake["dynamicGameplayProbeSchema"] = {
            "manifestPath": "server.gameplay.dynamicProbe",
            "source": "real G7MTClient.exe child codec static tables",
            "phase3": "decode live 0x0034 with configured transport key, then emit 0x0035 using decoded phase1 key",
            "commandOk": "after observed 0x0030, emit configured 0x0031/0x0032/0x0033 using same connection phase1 key",
            "requiredFields": ["clientExePath", "transportKeyHex", "decipherKeyHex", "commandOkResponseCode", "evidence", "policy"],
            "optionalFields": {"commandOkEntityKey": "uint32 primaryEntry+0x00 dword for one-entry command OK body probes"},
            "policy": "explicit runtime probe only; default gameplay server remains record-only",
            "evidence": "g024-dynamic-server-green.txt",
            "nextTracePoint": "run dynamicProbe against the real Windows client and inspect command OK follow-up packets",
        }
        handshake["runtimeKeyProbeFindings"] = {
            "debugAttach": {
                "method": "DebugActiveProcess breakpoints at 0x614810 and 0x6148a0",
                "result": "client exits before key events",
                "events": [],
                "exitProcess": True,
                "evidence": "g005-runtime-key-debug-probe-attach.stdout.txt",
            },
            "memoryScan": {
                "method": "OpenProcess ReadProcessMemory scan for child codec vtable 0x681fc8 and stored-key fields",
                "result": (
                    "real login payload captured but no stored child-codec key objects "
                    "found before/after login"
                ),
                "observedRequestFrameHex": "001a003434fe1eaa3ddb5957b16e1d70dc6f9f452f9849ddd6930a27",
                "beforeLoginKeys": [],
                "afterLoginKeys": [],
                "evidence": "g005-memory-key-scan-high.stdout.txt",
            },
            "keySetupWrapperEntry": {
                "method": "prepatched runtime-keysetup-log-patch with writable code-cave section",
                "result": "captures raw login GUID and login session key setup bytes without debugger attach",
                "observedRequestFrameHex": "001a00344a7929b40e3953f4deaef8a0667bbedddfb1d0e76cf9003b",
                "records": [
                    {
                        "helperReturn": "loginGuidKeySetup.returnAfterKeySetup",
                        "keyLength": 38,
                        "keyHex": "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d",
                    },
                    {
                        "helperReturn": "loginSessionKeySetup.returnAfterKeySetup",
                        "keyLength": 16,
                        "keyHex": "c32eb86b4de5d491af7f0254bc973e52",
                    },
                ],
                "evidence": "g009-kwrap-copy-records.json",
            },
            "keyReadHelperEntry": {
                "method": "prepatched runtime-keyread-log-patch with writable code-cave section",
                "result": "captures phase1 outbound stored key image read before the observed 0x0034 request",
                "observedRequestFrameHex": "001a0034ddd191f97a7e35ccefd8aa61201068586c66beecbbbd2389",
                "storedImageHex": "315ab37d3a44955490c29ba1abdb3f89",
                "rawXor17KeyHex": "264da46a2d53824387d58cb6bccc289e",
                "helperReturn": "phase1OutboundRead.returnAfterKeyRead",
                "evidence": "g009-kread-fieldfix-records.json",
            },
            "childCodecEncodeEntry": {
                "method": "prepatched runtime-child-encode-log-patch with writable code-cave section",
                "result": "captures phase1 decoded plaintext, generated phase1 key, and active transport codec stored key image",
                "observedRequestFrameHex": "001a00349cdd78f9d5e6b5aeeaa4c146b7e434ed4db6bdcb417c39ce",
                "caller": "phase1OutboundEncode.returnAfterChildCodecEncode",
                "decodedPayloadHex": "828400108e901f21bafe36f8233b5d26ec250a1d00000001",
                "phase1GeneratedKeyHex": "8e901f21bafe36f8233b5d26ec250a1d",
                "sequence": 1,
                "transportStoredImageHex": (
                    "6c562354262420232f3a2726222e3a237422233a565255243a2653212f22202220212655246a"
                ),
                "transportRawXor17KeyHex": (
                    "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
                ),
                "outputCaptureStatus": "entry plaintext/key proven; post-call output holder was reused before stable ReadProcessMemory capture",
                "evidence": "g010-child-encode-keycapture-real-records.json",
            },
            "childCodecEncodePostCall": {
                "method": "prepatched runtime-child-encode-post-log-patch with writable code-cave section",
                "result": "captures the encoded output body before caller cleanup; output matches the observed request frame body",
                "observedRequestFrameHex": "001a003488396949581bcc872316b86f23a92d45014cbc56d722012b",
                "caller": "phase1OutboundEncode.returnAfterChildCodecEncode",
                "outputHex": "88396949581bcc872316b86f23a92d45014cbc56d722012b",
                "outputLength": 24,
                "returnValue": 1,
                "outputMatchesObservedRequestBody": True,
                "evidence": "g011-child-post-real-records.json",
            },
            "childCodecEncodeScheduleEntry": {
                "method": "prepatched runtime-child-schedule-log-patch with writable code-cave section",
                "result": "captures active stored key image and scheduled P-array head in the same encode call",
                "observedRequestFrameHex": "001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c",
                "decodedPayloadHex": "4fe30010dbb2f9ab333223792a6f45be98af277300000001",
                "transportRawXor17KeyHex": (
                    "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d"
                ),
                "scheduledPArrayHeadHex": (
                    "07ea4e160fbda36082588d5cd62ab3e31d393f2197ae7d8b"
                    "29d1d7dcec84410e1f8a03a7d6c7b3b33c169a0f7d63d99e"
                    "7fd1cfa050293d2526cc69a008db3c50"
                ),
                "pythonReplayOutputHex": "22785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c",
                "pythonReplayMatchesObservedRequestBody": True,
                "evidence": "g012-live-replay-after-codec-fix.json",
            },
            "nextStrategy": "reverse the 0x0036 and 0x0030 packet handlers and implement the next proven server response",
        }
    return handshake


def build_client_protocol_index(source: Path) -> ClientProtocolIndexJson:
    raw = source.read_bytes()
    strings = _ascii_strings(raw)
    return {
        "source": str(source),
        "defaults": _defaults(strings).to_json(),
        "commandLineModes": _command_line_modes(strings),
        "messageGroups": _message_groups(strings),
        "messageCodes": _message_codes(strings),
        "cipherHandshake": _cipher_handshake(strings),
        "evidence": {
            "sourceKind": "G7MTClient.exe static ASCII strings",
            "responsePolicy": "Do not emit protocol responses until real client advancement is proven.",
        },
    }


def write_client_protocol_index(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise PipelineError(f"client executable not found: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_client_protocol_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
