from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final


ENCODINGS: Final = ("cp932", "latin-1", "utf-16le")

JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
ReadFileBytes = Callable[[str], bytes | None]


@dataclass(frozen=True, slots=True)
class ServerDiscoverySource:
    image_source: Path
    read_file_bytes: ReadFileBytes


def _printable_tokens(raw: bytes) -> tuple[str, ...]:
    values: set[str] = set()
    for encoding in ENCODINGS:
        text = raw.decode(encoding, errors="ignore")
        for match in re.finditer(r"[A-Za-z0-9_./:\\-]{4,}", text):
            values.add(match.group(0).strip("\\"))
    return tuple(sorted(values))


def discover_server(source: ServerDiscoverySource) -> dict[str, JsonValue]:
    tokens: set[str] = set()
    for path in ("data1.hdr", "setup.inx"):
        raw = source.read_file_bytes(path)
        if raw is not None:
            tokens.update(_printable_tokens(raw))

    executables = sorted(token for token in tokens if token.lower().endswith(".exe"))
    config_files = sorted(token for token in tokens if token.lower().endswith((".ini", ".url")))
    urls = sorted(token for token in tokens if token.startswith(("http://", "https://", "ftp://")))
    resource_hints = sorted(
        token
        for token in tokens
        if token.lower().endswith((".dat", ".txt", ".pdf")) or token.lower().startswith("messages_")
    )
    return {
        "source": str(source.image_source),
        "legacyServerStatus": "static-evidence-only",
        "executables": executables,
        "configFiles": config_files,
        "urls": urls,
        "resourceHints": resource_hints,
        "defaultBind": {"host": "127.0.0.1", "port": 4787},
        "notes": [
            "Legacy executables were not run.",
            "No protocol or gameplay port is proven until extracted binaries/configs are analyzed in a sandbox.",
            "Local server scripts expose manifest/update evidence only on localhost.",
        ],
    }
