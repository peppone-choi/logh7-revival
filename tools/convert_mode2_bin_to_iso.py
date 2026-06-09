#!/usr/bin/env python3
from pathlib import Path
import argparse


SECTOR_SIZE = 2352
PAYLOAD_OFFSET = 24
PAYLOAD_SIZE = 2048


def convert(source: Path, destination: Path) -> int:
    sectors = 0
    with source.open("rb") as src, destination.open("wb") as dst:
        while True:
            sector = src.read(SECTOR_SIZE)
            if not sector:
                break
            if len(sector) != SECTOR_SIZE:
                raise ValueError(f"partial sector at index {sectors}: {len(sector)} bytes")
            dst.write(sector[PAYLOAD_OFFSET : PAYLOAD_OFFSET + PAYLOAD_SIZE])
            sectors += 1
    return sectors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    sectors = convert(args.source, args.destination)
    print(f"converted {sectors} sectors to {args.destination}")


if __name__ == "__main__":
    main()
