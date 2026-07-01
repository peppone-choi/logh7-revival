from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Final


SCHEMA_VERSION: Final[int] = 1
PENDING_COORD_CONTENT_IDS: Final[tuple[int, ...]] = (13, 32, 34, 52, 75)

IMPLICIT_ON_UNLESS_ZERO_GATES: Final[frozenset[str]] = frozenset(
    {
        "LOGH_WORLD_IMPORT_BASES",
        "LOGH_BASE_ECONOMY",
    }
)

LAUNCHER_ENABLED_GATES: Final[frozenset[str]] = frozenset(
    {
        "LOGH_WORLD_IMPORT_BASES",
        "LOGH_BASE_ECONOMY",
        "LOGH_STATIC_SHIPS",
    }
)


DELIVERY_DOMAINS: Final[tuple[dict[str, Any], ...]] = (
    {
        "domain": "galaxy-grid",
        "content": [
            "galaxy.json",
            "galaxy-raster-star-centers.json",
            "galaxy-passable-cells.json",
            "galaxy-adjacency.json",
        ],
        "opcodes": ["0x0313", "0x0315"],
        "serverFiles": [
            "server/src/server/logh7-login-session.mjs",
            "server/src/server/logh7-login-protocol.mjs",
        ],
        "gates": ["LOGH_STRAT_GALAXY", "LOGH_STRAT_GRID_EARLY", "LOGH_STRAT_TERRAIN"],
        "deliveryRisk": "5 constmsg-confirmed systems have no recovered coordinates; grid markers remain 80 positioned systems.",
    },
    {
        "domain": "bases-planets-economy",
        "content": ["galaxy.json", "planet-economy.json", "fortresses.json"],
        "opcodes": ["0x031d", "0x031f", "0x0321", "0x0337"],
        "serverFiles": [
            "server/src/server/logh7-login-session.mjs",
            "server/src/server/codec/base-record.mjs",
            "server/src/server/logh7-base-economy.mjs",
        ],
        "gates": ["LOGH_PLANET_BASE_RECORDS", "LOGH_WORLD_IMPORT_BASES", "LOGH_BASE_ECONOMY"],
        "deliveryRisk": "0x0337 economy scalar route remains collision/provisional; 0x031f scalar offsets stay conservative.",
    },
    {
        "domain": "characters-personnel",
        "content": ["roster/characters.json", "roster/ability-seed.json", "character-roster.json"],
        "opcodes": ["0x0204", "0x0323", "0x0356"],
        "serverFiles": [
            "server/src/server/logh7-login-session.mjs",
            "server/src/server/codec/personnel-records.mjs",
        ],
        "gates": ["LOGH_WORLD_PLAYER", "LOGH_POSTLOAD_PLAYER_RECORD", "LOGH_POSTLOAD_RICH_CHARACTER"],
        "deliveryRisk": "Created-player binding must remain explicit so the world HUD does not fall back to emperor/stats-zero.",
    },
    {
        "domain": "units-fleets-ships",
        "content": ["ship-stats.json", "scenarios/canon-801-07.json"],
        "opcodes": ["0x030b", "0x0325", "0x033b", "0x0b07"],
        "serverFiles": [
            "server/src/server/logh7-login-session.mjs",
            "server/src/server/logh7-info-records-static.mjs",
            "server/src/server/logh7-command-engine.mjs",
        ],
        "gates": ["LOGH_STATIC_SHIPS", "LOGH_FULL_UNIT_LOCATION", "LOGH_STRAT_FLEET"],
        "deliveryRisk": "0x0325 full fleet delivery is server-ready; visible movement still needs live client consumption proof.",
    },
    {
        "domain": "static-catalogs",
        "content": ["ship-stats.json", "manual/ship-units.json", "manual/strategy-commands.json"],
        "opcodes": ["0x0307", "0x0309", "0x030d", "0x030f", "0x0311"],
        "serverFiles": ["server/src/server/logh7-info-records-static.mjs"],
        "gates": ["LOGH_COMMAND_TABLE_PRELOAD_PROBE"],
        "deliveryRisk": "Several static catalogs have byte builders but no recovered P0/P1 table content; keep empty until recovered.",
    },
)


def build_data_sweep(repo_root: Path | None = None) -> dict[str, Any]:
    root = (repo_root or _default_repo_root()).resolve()
    server_content = root / "server" / "content"
    re_content = root / "RE" / "content"
    galaxy = _load_json(server_content / "galaxy.json")
    systems = list(galaxy.get("systems", []))

    return {
        "schemaVersion": SCHEMA_VERSION,
        "repoRoot": str(root),
        "contentCopies": _compare_content_roots(server_content, re_content),
        "galaxy": _galaxy_summary(server_content, systems),
        "modelGalaxy": _model_galaxy_summary(server_content),
        "deliveryDomains": _delivery_domains(root),
        "reverseEngineeringIndexes": _re_index_summary(root),
        "evidence": [
            "server/content/galaxy.json is the canonical server content source.",
            "server/content/galaxy-raster-star-centers.json carries the 80 recovered manual-page star positions.",
            "server/content/extracted/model-galaxy-stars.json carries MDX stellar-class nodes but no named-system coordinates.",
            "RE/.omo/ghidra/opcode-index.json and outbound-request-dispatch.json carry the current opcode sweep outputs when present.",
        ],
    }


