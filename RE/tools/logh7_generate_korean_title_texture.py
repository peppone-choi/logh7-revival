#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from tools.logh7_upscale_textures import Tga, read_tga, write_tga


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_INSTALLED_ROOT: Final = ROOT / ".omo" / "work" / "logh7-installed"
DEFAULT_FONT_ROOT: Final = ROOT / "fonts"
TITLE_RELATIVE: Final = Path("data/image/gamemenu/title_korea.tga")
TITLE_ALIAS_RELATIVE: Final = Path("data/image/gamemenu/title.tga")
ORIGINAL_TITLE_NAME: Final = "title_korea.original.tga"
BASE_WIDTH: Final = 640
BASE_HEIGHT: Final = 480
DEFAULT_WIDTH: Final = 640
DEFAULT_HEIGHT: Final = 480


@dataclass(frozen=True, slots=True)
class TitleRenderConfig:
    source: Path
    font_root: Path
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT


@dataclass(frozen=True, slots=True)
class TitleWriteResult:
    source: Path
    output: Path
    backup: Path | None
    alias: Path | None
    width: int
    height: int
    bytes_written: int


@dataclass(frozen=True, slots=True)
class TitleWriteConfig:
    render: TitleRenderConfig
    output: Path
    preserve_original: bool = True
    alias_title: bool = False


@dataclass(frozen=True, slots=True)
class TextSpec:
    text: str
    xy: tuple[int, int]
    size: int
    fill: tuple[int, int, int, int]
    anchor: str
    stroke_width: int = 0
    stroke_fill: tuple[int, int, int, int] = (0, 0, 0, 255)
    font_name: str = "PretendardStd-Black.ttf"


def _to_image(tga: Tga) -> Image.Image:
    return Image.frombytes("RGBA", (tga.width, tga.height), tga.rgba)


def _font_path(font_root: Path, font_name: str) -> Path:
    families = ("PretendardStd", "PretendardJP", "Pretendard")
    for family in families:
        candidate = font_root / family / font_name
        if candidate.exists():
            return candidate
    fallback = font_root / "PretendardStd" / "PretendardStd-Black.ttf"
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f"Pretendard font not found under {font_root}")


def _fit_font(font_root: Path, spec: TextSpec, max_width: int) -> ImageFont.FreeTypeFont:
    font_path = _font_path(font_root, spec.font_name)
    size = spec.size
    while size > 12:
        font = ImageFont.truetype(str(font_path), size)
        bbox = font.getbbox(spec.text, stroke_width=spec.stroke_width)
        if bbox[2] - bbox[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(str(font_path), size)


def _draw_glow_text(base: Image.Image, font_root: Path, spec: TextSpec, max_width: int) -> None:
    font = _fit_font(font_root, spec, max_width)
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.text(
        spec.xy,
        spec.text,
        font=font,
        anchor=spec.anchor,
        fill=(255, 230, 160, 170),
        stroke_width=spec.stroke_width + 5,
        stroke_fill=(255, 200, 80, 130),
    )
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(7)))
    draw = ImageDraw.Draw(base)
    draw.text(
        spec.xy,
        spec.text,
        font=font,
        anchor=spec.anchor,
        fill=spec.fill,
        stroke_width=spec.stroke_width,
        stroke_fill=spec.stroke_fill,
    )


def _make_canvas(source: Image.Image, width: int, height: int) -> Image.Image:
    return source.resize((width, height), Image.Resampling.LANCZOS)


def _scale_xy(canvas: Image.Image, x: int, y: int) -> tuple[int, int]:
    return (int(x * canvas.width / BASE_WIDTH), int(y * canvas.height / BASE_HEIGHT))


def _scale_value(canvas: Image.Image, value: int) -> int:
    return max(1, int(value * min(canvas.width / BASE_WIDTH, canvas.height / BASE_HEIGHT)))


def _darken_logo_region(canvas: Image.Image) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    left, top = _scale_xy(canvas, 58, 8)
    right, bottom = _scale_xy(canvas, 582, 172)
    draw.rounded_rectangle((left, top, right, bottom), radius=_scale_value(canvas, 16), fill=(0, 8, 18, 236))
    ellipse_left, ellipse_top = _scale_xy(canvas, 170, 20)
    ellipse_right, ellipse_bottom = _scale_xy(canvas, 470, 160)
    draw.ellipse((ellipse_left, ellipse_top, ellipse_right, ellipse_bottom), fill=(20, 36, 52, 180))
    canvas.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(_scale_value(canvas, 6))))


