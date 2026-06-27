import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from tools.logh7_generate_korean_title_texture import TitleRenderConfig, render_title_texture
from tools.logh7_upscale_textures import Tga, read_tga, write_tga


REPO_ROOT = Path(__file__).resolve().parents[2]
FONT_ROOT = REPO_ROOT / "fonts"


def _write_source(path: Path) -> None:
    width = 640
    height = 480
    rgba = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            off = (y * width + x) * 4
            rgba[off : off + 4] = bytes((8 + x % 31, 12 + y % 47, 28 + (x + y) % 53, 255))
    write_tga(path, width, height, bytes(rgba), alpha=False)


class Logh7GenerateKoreanTitleTextureTests(unittest.TestCase):
    def test_render_uses_native_widescreen_canvas_and_preserves_footer(self):
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "title_korea.tga"
            _write_source(source)
            original = read_tga(source)

            rendered = render_title_texture(TitleRenderConfig(source=source, font_root=FONT_ROOT))

            self.assertEqual((rendered.width, rendered.height), (640, 480))
            image = Image.frombytes("RGBA", (rendered.width, rendered.height), rendered.rgba)
            title_region = image.crop((200, 42, 440, 100))
            raw = title_region.tobytes()
            bright_pixels = sum(1 for index in range(0, len(raw), 4) if raw[index] + raw[index + 1] + raw[index + 2] > 520)
            self.assertGreater(bright_pixels, 600)
            footer_pixel = image.getpixel((320, 470))
            source_footer = Image.frombytes("RGBA", (original.width, original.height), original.rgba).resize(
                (640, 480), Image.Resampling.LANCZOS
            )
            self.assertEqual(footer_pixel[3], source_footer.getpixel((320, 470))[3])

    def test_cli_writes_in_place_alias_and_backup(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            menu = root / "data" / "image" / "gamemenu"
            menu.mkdir(parents=True)
            source = menu / "title_korea.tga"
            _write_source(source)

            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_generate_korean_title_texture",
                    "--installed-root",
                    str(root),
                    "--font-root",
                    str(FONT_ROOT),
                    "--alias-title",
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=True,
            )

            self.assertIn("640x480", proc.stdout)
            self.assertTrue((menu / "title_korea.original.tga").exists())
            self.assertTrue((menu / "title.tga").exists())
            generated = read_tga(source)
            alias = read_tga(menu / "title.tga")
            self.assertEqual((generated.width, generated.height), (640, 480))
            self.assertEqual(Tga(alias.width, alias.height, alias.rgba, alias.had_alpha), generated)


if __name__ == "__main__":
    unittest.main()
