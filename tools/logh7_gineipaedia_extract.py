from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tarfile
import time
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from PIL import Image

DEFAULT_DUMP = Path(".omo/work/gineipaedia/dump.xml")
DEFAULT_IMAGES = Path(".omo/work/gineipaedia/images.tar.xz")
DEFAULT_OUT_ROOT = Path(".omo/work/gineipaedia/extracted")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SKIP_PATH_PARTS = {"/thumb/", "/archive/", "/temp/"}
PEOPLE_CATEGORY_KEYWORDS = (
    "citizens",
    "soldiers",
    "nobility",
    "people",
    "fpa",
    "imperial",
    "free planets alliance",
    "galactic empire",
)


def _norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-z0-9]+", " ", value.lower())
    return re.sub(r"\s+", " ", value).strip()


def _file_key(value: str) -> str:
    value = value.replace("_", " ").strip()
    value = value.split("#", 1)[0]
    return _norm(value)


def _mediawiki_ns(root_tag: str) -> str:
    match = re.match(r"\{(.+)\}", root_tag)
    return "{" + match.group(1) + "}" if match else ""


def _categories(text: str) -> list[str]:
    return [m.strip() for m in re.findall(r"\[\[Category:([^\]|]+)", text, flags=re.I)]


def _image_refs(text: str) -> list[str]:
    return [m.strip() for m in re.findall(r"\[\[(?:File|Image):([^\]|]+)", text, flags=re.I)]


def _is_people_page(title: str, categories: list[str], text: str, redirect: bool) -> bool:
    if title.startswith(("File:", "Image:", "Category:", "Template:", "User:", "Talk:", "Gineipaedia:", "MediaWiki:", "Help:")):
        return False
    low = " ".join(categories).lower()
    if redirect and "people redirects" in low:
        return True
    if any(k in low for k in PEOPLE_CATEGORY_KEYWORDS):
        return True
    text_low = text.lower()
    return "{{character" in text_low or "[[category:people" in text_low or "[[category:characters" in text_low


def parse_dump(path: Path) -> dict[str, Any]:
    context = ET.iterparse(path, events=("start", "end"))
    _, root = next(context)
    ns = _mediawiki_ns(root.tag)
    people: dict[str, dict[str, Any]] = {}
    files: dict[str, dict[str, Any]] = {}
    aliases: dict[str, set[str]] = {}
    counts = {"pages": 0, "redirects": 0, "people_pages": 0, "file_pages": 0, "people_image_refs": 0}

    for event, elem in context:
        if event != "end" or elem.tag != ns + "page":
            continue
        counts["pages"] += 1
        title = elem.findtext(ns + "title") or ""
        redirect_el = elem.find(ns + "redirect")
        redirect_target = redirect_el.attrib.get("title") if redirect_el is not None else None
        counts["redirects"] += 1 if redirect_target else 0
        rev = elem.find(ns + "revision")
        text = rev.findtext(ns + "text") if rev is not None else ""
        text = text or ""
        categories = _categories(text)
        refs = _image_refs(text)
        if title.startswith(("File:", "Image:")):
            name = title.split(":", 1)[1]
            files[_file_key(name)] = {
                "title": title,
                "name": name,
                "categories": categories,
                "text_len": len(text),
            }
            counts["file_pages"] += 1
        if _is_people_page(title, categories, text, bool(redirect_target)):
            people[title] = {
                "title": title,
                "redirect": redirect_target,
                "categories": categories,
                "image_refs": refs,
                "text_len": len(text),
            }
            counts["people_pages"] += 1
            counts["people_image_refs"] += len(refs)
            primary = redirect_target or title
            aliases.setdefault(primary, set()).add(title)
            if redirect_target:
                aliases.setdefault(redirect_target, set()).add(title)
        elem.clear()

    return {
        "counts": counts,
        "people": list(people.values()),
        "files": files,
        "aliases": {k: sorted(v) for k, v in aliases.items()},
    }


def index_tar(path: Path) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    with tarfile.open(path, "r:xz") as tf:
        for member in tf:
            if not member.isfile():
                continue
            name = member.name
            low = "/" + name.lower()
            if any(part in low for part in SKIP_PATH_PARTS):
                continue
            ext = Path(name).suffix.lower()
            if ext not in IMAGE_EXTENSIONS:
                continue
            key = _file_key(Path(name).name)
            out.setdefault(key, []).append({"member": name, "size": member.size})
    for entries in out.values():
        entries.sort(key=lambda x: (x["member"].count("/"), -x["size"], x["member"]))
    return out