def write_data_sweep(destination: Path, repo_root: Path | None = None) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_data_sweep(repo_root), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _walk_files(root: Path) -> dict[str, dict[str, Any]]:
    if not root.exists():
        return {}
    result: dict[str, dict[str, Any]] = {}
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        result[rel] = {"path": str(path), "size": path.stat().st_size, "sha256": _file_hash(path)}
    return result


def _compare_content_roots(server_content: Path, re_content: Path) -> dict[str, Any]:
    server = _walk_files(server_content)
    re = _walk_files(re_content)
    all_keys = sorted(set(server) | set(re))
    common = [key for key in all_keys if key in server and key in re]
    diff = [key for key in common if server[key]["sha256"] != re[key]["sha256"]]
    tracked_keys = (
        "galaxy.json",
        "galaxy-raster-star-centers.json",
        "galaxy-passable-cells.json",
        "extracted/model-galaxy-stars.json",
    )
    return {
        "serverRoot": str(server_content),
        "reRoot": str(re_content),
        "counts": {
            "server": len(server),
            "RE": len(re),
            "common": len(common),
            "same": len(common) - len(diff),
            "different": len(diff),
            "onlyServer": sum(1 for key in all_keys if key in server and key not in re),
            "onlyRE": sum(1 for key in all_keys if key in re and key not in server),
        },
        "different": [
            {
                "rel": key,
                "server": server[key],
                "RE": re[key],
            }
            for key in diff
        ],
        "onlyServer": [key for key in all_keys if key in server and key not in re],
        "onlyRE": [key for key in all_keys if key in re and key not in server],
        "tracked": {
            key: _content_copy_state(key, server, re)
            for key in tracked_keys
        },
    }


