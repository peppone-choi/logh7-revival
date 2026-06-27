#!/usr/bin/env python3
"""에셋레벨 HUD/UI 텍스처 리마스터 (런타임 그래픽이 아닌 실제 텍스처 업스케일).

게임 TGA는 type-1(256색 팔레트, BGRA cmap, 8bpp 인덱스, bottom-up)이라 PIL이 못 읽는다.
직접 디코드 → RGBA → 고품질 업스케일(LANCZOS ×scale + 언샤프) → type-2 32bpp BGRA TGA로
재인코딩(D3DX8 CD3DXImage는 content magic으로 로드하므로 더 큰 치수 드롭인 가능).
알파 보존. 오버레이 디렉토리에 설치 트리 미러로 출력(원본 무손상).

사용:
  python -m tools.logh7_remaster_hud_tga --scale 4 --out .omo/work/remaster/hud-overlay
"""
from __future__ import annotations
import argparse
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RE_ROOT = Path(__file__).resolve().parents[1]              # .../RE (오버레이/.omo 산출 기준)
# client/ 는 저장소 루트(RE의 부모)에 있고 .omo 는 RE 안으로 정션됨
REPO = RE_ROOT.parent if (RE_ROOT.parent / "client").exists() else RE_ROOT
IMG = REPO / "client/vendor/logh7-installed/data/image"

# 리마스터 대상 HUD/UI 텍스처 (전략 HUD·창·바·레이더·통관패널 등)
HUD_SET = [
    "icon_normal/com_bar.tga", "icon_normal/com_window.tga", "icon_normal/com_saishou.tga",
    "icon_kj/com_bar.tga", "icon_kj/com_window.tga",
    "window/window_parts.tga", "window/system_window.tga", "window/various_window.tga",
    "window/various_window_2.tga", "window/sentaku_window.tga", "window/sentaku_bar.tga",
    "window/wakusei_window.tga", "window/wakusei_shousai_window.tga", "window/mail_window.tga",
    "window/shinnin_shiji_shikin_window.tga",
    "soukan/soukan_window.tga", "soukan/soukan_bar.tga",
    "rader/bar.tga", "Field/unit_statusbar.tga", "icon/system_window_shade.tga",
]

# 2026-06-26 추가: 대형 UI 패널 세트(전략패널·직무카드·게임메뉴·拠点/레이더/필드 등).
# HUD_SET(20종) 이외의 미업스케일 type-1 패널 중 min(w,h)>=128 인 것만(작은 32px 아이콘 제외).
PANEL_SET = [
    "shokumu_card/shokumu_meirei_doumei.tga", "shokumu_card/shokumu_meirei_teikoku.tga",
    "shokumu_card/shokumu_parts_1.tga", "shokumu_card/shokumu_parts_2.tga",
    "shokumu_card/shokumu_shokumu_doumei.tga", "shokumu_card/shokumu_shokumu_teikoku.tga",
    "gamemenu/bothtec_logo.tga", "gamemenu/jinei.tga", "gamemenu/kekka.tga",
    "gamemenu/menu_parts.tga", "gamemenu/microvision_logo.tga", "gamemenu/multiterm_logo.tga",
    "gamemenu/title.tga", "gamemenu/title_japan.tga", "gamemenu/title_korea.tga",
    "gamemenu/title_korea_china.tga",
    "rader/parts.tga", "rader/rader.tga", "rader/rader_parts.tga",
    "soukan/soukan_parts.tga",
    "window/cursor_parts.tga", "window/dialog_parts.tga", "window/ending_parts.tga",
    "window/ending_parts_2.tga", "window/menu_parts.tga", "window/offline_window.tga",
    "window/resize_window_parts.tga", "window/sentaku_dd_window.tga", "window/wakusei_parts.tga",
    "Field/ShipMark.tga", "Field/icon_action.tga", "Field/icon_country32.tga",
    "Field/icon_set.tga", "Field/idou_kaiten_pointer.tga", "Field/idou_parts.tga",
    "Field/mk_unitcircle_blue.tga", "Field/mk_unitcircle_red.tga", "Field/unit_range.tga",
    "chat/chat_parts.tga", "icon/system_icon_parts.tga",
]


