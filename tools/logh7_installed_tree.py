from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_client_protocol import build_client_protocol_index
from logh7_iso import PipelineError
from logh7_windows_runtime import write_windows_runtime_files


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
INSTALL_ROOT_MARKERS: Final = (
    "update.ini",
    "Gin7UpdateClient.exe",
    "exe/G7MTClient.exe",
    "data/MsgDat/constmsg.dat",
)
LAUNCHER_RUNTIME_DEPENDENCIES: Final = (
    ("dsetup.dll", "DSETUP.dll", "G7Start.exe imports DSETUP.dll"),
    ("dsetup32.dll", "DSETUP32.dll", "DirectX setup runtime paired with DSETUP.dll"),
)
CLIENT_LEGACY_ADDRESS: Final = b"202.8.80.179"
CLIENT_LOCAL_ADDRESS: Final = b"127.0.0.1"
CLIENT_ADDRESS_PATCH: Final[dict[str, str]] = {
    "path": "exe/G7MTClient.exe",
    "legacyAddress": CLIENT_LEGACY_ADDRESS.decode("ascii"),
    "localAddress": CLIENT_LOCAL_ADDRESS.decode("ascii"),
    "reason": "Real login UI sent the first observed packet only after this generated-client redirect.",
}


class InstalledTreeError(PipelineError):
    pass


class MissingInstallRootError(InstalledTreeError):
    pass


class AmbiguousInstallRootError(InstalledTreeError):
    pass


@dataclass(frozen=True, slots=True)
class InstalledTreeFile:
    path: str
    size: int
    sha256: str


def _sha256(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _archive_path(root: Path, source: Path) -> str:
    return source.relative_to(root).as_posix()


def find_install_root(extracted_tree: Path) -> Path:
    candidates = []
    for update_ini in extracted_tree.rglob("update.ini"):
        candidate = update_ini.parent
        if all((candidate / marker).exists() for marker in INSTALL_ROOT_MARKERS):
            candidates.append(candidate)

    if not candidates:
        raise MissingInstallRootError(f"{extracted_tree} does not contain a LOGH VII install root")
    if len(candidates) > 1:
        joined = ", ".join(str(candidate) for candidate in candidates)
        raise AmbiguousInstallRootError(f"{extracted_tree} contains multiple LOGH VII install roots: {joined}")
    return candidates[0]


def _copy_tree(source_root: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source_root, destination)


def _collect_files(root: Path) -> tuple[InstalledTreeFile, ...]:
    return tuple(
        InstalledTreeFile(path=_archive_path(root, source), size=source.stat().st_size, sha256=_sha256(source))
        for source in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix().casefold())
        if source.is_file()
    )


def _copy_launcher_runtime_dependencies(iso_root: Path, destination: Path) -> list[dict[str, str]]:
    copied: list[dict[str, str]] = []
    for source_name, target_name, reason in LAUNCHER_RUNTIME_DEPENDENCIES:
        source = iso_root / source_name
        if not source.exists():
            raise MissingInstallRootError(f"{iso_root} does not contain {source_name}")
        shutil.copy2(source, destination / target_name)
        copied.append({"path": target_name, "source": str(source), "reason": reason})
    return copied


def _patch_client_login_address(destination: Path) -> dict[str, str]:
    client = destination / CLIENT_ADDRESS_PATCH["path"]
    raw = client.read_bytes()
    if raw.count(CLIENT_LEGACY_ADDRESS) != 1:
        raise MissingInstallRootError(
            f"{client} does not contain exactly one {CLIENT_LEGACY_ADDRESS.decode('ascii')} literal"
        )
    padded_local = CLIENT_LOCAL_ADDRESS + (b"\x00" * (len(CLIENT_LEGACY_ADDRESS) - len(CLIENT_LOCAL_ADDRESS)))
    client.write_bytes(raw.replace(CLIENT_LEGACY_ADDRESS, padded_local, 1))
    return dict(CLIENT_ADDRESS_PATCH)


def _read_update_ini(path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    text = path.read_bytes().decode("cp932")
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        fields[key.strip().upper()] = value.strip()
    return fields


def _server_update_schema(destination: Path) -> dict[str, JsonValue]:
    fields = _read_update_ini(destination / "update.ini")
    version = fields.get("VERSION", "131")
    try:
        parsed_version: JsonValue = int(version)
    except ValueError:
        parsed_version = version
    return {
        "VERSION": parsed_version,
        "BASE_DIR": fields.get("BASE_DIR", ".\\"),
        "SERVER_ADDRESS": "127.0.0.1",
        "SERVER_PORT": 4787,
        "PORT": 47900,
    }


def _gameplay_schema() -> dict[str, JsonValue]:
    return {
        "MODE": "tcp-capture-stub",
        "HOST": "127.0.0.1",
        "PORT": 47900,
        "LEGACY_ADDRESS": "202.8.80.179",
        "CLIENT_LITERAL": "ginei00",
    }


def _manifest(
    extracted_tree: Path,
    install_root: Path,
    iso_root: Path,
    destination: Path,
    files: tuple[InstalledTreeFile, ...],
    launcher_dependencies: list[dict[str, str]],
    windows_runtime: list[dict[str, str]],
) -> dict[str, JsonValue]:
    return {
        "source": str(extracted_tree),
        "installRoot": str(install_root),
        "isoRoot": str(iso_root),
        "destination": str(destination),
        "format": "windows-installed-tree",
        "installRootMarkers": list(INSTALL_ROOT_MARKERS),
        "runtime": {
            "launcherDependencies": launcher_dependencies,
            "clientAddressPatch": dict(CLIENT_ADDRESS_PATCH),
            "windowsCompatibility": {
                "scripts": [item["path"] for item in windows_runtime],
                "registry": "HKCU\\Software\\BOTHTEC\\銀河英雄伝説VII\\1.0",
                "appCompatFlags": "~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE",
                "stringBackup": "exe/String.txt.original",
            },
        },
        "server": {
            "update": _server_update_schema(destination),
            "gameplay": _gameplay_schema(),
            "clientProtocol": build_client_protocol_index(destination / "exe" / "G7MTClient.exe"),
            "evidence": {
                "source": "installed update.ini plus Gin7UpdateClient.exe/G7MTClient.exe byte strings",
                "clientDefaultAddress": "202.8.80.179",
                "gameClientPortLiteral": 47900,
                "updateClientPortLiteral": 47902,
            },
        },
        "entries": [
            {
                "path": item.path,
                "size": item.size,
                "sha256": item.sha256,
            }
            for item in files
        ],
    }


def build_installed_tree(extracted_tree: Path, iso_root: Path, destination: Path, manifest_out: Path) -> None:
    install_root = find_install_root(extracted_tree)
    launcher = iso_root / "g7start.exe"
    if not launcher.exists():
        raise MissingInstallRootError(f"{iso_root} does not contain g7start.exe")

    _copy_tree(install_root, destination)
    shutil.copy2(launcher, destination / "G7Start.exe")
    launcher_dependencies = _copy_launcher_runtime_dependencies(iso_root, destination)
    _patch_client_login_address(destination)
    windows_runtime = write_windows_runtime_files(destination)

    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    files = _collect_files(destination)
    manifest_out.write_text(
        json.dumps(
            _manifest(extracted_tree, install_root, iso_root, destination, files, launcher_dependencies, windows_runtime),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
