from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from logh7_iso import IsoImage, PipelineError, read_extent


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]


class ExtractionError(PipelineError):
    pass


class UnsafeIsoPathError(ExtractionError):
    pass


@dataclass(frozen=True, slots=True)
class ExtractedIsoFile:
    path: str
    size: int
    sha256: str


def _assert_safe_iso_path(path: str) -> None:
    candidate = Path(path)
    if candidate.is_absolute() or ".." in candidate.parts or path in {"", ".", ".."}:
        raise UnsafeIsoPathError(f"unsafe ISO entry path: {path}")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _manifest(image: IsoImage, destination: Path, entries: tuple[ExtractedIsoFile, ...]) -> dict[str, JsonValue]:
    return {
        "source": str(image.source),
        "destination": str(destination),
        "format": "iso9660-root-extraction",
        "volume": {
            "system": image.system_identifier,
            "identifier": image.volume_identifier,
        },
        "entries": [
            {
                "path": item.path,
                "size": item.size,
                "sha256": item.sha256,
            }
            for item in entries
        ],
    }


def extract_iso_root(image: IsoImage, destination: Path, manifest_out: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[ExtractedIsoFile] = []
    for entry in sorted(image.entries, key=lambda item: item.path.casefold()):
        if entry.is_directory:
            continue
        _assert_safe_iso_path(entry.path)
        raw = read_extent(image.source, entry.extent, entry.size)
        target = destination / Path(entry.path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        extracted.append(ExtractedIsoFile(path=entry.path, size=len(raw), sha256=_sha256(raw)))

    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(
        json.dumps(_manifest(image, destination, tuple(extracted)), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
