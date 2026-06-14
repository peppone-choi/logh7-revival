#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from logh7_client_protocol import write_client_protocol_index
from logh7_command_ok_layout import write_command_ok_layout
from logh7_command_ok_response_candidates import write_command_ok_response_candidates
from logh7_extractor import extract_iso_root
from logh7_game_function_catalog import write_game_function_catalog
from logh7_installed_tree import build_installed_tree
from logh7_internal_handlers import write_post_handshake_handler_index
from logh7_iso import InvalidIsoError, IsoImage, PipelineError, read_extent_prefix, read_file_bytes, read_iso
from logh7_message_family_maps import write_message_family_index
from logh7_msgdat import write_msgdat_index
from logh7_packager import PackageError, package_installed_tree
from logh7_pe_inventory import write_pe_inventory
from logh7_post_0030_followups import write_post_0030_followup_effects
from logh7_post_0030_payload_layout import write_post_0030_payload_layout
from logh7_post_handshake_body import write_post_handshake_body_decode
from logh7_post_handshake_responses import write_post_handshake_response_candidates
from logh7_pipeline_runtime import (
    write_gameplay_packet_analysis,
    write_runtime_child_encode_patch,
    write_runtime_child_post_encode_patch,
    write_runtime_child_schedule_patch,
    write_runtime_child_trace_records,
    write_runtime_keylog_patch,
    write_runtime_keylog_records,
    write_runtime_manager,
    write_runtime_manager_callback_patch,
    write_runtime_manager_clear_patch,
    write_runtime_manager_cleanup_patch,
    write_runtime_manager_destructor_patch,
    write_runtime_manager_dispatcher_node_patch,
    write_runtime_manager_dispatcher_patch,
    write_runtime_manager_member_slot_effect_patch,
    write_runtime_manager_member_slot_patch,
    write_runtime_manager_member_slot_tail_patch,
    write_runtime_manager_nested_callback_patch,
    write_runtime_manager_patch,
    write_runtime_manager_state_trigger_patch,
    write_runtime_manager_state_patch,
    write_runtime_keyread_patch,
    write_runtime_keysetup_patch,
    write_runtime_patch_targets,
    write_runtime_queue_append_patch,
    write_runtime_queue_entry_patch,
    write_socket_boundary,
    write_socket_recv_all_patch,
    write_socket_recv_phase3_ring_patch,
    write_socket_recv_phase_ring_patch,
    write_socket_recv_patch,
    write_socket_recv_ring_patch,
    write_socket_recv_window_patch,
)
from logh7_server_discovery import ServerDiscoverySource, discover_server
from logh7_session_bootstrap import write_session_bootstrap_index
from logh7_transport_dispatch import write_transport_dispatch_index


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]


def _parse_ini_fields(raw: bytes) -> dict[str, str]:
    text = raw.decode("cp932")
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        fields[key.strip().lower()] = value.strip()
    return fields


def _cab_kind(raw: bytes) -> str:
    if raw.startswith(b"MSCF"):
        return "microsoft-cab"
    return "installshield-cab"


def _candidate_reason(path: str) -> str:
    if path == "setup.ini":
        return "CP932 InstallShield metadata contains Japanese product, company, and language fields."
    if path == "data1.hdr":
        return "InstallShield header names support, language, and payload groups before CAB extraction."
    if path == "setup.inx":
        return "InstallShield compiled script may contain installer UI strings and install flow logic."
    if path.endswith(".cab"):
        return "InstallShield CAB payload likely contains installed game resources; requires InstallShield-aware extraction."
    if path.endswith(".exe"):
        return "Windows executable may contain launcher strings, icons, or embedded resources."
    return "Candidate file may contain localizable text or patch metadata."


