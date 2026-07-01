import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_data_sweep import PENDING_COORD_CONTENT_IDS, build_data_sweep
from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


WORKSPACE_ROOT = REPO_ROOT.parent


class Logh7DataSweepTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sweep = build_data_sweep(WORKSPACE_ROOT)

    def test_galaxy_count_distinguishes_85_names_from_80_positions(self) -> None:
        galaxy = self.sweep["galaxy"]

        self.assertEqual(galaxy["systems"], 85)
        self.assertEqual(galaxy["positionedSystems"], 80)
        self.assertEqual(galaxy["coordinatePendingSystems"], 5)
        self.assertEqual(tuple(galaxy["coordinatePendingContentIds"]), PENDING_COORD_CONTENT_IDS)
        self.assertTrue(galaxy["pendingContentIdsMatchExpected"])
        self.assertEqual(galaxy["positionedMarkerSource"]["systems"], 80)
        self.assertEqual(galaxy["adjacency"]["nodes"], 80)

    def test_pending_systems_are_names_only_not_grid_markers(self) -> None:
        pending = self.sweep["galaxy"]["coordinatePending"]

        self.assertEqual([row["contentId"] for row in pending], [13, 32, 34, 52, 75])
        for row in pending:
            self.assertEqual(row["positionAuthority"], "UNVERIFIED_P3")
            self.assertTrue(row["coordinatePending"])
            self.assertEqual(row["nameAuthority"], "constmsg-group-0x18-P0")
            self.assertIsNone(row["cx"])
            self.assertIsNone(row["cy"])
            self.assertIsNone(row["canonGameCol"])
            self.assertIsNone(row["canonGameRow"])

    def test_model_galaxy_summary_records_mdx_limit(self) -> None:
        model = self.sweep["modelGalaxy"]

        self.assertEqual(model["stars"], 79)
        self.assertEqual(model["specialBodies"], 6)
        self.assertIn("NOT necessarily galaxy.json system order", model["coordinateCaveat"])

    def test_delivery_domains_expose_wire_surfaces_and_gates(self) -> None:
        by_domain = {row["domain"]: row for row in self.sweep["deliveryDomains"]}

        galaxy = by_domain["galaxy-grid"]
        self.assertEqual(galaxy["opcodes"], ["0x0313", "0x0315"])
        self.assertTrue(all(item["exists"] for item in galaxy["content"]))
        self.assertIn("5 constmsg-confirmed systems", galaxy["deliveryRisk"])

        personnel = by_domain["characters-personnel"]
        self.assertIn("0x0356", personnel["opcodes"])
        self.assertTrue(any(gate["name"] == "LOGH_POSTLOAD_RICH_CHARACTER" for gate in personnel["gates"]))

        units = by_domain["units-fleets-ships"]
        static_ships = next(gate for gate in units["gates"] if gate["name"] == "LOGH_STATIC_SHIPS")
        self.assertFalse(static_ships["inPlayableDefaults"])
        self.assertFalse(static_ships["effectiveDefault"])
        self.assertEqual(static_ships["defaultMode"], "off-unless-1")
        self.assertTrue(static_ships["launcherEnabled"])

        bases = by_domain["bases-planets-economy"]
        import_bases = next(gate for gate in bases["gates"] if gate["name"] == "LOGH_WORLD_IMPORT_BASES")
        self.assertFalse(import_bases["inPlayableDefaults"])
        self.assertTrue(import_bases["effectiveDefault"])
        self.assertEqual(import_bases["defaultMode"], "implicit-on-unless-0")

    def test_content_copy_comparison_is_present(self) -> None:
        copies = self.sweep["contentCopies"]

        self.assertGreater(copies["counts"]["server"], 0)
        self.assertGreater(copies["counts"]["RE"], 0)
        self.assertGreater(copies["counts"]["common"], 0)
        self.assertEqual(copies["tracked"]["galaxy.json"]["state"], "same")
        self.assertEqual(copies["tracked"]["galaxy-raster-star-centers.json"]["state"], "same")

    def test_pipeline_cli_writes_data_sweep(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "data-sweep.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "data-sweep",
                    "--repo-root",
                    str(WORKSPACE_ROOT),
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(payload["galaxy"]["systems"], 85)
            self.assertEqual(payload["galaxy"]["coordinatePendingContentIds"], [13, 32, 34, 52, 75])


if __name__ == "__main__":
    unittest.main()