def decode_tga(path: Path) -> tuple[np.ndarray, int]:
    """type-1(palettized 8bpp) / type-2(truecolor) TGA → (H,W,4) RGBA uint8."""
    d = path.read_bytes()
    idlen, cmaptype, imgtype = d[0], d[1], d[2]
    cmap_first, cmap_len, cmap_bpp = struct.unpack_from("<HHB", d, 3)
    x, y, w, h, bpp, desc = struct.unpack_from("<HHHHBB", d, 8)
    off = 18 + idlen
    top_origin = bool(desc & 0x20)
    out = np.zeros((h, w, 4), np.uint8)
    if cmaptype == 1 and imgtype in (1, 9):
        entry = cmap_bpp // 8
        pal_bytes = d[off: off + cmap_len * entry]
        off += cmap_len * entry
        pal = np.frombuffer(pal_bytes, np.uint8).reshape(-1, entry)
        # cmap은 BGRA(또는 BGR). RGBA로 변환
        pr = np.zeros((cmap_len, 4), np.uint8)
        if entry >= 3:
            pr[:, 0] = pal[:, 2]; pr[:, 1] = pal[:, 1]; pr[:, 2] = pal[:, 0]
            pr[:, 3] = pal[:, 3] if entry == 4 else 255
        idx = np.frombuffer(d[off: off + w * h], np.uint8).reshape(h, w)
        out = pr[idx]
    elif imgtype == 2:
        px = np.frombuffer(d[off: off + w * h * (bpp // 8)], np.uint8).reshape(h, w, bpp // 8)
        if bpp == 32:
            out[..., 0] = px[..., 2]; out[..., 1] = px[..., 1]; out[..., 2] = px[..., 0]; out[..., 3] = px[..., 3]
        else:
            out[..., 0] = px[..., 2]; out[..., 1] = px[..., 1]; out[..., 2] = px[..., 0]; out[..., 3] = 255
    else:
        raise ValueError(f"unsupported tga imgtype={imgtype}")
    if not top_origin:
        out = out[::-1]  # bottom-up → top-down
    return out, bpp


def encode_tga32(rgba: np.ndarray) -> bytes:
    """(H,W,4) RGBA → type-2 32bpp BGRA TGA, top-left origin."""
    h, w = rgba.shape[:2]
    hdr = struct.pack("<BBBHHBHHHHBB", 0, 0, 2, 0, 0, 0, 0, 0, w, h, 32, 0x28)
    bgra = np.empty_like(rgba)
    bgra[..., 0] = rgba[..., 2]; bgra[..., 1] = rgba[..., 1]; bgra[..., 2] = rgba[..., 0]; bgra[..., 3] = rgba[..., 3]
    return hdr + bgra.tobytes()


def remaster_one(rel: str, scale: int, out_dir: Path, max_dim: int = 2048) -> dict:
    src = IMG / rel
    rgba, bpp = decode_tga(src)
    h, w = rgba.shape[:2]
    # 패키지 비대 방지: 긴 변이 max_dim 넘으면 배율을 줄여 캡(32bpp 비압축이라 4096²=64MB).
    eff = scale
    while eff > 1 and max(w, h) * eff > max_dim:
        eff -= 1
    im = Image.fromarray(rgba, "RGBA")
    up = im.resize((w * eff, h * eff), Image.LANCZOS)
    # 언샤프(가벼운 디테일 복원)
    up = up.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))
    dst = out_dir / rel  # 동일 .tga 이름 유지(EXE 경로 보존)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(encode_tga32(np.asarray(up, np.uint8)))
    # 검증용 PNG 미리보기
    prev = out_dir / "_preview" / (rel.replace("/", "_") + ".png")
    prev.parent.mkdir(parents=True, exist_ok=True)
    up.save(prev)
    return {"rel": rel, "src": f"{w}x{h}@{bpp}bpp", "scale": eff,
            "out": f"{w*eff}x{h*eff}@32", "bytes": dst.stat().st_size}


import json
import shutil

# 캐논 클라 이미지 트리(둘 다 배포 대상)
DEPLOY_DIRS = [
    REPO / "client/dist/logh7-client/data/image",
    REPO / "client/vendor/logh7-installed/data/image",
]


def deploy_with_backup(rels: list[str], overlay_img_dir: Path, backup_root: Path) -> dict:
    """오버레이 업스케일 TGA를 두 캐논 이미지 트리에 드롭인(원본은 backup_root에 보존)."""
    deployed, grew = 0, 0
    for tree in DEPLOY_DIRS:
        for rel in rels:
            up = overlay_img_dir / rel
            if not up.exists():
                continue
            dst = tree / rel
            if dst.exists():
                # 백업(트리명으로 네임스페이스 분리, 최초 1회만)
                tag = "dist" if "dist" in tree.parts else "vendor"
                bak = backup_root / tag / rel
                if not bak.exists():
                    bak.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dst, bak)
                grew += up.stat().st_size - dst.stat().st_size
            shutil.copy2(up, dst)
            deployed += 1
    return {"deployed": deployed, "bytes_grew": grew}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--out", default=".omo/work/remaster/hud-overlay")
    ap.add_argument("--set", dest="which", choices=["hud", "panel"], default="hud",
                    help="hud=원래 20종, panel=2026-06-26 대형 패널 세트")
    ap.add_argument("--deploy", action="store_true",
                    help="두 캐논 이미지 트리(dist+vendor)에 드롭인 배포(원본 백업)")
    ap.add_argument("--backup", default=".omo/work/remaster/panel-original-backup-2026-06-26")
    args = ap.parse_args()
    out_dir = REPO / args.out / "data/image"
    targets = PANEL_SET if args.which == "panel" else HUD_SET
    done, errs = [], []
    for rel in targets:
        try:
            done.append(remaster_one(rel, args.scale, out_dir))
        except Exception as e:
            errs.append({"rel": rel, "err": str(e)})
    result = {"set": args.which, "remastered": len(done), "errors": errs,
              "out": str(out_dir), "sample": done[:6]}
    if args.deploy:
        rels = [d["rel"] for d in done]
        result["deploy"] = deploy_with_backup(rels, out_dir, REPO / args.backup)
    print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    raise SystemExit(main())