def _content_copy_state(
    key: str,
    server: dict[str, dict[str, Any]],
    re: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if key not in server and key not in re:
        return {"state": "missing"}
    if key not in server:
        return {"state": "onlyRE", "RE": re[key]}
    if key not in re:
        return {"state": "onlyServer", "server": server[key]}
    state = "same" if server[key]["sha256"] == re[key]["sha256"] else "different"
    return {"state": state, "server": server[key], "RE": re[key]}


def _is_positioned(system: dict[str, Any]) -> bool:
    return all(system.get(key) is not None for key in ("cx", "cy", "canonGameCol", "canonGameRow"))


def _galaxy_summary(server_content: Path, systems: list[dict[str, Any]]) -> dict[str, Any]:
    positioned = [system for system in systems if _is_positioned(system)]
    pending = [
        {
            "index": index,
            "system": system.get("system"),
            "contentId": system.get("contentId"),
            "positionAuthority": system.get("positionAuthority"),
            "coordinatePending": bool(system.get("coordinatePending")),
            "nameAuthority": system.get("nameAuthority"),
            "planets": len(system.get("planets") or []),
            "fortresses": len(system.get("fortresses") or []),
            "cx": system.get("cx"),
            "cy": system.get("cy"),
            "canonGameCol": system.get("canonGameCol"),
            "canonGameRow": system.get("canonGameRow"),
        }
        for index, system in enumerate(systems)
        if not _is_positioned(system)
    ]
    raster = _load_json(server_content / "galaxy-raster-star-centers.json")
    adjacency = _load_json(server_content / "galaxy-adjacency.json")
    passable = _load_json(server_content / "galaxy-passable-cells.json")
    pending_ids = tuple(item.get("contentId") for item in pending)
    return {
        "systems": len(systems),
        "positionedSystems": len(positioned),
        "coordinatePendingSystems": len(pending),
        "coordinatePendingContentIds": list(pending_ids),
        "expectedPendingContentIds": list(PENDING_COORD_CONTENT_IDS),
        "pendingContentIdsMatchExpected": pending_ids == PENDING_COORD_CONTENT_IDS,
        "planets": sum(len(system.get("planets") or []) for system in systems),
        "planetlessSystems": sum(1 for system in systems if not system.get("planets")),
        "positionedMarkerSource": {
            "file": str(server_content / "galaxy-raster-star-centers.json"),
            "systems": len(raster.get("systems", [])),
            "source": raster.get("_source"),
        },
        "adjacency": {
            "file": str(server_content / "galaxy-adjacency.json"),
            "nodes": adjacency.get("meta", {}).get("nodes"),
            "adjacencyKeys": len(adjacency.get("adjacency", {})),
        },
        "passableCells": {
            "file": str(server_content / "galaxy-passable-cells.json"),
            "count": passable.get("_count"),
        },
        "coordinatePending": pending,
    }


def _model_galaxy_summary(server_content: Path) -> dict[str, Any]:
    path = server_content / "extracted" / "model-galaxy-stars.json"
    data = _load_json(path)
    return {
        "file": str(path),
        "source": data.get("_source"),
        "stars": len(data.get("stars", [])),
        "specialBodies": len(data.get("special_bodies", [])),
        "spectralHistogram": data.get("spectral_histogram", {}),
        "coordinateCaveat": data.get("_note"),
    }


def _delivery_domains(root: Path) -> list[dict[str, Any]]:
    defaults_text = (root / "server" / "src" / "server" / "logh7-config.mjs").read_text(encoding="utf-8")
    playable_defaults = _playable_env_default_keys(defaults_text)
    domains = []
    for domain in DELIVERY_DOMAINS:
        gates = [
            _gate_default_summary(gate, playable_defaults)
            for gate in domain["gates"]
        ]
        server_files = [
            {
                "path": file,
                "exists": (root / file).exists(),
            }
            for file in domain["serverFiles"]
        ]
        content_files = [
            {
                "path": f"server/content/{file}",
                "exists": (root / "server" / "content" / file).exists(),
            }
            for file in domain["content"]
        ]
        domains.append({**domain, "gates": gates, "serverFiles": server_files, "content": content_files})
    return domains


def _playable_env_default_keys(defaults_text: str) -> set[str]:
    match = re.search(
        r"PLAYABLE_ENV_DEFAULTS\s*=\s*Object\.freeze\(\{(?P<body>.*?)^\}\);",
        defaults_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    if match is None:
        return set()
    return set(re.findall(r"\b(LOGH_[A-Z0-9_]+)\s*:", match.group("body")))


def _gate_default_summary(gate: str, playable_defaults: set[str]) -> dict[str, Any]:
    in_playable_defaults = gate in playable_defaults
    if in_playable_defaults:
        default_mode = "playable-env-default"
        effective_default = True
    elif gate in IMPLICIT_ON_UNLESS_ZERO_GATES:
        default_mode = "implicit-on-unless-0"
        effective_default = True
    else:
        default_mode = "off-unless-1"
        effective_default = False
    return {
        "name": gate,
        "inPlayableDefaults": in_playable_defaults,
        "defaultMode": default_mode,
        "effectiveDefault": effective_default,
        "launcherEnabled": gate in LAUNCHER_ENABLED_GATES,
    }


def _re_index_summary(root: Path) -> dict[str, Any]:
    candidates = [
        root / "RE" / ".omo" / "ghidra" / "opcode-index.json",
        root / ".omo" / "ghidra" / "opcode-index.json",
    ]
    opcode_path = next((path for path in candidates if path.exists()), None)
    outbound_path = root / "RE" / ".omo" / "ghidra" / "outbound-request-dispatch.json"
    if not outbound_path.exists():
        outbound_path = root / ".omo" / "ghidra" / "outbound-request-dispatch.json"
    strings_path = root / "RE" / ".omo" / "ghidra" / "export" / "G7MTClient" / "strings.tsv"
    functions_path = root / "RE" / ".omo" / "ghidra" / "export" / "G7MTClient" / "functions.jsonl"
    summary: dict[str, Any] = {
        "opcodeIndex": None if opcode_path is None else _summarize_opcode_index(opcode_path),
        "outboundRequestDispatch": None if not outbound_path.exists() else _summarize_outbound_index(outbound_path),
        "ghidraExport": {
            "stringsTsv": str(strings_path),
            "stringsLines": _line_count(strings_path),
            "functionsJsonl": str(functions_path),
            "functionsLines": _line_count(functions_path),
        },
    }
    return summary


def _summarize_opcode_index(path: Path) -> dict[str, Any]:
    data = _load_json(path)
    return {
        "file": str(path),
        "coverage": data.get("coverage", {}),
        "c002Route": data.get("c002Route", {}),
        "c002Callsites": data.get("c002Callsites", []),
    }


def _summarize_outbound_index(path: Path) -> dict[str, Any]:
    data = _load_json(path)
    return {
        "file": str(path),
        "routes": len(data.get("trackedRoutes", [])),
        "c002Route": data.get("c002Route", {}),
    }


def _line_count(path: Path) -> int | None:
    if not path.exists():
        return None
    with path.open("rb") as fh:
        return sum(1 for _ in fh)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sweep LOGH VII content, delivery, and RE index state.")
    parser.add_argument("--repo-root", type=Path, default=_default_repo_root())
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    write_data_sweep(args.out, repo_root=args.repo_root)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