def build_manifest(image: IsoImage) -> dict[str, JsonValue]:
    setup_raw = read_file_bytes(image, "setup.ini")
    setup_fields = _parse_ini_fields(setup_raw) if setup_raw is not None else {}
    cab_entries = []
    for entry in image.entries:
        if not entry.path.endswith(".cab") or entry.is_directory:
            continue
        raw = read_extent_prefix(image.source, entry.extent, entry.size, 4)
        cab_entries.append(
            {
                "path": entry.path,
                "size": entry.size,
                "format": _cab_kind(raw),
                "standard_cab": raw.startswith(b"MSCF"),
            }
        )

    interesting_paths = {
        "setup.ini",
        "data1.hdr",
        "setup.inx",
        "data1.cab",
        "data2.cab",
        "g7start.exe",
    }
    candidates = [
        {"path": entry.path, "size": entry.size, "reason": _candidate_reason(entry.path)}
        for entry in image.entries
        if entry.path in interesting_paths
    ]

    return {
        "source": str(image.source),
        "volume": {
            "system": image.system_identifier,
            "identifier": image.volume_identifier,
        },
        "entries": [
            {"path": entry.path, "size": entry.size, "is_directory": entry.is_directory}
            for entry in image.entries
        ],
        "installer": {
            "setup_ini": {
                "encoding": "cp932" if setup_raw is not None else None,
                "app_name": setup_fields.get("appname"),
                "company_name": setup_fields.get("companyname"),
                "default_language": setup_fields.get("default"),
            },
            "cab_archives": cab_entries,
            "rebuild_note": "ISO root can be inspected without extraction; data*.cab uses InstallShield CAB layout when standard_cab is false.",
        },
        "localization_candidates": candidates,
        "patch_pipeline": [
            "Rebuild MODE2/2352 payload with tools/convert_mode2_bin_to_iso.py before inspection.",
            "Inspect ISO root and CP932 setup metadata with this manifest command.",
            "Use an InstallShield-aware extractor for data1.hdr/data*.cab before editing game resources.",
            "Preserve CP932/Japanese language assumptions until a target resource proves a different encoding.",
        ],
    }


def inspect_iso(source: Path, destination: Path) -> None:
    manifest = build_manifest(read_iso(source))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination}")


def write_iso_root(source: Path, destination: Path, manifest_out: Path) -> None:
    extract_iso_root(read_iso(source), destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_installed_tree(extracted_tree: Path, iso_root: Path, destination: Path, manifest_out: Path) -> None:
    build_installed_tree(extracted_tree, iso_root, destination, manifest_out)
    print(f"wrote {destination}")
    print(f"wrote {manifest_out}")


def write_server_discovery(source: Path, destination: Path) -> None:
    image = read_iso(source)
    discovery = discover_server(
        ServerDiscoverySource(image_source=image.source, read_file_bytes=lambda path: read_file_bytes(image, path))
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(discovery, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination}")


def write_msgdat_schema_index(source: Path, destination: Path) -> None:
    write_msgdat_index(source, destination)
    print(f"wrote {destination}")


def write_client_protocol_schema_index(source: Path, destination: Path) -> None:
    write_client_protocol_index(source, destination)
    print(f"wrote {destination}")


def _add_inspect_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("iso", type=Path)
    inspect_parser.add_argument("--out", type=Path, required=True)


def _add_server_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    server_parser = subparsers.add_parser("discover-server")
    server_parser.add_argument("iso", type=Path)
    server_parser.add_argument("--out", type=Path, required=True)


def _add_extract_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    extract_parser = subparsers.add_parser("extract-root")
    extract_parser.add_argument("iso", type=Path)
    extract_parser.add_argument("--out", type=Path, required=True)
    extract_parser.add_argument("--manifest-out", type=Path, required=True)


def _add_build_installed_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    build_parser = subparsers.add_parser("build-installed")
    build_parser.add_argument("extracted_tree", type=Path)
    build_parser.add_argument("--iso-root", type=Path, required=True)
    build_parser.add_argument("--out", type=Path, required=True)
    build_parser.add_argument("--manifest-out", type=Path, required=True)


def _add_package_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    package_parser = subparsers.add_parser("package-installed")
    package_parser.add_argument("installed_tree", type=Path)
    package_parser.add_argument("--overlay", type=Path)
    package_parser.add_argument("--out", type=Path, required=True)
    package_parser.add_argument("--manifest-out", type=Path, required=True)


def _add_msgdat_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    msgdat_parser = subparsers.add_parser("msgdat-index")
    msgdat_parser.add_argument("source", type=Path)
    msgdat_parser.add_argument("--out", type=Path, required=True)


def _add_client_protocol_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    protocol_parser = subparsers.add_parser("client-protocol-index")
    protocol_parser.add_argument("source", type=Path)
    protocol_parser.add_argument("--out", type=Path, required=True)


def _add_runtime_patch_targets_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    patch_parser = subparsers.add_parser("runtime-patch-targets")
    patch_parser.add_argument("source", type=Path)
    patch_parser.add_argument("--out", type=Path, required=True)


def _add_binary_patch_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser], name: str) -> None:
    patch_parser = subparsers.add_parser(name)
    patch_parser.add_argument("source", type=Path)
    patch_parser.add_argument("--out", type=Path, required=True)
    patch_parser.add_argument("--manifest-out", type=Path, required=True)


