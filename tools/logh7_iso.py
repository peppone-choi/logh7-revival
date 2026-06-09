from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final


SECTOR_SIZE: Final = 2048
PVD_SECTOR: Final = 16
PVD_ROOT_RECORD_OFFSET: Final = 156


@dataclass(frozen=True, slots=True)
class IsoEntry:
    path: str
    extent: int
    size: int
    is_directory: bool


@dataclass(frozen=True, slots=True)
class IsoImage:
    source: Path
    system_identifier: str
    volume_identifier: str
    entries: tuple[IsoEntry, ...]


class PipelineError(Exception):
    pass


class MissingSourceError(PipelineError):
    pass


class InvalidIsoError(PipelineError):
    pass


def ascii_field(raw: bytes) -> str:
    return raw.decode("ascii", errors="replace").strip()


def entry_name(raw: bytes) -> str:
    if raw == b"\x00":
        return "."
    if raw == b"\x01":
        return ".."
    name = raw.decode("ascii", errors="replace")
    return name.split(";")[0].lower()


def read_record(record: bytes, base_path: str) -> IsoEntry:
    name_length = record[32]
    name = entry_name(record[33 : 33 + name_length])
    path = name if not base_path else f"{base_path}/{name}"
    return IsoEntry(
        path=path,
        extent=int.from_bytes(record[2:6], "little"),
        size=int.from_bytes(record[10:14], "little"),
        is_directory=bool(record[25] & 0x02),
    )


def directory_entries(data: bytes, base_path: str) -> tuple[IsoEntry, ...]:
    entries: list[IsoEntry] = []
    offset = 0
    while offset < len(data):
        record_length = data[offset]
        if record_length == 0:
            offset = ((offset // SECTOR_SIZE) + 1) * SECTOR_SIZE
            continue
        record = data[offset : offset + record_length]
        entry = read_record(record, base_path)
        if entry.path not in {".", ".."} and not entry.path.endswith(("/.", "/..")):
            entries.append(entry)
        offset += record_length
    return tuple(entries)


def read_extent(source: Path, extent: int, size: int) -> bytes:
    with source.open("rb") as handle:
        handle.seek(extent * SECTOR_SIZE)
        return handle.read(size)


def read_extent_prefix(source: Path, extent: int, size: int, limit: int) -> bytes:
    with source.open("rb") as handle:
        handle.seek(extent * SECTOR_SIZE)
        return handle.read(min(size, limit))


def read_iso(source: Path) -> IsoImage:
    if not source.exists():
        raise MissingSourceError(f"{source} does not exist")

    with source.open("rb") as handle:
        handle.seek(PVD_SECTOR * SECTOR_SIZE)
        descriptor = handle.read(SECTOR_SIZE)

    if len(descriptor) != SECTOR_SIZE or descriptor[1:6] != b"CD001":
        raise InvalidIsoError(f"{source} is not a readable ISO 9660 image")

    root_record_length = descriptor[PVD_ROOT_RECORD_OFFSET]
    root_record = descriptor[PVD_ROOT_RECORD_OFFSET : PVD_ROOT_RECORD_OFFSET + root_record_length]
    root = read_record(root_record, "")
    pending = list(directory_entries(read_extent(source, root.extent, root.size), ""))
    entries: list[IsoEntry] = []

    while pending:
        entry = pending.pop(0)
        entries.append(entry)
        if entry.is_directory:
            child_data = read_extent(source, entry.extent, entry.size)
            pending.extend(directory_entries(child_data, entry.path))

    return IsoImage(
        source=source,
        system_identifier=ascii_field(descriptor[8:40]),
        volume_identifier=ascii_field(descriptor[40:72]),
        entries=tuple(entries),
    )


def read_file_bytes(image: IsoImage, path: str) -> bytes | None:
    wanted = path.lower()
    for entry in image.entries:
        if entry.path == wanted and not entry.is_directory:
            return read_extent(image.source, entry.extent, entry.size)
    return None
