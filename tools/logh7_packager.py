from __future__ import annotations

import hashlib
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Final


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
FORBIDDEN_IMAGE_SUFFIXES: Final = frozenset({".bin", ".cue", ".iso"})
MANIFEST_NAME: Final = "MANIFEST.json"


class PackageError(Exception):
    pass


class ForbiddenArtifactError(PackageError):
    pass


class InvalidPackageSourceError(PackageError):
    pass


@dataclass(frozen=True, slots=True)
class PackageFile:
    source: Path
    archive_path: str
    size: int
    sha256: str


def _archive_path(root: Path, source: Path) -> str:
    return source.relative_to(root).as_posix()


def _sha256(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _assert_safe_distribution_path(archive_path: str) -> None:
    path = Path(archive_path)
    if path.is_absolute() or ".." in path.parts:
        raise InvalidPackageSourceError(f"unsafe archive path: {archive_path}")
    suffix = Path(archive_path).suffix.lower()
    if suffix in FORBIDDEN_IMAGE_SUFFIXES:
        raise ForbiddenArtifactError(f"forbidden image artifact in distribution tree: {archive_path}")


def _collect_files(root: Path) -> dict[str, Path]:
    if not root.exists() or not root.is_dir():
        raise InvalidPackageSourceError(f"{root} is not a directory")
    files: dict[str, Path] = {}
    for source in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix().casefold()):
        if source.is_dir():
            continue
        if source.is_symlink():
            raise InvalidPackageSourceError(f"symlink is not portable for Windows zip: {_archive_path(root, source)}")
        archive_path = _archive_path(root, source)
        _assert_safe_distribution_path(archive_path)
        files[archive_path] = source
    return files


def _manifest(source_root: Path, overlay_root: Path | None, archive: Path, files: tuple[PackageFile, ...]) -> dict[str, JsonValue]:
    return {
        "archive": str(archive),
        "source": str(source_root),
        "overlay": str(overlay_root) if overlay_root is not None else None,
        "format": "image-free-windows-installed-tree",
        "forbidden_suffixes": sorted(FORBIDDEN_IMAGE_SUFFIXES),
        "entries": [
            {
                "path": item.archive_path,
                "size": item.size,
                "sha256": item.sha256,
            }
            for item in files
        ],
    }


def package_installed_tree(source_root: Path, overlay_root: Path | None, archive: Path, manifest_out: Path) -> None:
    source_files = _collect_files(source_root)
    overlay_files = _collect_files(overlay_root) if overlay_root is not None else {}
    merged = dict(source_files)
    merged.update(overlay_files)
    package_files = tuple(
        PackageFile(
            source=source,
            archive_path=archive_path,
            size=source.stat().st_size,
            sha256=_sha256(source),
        )
        for archive_path, source in sorted(merged.items(), key=lambda item: item[0].casefold())
    )
    manifest = _manifest(source_root, overlay_root, archive, package_files)
    archive.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for item in package_files:
            package.write(item.source, item.archive_path)
        package.writestr(MANIFEST_NAME, manifest_text)
    manifest_out.write_text(manifest_text, encoding="utf-8")
