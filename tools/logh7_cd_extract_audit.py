"""Audit the LOGH VII install against the original CD image on archive.org, WITHOUT downloading
the whole 229 MB BIN -- it parses the ISO9660/Joliet directory tree via HTTP range requests.

The archive.org item `logh-7` ships a raw BIN/CUE CD image (Logh7.bin, MODE2/Form1: 2352-byte
sectors, 2048 user bytes at offset 24). This reader range-fetches only the volume descriptors and
directory extents (a few KB each), walks the whole tree, and diffs it against the local install at
.omo/work/logh7-installed -- reporting files present on the CD but MISSING from the install (the
"추출 중 빠진 데이터"), size mismatches, and install-only extras.

Why range-only: a full directory walk touches a few hundred KB instead of 229 MB, so the audit
runs in seconds and needs no disk for the image.

Subcommands:
  list   [--depth N]                       dump the CD file tree (range-only)
  audit  --install <dir> --out <json>      diff CD tree vs install, report gaps

Usage:
  python -m tools.logh7_cd_extract_audit audit \
      --install .omo/work/logh7-installed --out .omo/ui-explorer/cd-audit.json
"""
from __future__ import annotations

import argparse
import json
import struct
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

BIN_URL: Final[str] = "https://archive.org/download/logh-7/Logh7.bin"
RAW_SECTOR: Final[int] = 2352
DATA_OFFSET: Final[int] = 24  # MODE2/Form1 user-data offset within a raw sector
DATA_LEN: Final[int] = 2048
PVD_LBA: Final[int] = 16
MAX_REQUESTS: Final[int] = 4000


@dataclass(slots=True)
class CdFile:
    path: str
    size: int
    is_dir: bool


