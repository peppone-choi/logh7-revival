#!/usr/bin/env python3
"""LOGH VII graphics/resolution/remaster configurator.

RE-verified (docs/logh7-graphics-remaster.md):
  * GraphicConfig.txt is parsed by FUN_004f33e0 with ZERO validation: any
    ScreenWidth/ScreenHeight is accepted verbatim and drives the virtual UI res +
    (windowed) backbuffer. Field order is the 14-int array below.
  * 3D projection is aspect-correct at any resolution (FUN_005a6d10 divides aspect
    into the horizontal scale only -> Hor+ wider FOV, no 3D stretch). No patch.
  * The player-facing remaster target is native system resolution, not a 4:3
    letterbox. Use --native/--width/--height for the real backbuffer, regenerate
    lobby-res + lobby-native-layout for the same size, then rebuild the playable
    client so lobby anchors move to the native canvas.
  * The 2D UI stretches at non-4:3 because FUN_004ea460 computes X and Y scale
    independently. The older Path A/Path B options remain available as diagnostics,
    not as the default remaster direction.
  * Drop-in upscaled textures work (D3DX8 loader reads file-header dims). LOD levels
    0..3 select Lo/Mid/Hi dirs; default 2 = Hi (max).

This tool round-trips GraphicConfig.txt (preserving its 3-comment header + all 14
lines independently) and patches dgVoodoo.conf keys. It never touches the EXE.

Usage:
  python tools/logh7_graphics_config.py --show
  python tools/logh7_graphics_config.py --width 1920 --height 1080
  python tools/logh7_graphics_config.py --native
  python tools/logh7_encode_lobby_res.py --width 1920 --height 1080 --write
  python tools/logh7_encode_lobby_native_layout.py --width 1920 --height 1080
  python tools/logh7_graphics_config.py --pathA 1080
  python tools/logh7_graphics_config.py --fill16x9 1920 1080
  python tools/logh7_graphics_config.py --remaster           # max LOD + dgVoodoo AA/aniso/sharpen
"""
from __future__ import annotations
import argparse
import os
import sys

# GraphicConfig.txt 14-field order, proven by writer FUN_004f34f0 (graphics-remaster.md §1.1).
FIELDS = [
    "UnitModelLevel", "StarsModelLevel", "ModelTextureLevel", "BGTextureLevel",
    "EffectTextureLevel", "ScreenWidth", "ScreenHeight", "ScreenRefreshRate",
    "ScreenBit", "EffectLV", "BGM Volume", "SE Volume", "StrategyBGM", "TacticsBGM",
]
HEADER = ["EasyGraphicConfigFile", "PleaseSetLevels0-3", "(*//"]
LEVEL_FIELDS = FIELDS[0:5]

DEFAULT_INSTALL = os.path.join(".omo", "work", "logh7-installed")


def _read_lines(path: str) -> list[str]:
    with open(path, "r", encoding="cp932", errors="replace") as f:
        return f.read().split("\n")


def parse_graphic_config(path: str) -> dict[str, int]:
    """Return {field: int}. Reader skips 3 header lines then takes label/value pairs."""
    raw = [ln.rstrip("\r") for ln in _read_lines(path)]
    # drop the 3 header lines (and any leading blanks the reader's do/while skips)
    body = [ln for ln in raw if ln != ""]
    if body[:3] == HEADER:
        body = body[3:]
    cfg: dict[str, int] = {}
    i = 0
    while i + 1 < len(body) and len(cfg) < len(FIELDS):
        label, value = body[i], body[i + 1]
        try:
            cfg[label.strip()] = int(value.strip())
        except ValueError:
            pass
        i += 2
    return cfg


def write_graphic_config(path: str, cfg: dict[str, int]) -> None:
    """Write all 14 lines independently in engine order with CRLF + cp932 header."""
    out = list(HEADER)
    for field in FIELDS:
        out.append(field)
        out.append(str(int(cfg.get(field, 0))))
    with open(path, "w", encoding="cp932", newline="") as f:
        f.write("\r\n".join(out) + "\r\n")


def patch_dgvoodoo(path: str, keys: dict[str, str]) -> list[str]:
    """Set `Key = Value` for active (non-comment) lines under their [Section]. Returns changes."""
    if not os.path.exists(path):
        return [f"(dgVoodoo.conf not found at {path} — skipped)"]
    lines = _read_lines(path)
    changed: list[str] = []
    remaining = dict(keys)
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(";") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in remaining:
            indent = line[: len(line) - len(line.lstrip())]
            lines[idx] = f"{indent}{key:<36}= {remaining[key]}"
            changed.append(f"{key} = {remaining.pop(key)}")
    if changed:
        with open(path, "w", encoding="cp932", newline="") as f:
            f.write("\n".join(lines))
    for key, val in remaining.items():
        changed.append(f"(key '{key}' not present in conf; set manually = {val})")
    return changed


