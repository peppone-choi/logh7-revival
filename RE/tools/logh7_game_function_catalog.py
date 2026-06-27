from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_command_ok_layout import build_command_ok_layout
    from .logh7_entity_pool_prerequisites import build_entity_pool_prerequisite_index
    from .logh7_post_handshake_responses import build_post_handshake_response_candidates
    from .logh7_session_bootstrap import build_session_bootstrap_index
else:
    from logh7_command_ok_layout import build_command_ok_layout
    from logh7_entity_pool_prerequisites import build_entity_pool_prerequisite_index
    from logh7_post_handshake_responses import build_post_handshake_response_candidates
    from logh7_session_bootstrap import build_session_bootstrap_index


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]


@dataclass(frozen=True, slots=True)
class FunctionSurface:
    key: str
    label: str
    asset_terms: tuple[str, ...]
    known_response_family: str | None
    missing_work: tuple[str, ...]


SURFACES: Final[tuple[FunctionSurface, ...]] = (
    FunctionSurface(
        "movement",
        "movement, turn, and parallel movement",
        ("idou", "heikou_idou", "kaiten"),
        "command-ok",
        ("derive non-empty CommandMoveShip/TurnShip/ParallelMoveShip body semantics",),
    ),
    FunctionSurface(
        "combat",
        "attack and weapon fire",
        ("kougeki", "shageki"),
        None,
        ("map combat UI actions to client request transports and server ACK/update responses",),
    ),
    FunctionSurface(
        "logistics",
        "supply, emergency supply, sortie, repair, and retreat",
        ("hokyuu", "kinkyuu", "shutsugeki", "shuuri", "tettai"),
        None,
        ("map logistics commands after world/entity initialization is active",),
    ),
    FunctionSurface(
        "formation",
        "formation, posture, and tactics",
        ("taisei", "tairetsu", "senjutsu"),
        None,
        ("recover formation/tactics request and response handlers",),
    ),
    FunctionSurface(
        "fortress",
        "fortress and fortress gun controls",
        ("yousai", "yousaihou"),
        None,
        ("identify fortress-specific command family and state prerequisites",),
    ),
    FunctionSurface(
        "social",
        "chat, mail, and system communication",
        ("chat", "mail", "system"),
        None,
        ("separate chat/mail transports from unit command transports",),
    ),
)


def build_game_function_catalog(client_exe: Path, installed_root: Path, manual_pdf: Path | None) -> dict[str, JsonValue]:
    session = build_session_bootstrap_index(client_exe)
    entity = build_entity_pool_prerequisite_index(client_exe)
    command_candidates = build_post_handshake_response_candidates(client_exe)
    command_layout = build_command_ok_layout(client_exe)
    command_by_code = {
        str(entry["transportHex"]): entry
        for entry in _json_list(command_layout["entries"])
    }
    command_responses = [
        _merge_command_candidate(candidate, command_by_code)
        for candidate in _json_list(command_candidates["candidates"])
    ]
    return {
        "source": str(client_exe),
        "installedRoot": str(installed_root),
        "manualPdf": _manual_pdf_json(manual_pdf),
        "requirements": _requirements(),
        "responseFamilies": {
            "session-bootstrap": {
                "responses": [_session_response_json(item) for item in _json_list(session["transportResponses"])],
                "negativeRuntimeEvidence": str(session["negativeRuntimeEvidence"]),
                "nextTracePoint": str(session["nextTracePoint"]),
            },
            "world-grid-unit": {
                "worldInitializationFlags": _json_list(entity["worldInitializationFlags"]),
                "unitInformationPrerequisites": _json_list(entity["unitInformationPrerequisites"]),
                "selector1Request": _json_dict(entity["selector1Request"]),
                "nextTracePoint": str(entity["nextTracePoint"]),
            },
            "command-ok": {
                "trigger": str(command_candidates["trigger"]),
                "responses": command_responses,
                "nextTracePoint": str(command_layout["nextTracePoint"]),
            },
        },
        "gameFunctions": _game_functions(installed_root, command_responses),
        "nextReverseEngineeringQueue": [
            "prove low transport framing/session-state prerequisite so SSLoginOK and SSGameLoginOK execute",
            "after cipherGate/sessionReady, serve world/grid/unit initialization and verify selector/entity pools",
            "capture real client request frames per UI function and attach each to a response family",
            "derive non-empty command/update body semantics before enabling combat/logistics/formation commands",
        ],
    }


