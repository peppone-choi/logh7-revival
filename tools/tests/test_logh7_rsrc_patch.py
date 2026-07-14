# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest>=8.0"]
# ///
# ─── How to run ───
# uv run --script tools/tests/test_logh7_rsrc_patch.py

from __future__ import annotations

import hashlib
import importlib.util
import json
import struct
import subprocess
import sys
from pathlib import Path

import pytest

PATCHER = Path(__file__).parents[1] / "patch" / "logh7_rsrc_patch.py"
PATCHER_SPEC = importlib.util.spec_from_file_location("logh7_rsrc_patch", PATCHER)
assert PATCHER_SPEC is not None and PATCHER_SPEC.loader is not None
rsrc_patch = importlib.util.module_from_spec(PATCHER_SPEC)
sys.modules[PATCHER_SPEC.name] = rsrc_patch
PATCHER_SPEC.loader.exec_module(rsrc_patch)


def _fixture_pe() -> bytes:
    data = bytearray(0x400)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HHIIIHH", data, 0x84, 0x14C, 1, 0, 0, 0, 0xE0, 0x010F)
    opt = 0x98
    struct.pack_into("<H", data, opt, 0x10B)
    struct.pack_into("<I", data, opt + 32, 0x1000)
    struct.pack_into("<I", data, opt + 36, 0x200)
    struct.pack_into("<I", data, opt + 56, 0x2000)
    struct.pack_into("<II", data, opt + 96 + 16, 0x1000, 122)
    sec = 0x178
    data[sec:sec + 8] = b".rsrc\0\0\0"
    struct.pack_into("<IIII", data, sec + 8, 122, 0x1000, 0x200, 0x200)

    rsrc = 0x200
    struct.pack_into("<IIHH", data, rsrc, 0, 0, 0, 0)
    struct.pack_into("<HH", data, rsrc + 12, 0, 1)
    struct.pack_into("<II", data, rsrc + 16, 6, 0x80000018)
    struct.pack_into("<IIHH", data, rsrc + 24, 0, 0, 0, 0)
    struct.pack_into("<HH", data, rsrc + 36, 0, 1)
    struct.pack_into("<II", data, rsrc + 40, 1, 0x80000030)
    struct.pack_into("<IIHH", data, rsrc + 48, 0, 0, 0, 0)
    struct.pack_into("<HH", data, rsrc + 60, 0, 1)
    struct.pack_into("<II", data, rsrc + 64, 0x411, 72)
    struct.pack_into("<IIII", data, rsrc + 72, 0x1058, 34, 1200, 0)
    struct.pack_into("<H", data, rsrc + 88, 1)
    data[rsrc + 90:rsrc + 92] = "A".encode("utf-16le")
    return bytes(data)


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(PATCHER), *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _write_mapping(path: Path, *, offset: int = 0x25A, text_ja: str = "A") -> None:
    path.write_text(
        json.dumps(
            {
                "strings": [
                    {
                        "va_off": offset,
                        "restype": "rsrc.stringtable",
                        "text_ja": text_ja,
                        "text_ko": "한국어",
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_patch_rebuilds_resource_atomically_in_place(tmp_path: Path) -> None:
    exe = tmp_path / "fixture.exe"
    source = _fixture_pe()
    exe.write_bytes(source)
    mapping = tmp_path / "map.json"
    _write_mapping(mapping)

    result = _run(
        "patch",
        "--exe",
        str(exe),
        "--map",
        str(mapping),
        "--expect-sha256",
        hashlib.sha256(source).hexdigest(),
    )

    assert result.returncode == 0, result.stderr
    assert "한국어".encode("utf-16le") in exe.read_bytes()
    assert not list(tmp_path.glob("*.bak*"))
    payload = json.loads(result.stdout)
    assert payload["verifyOk"] is True
    assert payload["changes"][0]["identity"] == {
        "typeId": 6,
        "nameId": 1,
        "langId": 0x411,
        "slotIndex": 0,
    }


def test_verification_matches_duplicate_translation_by_resource_slot() -> None:
    pe = rsrc_patch.parse_pe(_fixture_pe())
    leaves = rsrc_patch.parse_rsrc(pe)
    leaf = leaves[0]
    parsed = rsrc_patch.parse_blob_strings(leaf)
    assert parsed is not None
    slots, gaps = parsed
    slots[0].text = "한국어"
    leaf.blob = bytearray(rsrc_patch._rebuild_with_lengths(slots, gaps, leaf.type_id))
    report = [
        {
            "identity": {"typeId": 6, "nameId": 1, "langId": 0x411, "slotIndex": 0},
            "to": "한국어",
        },
        {
            "identity": {"typeId": 6, "nameId": 1, "langId": 0x411, "slotIndex": 1},
            "to": "한국어",
        },
    ]

    assert rsrc_patch._count_verified_translations(leaves, report) == 1


def test_default_exe_fails_closed_without_installed_artifact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    historical_copy = tmp_path / ".omo" / "ghidra" / "bin" / "G7MTClient.exe"
    historical_copy.parent.mkdir(parents=True)
    historical_copy.write_bytes(_fixture_pe())
    monkeypatch.setattr(rsrc_patch, "_ARTIFACTS_INSTALL", tmp_path / "missing-install")
    monkeypatch.setattr(rsrc_patch, "_JP_EXE", historical_copy, raising=False)
    monkeypatch.setattr(rsrc_patch, "_INSTALLED_EXE", historical_copy, raising=False)

    with pytest.raises(FileNotFoundError, match="installed G7MTClient.exe not found"):
        rsrc_patch.default_exe()


def test_patch_rejects_hash_mismatch_without_writing(tmp_path: Path) -> None:
    exe = tmp_path / "fixture.exe"
    source = _fixture_pe()
    exe.write_bytes(source)
    mapping = tmp_path / "map.json"
    _write_mapping(mapping)

    result = _run(
        "patch",
        "--exe",
        str(exe),
        "--map",
        str(mapping),
        "--expect-sha256",
        "0" * 64,
    )

    assert result.returncode != 0
    assert "source exe hash mismatch" in result.stderr
    assert exe.read_bytes() == source


def test_patch_rejects_offset_mismatch_without_writing(tmp_path: Path) -> None:
    exe = tmp_path / "fixture.exe"
    source = _fixture_pe()
    exe.write_bytes(source)
    mapping = tmp_path / "map.json"
    _write_mapping(mapping, offset=0x25C)

    result = _run(
        "patch",
        "--exe",
        str(exe),
        "--map",
        str(mapping),
        "--expect-sha256",
        hashlib.sha256(source).hexdigest(),
    )

    assert result.returncode != 0
    assert "resource slot mismatch" in result.stderr
    assert exe.read_bytes() == source


if __name__ == "__main__":
    raise SystemExit(subprocess.call(["uv", "run", "--with", "pytest", "pytest", __file__]))
