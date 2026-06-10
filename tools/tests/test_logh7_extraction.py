import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_logh7_pipeline import REPO_ROOT, TOOL, _fixture_iso


class Logh7ExtractionTests(unittest.TestCase):
    def test_extract_root_writes_iso_files_and_manifest_when_iso_contains_installshield_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            iso = temp_path / "fixture.iso"
            out = temp_path / "iso-root"
            manifest = temp_path / "iso-root-manifest.json"
            _fixture_iso(iso)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "extract-root",
                    str(iso),
                    "--out",
                    str(out),
                    "--manifest-out",
                    str(manifest),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            root_manifest = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual((out / "setup.ini").read_bytes().decode("cp932").splitlines()[1], "AppName=銀河英雄伝説VII")
            self.assertEqual((out / "data1.cab").read_bytes(), b"InstallShield CAB placeholder")
            self.assertEqual((out / "directx9" / "dxsetup.exe").read_bytes(), b"setup!")
            self.assertEqual(root_manifest["source"], str(iso))
            self.assertEqual(root_manifest["destination"], str(out))
            self.assertIn("data1.hdr", {entry["path"] for entry in root_manifest["entries"]})
            self.assertIn("directx9/dxsetup.exe", {entry["path"] for entry in root_manifest["entries"]})

    def test_extract_root_preserves_cp932_iso_filenames_when_directory_entry_uses_japanese_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            iso = temp_path / "fixture.iso"
            out = temp_path / "iso-root"
            manifest = temp_path / "iso-root-manifest.json"
            _fixture_iso(iso)

            raw = iso.read_bytes()
            patched = raw.replace(b"SETUP.INI;1", "銀河.pdf;1".encode("cp932"))
            iso.write_bytes(patched)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "extract-root",
                    str(iso),
                    "--out",
                    str(out),
                    "--manifest-out",
                    str(manifest),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            root_manifest = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual((out / "銀河.pdf").read_text(encoding="cp932").splitlines()[1], "AppName=銀河英雄伝説VII")
            self.assertIn("銀河.pdf", {entry["path"] for entry in root_manifest["entries"]})


if __name__ == "__main__":
    unittest.main()
