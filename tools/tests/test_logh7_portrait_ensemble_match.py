from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from tools.logh7_portrait_ensemble_match import run_match


def _base_image() -> np.ndarray:
    arr = np.zeros((80, 64, 3), dtype=np.uint8)
    yy, xx = np.mgrid[0:80, 0:64]
    arr[:, :, 0] = np.clip(40 + xx * 3, 0, 255)
    arr[:, :, 1] = np.clip(30 + yy * 2, 0, 255)
    arr[:, :, 2] = 80
    mask = ((xx - 25) ** 2) / 160 + ((yy - 38) ** 2) / 360 < 1
    arr[mask] = [220, 170, 130]
    arr[25:32, 18:24] = [20, 20, 30]
    arr[25:32, 34:40] = [20, 20, 30]
    arr[50:54, 26:40] = [120, 35, 35]
    arr[8:22, 12:42] = [50, 35, 25]
    return arr


def _write(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, mode="RGB").save(path)


class EnsembleMatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = Path(tempfile.mkdtemp())
        self.refs = self.temp / "refs"
        self.portraits = self.temp / "portraits"
        self.out = self.temp / "out.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.temp, ignore_errors=True)

    def _manifest(self, ref_path: Path) -> Path:
        path = self.temp / "manifest.json"
        payload = {
            "entries": [
                {
                    "status": "downloaded",
                    "identifier": "test",
                    "title": "test",
                    "role": "vii_primary_manual",
                    "source_name": ref_path.name,
                    "source_url": "https://example.invalid/ref.png",
                    "local_path": str(ref_path),
                    "confidence_cap": 0.95,
                    "width": 64,
                    "height": 80,
                }
            ]
        }
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_identical_reference_is_accepted(self) -> None:
        base = _base_image()
        ref = self.refs / "ref.png"
        _write(ref, base)
        _write(self.portraits / "0001.png", base)
        _write(self.portraits / "0002.png", 255 - base)
        result = run_match(self._manifest(ref), self.portraits, self.out, topk=2)
        row = result["results"][0]
        self.assertEqual(row["status"], "accepted")
        self.assertEqual(row["top"][0]["slot"], "0001")
        self.assertGreater(row["gap"], 0.08)

    def test_mirrored_reference_matches_original(self) -> None:
        base = _base_image()
        ref = self.refs / "mirror.png"
        _write(ref, base[:, ::-1, :])
        _write(self.portraits / "0001.png", base)
        _write(self.portraits / "0002.png", np.roll(base, 12, axis=0))
        result = run_match(self._manifest(ref), self.portraits, self.out, topk=2)
        row = result["results"][0]
        self.assertEqual(row["top"][0]["slot"], "0001")
        self.assertIn(row["status"], {"accepted", "candidate"})

    def test_ambiguous_identical_portraits_are_rejected(self) -> None:
        base = _base_image()
        ref = self.refs / "ref.png"
        _write(ref, base)
        _write(self.portraits / "0001.png", base)
        _write(self.portraits / "0002.png", base)
        result = run_match(self._manifest(ref), self.portraits, self.out, topk=2)
        row = result["results"][0]
        self.assertEqual(row["status"], "rejected")
        self.assertEqual(row["gap"], 0.0)


if __name__ == "__main__":
    unittest.main()