def _add_source_out_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser], name: str) -> None:
    source_parser = subparsers.add_parser(name)
    source_parser.add_argument("source", type=Path)
    source_parser.add_argument("--out", type=Path, required=True)


def _add_post_handshake_body_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    body_parser = subparsers.add_parser("post-handshake-body-decode")
    body_parser.add_argument("source", type=Path)
    body_parser.add_argument("--transport-key-hex", required=True)
    body_parser.add_argument("--request-frame-hex", required=True)
    body_parser.add_argument("--post-handshake-frame-hex", required=True)
    body_parser.add_argument("--out", type=Path, required=True)


def _add_command_ok_response_candidates_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    candidates_parser = subparsers.add_parser("command-ok-response-candidates")
    candidates_parser.add_argument("source", type=Path)
    candidates_parser.add_argument("--phase1-key-hex", required=True)
    candidates_parser.add_argument("--entity-key-hex")
    candidates_parser.add_argument("--out", type=Path, required=True)


def _add_game_function_catalog_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    catalog_parser = subparsers.add_parser("game-function-catalog")
    catalog_parser.add_argument("source", type=Path)
    catalog_parser.add_argument("--installed-root", type=Path, required=True)
    catalog_parser.add_argument("--manual-pdf", type=Path)
    catalog_parser.add_argument("--out", type=Path, required=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect and package LOGH VII artifacts for localization work.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    _add_inspect_parser(subparsers)
    _add_server_parser(subparsers)
    _add_extract_parser(subparsers)
    _add_build_installed_parser(subparsers)
    _add_package_parser(subparsers)
    _add_source_out_parser(subparsers, "pe-inventory")
    _add_msgdat_parser(subparsers)
    _add_client_protocol_parser(subparsers)
    _add_source_out_parser(subparsers, "message-family-index")
    _add_source_out_parser(subparsers, "transport-dispatch-index")
    _add_source_out_parser(subparsers, "session-bootstrap-index")
    _add_source_out_parser(subparsers, "post-handshake-handler-index")
    _add_post_handshake_body_parser(subparsers)
    _add_source_out_parser(subparsers, "post-handshake-response-candidates")
    _add_source_out_parser(subparsers, "post-0030-payload-layout")
    _add_source_out_parser(subparsers, "post-0030-followup-effects")
    _add_source_out_parser(subparsers, "command-ok-layout")
    _add_command_ok_response_candidates_parser(subparsers)
    _add_game_function_catalog_parser(subparsers)
    _add_runtime_patch_targets_parser(subparsers)
    _add_source_out_parser(subparsers, "runtime-manager-index")
    _add_binary_patch_parser(subparsers, "runtime-manager-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-clear-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-destructor-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-cleanup-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-callback-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-state-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-dispatcher-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-dispatcher-node-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-nested-callback-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-state-trigger-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-member-slot-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-member-slot-effect-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-manager-member-slot-tail-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-keylog-patch")
    _add_binary_patch_parser(subparsers, "runtime-keysetup-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-keyread-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-child-encode-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-child-encode-post-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-child-schedule-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-queue-append-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-queue-entry-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-all-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-phase3-ring-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-phase-ring-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-ring-log-patch")
    _add_binary_patch_parser(subparsers, "runtime-socket-recv-window-log-patch")
    _add_source_out_parser(subparsers, "runtime-keylog-read")
    _add_source_out_parser(subparsers, "runtime-child-trace-read")
    _add_source_out_parser(subparsers, "gameplay-trace-analyze")
    _add_source_out_parser(subparsers, "socket-boundary-index")
    args = parser.parse_args()

    try:
        match args.command:
            case "inspect":
                inspect_iso(args.iso, args.out)
            case "discover-server":
                write_server_discovery(args.iso, args.out)
            case "extract-root":
                write_iso_root(args.iso, args.out, args.manifest_out)
            case "build-installed":
                write_installed_tree(args.extracted_tree, args.iso_root, args.out, args.manifest_out)
            case "package-installed":
                package_installed_tree(args.installed_tree, args.overlay, args.out, args.manifest_out)
                print(f"wrote {args.out}")
                print(f"wrote {args.manifest_out}")
            case "pe-inventory":
                write_pe_inventory(args.source, args.out)
            case "msgdat-index":
                write_msgdat_schema_index(args.source, args.out)
            case "client-protocol-index":
                write_client_protocol_schema_index(args.source, args.out)
            case "message-family-index":
                write_message_family_index(args.source, args.out)
            case "transport-dispatch-index":
                write_transport_dispatch_index(args.source, args.out)
            case "session-bootstrap-index":
                write_session_bootstrap_index(args.source, args.out)
            case "post-handshake-handler-index":
                write_post_handshake_handler_index(args.source, args.out)
            case "post-handshake-body-decode":
                write_post_handshake_body_decode(
                    args.source,
                    args.out,
                    transport_key_hex=args.transport_key_hex,
                    request_frame_hex=args.request_frame_hex,
                    post_handshake_frame_hex=args.post_handshake_frame_hex,
                )
            case "post-handshake-response-candidates":
                write_post_handshake_response_candidates(args.source, args.out)
            case "post-0030-payload-layout":
                write_post_0030_payload_layout(args.source, args.out)
            case "post-0030-followup-effects":
                write_post_0030_followup_effects(args.source, args.out)
            case "command-ok-layout":
                write_command_ok_layout(args.source, args.out)
            case "command-ok-response-candidates":
                write_command_ok_response_candidates(
                    args.source,
                    args.out,
                    phase1_key_hex=args.phase1_key_hex,
                    entity_key_hex=args.entity_key_hex,
                )
            case "game-function-catalog":
                write_game_function_catalog(args.source, args.installed_root, args.manual_pdf, args.out)
            case "runtime-patch-targets":
                write_runtime_patch_targets(args.source, args.out)
            case "runtime-manager-index":
                write_runtime_manager(args.source, args.out)
            case "runtime-manager-log-patch":
                write_runtime_manager_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-clear-log-patch":
                write_runtime_manager_clear_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-destructor-log-patch":
                write_runtime_manager_destructor_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-cleanup-log-patch":
                write_runtime_manager_cleanup_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-callback-log-patch":
                write_runtime_manager_callback_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-state-log-patch":
                write_runtime_manager_state_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-dispatcher-log-patch":
                write_runtime_manager_dispatcher_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-dispatcher-node-log-patch":
                write_runtime_manager_dispatcher_node_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-nested-callback-log-patch":
                write_runtime_manager_nested_callback_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-state-trigger-log-patch":
                write_runtime_manager_state_trigger_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-member-slot-log-patch":
                write_runtime_manager_member_slot_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-member-slot-effect-log-patch":
                write_runtime_manager_member_slot_effect_patch(args.source, args.out, args.manifest_out)
            case "runtime-manager-member-slot-tail-log-patch":
                write_runtime_manager_member_slot_tail_patch(args.source, args.out, args.manifest_out)
            case "runtime-keylog-patch":
                write_runtime_keylog_patch(args.source, args.out, args.manifest_out)
            case "runtime-keysetup-log-patch":
                write_runtime_keysetup_patch(args.source, args.out, args.manifest_out)
            case "runtime-keyread-log-patch":
                write_runtime_keyread_patch(args.source, args.out, args.manifest_out)
            case "runtime-child-encode-log-patch":
                write_runtime_child_encode_patch(args.source, args.out, args.manifest_out)
            case "runtime-child-encode-post-log-patch":
                write_runtime_child_post_encode_patch(args.source, args.out, args.manifest_out)
            case "runtime-child-schedule-log-patch":
                write_runtime_child_schedule_patch(args.source, args.out, args.manifest_out)
            case "runtime-queue-append-log-patch":
                write_runtime_queue_append_patch(args.source, args.out, args.manifest_out)
            case "runtime-queue-entry-log-patch":
                write_runtime_queue_entry_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-log-patch":
                write_socket_recv_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-all-log-patch":
                write_socket_recv_all_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-phase3-ring-log-patch":
                write_socket_recv_phase3_ring_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-phase-ring-log-patch":
                write_socket_recv_phase_ring_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-ring-log-patch":
                write_socket_recv_ring_patch(args.source, args.out, args.manifest_out)
            case "runtime-socket-recv-window-log-patch":
                write_socket_recv_window_patch(args.source, args.out, args.manifest_out)
            case "runtime-keylog-read":
                write_runtime_keylog_records(args.source, args.out)
            case "runtime-child-trace-read":
                write_runtime_child_trace_records(args.source, args.out)
            case "gameplay-trace-analyze":
                write_gameplay_packet_analysis(args.source, args.out)
            case "socket-boundary-index":
                write_socket_boundary(args.source, args.out)
            case unreachable:
                raise InvalidIsoError(f"unsupported command: {unreachable}")
    except (PipelineError, PackageError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
