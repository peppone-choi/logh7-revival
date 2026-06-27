import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_galaxy_star_extract import extract_raster_star_dots, extract_star_dots

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF = REPO_ROOT / ".omo" / "work" / "manual_saved.pdf"


class Logh7GalaxyStarExtractTests(unittest.TestCase):
    def test_extracts_80_colored_star_dots_and_rejects_line_markers(self) -> None:
        meta, accepted, rejected = extract_star_dots(PDF, 101)

        self.assertEqual(meta["page"], 101)
        self.assertEqual(len(accepted), 80)
        self.assertEqual(
            sum(1 for item in rejected if item.classification == "annotation_marker"),
            80,
        )
        self.assertEqual(accepted[0].classification, "star_dot")
        self.assertEqual(accepted[0].method, "colored_marker_left_anchor")
        self.assertEqual((accepted[0].cell.col, accepted[0].cell.row), (51, 12))
        self.assertEqual((accepted[0].lineMarkerCell.col, accepted[0].lineMarkerCell.row), (51, 14))

    def test_wrong_page_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "wrong-page.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_galaxy_star_extract",
                    "--inventory-only",
                    "--pdf",
                    str(PDF),
                    "--page",
                    "1",
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("expected 80 star dots", proc.stderr)

    def test_inventory_cli_writes_classification_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "page101-raw.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_galaxy_star_extract",
                    "--inventory-only",
                    "--pdf",
                    str(PDF),
                    "--page",
                    "101",
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))

        self.assertEqual(len(data["accepted"]["star_dot"]), 80)
        self.assertEqual(data["rejected"]["summary"]["annotation_marker"], 80)
        self.assertNotIn("line-marker", data["_method"]["star_dot"])

    def test_regenerate_applies_raster_dot_override_for_iserlohn(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            galaxy = out_dir / "galaxy.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_galaxy_star_extract",
                    "--pdf",
                    str(PDF),
                    "--page",
                    "101",
                    "--out-dir",
                    str(out_dir),
                    "--write-content",
                    str(galaxy),
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            data = json.loads(galaxy.read_text(encoding="utf-8"))

        iserlohn = next(system for system in data["systems"] if system["system"] == "イゼルローン")
        fezzan = next(system for system in data["systems"] if system["system"] == "フェザーン")
        self.assertEqual((iserlohn["canonCol"], iserlohn["canonRow"]), (53, 12))
        self.assertEqual((iserlohn["canonGameCol"], iserlohn["canonGameRow"]), (54, 13))
        self.assertEqual(iserlohn["canonColorRgb"], [184, 92, 55])
        self.assertEqual(iserlohn["spectralClass"], "K")
        self.assertEqual((fezzan["canonCol"], fezzan["canonRow"]), (51, 38))
        self.assertEqual((fezzan["canonGameCol"], fezzan["canonGameRow"]), (52, 39))
        self.assertEqual(fezzan["spectralClass"], "G")

    def test_extracts_80_raster_star_dots_and_keeps_gradient_color_separate(self) -> None:
        raster = extract_raster_star_dots(REPO_ROOT / ".omo" / "work" / "galaxy-extract" / "page101-bg.jpg")

        self.assertEqual(len(raster), 80)
        by_name = {dot.name: dot for dot in raster}
        self.assertEqual((by_name["イゼルローン"].cell.col, by_name["イゼルローン"].cell.row), (53, 12))
        self.assertEqual((by_name["フェザーン"].cell.col, by_name["フェザーン"].cell.row), (51, 38))
        self.assertEqual(by_name["イゼルローン"].spectralClass, "K")
        self.assertEqual(by_name["フェザーン"].spectralClass, "G")
        self.assertNotEqual(
            by_name["イゼルローン"].representativeRgb,
            [255, 213, 187],
            "spectral color must be the background-subtracted disk color, not the center pixel",
        )


if __name__ == "__main__":
    unittest.main()
