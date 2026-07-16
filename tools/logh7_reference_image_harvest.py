from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image

DEFAULT_CATALOG = Path("content/roster/archive-org-logh-sources.json")
DEFAULT_OUT = Path(".omo/work/logh7-reference-images/archive-reference-manifest.json")
DEFAULT_ROOT = Path(".omo/work/logh7-reference-images")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff", ".jp2", ".bmp"}


def _safe_name(value: str) -> str:
    value = value.replace("\\", "/").split("/")[-1]
    value = re.sub(r"[^A-Za-z0-9._()\\[\\] -]+", "_", value)
    return value[:160] or "image"


def _confidence_cap(role: str) -> float:
    if role.startswith("vii_primary"):
        return 0.95
    if "prior" in role:
        return 0.75
    if "manual" in role or "scan" in role:
        return 0.65
    if "later" in role:
        return 0.45
    return 0.50


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _image_info(path: Path) -> dict[str, Any]:
    with Image.open(path) as img:
        return {"width": img.width, "height": img.height, "mode": img.mode, "format": img.format}


def _file_size(spec: dict[str, Any]) -> int | None:
    raw = spec.get("size")
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def iter_image_candidates(catalog: dict[str, Any], max_bytes: int) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in catalog.get("items", []):
        for spec in item.get("candidate_files", []):
            name = spec.get("name", "")
            ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext not in IMAGE_EXTENSIONS:
                continue
            size = _file_size(spec)
            candidates.append(
                {
                    "identifier": item.get("identifier"),
                    "title": item.get("title"),
                    "role": item.get("role"),
                    "priority": item.get("priority", 0),
                    "archive_url": item.get("archive_url"),
                    "source_name": name,
                    "source_url": spec.get("direct_url"),
                    "format": spec.get("format"),
                    "declared_size": size,
                    "confidence_cap": _confidence_cap(str(item.get("role", ""))),
                    "skip_reason": "over_max_bytes" if size is not None and size > max_bytes else None,
                }
            )
    candidates.sort(key=lambda x: (x["skip_reason"] is not None, -int(x.get("priority") or 0), x["identifier"] or "", x["source_name"]))
    return candidates


def _download(url: str, dest: Path, timeout: int) -> None:
    parts = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, urllib.parse.quote(parts.path, safe="/%"), parts.query, parts.fragment)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "logh7-revival-research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)


def harvest(
    catalog_path: Path = DEFAULT_CATALOG,
    out_path: Path = DEFAULT_OUT,
    root: Path = DEFAULT_ROOT,
    limit: int = 30,
    max_bytes: int = 30_000_000,
    timeout: int = 45,
) -> dict[str, Any]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    candidates = iter_image_candidates(catalog, max_bytes=max_bytes)
    entries: list[dict[str, Any]] = []
    attempted = 0

    for cand in candidates:
        entry = dict(cand)
        if cand.get("skip_reason"):
            entry["status"] = "skipped"
            entries.append(entry)
            continue
        if attempted >= limit:
            entry["status"] = "skipped"
            entry["skip_reason"] = "limit_reached"
            entries.append(entry)
            continue
        attempted += 1
        ident = str(cand["identifier"])
        dest = root / ident / _safe_name(str(cand["source_name"]))
        entry["local_path"] = str(dest)
        try:
            if not dest.exists():
                _download(str(cand["source_url"]), dest, timeout=timeout)
                entry["status"] = "downloaded"
                time.sleep(0.1)
            else:
                entry["status"] = "exists"
            entry["bytes"] = dest.stat().st_size
            entry["sha256"] = _sha256(dest)
            entry.update(_image_info(dest))
        except Exception as exc:
            entry["status"] = "error"
            entry["error"] = repr(exc)
            if dest.exists() and dest.stat().st_size == 0:
                dest.unlink()
        entries.append(entry)

    manifest = {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_source_catalog": str(catalog_path),
        "_root": str(root),
        "_limits": {"limit": limit, "max_bytes": max_bytes, "timeout": timeout},
        "_counts": {
            "candidates": len(candidates),
            "entries": len(entries),
            "downloaded_or_existing": sum(1 for e in entries if e.get("status") in {"downloaded", "exists"}),
            "skipped": sum(1 for e in entries if e.get("status") == "skipped"),
            "errors": sum(1 for e in entries if e.get("status") == "error"),
        },
        "entries": entries,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Harvest bounded public reference images from the LOGH Archive.org source catalog."
    )
    ap.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--max-bytes", type=int, default=30_000_000)
    ap.add_argument("--timeout", type=int, default=45)
    args = ap.parse_args(argv)

    manifest = harvest(
        catalog_path=args.catalog,
        out_path=args.out,
        root=args.root,
        limit=args.limit,
        max_bytes=args.max_bytes,
        timeout=args.timeout,
    )
    print(json.dumps(manifest["_counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
