#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "PyMuPDF",
# ]
# ///

# --- How to run ---
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run tools/logh7_galaxy_star_extract.py --inventory-only --pdf .omo/work/manual_saved.pdf --page 101 --out .omo/work/galaxy-extract/page101-raw.json
# 3. Or run as a module from the repo root:
#      python -m tools.logh7_galaxy_star_extract --inventory-only --pdf .omo/work/manual_saved.pdf --page 101 --out .omo/work/galaxy-extract/page101-raw.json
# ------------------

"""Recover LOGH VII galaxy canon cells from the manual page-101 vector chart.

The recovered PDF has 80 colored vector markers and 80 black inner horizontal
lines. Older recovery used the black line center as the star point. The user
ground truth for Iserlohn proves that is the annotation marker, not the star
anchor. The canon point is the colored marker's left anchor at the paired line
Y, then projected through the already-established 100x50 page lattice.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

import fitz
from PIL import Image

GRID_WIDTH = 100
GRID_HEIGHT = 50
ORIGIN_PX_X = 95.0
ORIGIN_PX_Y = 215.0
PITCH_PX = 14.0
ZOOM = 2.0
RASTER_ORIGIN_PX_X = ORIGIN_PX_X / ZOOM
RASTER_ORIGIN_PX_Y = (ORIGIN_PX_Y / ZOOM) + (PITCH_PX / ZOOM)
RASTER_PITCH_PX = PITCH_PX / ZOOM
PAGE101_WIDTH_PT = 842.0
EXPECTED_STAR_DOTS = 80
PAIR_EPSILON = 0.01
CENTRAL_GAP_COL_MIN = 48
CENTRAL_GAP_COL_MAX = 57
ONE_CELL_CORRIDOR_ROWS = (12, 38)

RASTER_DOT_OVERRIDES = {
    "イゼルローン": {
        "pixelX": 420.88,
        "pixelY": 200.45,
        "rgb": [255, 211, 179],
        "hue": 25.3,
        "spectralClass": "K",
        "reason": "user-confirmed red/orange dot in .omo/work/galaxy-extract/page101-bg.jpg",
        "removeCells": [[51, 14]],
    },
}
RASTER_STAR_CENTERS = Path("content/galaxy-raster-star-centers.json")


@dataclass(frozen=True, slots=True)
class Cell:
    col: int
    row: int


@dataclass(frozen=True, slots=True)
class RectJson:
    x0: float
    y0: float
    x1: float
    y1: float
    width: float
    height: float


@dataclass(frozen=True, slots=True)
class StarDot:
    index: int
    markerDrawingIndex: int
    lineDrawingIndex: int
    dotX: float
    dotY: float
    lineMarkerX: float
    lineMarkerY: float
    markerRect: RectJson
    fill: list[float]
    factionHint: str
    cell: Cell
    lineMarkerCell: Cell
    classification: str = "star_dot"
    method: str = "colored_marker_left_anchor"


@dataclass(frozen=True, slots=True)
class RasterStarDot:
    name: str
    pixelX: float
    pixelY: float
    cell: Cell
    representativeRgb: list[int]
    representativeHue: float
    spectralClass: str
    componentArea: int
    componentBbox: list[int]
    method: str = "manual_audited_raster_star_center"


@dataclass(frozen=True, slots=True)
class RepresentativeColor:
    rgb: list[int]
    hue: float
    spectralClass: str


@dataclass(frozen=True, slots=True)
class RejectedDrawing:
    drawingIndex: int
    classification: str
    reason: str
    rect: RectJson
    fill: list[float] | None
    stroke: list[float] | None


class GalaxyExtractionError(RuntimeError):
    pass


def rect_to_json(rect: fitz.Rect) -> RectJson:
    return RectJson(
        x0=round(float(rect.x0), 3),
        y0=round(float(rect.y0), 3),
        x1=round(float(rect.x1), 3),
        y1=round(float(rect.y1), 3),
        width=round(float(rect.width), 3),
        height=round(float(rect.height), 3),
    )


def color_to_list(color: tuple[float, ...] | None) -> list[float] | None:
    if color is None:
        return None
    return [round(float(v), 6) for v in color]


def faction_hint(fill: tuple[float, ...] | None) -> str:
    if fill is None:
        return "unknown"
    r, g, b = fill
    if g > 0.9 and b > 0.9 and r < 0.1:
        return "empire"
    if g > 0.9 and r > 0.4 and b > 0.4:
        return "alliance"
    if r > 0.9 and g > 0.9 and b < 0.1:
        return "neutral"
    return "unknown"


def is_colored_marker(drawing: dict) -> bool:
    rect = drawing.get("rect")
    fill = drawing.get("fill")
    if rect is None or fill is None:
        return False
    return (
        drawing.get("type") == "fs"
        and 17.0 <= rect.width <= 19.0
        and 18.0 <= rect.height <= 20.0
        and len(drawing.get("items") or []) >= 8
    )


def is_inner_line(drawing: dict) -> bool:
    rect = drawing.get("rect")
    if rect is None:
        return False
    return (
        drawing.get("type") == "s"
        and drawing.get("fill") is None
        and 7.0 <= rect.width <= 8.5
        and abs(rect.height) <= PAIR_EPSILON
    )


def point_to_cell(page_width: float, x: float, y: float) -> Cell:
    pixel_x = (page_width - y) * ZOOM
    pixel_y = x * ZOOM
    return Cell(
        col=round((pixel_x - ORIGIN_PX_X) / PITCH_PX),
        row=round((pixel_y - ORIGIN_PX_Y) / PITCH_PX),
    )


def raster_pixel_to_cell(pixel_x: float, pixel_y: float) -> Cell:
    return Cell(
        col=round((pixel_x - RASTER_ORIGIN_PX_X) / RASTER_PITCH_PX),
        row=round((pixel_y - RASTER_ORIGIN_PX_Y) / RASTER_PITCH_PX),
    )


def raster_override(name: str):
    return RASTER_DOT_OVERRIDES.get(name)


def spectral_class_from_hue(hue: float) -> str:
    if hue < 12.0 or hue >= 340.0:
        return "M"
    if hue < 25.0:
        return "K"
    if hue < 43.0:
        return "G"
    if hue < 60.0:
        return "F"
    if hue < 180.0:
        return "A"
    if hue < 260.0:
        return "B"
    return "M"


def hue_distance(a: float, b: float) -> float:
    diff = abs(a - b) % 360.0
    return min(diff, 360.0 - diff)


def median_rgb(samples: list[tuple[int, int, int]]) -> list[float]:
    return [
        float(median([sample[channel] for sample in samples]))
        for channel in range(3)
    ]


def representative_star_color(
    image: Image.Image,
    pixel_x: float,
    pixel_y: float,
) -> RepresentativeColor:
    width, height = image.size
    center_x = int(round(pixel_x))
    center_y = int(round(pixel_y))
    background_samples: list[tuple[int, int, int]] = []
    disk_samples: list[tuple[float, tuple[int, int, int], tuple[int, int, int]]] = []
    pixels = image.load()
    for y in range(max(0, center_y - 12), min(height, center_y + 13)):
        for x in range(max(0, center_x - 12), min(width, center_x + 13)):
            distance = math.hypot(x - pixel_x, y - pixel_y)
            rgb = tuple(int(channel) for channel in pixels[x, y][:3])
            if 7.0 <= distance <= 11.5:
                background_samples.append(rgb)
            elif distance <= 5.2:
                disk_samples.append((distance, rgb, (0, 0, 0)))
    if not background_samples or not disk_samples:
        raise GalaxyExtractionError(f"cannot sample raster star color at px=({pixel_x:.3f},{pixel_y:.3f})")
    background = median_rgb(background_samples)
    weighted_samples: list[tuple[float, float, tuple[int, int, int]]] = []
    hue_bins: dict[int, float] = {}
    for distance, rgb, _unused in disk_samples:
        residual = tuple(max(0, int(round(rgb[channel] - background[channel]))) for channel in range(3))
        r, g, b = [channel / 255.0 for channel in residual]
        hue, saturation, value = colorsys.rgb_to_hsv(r, g, b)
        if value < 0.08 or saturation < 0.12:
            continue
        hue_degrees = (hue * 360.0) % 360.0
        weight = saturation * value
        if distance <= 3.2:
            weight *= 1.1
        bin_key = int(round(hue_degrees / 15.0) * 15) % 360
        hue_bins[bin_key] = hue_bins.get(bin_key, 0.0) + weight
        weighted_samples.append((hue_degrees, weight, residual))
    if not weighted_samples or not hue_bins:
        raise GalaxyExtractionError(f"cannot isolate raster star hue at px=({pixel_x:.3f},{pixel_y:.3f})")
    dominant_hue = max(hue_bins.items(), key=lambda item: item[1])[0]
    selected = [
        (weight, residual)
        for hue_degrees, weight, residual in weighted_samples
        if hue_distance(hue_degrees, float(dominant_hue)) <= 22.5
    ]
    if not selected:
        selected = [(weight, residual) for _hue, weight, residual in weighted_samples]
    total_weight = sum(weight for weight, _residual in selected)
    if total_weight <= 0.0:
        raise GalaxyExtractionError(f"zero raster star color weight at px=({pixel_x:.3f},{pixel_y:.3f})")
    rgb = [
        int(round(sum(weight * residual[channel] for weight, residual in selected) / total_weight))
        for channel in range(3)
    ]
    hue, _saturation, _value = colorsys.rgb_to_hsv(*(channel / 255.0 for channel in rgb))
    hue_degrees = round((hue * 360.0) % 360.0, 1)
    return RepresentativeColor(
        rgb=rgb,
        hue=hue_degrees,
        spectralClass=spectral_class_from_hue(hue_degrees),
    )


def extract_raster_star_dots(
    raster_image: Path,
    raster_centers: Path = RASTER_STAR_CENTERS,
) -> list[RasterStarDot]:
    if not raster_image.exists():
        raise GalaxyExtractionError(f"raster star-chart image not found: {raster_image}")
    if not raster_centers.exists():
        raise GalaxyExtractionError(f"raster star-center table not found: {raster_centers}")
    payload = json.loads(raster_centers.read_text(encoding="utf-8"))
    systems = payload.get("systems")
    if not isinstance(systems, list):
        raise GalaxyExtractionError(f"{raster_centers}: missing systems list")
    dots: list[RasterStarDot] = []
    image = Image.open(raster_image).convert("RGB")
    for item in systems:
        name = str(item.get("name", ""))
        cell = item.get("cell")
        bbox = item.get("componentBbox", [])
        if not name or not isinstance(cell, list) or len(cell) != 2:
            raise GalaxyExtractionError(f"{raster_centers}: malformed raster center entry for {name!r}")
        pixel_x = round(float(item["pixelX"]), 3)
        pixel_y = round(float(item["pixelY"]), 3)
        table_cell = Cell(col=int(cell[0]), row=int(cell[1]))
        computed_cell = raster_pixel_to_cell(pixel_x, pixel_y)
        if computed_cell != table_cell:
            raise GalaxyExtractionError(
                f"{raster_centers}: {name} cell {table_cell} does not match raster formula {computed_cell}"
            )
        color = representative_star_color(image, pixel_x, pixel_y)
        dots.append(RasterStarDot(
            name=name,
            pixelX=pixel_x,
            pixelY=pixel_y,
            cell=computed_cell,
            representativeRgb=color.rgb,
            representativeHue=color.hue,
            spectralClass=color.spectralClass,
            componentArea=int(item.get("componentArea", 0)),
            componentBbox=[int(value) for value in bbox],
        ))
    if len(dots) != EXPECTED_STAR_DOTS:
        raise GalaxyExtractionError(f"expected 80 raster star dots, found {len(dots)} in {raster_centers}")
    cells = {(dot.cell.col, dot.cell.row) for dot in dots}
    if len(cells) != len(dots):
        raise GalaxyExtractionError(f"{raster_centers}: duplicate raster star cells")
    return dots


def raster_star_dots_by_name(
    raster_image: Path,
    raster_centers: Path = RASTER_STAR_CENTERS,
) -> dict[str, RasterStarDot]:
    return {dot.name: dot for dot in extract_raster_star_dots(raster_image, raster_centers)}


def extract_star_dots(pdf: Path, page_number: int) -> tuple[dict, list[StarDot], list[RejectedDrawing]]:
    doc = fitz.open(pdf)
    if page_number < 1 or page_number > doc.page_count:
        raise GalaxyExtractionError(f"page {page_number} outside PDF page count {doc.page_count}")
    page = doc[page_number - 1]
    drawings = page.get_drawings()
    accepted: list[StarDot] = []
    rejected: list[RejectedDrawing] = []
    used_line_indices: set[int] = set()

    for index, drawing in enumerate(drawings):
        rect = drawing.get("rect")
        if rect is None:
            continue
        if not is_colored_marker(drawing):
            continue
        if index + 1 >= len(drawings) or not is_inner_line(drawings[index + 1]):
            rejected.append(RejectedDrawing(
                drawingIndex=index,
                classification="unpaired_colored_marker",
                reason="colored marker is not immediately followed by its black inner line",
                rect=rect_to_json(rect),
                fill=color_to_list(drawing.get("fill")),
                stroke=color_to_list(drawing.get("color")),
            ))
            continue

        line = drawings[index + 1]
        line_rect = line["rect"]
        line_x = (line_rect.x0 + line_rect.x1) / 2.0
        line_y = (line_rect.y0 + line_rect.y1) / 2.0
        dot_x = rect.x0
        dot_y = line_y
        accepted.append(StarDot(
            index=len(accepted),
            markerDrawingIndex=index,
            lineDrawingIndex=index + 1,
            dotX=round(float(dot_x), 3),
            dotY=round(float(dot_y), 3),
            lineMarkerX=round(float(line_x), 3),
            lineMarkerY=round(float(line_y), 3),
            markerRect=rect_to_json(rect),
            fill=color_to_list(drawing.get("fill")) or [],
            factionHint=faction_hint(drawing.get("fill")),
            cell=point_to_cell(page.rect.width, dot_x, dot_y),
            lineMarkerCell=point_to_cell(page.rect.width, line_x, line_y),
        ))
        used_line_indices.add(index + 1)

    for index, drawing in enumerate(drawings):
        rect = drawing.get("rect")
        if rect is None:
            continue
        if is_inner_line(drawing):
            rejected.append(RejectedDrawing(
                drawingIndex=index,
                classification="annotation_marker",
                reason="black inner horizontal line; old extractor used this center and shifted rows",
                rect=rect_to_json(rect),
                fill=color_to_list(drawing.get("fill")),
                stroke=color_to_list(drawing.get("color")),
            ))
        elif not is_colored_marker(drawing) and index not in used_line_indices:
            rejected.append(RejectedDrawing(
                drawingIndex=index,
                classification="other_drawing",
                reason="not a colored star marker and not the paired inner annotation line",
                rect=rect_to_json(rect),
                fill=color_to_list(drawing.get("fill")),
                stroke=color_to_list(drawing.get("color")),
            ))

    if len(accepted) != EXPECTED_STAR_DOTS:
        raise GalaxyExtractionError(f"expected 80 star dots, found {len(accepted)} on page {page_number}")

    meta = {
        "pdf": str(pdf),
        "page": page_number,
        "pageRotation": page.rotation,
        "pageRect": [round(float(page.rect.x0), 3), round(float(page.rect.y0), 3),
                     round(float(page.rect.x1), 3), round(float(page.rect.y1), 3)],
        "drawingCount": len(drawings),
        "grid": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "pitchPx": PITCH_PX,
            "originPx": [ORIGIN_PX_X, ORIGIN_PX_Y],
            "projection": "col=round(((pageWidth-y)*2-originX)/pitch), row=round((x*2-originY)/pitch)",
        },
    }
    return meta, accepted, rejected


def inventory_json(meta: dict, accepted: list[StarDot], rejected: list[RejectedDrawing]) -> dict:
    by_rejection: dict[str, int] = {}
    for item in rejected:
        by_rejection[item.classification] = by_rejection.get(item.classification, 0) + 1
    return {
        "_source": "gin7manual page 101 vector drawings",
        "_generated": datetime.now(timezone.utc).isoformat(),
        "_method": {
            "star_dot": "accept colored 18x19pt vector marker; canon point is marker rect.x0 at paired black-line y",
            "annotation_marker": "reject black 7.824pt inner horizontal line; this was the old wrong point",
            "axis": "preserve page rotation=90 transform; no cx/cy regrid",
        },
        "meta": meta,
        "accepted": {"star_dot": [asdict(dot) for dot in accepted]},
        "rejected": {
            "summary": by_rejection,
            "drawings": [asdict(item) for item in rejected],
        },
    }


def write_overlay(pdf: Path, page_number: int, accepted: list[StarDot], rejected: list[RejectedDrawing], out: Path) -> None:
    doc = fitz.open(pdf)
    page = doc[page_number - 1]
    shape = page.new_shape()
    for dot in accepted:
        shape.draw_circle(fitz.Point(dot.dotX, dot.dotY), 2.6)
        shape.draw_rect(fitz.Rect(
            dot.markerRect.x0,
            dot.markerRect.y0,
            dot.markerRect.x1,
            dot.markerRect.y1,
        ))
    for item in rejected:
        if item.classification != "annotation_marker":
            continue
        y = (item.rect.y0 + item.rect.y1) / 2.0
        shape.draw_line(fitz.Point(item.rect.x0, y), fitz.Point(item.rect.x1, y))
    shape.finish(color=(1, 0, 0), fill=None, width=0.8)
    shape.commit()
    out.parent.mkdir(parents=True, exist_ok=True)
    page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(out)


def find_candidate_for_system(system: dict, candidates: list[StarDot], previous_by_name: dict[str, dict]) -> StarDot:
    name = str(system["system"])
    previous = previous_by_name.get(name, {})
    line_x = previous.get("lineMarkerX", previous.get("dotX", system.get("canonDotX")))
    line_y = previous.get("lineMarkerY", previous.get("dotY", system.get("canonDotY")))
    if not isinstance(line_x, int | float) or not isinstance(line_y, int | float):
        raise GalaxyExtractionError(f"{name}: no previous line marker coordinate for candidate matching")
    return min(candidates, key=lambda dot: (dot.lineMarkerX - line_x) ** 2 + (dot.lineMarkerY - line_y) ** 2)


def previous_canon_by_name(path: Path | None) -> dict[str, dict]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(item.get("name")): item for item in data.get("systems", []) if item.get("name")}


def canon_positions_json(
    galaxy: dict,
    candidates_by_name: dict[str, StarDot],
    previous: dict | None,
    raster_by_name: dict[str, RasterStarDot],
) -> dict:
    existing = previous or {}
    systems = []
    for system in galaxy["systems"]:
        dot = candidates_by_name[system["system"]]
        raster = raster_by_name.get(system["system"])
        cell = dot.cell
        dot_x = dot.dotX
        dot_y = dot.dotY
        extra = {}
        if raster:
            pixel_x = raster.pixelX
            pixel_y = raster.pixelY
            cell = raster.cell
            dot_x = round(pixel_y, 3)
            dot_y = round(PAGE101_WIDTH_PT - pixel_x, 3)
            extra = {
                "canonPixelX": round(pixel_x, 3),
                "canonPixelY": round(pixel_y, 3),
                "canonColorRgb": raster.representativeRgb,
                "canonColorHue": raster.representativeHue,
                "spectralClass": raster.spectralClass,
                "rasterOverrideReason": "manual-audited raster star-circle center and background-subtracted disk color",
            }
        systems.append({
            "name": system["system"],
            "faction": system.get("faction"),
            "faction_color_hint": dot.factionHint,
            "dotX": dot_x,
            "dotY": dot_y,
            "lineMarkerX": dot.lineMarkerX,
            "lineMarkerY": dot.lineMarkerY,
            "markerRect": asdict(dot.markerRect),
            "col": cell.col,
            "row": cell.row,
            "gameCol": cell.col + 1,
            "gameRow": cell.row + 1,
            "lineMarkerCol": dot.lineMarkerCell.col,
            "lineMarkerRow": dot.lineMarkerCell.row,
            "is_corridor": system.get("is_corridor", 0),
            "planets": [p if isinstance(p, str) else p.get("name") for p in system.get("planets", [])],
            "fortresses": system.get("fortresses", []),
            **extra,
        })
    payload = {
        "_source": "gin7manualsaved.pdf page 101 星系図 vector colored markers + galaxy.json names",
        "_generated": datetime.now(timezone.utc).date().isoformat(),
        "_method": {
            "frame_alignment": "page rotation=90; no axis regrid; cx/cy remain manual annotation centres only",
            "star_dot": "PDF vector markers identify labels only; raster star-circle centers provide canon coordinates",
            "raster_dot": "content/galaxy-raster-star-centers.json was audited from .omo/work/galaxy-extract/page101-bg.jpg actual circular dots",
            "annotation_marker_rejected": "black 7.824pt inner horizontal line; old nearest line-marker center is not canon",
            "grid": "page101 lattice pitch 14px=7pt/cell; origin col0row0 center px=(95,215); 100x50",
            "coordinate_indexing": "game grid coordinates are 1-indexed; col/row are zero-indexed wire cells",
        },
        "grid": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "pitchPx": PITCH_PX,
            "pitchPt": PITCH_PX / ZOOM,
            "originPx": [ORIGIN_PX_X, ORIGIN_PX_Y],
            "dotPxToCell": "col=round((px-95)/14), row=round((py-215)/14)",
            "gapCol": 50,
        },
        "systems": systems,
    }
    for key in ("passableCells", "passableCount", "regions"):
        if key in existing:
            payload[key] = existing[key]
    return payload


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def update_galaxy(
    galaxy_path: Path,
    candidates_by_name: dict[str, StarDot],
    raster_by_name: dict[str, RasterStarDot],
) -> dict:
    galaxy = json.loads(galaxy_path.read_text(encoding="utf-8"))
    for system in galaxy["systems"]:
        dot = candidates_by_name[system["system"]]
        raster = raster_by_name.get(system["system"])
        cell = dot.cell
        dot_x = dot.dotX
        dot_y = dot.dotY
        if raster:
            pixel_x = raster.pixelX
            pixel_y = raster.pixelY
            cell = raster.cell
            dot_x = round(pixel_y, 3)
            dot_y = round(PAGE101_WIDTH_PT - pixel_x, 3)
            system["canonPixelX"] = round(pixel_x, 3)
            system["canonPixelY"] = round(pixel_y, 3)
            system["canonColorRgb"] = raster.representativeRgb
            system["canonColorHue"] = raster.representativeHue
            system["spectralClass"] = raster.spectralClass
            system["spectralClassSource"] = (
                "page101-bg actual star disk color after local background subtraction; "
                "center pixel alone is not used"
            )
        system["canonDotX"] = dot_x
        system["canonDotY"] = dot_y
        system["canonLineMarkerX"] = dot.lineMarkerX
        system["canonLineMarkerY"] = dot.lineMarkerY
        system["canonLineMarkerCol"] = dot.lineMarkerCell.col
        system["canonLineMarkerRow"] = dot.lineMarkerCell.row
        system["canonCol"] = cell.col
        system["canonRow"] = cell.row
        system["canonGameCol"] = cell.col + 1
        system["canonGameRow"] = cell.row + 1
    galaxy["_source"] = (
        "gin7manualsaved.pdf 星系図 special Text annotations (80 system labels; cx/cy only); "
        "canonCol/canonRow are zero-indexed wire cells from page-101 raster star-dot centers "
        "(.omo/work/galaxy-extract/page101-bg.jpg; labels/annotations identify names only; "
        "black inner line markers rejected; game grid coordinates are 1-indexed in canonGameCol/canonGameRow)"
    )
    galaxy["_canon_grid"] = {
        "width": GRID_WIDTH,
        "height": GRID_HEIGHT,
        "coordinateBase": {
            "canonColRow": 0,
            "canonGameColRow": 1,
        },
        "note": "canonCol/canonRow feed the 0x0315 zero-indexed wire array; canonGameCol/canonGameRow are the 1-indexed in-game grid coordinates",
    }
    return galaxy


def cells_to_ranges(cells: set[tuple[int, int]]) -> dict[str, list[list[int]]]:
    rows: dict[int, list[int]] = {}
    for col, row in sorted(cells, key=lambda item: (item[1], item[0])):
        rows.setdefault(row, []).append(col)
    out: dict[str, list[list[int]]] = {}
    for row, cols in rows.items():
        ranges: list[list[int]] = []
        start = prev = cols[0]
        for col in cols[1:]:
            if col == prev + 1:
                prev = col
                continue
            ranges.append([start, prev])
            start = prev = col
        ranges.append([start, prev])
        out[str(row)] = ranges
    return out


def parse_ranges(source: dict) -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for row_key, row_ranges in source.get("rowRangesByRow", {}).items():
        row = int(row_key)
        for lo, hi in row_ranges:
            for col in range(int(lo), int(hi) + 1):
                cells.add((col, row))
    return cells


def enforce_one_cell_corridors(cells: set[tuple[int, int]]) -> list[list[int]]:
    removed: list[list[int]] = []
    corridor_rows = set(ONE_CELL_CORRIDOR_ROWS)
    for row in range(GRID_HEIGHT):
        for col in range(CENTRAL_GAP_COL_MIN, CENTRAL_GAP_COL_MAX + 1):
            cell = (col, row)
            if row in corridor_rows:
                cells.add(cell)
            elif cell in cells:
                cells.remove(cell)
                removed.append([col, row])
    return removed


def rebuild_passable(canon_path: Path, out_path: Path) -> dict:
    canon = json.loads(canon_path.read_text(encoding="utf-8"))
    base = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    cells = parse_ranges(base)
    removed_wide_corridor_cells = enforce_one_cell_corridors(cells)
    removed_stale_corridor_cells = []
    for system in canon["systems"]:
        cells.add((int(system["col"]), int(system["row"])))
        override = raster_override(system["name"])
        if override:
            for stale_col, stale_row in override.get("removeCells", []):
                stale = (int(stale_col), int(stale_row))
                if stale in cells:
                    cells.remove(stale)
                    removed_stale_corridor_cells.append([stale[0], stale[1], system["name"]])
        if system.get("is_corridor"):
            stale = (int(system["lineMarkerCol"]), int(system["lineMarkerRow"]))
            current = (int(system["col"]), int(system["row"]))
            if stale != current and stale in cells:
                cells.remove(stale)
                removed_stale_corridor_cells.append([stale[0], stale[1], system["name"]])
    payload = {
        "_source": (
            ".omo/work/galaxy-extract/canon-positions.json actual star-dot cells + previous pixel mask; "
            "central gap re-cut to two one-cell corridor rows; stale annotation-marker line cells removed"
        ),
        "_grid": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "pitchPx": PITCH_PX,
            "pitchPt": PITCH_PX / ZOOM,
            "originPx": [ORIGIN_PX_X, ORIGIN_PX_Y],
            "gapCol": 50,
        },
        "_count": len(cells),
        "_method": {
            "base": "previous pixel-mask row ranges",
            "fix": "close the central gap except two 1-cell-high corridor rows; add all recovered star-dot system cells; remove stale line-marker cells for corridor systems",
            "corridorWidthCells": 1,
            "centralGapClosedCols": [CENTRAL_GAP_COL_MIN, CENTRAL_GAP_COL_MAX],
            "oneCellCorridorRows": list(ONE_CELL_CORRIDOR_ROWS),
            "removedWideCorridorCells": removed_wide_corridor_cells,
            "removedStaleCorridorCells": removed_stale_corridor_cells,
        },
        "rowRangesByRow": cells_to_ranges(cells),
    }
    write_json(out_path, payload)
    return payload


def run_inventory(args: argparse.Namespace) -> int:
    meta, accepted, rejected = extract_star_dots(args.pdf, args.page)
    payload = inventory_json(meta, accepted, rejected)
    if args.out:
        write_json(args.out, payload)
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    if args.overlay:
        write_overlay(args.pdf, args.page, accepted, rejected, args.overlay)
    print(json.dumps({
        "acceptedStarDots": len(accepted),
        "rejectedAnnotationMarkers": sum(1 for item in rejected if item.classification == "annotation_marker"),
        "out": str(args.out) if args.out else None,
        "overlay": str(args.overlay) if args.overlay else None,
    }, ensure_ascii=False))
    return 0


def run_regenerate(args: argparse.Namespace) -> int:
    meta, accepted, rejected = extract_star_dots(args.pdf, args.page)
    out_dir = args.out_dir
    previous_path = out_dir / "canon-positions.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {}
    previous_names = previous_canon_by_name(previous_path)
    galaxy = json.loads(args.galaxy.read_text(encoding="utf-8"))
    candidates_by_name = {
        system["system"]: find_candidate_for_system(system, accepted, previous_names)
        for system in galaxy["systems"]
    }
    raster_by_name = raster_star_dots_by_name(args.raster_image, args.raster_centers)
    write_json(out_dir / "page101-raw.json", inventory_json(meta, accepted, rejected))
    write_json(out_dir / "dots.json", {
        "_source": "page-101 colored vector star marker left anchors",
        "dots": [[dot.dotX, dot.dotY] for dot in accepted],
        "lineMarkers": [[dot.lineMarkerX, dot.lineMarkerY] for dot in accepted],
    })
    updated_galaxy = update_galaxy(args.galaxy, candidates_by_name, raster_by_name)
    write_json(
        out_dir / "canon-positions.json",
        canon_positions_json(updated_galaxy, candidates_by_name, previous, raster_by_name),
    )
    write_overlay(args.pdf, args.page, accepted, rejected, out_dir / "canon-overlay.png")
    if args.write_content:
        write_json(args.write_content, updated_galaxy)
    iserlohn = next(system for system in updated_galaxy["systems"] if system["system"] == "イゼルローン")
    print(json.dumps({
        "actualStarDots": len(accepted),
        "systemsMatched": len(candidates_by_name),
        "rasterSystemsMatched": len(raster_by_name),
        "annotationMarkersAccepted": 0,
        "iserlohn": {
            "cell": [
                iserlohn["canonCol"],
                iserlohn["canonRow"],
            ],
            "gameCell": [
                iserlohn["canonGameCol"],
                iserlohn["canonGameRow"],
            ],
        },
    }, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract LOGH VII manual page-101 galaxy star markers.")
    parser.add_argument("--pdf", type=Path, default=Path(".omo/work/manual_saved.pdf"))
    parser.add_argument("--page", type=int, default=101)
    parser.add_argument("--inventory-only", action="store_true")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--overlay", type=Path)
    parser.add_argument("--galaxy", type=Path, default=Path("content/galaxy.json"))
    parser.add_argument("--out-dir", type=Path, default=Path(".omo/work/galaxy-extract"))
    parser.add_argument("--raster-image", type=Path, default=Path(".omo/work/galaxy-extract/page101-bg.jpg"))
    parser.add_argument("--raster-centers", type=Path, default=RASTER_STAR_CENTERS)
    parser.add_argument("--write-content", type=Path)
    parser.add_argument("--rebuild-passable", action="store_true")
    parser.add_argument("--canon", type=Path, default=Path(".omo/work/galaxy-extract/canon-positions.json"))
    args = parser.parse_args()

    try:
        if args.rebuild_passable:
            if args.out is None:
                parser.error("--rebuild-passable requires --out")
            payload = rebuild_passable(args.canon, args.out)
            print(json.dumps({
                "wrote": str(args.out),
                "passableCount": payload["_count"],
                "iserlohnPassable": any(lo <= 53 <= hi for lo, hi in payload["rowRangesByRow"].get("12", [])),
                "iserlohnOldCyanEdgeCorridorFloor": any(
                    lo <= 51 <= hi for lo, hi in payload["rowRangesByRow"].get("12", [])
                ),
                "staleIserlohnLineMarkerPassable": any(
                    lo <= 51 <= hi for lo, hi in payload["rowRangesByRow"].get("14", [])
                ),
            }, ensure_ascii=False))
            return 0
        if args.inventory_only:
            return run_inventory(args)
        return run_regenerate(args)
    except GalaxyExtractionError as exc:
        parser.exit(2, f"{exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
