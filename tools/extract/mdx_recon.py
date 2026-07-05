# -*- coding: utf-8 -*-
# LOGH VII mdx/mds 1단계 정찰: 헤더 10쌍(ptr,count) + 0xE8 노드워크 + 임베디드 경로 검증
import struct, os, sys, json

ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model"
SAMPLES = [
    r"light\l006.mdx",            # 최소 크기 1.5KB
    r"dummy.mdx",                 # 루트 더미
    r"strategy\grid.mdx",         # 전략 보드
    r"strategy\Null_galaxy.mdx",  # 갤럭시 스타맵
    r"planets\p000.mdx",          # 행성
    r"effect\beam.mdx",           # 이펙트
    r"space\s000.mdx",            # 우주 배경
    r"ship\ge\eh042.mdx",         # 최대 크기 400KB
    r"ship\fp\fm023.mds",         # mds (동맹 함선)
    r"ship\ge\em027.mds",         # mds (제국 함선)
    r"ship\ge\em027.mdx",         # 같은 이름 mdx — mds와 비교
]

NODE_OFF = 0x58
NODE_STRIDE = 0xE8
BSLASH = bytes([0x57, 0x3A, 0x5C])  # b"W:\\"

def walk_nodes(b):
    """0x58부터 0xE8 스트라이드로 NUL종단 노드명을 걷는다 (스냅샷 카탈로그 방식)."""
    names = []
    off = NODE_OFF
    while off + NODE_STRIDE <= len(b):
        end = b.find(b"\x00", off, off + 0x40)
        if end <= off:
            break
        raw = b[off:end]
        if not all(0x20 < c < 0x7F for c in raw):
            break
        names.append(raw.decode("ascii"))
        off += NODE_STRIDE
    return names

def find_case(path):
    """윈도우 대소문자 무시 경로 보정."""
    if os.path.exists(path):
        return path
    return None

out = []
for rel in SAMPLES:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        out.append({"file": rel, "error": "missing"})
        continue
    b = open(p, "rb").read()
    pairs = [struct.unpack_from("<II", b, i * 8) for i in range(10)]
    nodes = walk_nodes(b)
    pidx = b.find(BSLASH)
    rec = {
        "file": rel,
        "size": len(b),
        "pairs": [[hex(a), c] for a, c in pairs],
        "bytes_50_58": b[0x50:0x58].hex(),
        "node_count_walked": len(nodes),
        "count0_matches_nodes": pairs[0][1] == len(nodes),
        "first_nodes": nodes[:8],
        "first_path_off": hex(pidx) if pidx >= 0 else None,
        "first_path": b[pidx:pidx + 40].split(b"\x00")[0].decode("ascii", "replace") if pidx >= 0 else None,
        "path_ref_count": b.count(BSLASH),
    }
    out.append(rec)

print(json.dumps(out, indent=1))
