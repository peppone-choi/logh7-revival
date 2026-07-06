# -*- coding: utf-8 -*-
# LOGH VII null_galaxy.mdx / galaxy.mdx 좌표 복원 판정기
# 목적: 232바이트(0xE8) 노드 레코드 안에 별 노드별 월드 XYZ 좌표(float32)가 존재하는지 확정 판정
# 근거만 출력한다 — 추측 금지. float 후보는 값범위/일관성으로 검증.
import struct, os, json, math, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
NG = os.path.join(ROOT, "null_galaxy.mdx")
GX = os.path.join(ROOT, "galaxy.mdx")

NODE_OFF = 0x58     # 노드 디렉토리 시작
STRIDE   = 0xE8     # 232 바이트

def read(p): return open(p, "rb").read()

def f32(b, o):
    if o + 4 > len(b): return None
    return struct.unpack_from("<f", b, o)[0]

def is_finite_coord(v):
    # 좌표 후보로 그럴듯한 float: 유한, NaN아님, 절대값 0<..<1e6, 서브노멀 배제
    if v is None: return False
    if v == 0.0: return False
    if not math.isfinite(v): return False
    a = abs(v)
    if a < 1e-4 or a > 1e6: return False
    return True

def node_name(b, off):
    end = b.find(b"\x00", off, off+0x40)
    if end < 0: end = off
    raw = b[off:end]
    try: return raw.decode("ascii")
    except: return raw.hex()

def analyze(path, label, node_off, count):
    b = read(path)
    print(f"\n===== {label} ({len(b)} bytes) =====")
    # 헤더 10쌍
    pairs = [struct.unpack_from("<II", b, i*8) for i in range(10)]
    print("header pairs (ptr,count):", [(hex(a),c) for a,c in pairs])
    # 레코드별: 이름 뒤 오프셋마다 float 후보를 스캔, 컬럼별 비영(非零) 히스토그램
    col_nonzero = {}   # 레코드내 오프셋 -> 좌표후보로 유효한 레코드 수
    col_samples = {}   # 오프셋 -> 처음 몇개 값
    recs = []
    for i in range(count):
        ro = node_off + i*STRIDE
        rec = b[ro:ro+STRIDE]
        name = node_name(b, ro)
        # 레코드 안 모든 4바이트 정렬 위치 float
        floats = {}
        for o in range(0, STRIDE-3, 4):
            v = f32(b, ro+o)
            floats[o] = v
            if is_finite_coord(v):
                col_nonzero[o] = col_nonzero.get(o,0)+1
                col_samples.setdefault(o, []).append((name, round(v,4)))
        recs.append((name, floats))
    # 어떤 레코드내 오프셋이 다수 레코드에서 유효좌표를 갖는가
    print(f"\n-- 레코드내 오프셋별 '유효좌표 후보' 보유 레코드 수 (총 {count}개 중) --")
    hot = sorted(col_nonzero.items(), key=lambda kv: -kv[1])
    for o, n in hot[:30]:
        samp = col_samples[o][:5]
        print(f"  off 0x{o:03x} ({o:3d}): {n:3d}/{count}   샘플={samp}")
    if not hot:
        print("  (유효 좌표 후보를 가진 오프셋이 하나도 없음 — 전 레코드 float 필드가 0/비유효)")
    return b, recs, col_nonzero, col_samples

# null_galaxy: 85 노드
b_ng, recs_ng, cn_ng, cs_ng = analyze(NG, "null_galaxy.mdx", NODE_OFF, 85)

# galaxy.mdx: 2 노드(메시레이어) — 참고용
b_gx, recs_gx, cn_gx, cs_gx = analyze(GX, "galaxy.mdx", NODE_OFF, 2)

# null_galaxy 첫 레코드 원시 hex 덤프(구조 파악)
print("\n===== null_galaxy 레코드[0] 원시 hex (star_01_G, 232B) =====")
r0 = b_ng[NODE_OFF:NODE_OFF+STRIDE]
for o in range(0, STRIDE, 16):
    chunk = r0[o:o+16]
    hexs = " ".join(f"{c:02x}" for c in chunk)
    asci = "".join(chr(c) if 32<=c<127 else "." for c in chunk)
    print(f"  +0x{o:03x}: {hexs:<48} |{asci}|")
