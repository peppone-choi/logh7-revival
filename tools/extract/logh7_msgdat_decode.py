# -*- coding: utf-8 -*-
"""
LOGH VII data/msgdat/ HFWR·GFWR 컨테이너 디코더 (2026-07-05 리셋 사이클 신규 작성)

포맷 지식 출처: git 스냅샷 5bd249c 의
  - docs/reference/legacy-evidence/logh7-msgdat-catalog.md
  - server/content/extracted/constmsg-groups.json (textPointerCount/offsetTableCount 검증)
과 이번 사이클의 헥스덤프 직접 분석으로 재확인.

HFWR 레이아웃 (리틀엔디언):
  +0x00  magic 'HFWR'
  +0x04  uint32 = 0 (예약)
  +0x08  uint32 recordCount  — 데이터부의 NUL 종단 문자열(레코드) 총수
  +0x0C  uint32 groupCount   — 그룹 경계 테이블 엔트리 수
  +0x10  uint32[groupCount]  — 누적 레코드 인덱스 (첫값 0, 끝값 recordCount)
  data   = align16(0x10 + 4*groupCount) 부터 recordCount 개의 NUL 종단 cp932 문자열

GFWR 레이아웃 (g7sw.dat, NG워드 필터):
  +0x00  magic 'GFWR'
  +0x04  uint32 = 0
  +0x08  uint32 unknown (체크섬/해시로 추정, 그대로 보존)
  +0x0C  uint32 recordCount
  이후   recordCount 개의 [uint32 charCount][UTF-16LE charCount자]
"""
import json, struct, sys, os
from pathlib import Path

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\msgdat")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
    r"E:\logh7-revival\server\content\generated")
OUT.mkdir(parents=True, exist_ok=True)
# provenance 는 게임 트리 루트 기준 상대경로로 기록
REL_BASE = "data/msgdat"


def decode_str(raw: bytes):
    """cp932 우선, 실패 시 cp949 시도, 둘 다 실패면 hex 보존."""
    for enc in ("cp932", "cp949"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            pass
    return raw.hex(), "hex"


def parse_hfwr(path: Path):
    b = path.read_bytes()
    assert b[:4] == b"HFWR", f"{path.name}: HFWR 매직 아님"
    zero, rec_count, grp_count = struct.unpack_from("<III", b, 4)
    assert zero == 0, f"{path.name}: +0x04 필드가 0이 아님 ({zero})"
    table = list(struct.unpack_from(f"<{grp_count}I", b, 0x10))
    assert table[0] == 0 and table[-1] == rec_count, \
        f"{path.name}: 그룹 테이블 경계 불일치 (last={table[-1]} rec={rec_count})"
    data_off = (0x10 + 4 * grp_count + 15) & ~15
    # 데이터부: recordCount 개의 NUL 종단 문자열을 순차 파싱
    records, pos = [], data_off
    for i in range(rec_count):
        end = b.index(0, pos)
        records.append(b[pos:end])
        pos = end + 1
    assert pos == len(b), f"{path.name}: 데이터부 잔여 바이트 {len(b)-pos}"
    # 그룹 정보: [start, end) 레코드 인덱스
    groups = [{"group": g, "baseId": table[g], "endIdExclusive": table[g + 1]}
              for g in range(grp_count - 1)]
    out_records, enc_stats = {}, {}
    for i, raw in enumerate(records):
        if not raw:
            continue  # 빈 레코드는 생략 (id 갭으로 빈 것을 표현)
        text, enc = decode_str(raw)
        enc_stats[enc] = enc_stats.get(enc, 0) + 1
        out_records[str(i)] = text
    return {
        "provenance": {
            "source": f"{REL_BASE}/{path.name}",
            "format": "HFWR (magic+recordCount@0x08+groupCount@0x0C+cumulative-index table@0x10, "
                      "data=align16 이후 NUL 종단 cp932 문자열 recordCount개)",
            "fileSize": len(b), "dataOffset": data_off, "encodings": enc_stats,
        },
        "recordCount": rec_count,
        "nonEmptyCount": len(out_records),
        "groupCount": grp_count - 1,
        "groups": groups,
        "records": out_records,
    }


def parse_gfwr(path: Path):
    b = path.read_bytes()
    assert b[:4] == b"GFWR", f"{path.name}: GFWR 매직 아님"
    zero, unknown, rec_count = struct.unpack_from("<III", b, 4)
    assert zero == 0
    records, pos = [], 0x10
    for i in range(rec_count):
        (n,) = struct.unpack_from("<I", b, pos)
        pos += 4
        records.append(b[pos:pos + 2 * n].decode("utf-16le"))
        pos += 2 * n
    assert pos == len(b), f"{path.name}: 잔여 바이트 {len(b)-pos}"
    return {
        "provenance": {
            "source": f"{REL_BASE}/{path.name}",
            "format": "GFWR (magic+unknown@0x08+recordCount@0x0C, "
                      "레코드=[uint32 문자수][UTF-16LE 문자열])",
            "fileSize": len(b), "unknownField0x08": f"0x{unknown:08x}",
        },
        "recordCount": rec_count,
        "records": {str(i): s for i, s in enumerate(records)},
        "role": "NG워드(금칙어) 필터 목록 — 이전 사이클 카탈로그 문서 확인",
    }


def dump(obj, name):
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


# --- 실행 ---
constmsg = parse_hfwr(SRC / "constmsg.dat")
dump(constmsg, "msgdat-constmsg.json")

messages = {}
for f in sorted(SRC.glob("messages_*.dat")):
    messages[f.name] = parse_hfwr(f)
dump({"provenance": {"source": f"{REL_BASE}/messages_*.dat",
                     "format": "파일별 HFWR — 각 항목의 provenance 참조"},
      "files": messages}, "msgdat-messages.json")

g7sw = parse_gfwr(SRC / "g7sw.dat")
dump(g7sw, "msgdat-g7sw.json")

# 요약 출력 (검증 증거)
summary = {
    "constmsg": {"records": constmsg["recordCount"], "nonEmpty": constmsg["nonEmptyCount"],
                 "groups": constmsg["groupCount"]},
    "messages": {k: {"records": v["recordCount"], "nonEmpty": v["nonEmptyCount"]}
                 for k, v in messages.items()},
    "g7sw": {"records": g7sw["recordCount"]},
}
print(json.dumps(summary, ensure_ascii=False, indent=1))
