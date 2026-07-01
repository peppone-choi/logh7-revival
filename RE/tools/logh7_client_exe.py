from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final, Mapping

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
INSTALLED_ROOT: Final = REPO_ROOT / ".omo/work/logh7-installed"
CLIENT_DIR: Final = INSTALLED_ROOT / "exe"
INSTALLED_CLIENT_EXE: Final = CLIENT_DIR / "G7MTClient.exe"
UI_EXPLORER_BACKUP_EXE: Final = CLIENT_DIR / "G7MTClient.exe.uiexplorer"
CLIENT_PATCH_DIR: Final = REPO_ROOT / "tools" / "client_patches"
VANILLA_REFERENCE_EXE: Final = REPO_ROOT / ".omo/ghidra/bin/G7MTClient.exe"
CANONICAL_KOREAN_EXE: Final = REPO_ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe"
CANONICAL_PLAYABLE_EXE: Final = REPO_ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe"
COMMANDLINE_BOOTSTRAP_PATCH: Final = "login-commandline-bootstrap"

VANILLA_CLIENT_SHA256: Final = "2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345"
KOREAN_CLIENT_SHA256: Final = "466725e2220726a4b5274b99e7b85fbdbef222cb424386638405d2cc7e23aa66"
PLAYABLE_CLIENT_SHA256: Final = "3b4f634818ff0d2b2f59eb6ddacbe73c9bcbc9cda146b9cfdb9c5d1cb7b98573"

STATIC_SHA_LABELS: Final[Mapping[str, str]] = {
    VANILLA_CLIENT_SHA256: "vanilla-installed",
    KOREAN_CLIENT_SHA256: "korean-localized",
    PLAYABLE_CLIENT_SHA256: "canonical-playable",
}


class ClientLaunchMode(StrEnum):
    NO_PATCH = "no-patch"
    EXPLICIT_EXE = "explicit-exe"
    CANONICAL_PLAYABLE = "canonical-playable"
    LOBBY_UNBLOCK = "lobby-unblock"


@dataclass(frozen=True, slots=True)
class ClientLaunchPlan:
    mode: ClientLaunchMode
    source: Path | None
    uses_backup: bool


@dataclass(frozen=True, slots=True)
class ClientShaStatus:
    path: Path
    sha256: str
    label: str
    expected_sha256: str | None
    expected_label: str | None
    verified: bool


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def playable_manifest_path(playable_exe: Path = CANONICAL_PLAYABLE_EXE) -> Path:
    return playable_exe.parent / f"{playable_exe.stem}.playable-manifest.json"


def playable_manifest_stack(playable_exe: Path = CANONICAL_PLAYABLE_EXE) -> tuple[str, ...]:
    manifest = playable_manifest_path(playable_exe)
    if not manifest.exists():
        return ()
    try:
        raw = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return ()
    stack = raw.get("stack") if isinstance(raw, dict) else None
    if not isinstance(stack, list):
        return ()
    return tuple(item for item in stack if isinstance(item, str))


def canonical_playable_sha256(playable_exe: Path = CANONICAL_PLAYABLE_EXE) -> str:
    manifest = playable_manifest_path(playable_exe)
    if not manifest.exists():
        return PLAYABLE_CLIENT_SHA256
    try:
        raw = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return PLAYABLE_CLIENT_SHA256
    if isinstance(raw, dict):
        value = raw.get("outSha256")
        if isinstance(value, str) and value:
            return value
    return PLAYABLE_CLIENT_SHA256


def label_for_sha(sha256: str) -> str:
    if sha256 == canonical_playable_sha256():
        return "canonical-playable"
    return STATIC_SHA_LABELS.get(sha256, "unknown")


def choose_ui_explorer_launch(
    *,
    no_patch: bool,
    patched_exe: Path | None,
    lobby_unblock_patch: bool,
    canonical_playable_exe: Path = CANONICAL_PLAYABLE_EXE,
) -> ClientLaunchPlan:
    if no_patch:
        return ClientLaunchPlan(ClientLaunchMode.NO_PATCH, None, uses_backup=False)
    if patched_exe is not None:
        return ClientLaunchPlan(ClientLaunchMode.EXPLICIT_EXE, patched_exe, uses_backup=True)
    if lobby_unblock_patch or not canonical_playable_exe.exists():
        return ClientLaunchPlan(ClientLaunchMode.LOBBY_UNBLOCK, None, uses_backup=True)
    return ClientLaunchPlan(ClientLaunchMode.CANONICAL_PLAYABLE, canonical_playable_exe, uses_backup=True)


def verify_client_sha(path: Path, *, expected_sha256: str | None) -> ClientShaStatus:
    actual = sha256_file(path)
    actual_label = label_for_sha(actual)
    if expected_sha256 is None:
        return ClientShaStatus(
            path=path,
            sha256=actual,
            label=actual_label,
            expected_sha256=None,
            expected_label=None,
            verified=actual_label != "unknown",
        )
    return ClientShaStatus(
        path=path,
        sha256=actual,
        label=actual_label,
        expected_sha256=expected_sha256,
        expected_label=label_for_sha(expected_sha256),
        verified=actual == expected_sha256,
    )