# Diverse resolution presets grouped by aspect — a varied selection for the user to pick from.
RESOLUTION_PRESETS = [
    (640, 480, "VGA", "4:3"), (800, 600, "SVGA", "4:3"), (1024, 768, "XGA (original)", "4:3"),
    (1280, 960, "SXGA-", "4:3"), (1440, 1080, "4:3@1080h", "4:3"), (1600, 1200, "UXGA", "4:3"),
    (1280, 800, "WXGA", "16:10"), (1680, 1050, "WSXGA+", "16:10"), (1920, 1200, "WUXGA", "16:10"),
    (1280, 720, "HD 720p", "16:9"), (1366, 768, "HD", "16:9"), (1600, 900, "HD+", "16:9"),
    (1920, 1080, "FHD 1080p", "16:9"), (2560, 1440, "QHD 1440p", "16:9"), (3840, 2160, "4K UHD", "16:9"),
    (2560, 1080, "UW-FHD", "21:9"), (3440, 1440, "UW-QHD", "21:9"), (5120, 1440, "DUW", "32:9"),
]


def detect_monitors() -> list[tuple[int, int]]:
    """Detect connected monitor pixel sizes. Windows via ctypes (no deps); [] on failure/other-OS."""
    out: list[tuple[int, int]] = []
    try:
        import ctypes
        u = ctypes.windll.user32
        try:
            u.SetProcessDPIAware()
        except Exception:
            pass
        w, h = u.GetSystemMetrics(0), u.GetSystemMetrics(1)        # SM_CXSCREEN / SM_CYSCREEN (primary)
        if w and h:
            out.append((int(w), int(h)))
        vw, vh = u.GetSystemMetrics(78), u.GetSystemMetrics(79)    # SM_CXVIRTUALSCREEN / SM_CYVIRTUALSCREEN
        if vw and vh and (vw, vh) != (w, h):
            out.append((int(vw), int(vh)))
    except Exception:
        pass
    return out


def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a or 1


def aspect_label(w: int, h: int) -> str:
    g = _gcd(w, h)
    return f"{w // g}:{h // g}"


