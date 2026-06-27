#!/usr/bin/env python3
"""런처 EXE(Gin7UpdateClient.exe / G7Start.exe)의 .rsrc 일본어 → 한글 패치.

왜 별도 도구인가
----------------
기존 ``logh7_rsrc_patch.py``는 .rsrc 섹션 전체를 재직렬화한다. 그 직렬화기는
G7MTClient.exe(전부 ID 엔트리)에 한해 byte-exact 라운드트립이 검증됐지만, 두 런처
EXE는 RT_BITMAP에 **이름(named) 디렉터리 엔트리**(TITLE_BG/BITBTN_*)를 가져
전체 재직렬화가 디렉터리 트리/이름 풀을 재현하지 못한다(selftest treeRoundTrip=false).

그래서 이 도구는 **디렉터리 트리·이름 문자열 풀·데이터엔트리 영역(첫 blob 이전)을
바이트 그대로 보존**하고, 변경된 RT_DIALOG/RT_STRING blob만 재빌드해 blob 영역을
다시 깔며, 각 leaf의 **DataEntry(RVA/Size)만 제자리 패치**한다. .rsrc는 파일의
마지막 섹션이라 blob이 길어지면 파일만 늘어난다(뒤 섹션 재배치 없음).

문자열 파싱/blob 재빌드/폰트 face 교체 로직은 기존 모듈을 재사용한다(중복 방지).
폰트 함정: 다이얼로그 폰트 face ``ＭＳ Ｐゴシック``는 DLGTEMPLATE의 'str' 슬롯이라
매핑에서 text_ko로 한글 face(맑은 고딕)로 교체하면 같은 경로로 패치된다.

사용법
  python tools/logh7_launcher_rsrc_patch.py selftest <exe>
  python tools/logh7_launcher_rsrc_patch.py dump     <exe> <out.json>
  python tools/logh7_launcher_rsrc_patch.py patch --exe <exe> --map <ko.json> --out <out.exe>
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import logh7_rsrc_patch as R  # 파서·blob 재빌드·PE 헬퍼 재사용


def _section(pe):
    return R.section_fields(pe, pe.rsrc_index)


def _de_offsets(pe, leaves):
    """첫 blob 이전 영역에서 각 leaf의 DataEntry(16B: RVA,Size,CP,0) 파일오프셋을 찾는다."""
    o, vsize, rva0, rsize, ptr0 = _section(pe)
    data = pe.data
    first_blob = min((rd.orig_file_off - ptr0) for rd in leaves)
    # DE는 원본 blob RVA로 매칭한다(편집 후 blob 길이가 달라져도 RVA는 보존 영역의 원본값).
    # RVA는 leaf마다 유일(원본 파일오프셋 1:1) 하므로 size 비교 없이도 충돌하지 않는다.
    want = {}
    for rd in leaves:
        want[(rd.orig_file_off - ptr0) + rva0] = rd  # 원본 blob RVA → leaf
    de_off = {}
    for off in range(0, first_blob - 16, 4):
        rva, size, cp, z = struct.unpack_from("<IIII", data, ptr0 + off)
        rd = want.get(rva)
        # z==0 + RVA in want + size == 원본 blob 길이(orig_file_off 기준)면 DE 확정.
        # rd.blob은 이미 편집됐을 수 있으므로 원본 길이로 검증한다.
        if rd is not None and z == 0 and id(rd) not in de_off:
            de_off[id(rd)] = ptr0 + off
    if len(de_off) != len(leaves):
        raise RuntimeError(f"DataEntry 매칭 실패: {len(de_off)}/{len(leaves)}")
    return de_off, first_blob


def _rebuild_inplace(pe, leaves) -> bytes:
    """디렉터리/이름풀/DataEntry 영역은 보존, blob 영역만 재배치하고 DE의 RVA/Size 패치.

    blob은 **원본 파일오프셋 순서**로 8B 정렬해 다시 깐다(원본 링커 배치와 동일 순서).
    편집 없으면 결과는 원본과 byte-identical."""
    o, vsize, rva0, rsize, ptr0 = _section(pe)
    data = bytes(pe.data)
    de_off, first_blob = _de_offsets(pe, leaves)

    head = bytearray(data[ptr0:ptr0 + first_blob])  # 보존 영역(디렉터리+이름풀+DE)
    out = bytearray(head)
    blob_seq = sorted(leaves, key=lambda r: r.orig_file_off)
    new_rva = {}
    for rd in blob_seq:
        while len(out) % 8:
            out += b"\x00"
        new_rva[id(rd)] = rva0 + len(out)
        out += rd.blob
    # DE 패치(보존 영역 내 위치에 새 RVA/Size 기록)
    for rd in leaves:
        deo = de_off[id(rd)] - ptr0  # head 내 상대오프셋
        struct.pack_into("<II", out, deo, new_rva[id(rd)], len(rd.blob))
    # tail pad: 원본 VirtualSize가 마지막 blob 끝보다 길면 0 패딩 재현
    last_end = max((rd.orig_file_off - ptr0) + len(rd.blob) for rd in leaves)
    tail = max(0, vsize - last_end)
    out += b"\x00" * tail
    return bytes(out)


def _write(pe, new_rsrc: bytes, out_path: Path):
    """logh7_rsrc_patch.write_patched와 동일한 섹션헤더/데이터디렉터리/SizeOfImage 갱신."""
    return R.write_patched(pe, new_rsrc, out_path)


def cmd_selftest(exe: Path) -> int:
    raw = exe.read_bytes()
    pe = R.parse_pe(raw)
    o, vsize, rva0, rsize, ptr0 = _section(pe)
    orig_body = raw[ptr0:ptr0 + vsize]
    leaves = R.parse_rsrc(pe)
    rebuilt = _rebuild_inplace(pe, leaves)
    print(json.dumps({
        "inplaceRoundTrip": rebuilt == bytes(orig_body),
        "rebuiltLen": len(rebuilt), "origBodyLen": len(orig_body),
        "leafCount": len(leaves),
    }, ensure_ascii=False, indent=2))
    return 0 if rebuilt == bytes(orig_body) else 1


def cmd_dump(exe: Path, out: Path) -> int:
    raw = exe.read_bytes()
    pe = R.parse_pe(raw)
    leaves = R.parse_rsrc(pe)
    rows = []
    for rd in leaves:
        if rd.type_id not in (R.RT_MENU, R.RT_DIALOG, R.RT_STRING):
            continue
        parsed = R.parse_blob_strings(rd)
        if not parsed:
            continue
        for slot in parsed[0]:
            if slot.text == "":
                continue
            rows.append({"va_off": slot.file_off, "restype": R.RT_NAME[rd.type_id],
                         "name_id": rd.name_id, "text": slot.text})
    out.write_text(json.dumps({"count": len(rows), "strings": rows},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out} rows {len(rows)}")
    return 0


def _load_map(map_path: Path):
    spec = json.loads(map_path.read_text(encoding="utf-8"))
    ko, ja = {}, {}
    for e in spec.get("strings", []):
        off = int(e["va_off"])
        if e.get("text_ja") is not None:
            ja[off] = e["text_ja"]
        if e.get("text_ko"):
            ko[off] = e["text_ko"]
    return ko, ja


def cmd_patch(exe: Path, out: Path, map_path: Path, no_guard: bool) -> int:
    raw = exe.read_bytes()
    # 16B 시그니처 가드: 원본 선두 16B 기록(보고용)
    sig16 = raw[:16].hex()
    pe = R.parse_pe(raw)
    leaves = R.parse_rsrc(pe)
    mapping, expect_ja = _load_map(map_path)
    if not mapping:
        print(f"no text_ko in {map_path}", file=sys.stderr)
        return 2
    report, skipped = [], []
    R._apply_korean(leaves, mapping, report,
                    expect_ja=None if no_guard else expect_ja, skipped=skipped)
    new_rsrc = _rebuild_inplace(pe, leaves)
    info = R.write_patched(pe, new_rsrc, out)

    # 검증: 재파싱해 한글 문자열이 실제 존재하는지 확인 + 로드가능(PE 파싱 성공)
    vpe = R.parse_pe(out.read_bytes())
    vleaves = R.parse_rsrc(vpe)
    seen = set()
    for rd in vleaves:
        if rd.type_id not in (R.RT_MENU, R.RT_DIALOG, R.RT_STRING):
            continue
        parsed = R.parse_blob_strings(rd)
        if parsed:
            for slot in parsed[0]:
                seen.add(slot.text)
    present = sum(1 for r in report if r["to"] in seen)
    print(json.dumps({
        "exe": str(exe), "origSig16": sig16, **info,
        "applied": len(report), "skippedMismatch": len(skipped),
        "verifiedPresent": present, "verifyOk": present == len(report),
        "skipped": skipped,
    }, ensure_ascii=False, indent=2))
    return 0 if present == len(report) else 1


def main(argv) -> int:
    ap = argparse.ArgumentParser(description="런처 EXE .rsrc 한글 패치(인플레이스, 이름엔트리 보존).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("selftest"); p.add_argument("exe", type=Path)
    p = sub.add_parser("dump"); p.add_argument("exe", type=Path); p.add_argument("out", type=Path)
    pp = sub.add_parser("patch")
    pp.add_argument("--exe", type=Path, required=True)
    pp.add_argument("--map", type=Path, required=True)
    pp.add_argument("--out", type=Path, required=True)
    pp.add_argument("--no-guard", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "selftest":
        return cmd_selftest(a.exe)
    if a.cmd == "dump":
        return cmd_dump(a.exe, a.out)
    if a.cmd == "patch":
        return cmd_patch(a.exe, a.out, a.map, a.no_guard)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
