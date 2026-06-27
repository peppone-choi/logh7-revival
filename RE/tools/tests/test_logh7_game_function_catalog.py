import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo/work/logh7-installed/exe/G7MTClient.exe"
INSTALLED_ROOT = REPO_ROOT / ".omo/work/logh7-installed"
MANUAL_PDF = (
    REPO_ROOT
    / ".omo/work/logh7-extracted/____________s___/____/doc/___p_`_V_}_j___A__.pdf"
)


class Logh7GameFunctionCatalogTests(unittest.TestCase):
    def test_indexes_function_surface_against_required_tcp_response_families(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "game-function-catalog.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "game-function-catalog",
                    str(CLIENT_EXE),
                    "--installed-root",
                    str(INSTALLED_ROOT),
                    "--manual-pdf",
                    str(MANUAL_PDF),
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
            catalog = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(catalog["manualPdf"]["exists"], True)
            self.assertIn("session-bootstrap", catalog["responseFamilies"])
            self.assertEqual(
                {item["transportHex"] for item in catalog["responseFamilies"]["session-bootstrap"]["responses"]},
                {"0x0001", "0x0003"},
            )
            movement = catalog["gameFunctions"]["movement"]
            self.assertIn("data/image/icon_down/idou.tga", movement["assetEvidence"])
            self.assertEqual(
                {item["transportHex"] for item in movement["knownTcpResponses"]},
                {"0x0031", "0x0032", "0x0033"},
            )
            self.assertEqual(catalog["gameFunctions"]["combat"]["knownTcpResponses"], [])
            self.assertIn("SSGameLoginOK", catalog["requirements"][0]["mustProve"])
            self.assertIn("low transport framing/session-state prerequisite", catalog["nextReverseEngineeringQueue"][0])


if __name__ == "__main__":
    unittest.main()
