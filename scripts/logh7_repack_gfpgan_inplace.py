#!/usr/bin/env python3
# GFPGAN 복원 초상화를 기존 hed 슬롯에 제자리(in-place) 재패킹하는 스크립트.
# 핵심: tcf.hed/atlas 크기/셀 카운트 불변. 각 글로벌 슬롯의 기존 오프셋에
#       byte-exact 6162B 영역(18B 헤더+1024B 팔레트+64*80 인덱스)을 덮어쓴다.
# encode_region 은 검증된 RE/tools/logh7_tcf_pack.py 의 역함수를 그대로 재사용.
from __future__ import annotations
import struct, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path("RE/tools")))
from logh7_tcf_pack import encode_region, CELL_W, CELL_H  # 검증된 인코더(바이트정확)

ATLASES = ["gem.tcf", "gef.tcf", "gam.tcf", "gaf.tcf", "o.tcf", "oam.tcf", "oem.tcf"]
AFTER_DIR = Path("artifacts/portrait-gfpgan/after")
REGION_SIZE = 18 + 1024 + CELL_W * CELL_H  # 6162

TREES = [
    "client/dist/logh7-client",
    "client/vendor/logh7-installed",
    ".omo/work/logh7-installed",
]


def load_hed(fd: Path):
    hed = (fd / "tcf.hed").read_bytes()
    return [list(struct.unpack_from("<II", hed, i * 8)) for i in range(len(hed) // 8)]


def decode_dims(region: bytes):
    if len(region) < 18 + 1024:
        return None
    w = struct.unpack_from("<H", region, 0x0c)[0]
    h = struct.unpack_from("<H", region, 0x0e)[0]
    if not (8 <= w <= 256 and 8 <= h <= 256) or 18 + 1024 + w * h != len(region):
        return None
    return (w, h)


def find_owner(entries, atlas_data, slot):
    """글로벌 슬롯이 어느 atlas 에 들어있는지(디코드 성공 기준) 찾는다."""
    off, sz = entries[slot]
    for a in ATLASES:
        d = atlas_data[a]
        if off + sz <= len(d) and decode_dims(d[off:off + sz]):
            return a, off, sz
    return None, off, sz


def reencode(png: Path) -> bytes:
    # GFPGAN 출력(128x160 등)을 LANCZOS 로 고품질 다운스케일 후 인코더에 전달.
    img = Image.open(png).convert("RGB")
    if img.size != (CELL_W, CELL_H):
        img = img.resize((CELL_W, CELL_H), Image.LANCZOS)
    region = encode_region(img)
    assert len(region) == REGION_SIZE, len(region)
    return region


def main():
    pngs = sorted(AFTER_DIR.glob("*.png"))
    slots = [int(p.stem) for p in pngs]
    print(f"재인코딩 대상 {len(pngs)}개 슬롯: {slots}")

    # 기준 트리(라이브 .omo/work)에서 슬롯->atlas 매핑 확정
    base_fd = Path(".omo/work/logh7-installed/data/image/Face")
    base_entries = load_hed(base_fd)
    base_atlas = {a: (base_fd / a).read_bytes() for a in ATLASES}

    plan = {}  # slot -> (atlas, off, sz)
    regions = {}  # slot -> new region bytes
    for p, slot in zip(pngs, slots):
        atlas, off, sz = find_owner(base_entries, base_atlas, slot)
        if atlas is None:
            sys.exit(f"슬롯 {slot}: 소유 atlas 미발견(off=0x{off:x} sz={sz})")
        if sz != REGION_SIZE:
            sys.exit(f"슬롯 {slot}: 기존 영역 크기 {sz}!={REGION_SIZE} — 제자리 교체 불가")
        plan[slot] = (atlas, off, sz)
        regions[slot] = reencode(p)
        print(f"  슬롯 {slot:4d} -> {atlas} @0x{off:x} ({sz}B) 재인코딩 OK")

    # 3트리 전부 동일 매핑 검증 + 제자리 덮어쓰기
    total_writes = 0
    for tree in TREES:
        fd = Path(tree) / "data/image/Face"
        entries = load_hed(fd)
        atlas_bytes = {a: bytearray((fd / a).read_bytes()) for a in ATLASES}
        atlas_orig_len = {a: len(atlas_bytes[a]) for a in ATLASES}
        for slot, (atlas, off, sz) in plan.items():
            e_off, e_sz = entries[slot]
            if (e_off, e_sz) != (off, sz):
                sys.exit(f"{tree} 슬롯 {slot}: hed 오프셋 불일치 {(e_off,e_sz)}!={(off,sz)}")
            atlas_bytes[atlas][off:off + sz] = regions[slot]
            total_writes += 1
        # 무결성: atlas 길이 불변
        for a in ATLASES:
            if len(atlas_bytes[a]) != atlas_orig_len[a]:
                sys.exit(f"{tree}: {a} 길이 변경됨 — 중단")
            (fd / a).write_bytes(bytes(atlas_bytes[a]))
        print(f"[배포] {tree}: {len(plan)}슬롯 제자리 교체, atlas 크기/hed 불변")

    print(f"총 쓰기 {total_writes}건 (={len(plan)}슬롯 x {len(TREES)}트리)")

    # 역검증: 각 트리에서 다시 디코드해 64x80 확인
    print("--- 역검증(디코드 라운드트립) ---")
    all_ok = True
    for tree in TREES:
        fd = Path(tree) / "data/image/Face"
        entries = load_hed(fd)
        atlas_data = {a: (fd / a).read_bytes() for a in ATLASES}
        ok = 0
        for slot, (atlas, off, sz) in plan.items():
            region = atlas_data[atlas][off:off + sz]
            if decode_dims(region) == (CELL_W, CELL_H):
                ok += 1
            else:
                all_ok = False
                print(f"  FAIL {tree} 슬롯 {slot}")
        print(f"  {tree}: {ok}/{len(plan)} 디코드 OK")
    print("RESULT:", "ALL PASS" if all_ok else "FAILURES PRESENT")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