def select_candidates(parsed: dict[str, Any], tar_index: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    aliases: list[tuple[str, str]] = []
    for canonical, names in parsed["aliases"].items():
        for name in [canonical, *names]:
            n = _norm(name)
            if len(n) >= 4:
                aliases.append((canonical, n))

    candidates: dict[str, dict[str, Any]] = {}
    for person in parsed["people"]:
        for ref in person.get("image_refs", []):
            key = _file_key(Path(ref).name)
            for hit in tar_index.get(key, []):
                member = hit["member"]
                candidates.setdefault(
                    member,
                    {
                        "member": member,
                        "size": hit["size"],
                        "reasons": [],
                        "people": [],
                    },
                )
                candidates[member]["reasons"].append("person_page_image_ref")
                candidates[member]["people"].append(person["title"])

    for key, hits in tar_index.items():
        file_meta = parsed["files"].get(key)
        combined = key + " " + _norm(file_meta["title"] if file_meta else "")
        matched = []
        for canonical, alias in aliases:
            if alias and alias in combined:
                matched.append(canonical)
        if not matched:
            continue
        for hit in hits[:1]:
            member = hit["member"]
            candidates.setdefault(
                member,
                {
                    "member": member,
                    "size": hit["size"],
                    "reasons": [],
                    "people": [],
                },
            )
            candidates[member]["reasons"].append("filename_alias_match")
            candidates[member]["people"].extend(matched[:8])

    rows = []
    for value in candidates.values():
        value["reasons"] = sorted(set(value["reasons"]))
        value["people"] = sorted(set(value["people"]))
        value["score_hint"] = len(value["people"]) * 2 + len(value["reasons"])
        rows.append(value)
    rows.sort(key=lambda x: (-x["score_hint"], x["member"]))
    return rows


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def extract_candidates(images_tar: Path, rows: list[dict[str, Any]], out_dir: Path, limit: int | None) -> list[dict[str, Any]]:
    selected = rows[:limit] if limit else rows
    wanted = {row["member"]: row for row in selected}
    extracted: list[dict[str, Any]] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(images_tar, "r:xz") as tf:
        for member in tf:
            if member.name not in wanted:
                continue
            row = dict(wanted[member.name])
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(member.name).name)
            dest = out_dir / safe
            if not dest.exists():
                src = tf.extractfile(member)
                if src is None:
                    continue
                dest.write_bytes(src.read())
            row["local_path"] = str(dest)
            row["status"] = "exists"
            row["sha256"] = _sha256(dest)
            try:
                with Image.open(dest) as img:
                    row["width"] = img.width
                    row["height"] = img.height
                    row["mode"] = img.mode
                    row["format"] = img.format
            except Exception as exc:
                row["status"] = "image_error"
                row["error"] = repr(exc)
            extracted.append(row)
    extracted.sort(key=lambda x: (-x.get("score_hint", 0), x["member"]))
    return extracted


def run(dump: Path, images_tar: Path, out_root: Path, limit: int | None) -> dict[str, Any]:
    parsed = parse_dump(dump)
    tar_index = index_tar(images_tar)
    candidates = select_candidates(parsed, tar_index)
    extracted = extract_candidates(images_tar, candidates, out_root / "images", limit=limit)
    out_root.mkdir(parents=True, exist_ok=True)
    character_path = out_root / "character-index.json"
    tar_path = out_root / "image-tar-index.json"
    candidate_path = out_root / "candidate-image-manifest.json"
    character_path.write_text(
        json.dumps(
            {
                "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "counts": parsed["counts"],
                "people": parsed["people"],
                "aliases": parsed["aliases"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    tar_path.write_text(
        json.dumps(
            {
                "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "counts": {"image_names": len(tar_index), "members": sum(len(v) for v in tar_index.values())},
                "images": tar_index,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    entries = []
    for row in extracted:
        entries.append(
            {
                "identifier": "gineipaedia",
                "title": "Gineipaedia extracted image candidate",
                "role": "gineipaedia_character_image",
                "priority": 85,
                "source_name": row["member"],
                "source_url": "https://gineipaedia.com/wiki/Gineipaedia:Closure",
                "local_path": row.get("local_path"),
                "status": row.get("status"),
                "confidence_cap": 0.55,
                "associated_people": row.get("people", []),
                "reasons": row.get("reasons", []),
                "width": row.get("width"),
                "height": row.get("height"),
                "mode": row.get("mode"),
                "format": row.get("format"),
                "bytes": row.get("size"),
                "sha256": row.get("sha256"),
            }
        )
    candidate_path.write_text(
        json.dumps(
            {
                "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "_source_dump": str(dump),
                "_source_images_tar": str(images_tar),
                "_counts": {
                    "people_pages": parsed["counts"]["people_pages"],
                    "tar_image_names": len(tar_index),
                    "candidate_members": len(candidates),
                    "extracted": len(entries),
                },
                "entries": entries,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "character_index": str(character_path),
        "tar_index": str(tar_path),
        "candidate_manifest": str(candidate_path),
        "counts": {
            "people_pages": parsed["counts"]["people_pages"],
            "tar_image_names": len(tar_index),
            "candidate_members": len(candidates),
            "extracted": len(entries),
        },
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Extract Gineipaedia character image evidence from closure dump archives.")
    ap.add_argument("--dump", type=Path, default=DEFAULT_DUMP)
    ap.add_argument("--images-tar", type=Path, default=DEFAULT_IMAGES)
    ap.add_argument("--out-root", type=Path, default=DEFAULT_OUT_ROOT)
    ap.add_argument("--limit", type=int, default=400)
    args = ap.parse_args(argv)
    print(json.dumps(run(args.dump, args.images_tar, args.out_root, args.limit), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