def _draw_title_text(canvas: Image.Image, font_root: Path) -> None:
    def spec(
        text: str,
        x: int,
        y: int,
        size: int,
        fill: tuple[int, int, int, int],
        anchor: str,
        font_name: str = "PretendardStd-Black.ttf",
        stroke_width: int = 1,
        stroke_fill: tuple[int, int, int, int] = (0, 0, 0, 230),
    ) -> TextSpec:
        return TextSpec(
            text=text,
            xy=_scale_xy(canvas, x, y),
            size=_scale_value(canvas, size),
            fill=fill,
            anchor=anchor,
            stroke_width=_scale_value(canvas, stroke_width),
            stroke_fill=stroke_fill,
            font_name=font_name,
        )

    specs = (
        spec("우주전략 시뮬레이션", 320, 28, 18, (220, 230, 240, 255), "mm", "Pretendard-SemiBold.ttf", 1),
        spec("은하영웅전설 VII", 320, 68, 58, (244, 246, 248, 255), "mm", "Pretendard-Black.ttf", 2, (6, 12, 24, 255)),
        spec("ONLINE", 320, 135, 46, (255, 232, 164, 255), "mm", stroke_width=2, stroke_fill=(34, 20, 4, 255)),
        spec("서버에 접속합니다.", 320, 226, 13, (238, 246, 248, 255), "mm", "Pretendard-SemiBold.ttf"),
        spec("ID와 비밀번호를 입력하세요.", 320, 246, 14, (248, 252, 255, 255), "mm", "Pretendard-SemiBold.ttf"),
        spec("ID", 182, 278, 12, (238, 246, 248, 255), "lm", "Pretendard-Medium.ttf"),
        spec("비밀번호", 182, 305, 12, (238, 246, 248, 255), "lm", "Pretendard-Medium.ttf"),
    )
    for spec in specs:
        _draw_glow_text(canvas, font_root, spec, _scale_value(canvas, 560))


def render_title_texture(config: TitleRenderConfig) -> Tga:
    source = _to_image(read_tga(config.source))
    canvas = _make_canvas(source, config.width, config.height)
    _darken_logo_region(canvas)
    _draw_title_text(canvas, config.font_root)
    return Tga(config.width, config.height, canvas.tobytes(), True)


def _resolve_source(installed_root: Path, explicit_source: Path | None) -> Path:
    if explicit_source is not None:
        return explicit_source
    return installed_root / TITLE_RELATIVE


def write_title_texture(config: TitleWriteConfig) -> TitleWriteResult:
    source = config.render.source
    backup: Path | None = None
    render_source = source
    if config.preserve_original and config.output.resolve() == source.resolve():
        backup = source.with_name(ORIGINAL_TITLE_NAME)
        if not backup.exists():
            shutil.copy2(source, backup)
        render_source = backup

    rendered = render_title_texture(
        TitleRenderConfig(render_source, config.render.font_root, config.render.width, config.render.height)
    )
    config.output.parent.mkdir(parents=True, exist_ok=True)
    write_tga(config.output, rendered.width, rendered.height, rendered.rgba, alpha=False)

    alias: Path | None = None
    if config.alias_title:
        alias = config.output.with_name(TITLE_ALIAS_RELATIVE.name)
        shutil.copy2(config.output, alias)
    return TitleWriteResult(source, config.output, backup, alias, rendered.width, rendered.height, config.output.stat().st_size)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the remastered Korean LOGH VII login title texture.")
    parser.add_argument("--installed-root", type=Path, default=DEFAULT_INSTALLED_ROOT)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--font-root", type=Path, default=DEFAULT_FONT_ROOT)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--alias-title", action="store_true")
    parser.add_argument("--no-preserve-original", action="store_true")
    args = parser.parse_args()

    source = _resolve_source(args.installed_root, args.source)
    output = args.out if args.out is not None else source
    result = write_title_texture(
        TitleWriteConfig(
            render=TitleRenderConfig(source=source, font_root=args.font_root, width=args.width, height=args.height),
            output=output,
            preserve_original=not args.no_preserve_original,
            alias_title=args.alias_title,
        )
    )
    print(json.dumps(asdict(result), ensure_ascii=False, default=str, indent=2))
    print(f"wrote {result.output}: Korean login title {result.width}x{result.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
