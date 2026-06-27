import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_client_exe import VANILLA_REFERENCE_EXE
from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_japanese_font_patch import HANGEUL_CHARSET, PATCH_SITES, SHIFTJIS_CHARSET
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = VANILLA_REFERENCE_EXE


class Logh7JapaneseFontPatchCliTests(unittest.TestCase):
    def test_script_help_works_when_run_by_file_path(self) -> None:
        result = subprocess.run(
            [sys.executable, str(REPO_ROOT / "tools" / "logh7_japanese_font_patch.py"), "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--charset", result.stdout)


@unittest.skipUnless(CLIENT_EXE.exists(), "vanilla reference G7MTClient.exe is required")
class Logh7JapaneseFontPatchTests(unittest.TestCase):
    def test_patches_create_font_charset_to_shiftjis(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.shiftjis-font.exe"
            manifest = temp_path / "shiftjis-font.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_japanese_font_patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
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
            patch = json.loads(manifest.read_text(encoding="utf-8"))
            raw = patched.read_bytes()
            image = _parse_pe_image(raw)

        self.assertEqual(patch["charset"], "SHIFTJIS_CHARSET")
        self.assertEqual(patch["charsetValue"], SHIFTJIS_CHARSET)
        self.assertEqual(len(patch["sites"]), 2)
        for virtual_address in PATCH_SITES:
            file_offset = _virtual_address_to_offset(image, virtual_address)
            self.assertEqual(raw[file_offset : file_offset + 2], bytes((0x6A, SHIFTJIS_CHARSET)))

    def test_patches_create_font_charset_to_hangeul(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.hangeul-font.exe"
            manifest = temp_path / "hangeul-font.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_japanese_font_patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(manifest),
                    "--charset",
                    "hangeul",
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(manifest.read_text(encoding="utf-8"))
            raw = patched.read_bytes()
            image = _parse_pe_image(raw)

        self.assertEqual(patch["charset"], "HANGEUL_CHARSET")
        self.assertEqual(patch["charsetValue"], HANGEUL_CHARSET)
        for virtual_address in PATCH_SITES:
            file_offset = _virtual_address_to_offset(image, virtual_address)
            self.assertEqual(raw[file_offset : file_offset + 2], bytes((0x6A, HANGEUL_CHARSET)))


if __name__ == "__main__":
    unittest.main()
