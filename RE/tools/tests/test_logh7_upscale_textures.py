import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_upscale_textures import (
    BACKUP_DIRNAME,
    Tga,
    cmd_revert,
    read_tga,
    upscale_tga,
    write_tga,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


def _write_colormapped_tga(path: Path, width: int, height: int) -> list[tuple[int, int, int, int]]:
    """8비트 색상맵(32비트 팔레트) TGA를 직접 작성 — Pillow가 못 읽는 포맷이라 우리 코덱 전용 경로를 검증한다."""
    palette = [(255, 0, 0, 255), (0, 255, 0, 128), (0, 0, 255, 0), (255, 255, 255, 255)]
    pal_bytes = b"".join(bytes((b, g, r, a)) for (r, g, b, a) in palette)
    pal_bytes += b"\x00" * (4 * (256 - len(palette)))  # 256엔트리로 패딩
    # top-down 논리 이미지의 인덱스를 만든 뒤, 원점 bottom-left(descriptor bit5=0)이므로 행을 역순 저장
    indices = [(x + y) % len(palette) for y in range(height) for x in range(width)]
    rows = [indices[y * width:(y + 1) * width] for y in range(height)]
    pix = bytearray()
    for row in reversed(rows):
        pix += bytes(row)
    header = struct.pack("<BBBHHBHHHHBB", 0, 1, 1, 0, 256, 32, 0, 0, width, height, 8, 0x00)
    path.write_bytes(header + pal_bytes + bytes(pix))
    return palette


class Logh7UpscaleTexturesTests(unittest.TestCase):
    def test_colormapped_decode_matches_palette_and_flags_alpha(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "cm.tga"
            palette = _write_colormapped_tga(src, 4, 4)

            tga = read_tga(src)

            self.assertEqual((tga.width, tga.height), (4, 4))
            self.assertTrue(tga.had_alpha, "32비트 팔레트는 had_alpha를 세워야 한다")
            # top-left 논리 픽셀 index=(0+0)%4=0=빨강
            self.assertEqual(tuple(tga.rgba[0:4]), palette[0])
            # 픽셀(1,0) index=1=초록 a=128
            self.assertEqual(tuple(tga.rgba[4:8]), palette[1])

    def test_integer_upscale_preserves_pow2_and_alpha(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "cm.tga"
            _write_colormapped_tga(src, 8, 8)
            tga = read_tga(src)

            for scale in (2, 4):
                up, backend = upscale_tga(tga, scale, prefer_external=False)
                self.assertEqual((up.width, up.height), (8 * scale, 8 * scale))
                self.assertEqual(backend, "lanczos")
                self.assertEqual(len(up.rgba), up.width * up.height * 4)

    def test_truecolor_roundtrip_is_byte_exact(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "tc.tga"
            rgba = bytes([10, 20, 30, 200] * (4 * 4))
            write_tga(out, 4, 4, rgba, alpha=True)

            written = out.read_bytes()
            self.assertEqual(written[2], 2, "truecolor image_type")
            self.assertEqual(written[16], 32, "32비트 bpp")
            self.assertEqual(struct.unpack_from("<HH", written, 12), (4, 4))

            back = read_tga(out)
            self.assertEqual((back.width, back.height), (4, 4))
            self.assertEqual(back.rgba, rgba)

    def test_written_upscaled_tga_decodes_to_expected_dims(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "cm.tga"
            _write_colormapped_tga(src, 4, 4)
            tga = read_tga(src)
            up, _ = upscale_tga(tga, 2, prefer_external=False)

            out = Path(td) / "out.tga"
            write_tga(out, up.width, up.height, up.rgba, up.had_alpha)
            rt = read_tga(out)
            self.assertEqual((rt.width, rt.height), (8, 8))

    def test_backup_atomic_overwrite_and_revert_restore_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            install = Path(td) / "install"
            rel = Path("data/image/test/cm.tga")
            target = install / rel
            target.parent.mkdir(parents=True)
            _write_colormapped_tga(target, 4, 4)
            original = target.read_bytes()

            # CLI upscale 서브커맨드를 통해 백업→원자적 교체→매니페스트 경로를 실제로 태운다
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_upscale_textures",
                    "--install",
                    str(install),
                    "upscale",
                    "--scale",
                    "2",
                    "--only",
                    str(rel.as_posix()),
                    "--no-external",
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
            self.assertIn("4x4 -> 8x8", proc.stdout)

            backup = install / BACKUP_DIRNAME / "2x" / rel
            self.assertTrue(backup.exists(), "백업 파일이 생성돼야 한다")
            self.assertEqual(backup.read_bytes(), original, "백업은 원본 바이트와 일치")
            self.assertNotEqual(target.read_bytes(), original, "제자리 업스케일이 파일을 바꿔야 한다")
            self.assertEqual(read_tga(target).width, 8)

            class _Args:
                pass

            args = _Args()
            args.install = str(install)
            args.keep_backup = False
            cmd_revert(args)

            self.assertEqual(target.read_bytes(), original, "revert가 원본 바이트를 복원해야 한다")
            self.assertFalse((install / BACKUP_DIRNAME).exists(), "revert가 백업 트리를 제거해야 한다")

    def test_revert_with_no_backup_is_noop(self):
        with tempfile.TemporaryDirectory() as td:
            install = Path(td) / "install"
            install.mkdir()

            class _Args:
                pass

            args = _Args()
            args.install = str(install)
            args.keep_backup = False
            # 백업 트리가 없어도 예외 없이 0을 반환해야 한다
            self.assertEqual(cmd_revert(args), 0)


if __name__ == "__main__":
    unittest.main()