def print_resolution_menu() -> None:
    mons = detect_monitors()
    primary = mons[0] if mons else None
    if primary:
        print(f"Detected primary monitor: {primary[0]}x{primary[1]} ({aspect_label(*primary)})")
        if len(mons) > 1:
            print(f"  (virtual desktop spanning all monitors: {mons[1][0]}x{mons[1][1]})")
    else:
        print("Monitor detection unavailable on this host — pick from the presets below.")
    print("\nResolution choices (apply with: --width W --height H, then rebuild the client with lobby-res to match):")
    last_aspect = None
    for w, h, label, aspect in RESOLUTION_PRESETS:
        if aspect != last_aspect:
            print(f"  [{aspect}]")
            last_aspect = aspect
        native = "  <- your monitor" if primary and (w, h) == tuple(primary) else ""
        print(f"     {w:>4} x {h:<4}  {label}{native}")
    if primary and tuple(primary) not in [(w, h) for w, h, _, _ in RESOLUTION_PRESETS]:
        print(f"  [native] {primary[0]} x {primary[1]}  (your monitor — also selectable){''}")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="LOGH VII graphics/resolution/remaster configurator")
    ap.add_argument("--install", default=DEFAULT_INSTALL, help="install tree root")
    ap.add_argument("--show", action="store_true", help="print current config and exit")
    ap.add_argument("--width", type=int)
    ap.add_argument("--height", type=int)
    ap.add_argument("--refresh", type=int)
    ap.add_argument("--level", type=int, choices=[0, 1, 2, 3], help="set all 5 *Level fields (3/default 2 = Hi)")
    ap.add_argument("--widescreen", type=int, metavar="MONITOR_HEIGHT",
                    help="diagnostic legacy 4:3 backbuffer matched to monitor height + dgVoodoo stretched_4_3 (pillarboxed, no distortion)")
    ap.add_argument("--pathA", type=int, nargs="?", const=-1, metavar="MONITOR_HEIGHT",
                    help="diagnostic legacy path (NO EXE patch, no distortion): set a 4:3 backbuffer "
                         "(W=H*4/3) + dgVoodoo ScalingMode=stretched_4_3 (the supported 4:3-preserving, "
                         "pillarboxed value). "
                         "Give the monitor HEIGHT (e.g. 1080); omit it to auto-detect the primary monitor height. "
                         "Not the production remaster target.")
    ap.add_argument("--fill16x9", nargs=2, type=int, metavar=("W", "H"),
                    help="diagnostic native backbuffer with legacy uniform-scale patch note")
    ap.add_argument("--remaster", action="store_true", help="max LOD + dgVoodoo 16x aniso + 4x MSAA + lanczos")
    ap.add_argument("--detect", action="store_true", help="detect connected monitor resolution(s) and exit")
    ap.add_argument("--list", action="store_true", help="list diverse resolution presets (+ mark your monitor) and exit")
    ap.add_argument("--native", action="store_true", help="detect the primary monitor and apply its resolution")
    ap.add_argument("--no-watermark", action="store_true", help="disable the dgVoodoo/3Dfx watermark in dgVoodoo.conf")
    args = ap.parse_args(argv)

    if args.detect:
        mons = detect_monitors()
        if not mons:
            print("Monitor detection unavailable on this host.")
        for i, (w, h) in enumerate(mons):
            print(f"  monitor[{i}]: {w}x{h} ({aspect_label(w, h)})" + (" primary" if i == 0 else " virtual-span"))
        return 0
    if args.list:
        print_resolution_menu()
        return 0

    gconf = os.path.join(args.install, "GraphicConfig.txt")
    dgconf = os.path.join(args.install, "exe", "dgVoodoo.conf")
    if not os.path.exists(gconf):
        print(f"GraphicConfig.txt not found at {gconf}", file=sys.stderr)
        return 2
    cfg = parse_graphic_config(gconf)

    if args.show:
        for field in FIELDS:
            print(f"  {field:<20} {cfg.get(field)}")
        return 0

    dg: dict[str, str] = {}
    notes: list[str] = []

    if args.native:
        mons = detect_monitors()
        if not mons:
            print("--native: monitor detection failed; pass --width/--height explicitly.", file=sys.stderr)
            return 2
        nw, nh = mons[0]
        cfg["ScreenWidth"], cfg["ScreenHeight"] = nw, nh
        notes.append(f"Native: applied detected primary monitor {nw}x{nh} ({aspect_label(nw, nh)}). "
                     f"Regenerate lobby-res.json and lobby-native-layout.json at {nw}x{nh}, then rebuild the playable stack.")
    if args.no_watermark:
        dg["3DfxWatermark"] = "false"
        dg["dgVoodooWatermark"] = "false"
        notes.append("Watermark: dgVoodoo/3Dfx watermark disabled (no wrapper swap needed).")
    path_a_height: int | None = None
    if args.pathA is not None:
        if args.pathA == -1:
            mons = detect_monitors()
            if not mons:
                print("--pathA: monitor detection failed; pass the monitor height, e.g. --pathA 1080.", file=sys.stderr)
                return 2
            path_a_height = mons[0][1]
            notes.append(f"Diagnostic Path A: auto-detected primary monitor height {path_a_height} ({mons[0][0]}x{mons[0][1]}).")
        else:
            path_a_height = args.pathA
    if args.widescreen is not None:
        path_a_height = args.widescreen
    if path_a_height is not None:
        h = path_a_height
        w = (h * 4) // 3  # 4:3 backbuffer the UI was authored for -> zero per-axis stretch
        cfg["ScreenWidth"], cfg["ScreenHeight"] = w, h
        # dgVoodoo가 실제 지원하는 4:3 보존 값은 stretched_4_3(4:3 강제 출력→측면 필러박스, 비왜곡).
        # (이전 'centered_4_3'은 dgVoodoo ScalingMode 목록에 없는 무효값이라 무패치·무왜곡 보장이 깨졌다.)
        dg["ScalingMode"] = "stretched_4_3"
        notes.append(f"Diagnostic Path A: backbuffer {w}x{h} (4:3) + dgVoodoo stretched_4_3 -> uniform pillarboxed UI, no per-axis stretch (no EXE patch). Not the remaster target.")
    if args.fill16x9 is not None:
        w, h = args.fill16x9
        cfg["ScreenWidth"], cfg["ScreenHeight"] = w, h
        dg["ScalingMode"] = "stretched"  # backbuffer already native; let the wrapper present 1:1
        notes.append(f"Diagnostic Path B: native {w}x{h} backbuffer with legacy uniform-scale patch note. "
                     f"Production lobby remaster should use lobby-res + lobby-native-layout instead.")
    if args.width:
        cfg["ScreenWidth"] = args.width
    if args.height:
        cfg["ScreenHeight"] = args.height
    if args.refresh:
        cfg["ScreenRefreshRate"] = args.refresh
    if args.level is not None:
        for lf in LEVEL_FIELDS:
            cfg[lf] = args.level
    if args.remaster:
        for lf in LEVEL_FIELDS:
            cfg[lf] = max(cfg.get(lf, 2), 2)  # 2 = Hi (max detail dir)
        dg.update({"Filtering": "16", "Antialiasing": "4x", "Resampling": "lanczos-3"})
        notes.append("Remaster: LOD=Hi + dgVoodoo 16x anisotropic + 4x MSAA + lanczos-3 resampling (non-invasive).")

    write_graphic_config(gconf, cfg)
    print(f"wrote {gconf}: ScreenWidth={cfg['ScreenWidth']} ScreenHeight={cfg['ScreenHeight']} "
          f"levels={[cfg[lf] for lf in LEVEL_FIELDS]}")
    if dg:
        for ch in patch_dgvoodoo(dgconf, dg):
            print(f"  dgVoodoo.conf: {ch}")
    for n in notes:
        print(f"  NOTE: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