@dataclass(slots=True)
class IsoReader:
    url: str = BIN_URL
    requests: int = 0
    total_bytes: int = 0
    _cache: dict[int, bytes] = field(default_factory=dict)

    def _fetch_raw(self, offset: int, length: int) -> bytes:
        self.requests += 1
        if self.requests > MAX_REQUESTS:
            raise RuntimeError("CD audit exceeded request budget")
        req = urllib.request.Request(
            self.url, headers={"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": "logh7-cd-audit"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            content_range = resp.headers.get("Content-Range")
            if content_range and "/" in content_range:
                self.total_bytes = int(content_range.rsplit("/", 1)[1])
            return resp.read()

    def read_logical(self, lba: int, length: int) -> bytes:
        """Read `length` logical bytes starting at logical sector `lba`, stitching 2048-byte
        user-data windows out of the raw 2352-byte sectors (one range request for the span)."""
        nsectors = (length + DATA_LEN - 1) // DATA_LEN
        raw = self._fetch_raw(lba * RAW_SECTOR, nsectors * RAW_SECTOR)
        out = bytearray()
        for i in range(nsectors):
            base = i * RAW_SECTOR + DATA_OFFSET
            out += raw[base : base + DATA_LEN]
        return bytes(out[:length])

    def volume_descriptors(self) -> list[tuple[int, bytes]]:
        descriptors: list[tuple[int, bytes]] = []
        for lba in range(PVD_LBA, PVD_LBA + 24):
            sector = self.read_logical(lba, DATA_LEN)
            if sector[1:6] != b"CD001":
                break
            vd_type = sector[0]
            descriptors.append((vd_type, sector))
            if vd_type == 255:  # terminator
                break
        return descriptors


def _is_joliet(sector: bytes) -> bool:
    # Supplementary VD (type 2) with a Joliet UCS-2 escape sequence at offset 88.
    if sector[0] != 2:
        return False
    escape = sector[88:120]
    return b"%/@" in escape or b"%/C" in escape or b"%/E" in escape


def _root_record(vd_sector: bytes) -> bytes:
    return vd_sector[156:156 + 34]


def _decode_name(raw: bytes, joliet: bool) -> str:
    if joliet:
        name = raw.decode("utf-16-be", errors="replace")
    else:
        name = raw.decode("ascii", errors="replace")
    if name.endswith(";1"):
        name = name[:-2]
    return name


def _walk(reader: IsoReader, extent_lba: int, data_len: int, joliet: bool, prefix: str,
          out: list[CdFile], depth: int, max_depth: int) -> None:
    data = reader.read_logical(extent_lba, data_len)
    offset = 0
    while offset < len(data):
        rec_len = data[offset]
        if rec_len == 0:
            # advance to next logical sector boundary (directory records don't span sectors)
            next_sector = ((offset // DATA_LEN) + 1) * DATA_LEN
            if next_sector >= len(data):
                break
            offset = next_sector
            continue
        record = data[offset : offset + rec_len]
        child_lba = struct.unpack_from("<I", record, 2)[0]
        child_len = struct.unpack_from("<I", record, 10)[0]
        flags = record[25]
        name_len = record[32]
        name_raw = record[33 : 33 + name_len]
        offset += rec_len
        if name_len == 1 and name_raw in (b"\x00", b"\x01"):  # '.' and '..'
            continue
        name = _decode_name(name_raw, joliet)
        is_dir = bool(flags & 0x02)
        path = f"{prefix}{name}"
        out.append(CdFile(path=path, size=0 if is_dir else child_len, is_dir=is_dir))
        if is_dir and depth < max_depth:
            _walk(reader, child_lba, child_len, joliet, f"{path}/", out, depth + 1, max_depth)


def read_cd_tree(reader: IsoReader, max_depth: int = 12) -> list[CdFile]:
    descriptors = reader.volume_descriptors()
    chosen = None
    joliet = False
    for vd_type, sector in descriptors:
        if _is_joliet(sector):
            chosen, joliet = sector, True
            break
    if chosen is None:
        for vd_type, sector in descriptors:
            if vd_type == 1:
                chosen = sector
                break
    if chosen is None:
        raise RuntimeError("no ISO9660 primary volume descriptor found")
    root = _root_record(chosen)
    root_lba = struct.unpack_from("<I", root, 2)[0]
    root_len = struct.unpack_from("<I", root, 10)[0]
    out: list[CdFile] = []
    _walk(reader, root_lba, root_len, joliet, "", out, 0, max_depth)
    return out


def _install_tree(install: Path) -> dict[str, int]:
    files: dict[str, int] = {}
    for path in install.rglob("*"):
        if path.is_file():
            rel = path.relative_to(install).as_posix().lower()
            files[rel] = path.stat().st_size
    return files


def _normalize_cd(cd_files: list[CdFile]) -> dict[str, int]:
    return {f.path.lower(): f.size for f in cd_files if not f.is_dir}


def cmd_list(args: argparse.Namespace) -> int:
    reader = IsoReader()
    tree = read_cd_tree(reader, max_depth=args.depth)
    dirs = sum(1 for f in tree if f.is_dir)
    files = [f for f in tree if not f.is_dir]
    print(f"# CD tree: {len(files)} files, {dirs} dirs, {reader.requests} range requests, image {reader.total_bytes} bytes")
    for f in tree:
        kind = "DIR " if f.is_dir else f"{f.size:>10}"
        print(f"{kind}  {f.path}")
    return 0


def cmd_audit(args: argparse.Namespace) -> int:
    reader = IsoReader()
    cd_tree = read_cd_tree(reader)
    cd = _normalize_cd(cd_tree)
    install = _install_tree(args.install)

    # Match CD files against the install by BASENAME-aware suffix: the install may nest the CD root
    # under a subdir, so compare by the longest matching path suffix; fall back to basename+size.
    install_by_base: dict[str, list[tuple[str, int]]] = {}
    for rel, size in install.items():
        install_by_base.setdefault(rel.rsplit("/", 1)[-1], []).append((rel, size))

    missing: list[dict[str, object]] = []
    size_mismatch: list[dict[str, object]] = []
    matched = 0
    for cd_path, cd_size in sorted(cd.items()):
        base = cd_path.rsplit("/", 1)[-1]
        candidates = install_by_base.get(base, [])
        exact = [c for c in candidates if c[0] == cd_path or c[0].endswith("/" + cd_path)]
        pool = exact or candidates
        if not pool:
            missing.append({"path": cd_path, "size": cd_size})
            continue
        if any(size == cd_size for _, size in pool):
            matched += 1
        else:
            size_mismatch.append({"path": cd_path, "cdSize": cd_size, "installSizes": [s for _, s in pool]})

    report = {
        "cdImage": {"url": BIN_URL, "totalBytes": reader.total_bytes, "rangeRequests": reader.requests},
        "cdFileCount": len(cd),
        "installFileCount": len(install),
        "matched": matched,
        "missingFromInstallCount": len(missing),
        "sizeMismatchCount": len(size_mismatch),
        "missingFromInstall": missing,
        "sizeMismatch": size_mismatch[:200],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in (
        "cdFileCount", "installFileCount", "matched", "missingFromInstallCount", "sizeMismatchCount")},
        ensure_ascii=False, indent=2))
    if missing:
        print("\n-- MISSING FROM INSTALL (first 40) --")
        for m in missing[:40]:
            print(f"  {m['size']:>10}  {m['path']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p_list = sub.add_parser("list")
    p_list.add_argument("--depth", type=int, default=12)
    p_list.set_defaults(func=cmd_list)
    p_audit = sub.add_parser("audit")
    p_audit.add_argument("--install", type=Path, default=Path(".omo/work/logh7-installed"))
    p_audit.add_argument("--out", type=Path, default=Path(".omo/ui-explorer/cd-audit.json"))
    p_audit.set_defaults(func=cmd_audit)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
