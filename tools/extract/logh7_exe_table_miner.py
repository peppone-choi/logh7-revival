#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
g7mtclient.exe 임베디드 바이너리 테이블 채굴기.
- PE 리소스(RCDATA 등) 전부 덤프
- 스냅샷 RE 지식 기반 알려진 테이블 재확인 (objectTable @clientBase+0x2c1755)
- .data/.rdata stride 휴리스틱 스캔으로 레코드형 배열 후보 탐지

주의: 이 스크립트는 EXE 바이트를 읽어 값을 직접 재유도한다. 이전 사이클 JSON은 참고만 하고
값 복사는 하지 않는다 (CLAUDE.md 규칙).
"""
import json
import os
import struct
import sys
from collections import Counter

import pefile

EXE_PATH = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
OUT_DIR = r"E:\logh7-revival\server\content\generated"
RESOURCE_DIR = os.path.join(OUT_DIR, "exe-resources")
OUT_JSON = os.path.join(OUT_DIR, "exe-tables.json")

RESOURCE_TYPE_NAMES = {
    1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG",
    6: "STRING", 7: "FONTDIR", 8: "FONT", 9: "ACCELERATOR",
    10: "RCDATA", 11: "MESSAGETABLE", 12: "GROUP_CURSOR", 14: "GROUP_ICON",
    16: "VERSION", 17: "DLGINCLUDE", 19: "PLUGPLAY", 20: "VXD",
    21: "ANICURSOR", 22: "ANIICON", 23: "HTML", 24: "MANIFEST",
}


def dump_resources(pe):
    """RCDATA/커스텀 리소스 전부 덤프. 파일명은 type/name/lang id 기반."""
    os.makedirs(RESOURCE_DIR, exist_ok=True)
    entries = []
    if not hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
        return entries
    for res_type in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        type_id = res_type.struct.Id if res_type.name is None else None
        type_name = res_type.name.string.decode("utf-8", "replace") if res_type.name else RESOURCE_TYPE_NAMES.get(type_id, str(type_id))
        if not hasattr(res_type, "directory"):
            continue
        for res_name in res_type.directory.entries:
            name_id = res_name.struct.Id if res_name.name is None else None
            name_str = res_name.name.string.decode("utf-8", "replace") if res_name.name else str(name_id)
            if not hasattr(res_name, "directory"):
                continue
            for res_lang in res_name.directory.entries:
                data_rva = res_lang.data.struct.OffsetToData
                size = res_lang.data.struct.Size
                lang_id = res_lang.data.struct.CodePage if hasattr(res_lang.data.struct, "CodePage") else 0
                try:
                    data = pe.get_memory_mapped_image()[data_rva:data_rva + size]
                except Exception as e:
                    data = b""
                safe_type = str(type_name).replace("\\", "_").replace("/", "_")
                safe_name = str(name_str).replace("\\", "_").replace("/", "_")
                fname = f"{safe_type}_{safe_name}_{res_lang.struct.Id}.bin"
                fpath = os.path.join(RESOURCE_DIR, fname)
                with open(fpath, "wb") as f:
                    f.write(data)
                entries.append({
                    "type": safe_type,
                    "name": safe_name,
                    "langId": res_lang.struct.Id,
                    "rva": hex(data_rva),
                    "size": size,
                    "file": os.path.relpath(fpath, OUT_DIR).replace("\\", "/"),
                    "sha256_first16": data[:16].hex() if data else None,
                })
    return entries


def rva_to_file_offset(pe, rva):
    try:
        return pe.get_offset_from_rva(rva)
    except Exception:
        return None


def read_bytes_at_rva(pe, rva, size):
    off = rva_to_file_offset(pe, rva)
    if off is None:
        return None
    with open(EXE_PATH, "rb") as f:
        f.seek(off)
        return f.read(size)


def check_object_table(pe):
    """objectTable: clientBase(0x400000)+0x2c1755 부근, 3바이트/레코드.
    RVA = clientBase_offset - imagebase(0x400000) = 0x2c1755 (clientBase는 통상 0x400000 로드).
    """
    image_base = pe.OPTIONAL_HEADER.ImageBase
    known_va_offset = 0x2c1755  # 문서(docs/logh7-loop-state.md 저널#46/#88 등)의 "clientBase+0x2c1755"
    rva = known_va_offset  # clientBase == imagebase 가정 시 RVA == 오프셋
    section = None
    for s in pe.sections:
        if s.VirtualAddress <= rva < s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData):
            section = s.Name.decode(errors="replace").strip("\x00")
            break
    file_off = rva_to_file_offset(pe, rva)
    record_count = 240  # 갤럭시 알려진 성계/셀 수 근방까지 샘플링
    stride = 3
    raw = read_bytes_at_rva(pe, rva, record_count * stride)
    records = []
    if raw:
        for i in range(0, len(raw) - stride + 1, stride):
            b0, b1, b2 = raw[i], raw[i + 1], raw[i + 2]
            records.append({"idx": i // stride, "label": b0, "type": b1, "spectral": b2})
    return {
        "name": "objectTable_0x0313",
        "provenance": "docs/logh7-loop-state.md 저널#46/#88 RE 지식 (clientBase+0x2c1755, 3바이트/레코드: byte0=라벨 byte1=type byte2=분광형/faction폴백)",
        "imageBase": hex(image_base),
        "assumedClientBaseOffset": hex(known_va_offset),
        "rva": hex(rva),
        "containingSection": section,
        "fileOffset": hex(file_off) if file_off is not None else None,
        "stride": stride,
        "sampledRecordCount": len(records),
        "first10Records": records[:10],
        "first3RecordsHex": raw[:9].hex() if raw else None,
    }


def check_face_resolver_range(pe):
    """face 리졸버 범위 1..597 재확인: docs/reference/legacy-evidence/logh7-face-code-conversion.md
    코드 레벨 한계값(597) 자체는 String.txt/리소스가 아니라 CMP 명령 즉치값이라 정적 EXE grep으로는
    직접 오프셋을 얻기 어려움 — 여기서는 .text에서 597(0x25d)/598(0x25e) 즉치 비교 패턴 후보만 스캔.
    """
    text_section = next((s for s in pe.sections if s.Name.decode(errors="replace").strip("\x00") == ".text"), None)
    candidates = []
    if text_section:
        data = text_section.get_data()
        needle_597 = struct.pack("<I", 597)
        needle_598 = struct.pack("<I", 598)
        for needle, label in ((needle_597, 597), (needle_598, 598)):
            idx = 0
            while True:
                idx = data.find(needle, idx)
                if idx == -1:
                    break
                rva = text_section.VirtualAddress + idx
                candidates.append({
                    "immediateValue": label,
                    "rva": hex(rva),
                    "fileOffset": hex(rva_to_file_offset(pe, rva) or 0),
                    "contextHex": data[max(0, idx - 6):idx + 10].hex(),
                })
                idx += 1
    return {
        "name": "face_resolver_range_1_597",
        "provenance": "docs/reference/legacy-evidence/logh7-face-code-conversion.md: 'flat face number 1..597 -> data/image/Face/<NNN>.tga'",
        "note": "597/598 즉치값이 CMP/즉치 데이터로 등장하는 .text 내 위치 후보 목록 (검증 필요 - 다수 오탐 가능, 함수 문맥 없이는 확정 불가)",
        "candidateCount": len(candidates),
        "candidates": candidates[:20],
    }


def stride_scan(pe):
    """.data/.rdata 규칙적 stride 배열 휴리스틱 스캔.
    아이디어: 후보 stride(8,12,16,20,24,32바이트)마다, 레코드 앞부분 N바이트가
    '작은 정수/ASCII 근사값' 패턴으로 반복되는 런(run)을 찾는다.
    """
    results = []
    target_sections = [s for s in pe.sections if s.Name.decode(errors="replace").strip("\x00") in (".data", ".rdata")]
    strides = [8, 12, 16, 20, 24, 32, 40, 48]
    for sec in target_sections:
        sec_name = sec.Name.decode(errors="replace").strip("\x00")
        data = sec.get_data()
        for stride in strides:
            n = len(data) // stride
            if n < 8:
                continue
            # 각 stride 오프셋 그리드에서, 레코드 첫 4바이트를 부호없는 32비트로 해석했을 때
            # '그럴듯한 작은 정수'(0 <= v < 100000) 비율이 높은 연속 런을 찾는다.
            best_run = {"start": 0, "len": 0}
            cur_start = None
            cur_len = 0
            for i in range(n):
                off = i * stride
                if off + 4 > len(data):
                    break
                v = struct.unpack_from("<I", data, off)[0]
                plausible = 0 <= v < 200000
                if plausible:
                    if cur_start is None:
                        cur_start = off
                        cur_len = 1
                    else:
                        cur_len += 1
                    if cur_len > best_run["len"]:
                        best_run = {"start": cur_start, "len": cur_len}
                else:
                    cur_start = None
                    cur_len = 0
            if best_run["len"] >= 20:  # 레코드 20개 이상 연속되면 후보로 채택
                start = best_run["start"]
                rec_count = best_run["len"]
                rva = sec.VirtualAddress + start
                first3 = data[start:start + stride * min(3, rec_count)]
                results.append({
                    "section": sec_name,
                    "stride": stride,
                    "startOffsetInSection": hex(start),
                    "rva": hex(rva),
                    "fileOffset": hex(rva_to_file_offset(pe, rva) or 0),
                    "recordCount": rec_count,
                    "first3RecordsHex": first3.hex(),
                })
    # 너무 많은 후보가 나올 수 있어 recordCount 내림차순 상위만 남김, section+stride당 최상위 1개
    dedup = {}
    for r in results:
        key = (r["section"], r["stride"])
        if key not in dedup or r["recordCount"] > dedup[key]["recordCount"]:
            dedup[key] = r
    ranked = sorted(dedup.values(), key=lambda r: -r["recordCount"])
    return ranked[:30]


def main():
    if not os.path.isfile(EXE_PATH):
        print(json.dumps({"error": f"EXE not found: {EXE_PATH}"}))
        sys.exit(1)
    pe = pefile.PE(EXE_PATH)
    pe.parse_data_directories()

    resources = dump_resources(pe)
    object_table = check_object_table(pe)
    face_range = check_face_resolver_range(pe)
    stride_candidates = stride_scan(pe)

    out = {
        "source": {
            "exe": EXE_PATH,
            "exeSizeBytes": os.path.getsize(EXE_PATH),
            "imageBase": hex(pe.OPTIONAL_HEADER.ImageBase),
        },
        "resources": {
            "count": len(resources),
            "outputDir": os.path.relpath(RESOURCE_DIR, OUT_DIR).replace("\\", "/"),
            "entries": resources,
        },
        "knownTables": {
            "objectTable_0x0313": object_table,
            "faceResolverRange": face_range,
        },
        "strideArrayCandidates": stride_candidates,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(json.dumps({
        "written": OUT_JSON,
        "resourceCount": len(resources),
        "strideCandidateCount": len(stride_candidates),
        "objectTableFileOffset": object_table["fileOffset"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
