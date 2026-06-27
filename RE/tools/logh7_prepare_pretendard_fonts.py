from __future__ import annotations

import argparse
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_VERSION: Final = "v1.3.9"
RELEASE_API: Final = "https://api.github.com/repos/orioncactus/pretendard/releases/tags/{version}"
LICENSE_URL: Final = "https://raw.githubusercontent.com/orioncactus/pretendard/main/LICENSE"
FAMILIES: Final = ("Pretendard", "PretendardJP", "PretendardStd")


class FontDownloadError(RuntimeError):
    pass


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"user-agent": "logh7-revival-font-fetcher"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"user-agent": "logh7-revival-font-fetcher"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def asset_by_family(release: dict) -> dict[str, dict]:
    assets = release.get("assets")
    if not isinstance(assets, list):
        raise FontDownloadError("GitHub release response does not contain assets")
    by_family: dict[str, dict] = {}
    for family in FAMILIES:
        prefix = f"{family}-"
        match = next(
            (
                asset for asset in assets
                if isinstance(asset, dict)
                and isinstance(asset.get("name"), str)
                and asset["name"].startswith(prefix)
                and asset["name"].endswith(".zip")
            ),
            None,
        )
        if match is None:
            names = ", ".join(str(asset.get("name")) for asset in assets if isinstance(asset, dict))
            raise FontDownloadError(f"release asset for {family} not found; available: {names}")
        by_family[family] = match
    return by_family


def extract_fonts(zip_path: Path, family: str, destination: Path) -> list[str]:
    target = destination / family
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    seen_names: set[str] = set()
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            name = Path(info.filename).name
            if not name.lower().endswith((".ttf", ".otf")):
                continue
            if name in seen_names:
                continue
            seen_names.add(name)
            out = target / name
            with archive.open(info) as source, out.open("wb") as sink:
                shutil.copyfileobj(source, sink)
            written.append(out.relative_to(destination).as_posix())
    if not written:
        raise FontDownloadError(f"{zip_path} did not contain TTF/OTF files")
    return sorted(written)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download official Pretendard font release assets.")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="GitHub release tag, default v1.3.9")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "fonts")
    parser.add_argument("--cache", type=Path, default=REPO_ROOT / ".omo" / "cache" / "pretendard")
    args = parser.parse_args()

    out_dir = args.out.resolve()
    cache_dir = args.cache.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    release = fetch_json(RELEASE_API.format(version=args.version))
    assets = asset_by_family(release)
    manifest = {
        "source": "orioncactus/pretendard",
        "version": args.version,
        "families": {},
    }

    for family, asset in assets.items():
        url = asset.get("browser_download_url")
        if not isinstance(url, str):
            raise FontDownloadError(f"{family} asset has no browser_download_url")
        zip_path = cache_dir / asset["name"]
        zip_path.write_bytes(fetch_bytes(url))
        manifest["families"][family] = {
            "asset": asset["name"],
            "sourceUrl": url,
            "files": extract_fonts(zip_path, family, out_dir),
        }

    (out_dir / "OFL.txt").write_bytes(fetch_bytes(LICENSE_URL))
    (out_dir / "PRETENDARD-MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