def write_game_function_catalog(client_exe: Path, installed_root: Path, manual_pdf: Path | None, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_game_function_catalog(client_exe, installed_root, manual_pdf), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )


def _json_list(value: JsonValue) -> list[JsonValue]:
    if isinstance(value, list):
        return value
    raise TypeError("expected JSON list")


def _json_dict(value: JsonValue) -> dict[str, JsonValue]:
    if isinstance(value, dict):
        return value
    raise TypeError("expected JSON object")


def _manual_pdf_json(manual_pdf: Path | None) -> dict[str, JsonValue]:
    if manual_pdf is None:
        return {"path": None, "exists": False, "usage": "not provided"}
    return {
        "path": str(manual_pdf),
        "exists": manual_pdf.exists(),
        "usage": "function-surface reference; current TCP requirements are PE/runtime evidence backed",
        "textExtractionStatus": "not authoritative until Japanese CMap/font extraction is available",
    }


def _requirements() -> list[dict[str, JsonValue]]:
    return [
        {
            "stage": "login-session",
            "mustProve": "SSLoginOK and SSGameLoginOK execute on the real client; SSGameLoginOK must set cipherGate client+0x35837e",
            "neededTcpResponses": ["0x0001", "0x0003"],
            "currentStatus": "blocked by low transport framing/session-state prerequisite",
        },
        {
            "stage": "world-entity-bootstrap",
            "mustProve": "ResponseWorldInitialize, ResponseGridInitialize, and ResponseInformationUnit populate selector/entity pools",
            "neededTcpResponses": ["0x0013", "0x0014", "ResponseInformationUnit"],
            "currentStatus": "cannot be proven until session cipherGate is active",
        },
        {
            "stage": "unit-command-loop",
            "mustProve": "each UI command has a captured client request and matching server ACK/update body",
            "neededTcpResponses": ["0x0031", "0x0032", "0x0033", "unknown command families"],
            "currentStatus": "movement response family is mapped; most function families still need transport discovery",
        },
    ]


def _session_response_json(value: JsonValue) -> dict[str, JsonValue]:
    entry = _json_dict(value)
    return {
        "transportHex": str(entry["transportHex"]),
        "internalHex": str(entry["internalHex"]),
        "messageName": str(entry["messageName"]),
        "stateGate": str(entry.get("stateGate", "")),
    }


def _merge_command_candidate(candidate: JsonValue, layouts: dict[str, JsonValue]) -> dict[str, JsonValue]:
    item = _json_dict(candidate)
    transport_hex = str(item["transportHex"])
    layout = _json_dict(layouts[transport_hex])
    return {
        "transportHex": transport_hex,
        "internalHex": str(item["internalHex"]),
        "messageName": str(layout["messageName"]),
        "decodedBodyBytes": int(layout["decodedBodyBytes"]),
        "layoutStatus": str(layout["layoutStatus"]),
        "responseStatus": str(item["responseStatus"]),
    }


def _game_functions(installed_root: Path, command_responses: list[dict[str, JsonValue]]) -> dict[str, JsonValue]:
    assets = _asset_paths(installed_root)
    result: dict[str, JsonValue] = {}
    for surface in SURFACES:
        evidence = _asset_evidence(assets, surface.asset_terms)
        result[surface.key] = {
            "label": surface.label,
            "assetEvidence": evidence,
            "knownTcpResponses": command_responses if surface.known_response_family == "command-ok" else [],
            "missingWork": list(surface.missing_work),
        }
    return result


def _asset_paths(installed_root: Path) -> list[str]:
    image_root = installed_root / "data/image"
    if not image_root.exists():
        return []
    return sorted(path.relative_to(installed_root).as_posix() for path in image_root.rglob("*.tga") if path.is_file())


def _asset_evidence(assets: list[str], terms: tuple[str, ...]) -> list[str]:
    return [asset for asset in assets if any(term in asset.lower() for term in terms)][:24]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a LOGH VII game-function TCP response catalog.")
    parser.add_argument("client_exe", type=Path)
    parser.add_argument("--installed-root", type=Path, required=True)
    parser.add_argument("--manual-pdf", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_game_function_catalog(args.client_exe, args.installed_root, args.manual_pdf, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
