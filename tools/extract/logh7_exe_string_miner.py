#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LOGH VII g7mtclient.exe 전체 문자열 채굴 도구
- 1차 소스: 클라 EXE(g7mtclient.exe) 바이트 스트림 직접 스캔
- PE 헤더를 직접 파싱해 섹션(.rdata/.data/.rsrc 등) 경계를 구하고, 각 문자열에
  포함 섹션 + 파일오프셋(=RVA 계산 포함) 을 provenance 로 기록한다.
- cp932(shift_jis) ASCII/일본어 문자열과 UTF-16LE 문자열을 각각 별도 스캔.
- 이름류(인명/함선/성계행성/계급/UI/경로/포맷문자열) 후보를 정규식 휴리스틱으로 분류.
- 'String.txt' 참조 여부(로드 단서) 를 따로 수집.

출력:
  server/content/generated/exe-strings.json            (전수 원본 스트링 목록)
  server/content/generated/exe-strings-classified.json (분류 + 카운트)
"""
import re
import json
import struct
import os

EXE_PATH = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
OUT_DIR = r"E:\logh7-revival\server\content\generated"
OUT_ALL = os.path.join(OUT_DIR, "exe-strings.json")
OUT_CLASSIFIED = os.path.join(OUT_DIR, "exe-strings-classified.json")

MIN_LEN = 2  # 최소 2자


def parse_pe_sections(data: bytes):
    """PE 헤더를 직접 파싱해 섹션 테이블(이름, 파일오프셋 범위, RVA)을 반환한다."""
    assert data[0:2] == b"MZ", "MZ 시그니처 없음"
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    assert data[e_lfanew:e_lfanew + 4] == b"PE\x00\x00", "PE 시그니처 없음"

    coff_off = e_lfanew + 4
    machine, num_sections, timestamp, symtab_ptr, num_syms, opt_hdr_size, characteristics = \
        struct.unpack_from("<HHIIIHH", data, coff_off)

    opt_hdr_off = coff_off + 20
    sec_table_off = opt_hdr_off + opt_hdr_size

    sections = []
    for i in range(num_sections):
        base = sec_table_off + i * 40
        raw = data[base:base + 40]
        name = raw[0:8].rstrip(b"\x00").decode("ascii", errors="replace")
        virt_size, virt_addr, raw_size, raw_ptr = struct.unpack_from("<IIII", raw, 8)
        sections.append({
            "name": name,
            "virtual_size": virt_size,
            "virtual_address": virt_addr,
            "raw_size": raw_size,
            "raw_ptr": raw_ptr,
            "file_start": raw_ptr,
            "file_end": raw_ptr + raw_size,
        })
    return sections


def section_for_offset(sections, offset):
    for s in sections:
        if s["file_start"] <= offset < s["file_end"]:
            return s["name"]
    return "(header/overlay)"


# ---- cp932(shift_jis) 아스키+일본어 문자열 스캔 ----
# 유효 shift_jis 바이트 시퀀스를 그리디하게 소비하며 문자열 경계를 잡는다.
SJIS_PRINTABLE_ASCII = set(range(0x20, 0x7F))


def is_sjis_lead(b):
    return (0x81 <= b <= 0x9F) or (0xE0 <= b <= 0xFC)


def is_sjis_trail(b):
    return (0x40 <= b <= 0xFC) and b != 0x7F


def scan_cp932(data: bytes, min_len=MIN_LEN):
    """cp932 문자열 후보를 오프셋과 함께 추출."""
    results = []
    i = 0
    n = len(data)
    buf_start = None
    raw_bytes = bytearray()

    def flush(end):
        nonlocal buf_start, raw_bytes
        if buf_start is not None and len(raw_bytes) >= 1:
            try:
                text = bytes(raw_bytes).decode("cp932", errors="strict")
            except UnicodeDecodeError:
                text = None
            if text is not None and len(text) >= min_len:
                # 최소 하나는 출력 가능한 문자, 전부 제어문자면 skip
                if any(ch.strip() for ch in text):
                    results.append((buf_start, text))
        buf_start = None
        raw_bytes = bytearray()

    while i < n:
        b = data[i]
        if b in SJIS_PRINTABLE_ASCII:
            if buf_start is None:
                buf_start = i
            raw_bytes.append(b)
            i += 1
        elif is_sjis_lead(b) and i + 1 < n and is_sjis_trail(data[i + 1]):
            if buf_start is None:
                buf_start = i
            raw_bytes.append(b)
            raw_bytes.append(data[i + 1])
            i += 2
        else:
            flush(i)
            i += 1
    flush(n)
    return results


# ---- UTF-16LE 문자열 스캔 ----
UTF16_PRINTABLE_MIN = 0x20
UTF16_PRINTABLE_MAX_ASCII = 0x7E
# 일본어 대역(히라가나/가타카나/CJK 통합한자/전각기호)도 허용
def is_utf16_char_ok(cu):
    if UTF16_PRINTABLE_MIN <= cu <= UTF16_PRINTABLE_MAX_ASCII:
        return True
    if 0x3040 <= cu <= 0x30FF:  # 히라가나/가타카나
        return True
    if 0x4E00 <= cu <= 0x9FFF:  # CJK 통합 한자
        return True
    if 0xFF00 <= cu <= 0xFFEF:  # 전각 폼
        return True
    if 0xAC00 <= cu <= 0xD7A3:  # 한글 완성형(패치/한글화 흔적 대비)
        return True
    return False


def scan_utf16le(data: bytes, min_len=MIN_LEN):
    results = []
    n = len(data)
    i = 0
    buf_start = None
    chars = []

    def flush(end):
        nonlocal buf_start, chars
        if buf_start is not None and len(chars) >= min_len:
            text = "".join(chars)
            if any(ch.strip() for ch in text):
                results.append((buf_start, text))
        buf_start = None
        chars = []

    while i + 1 < n:
        cu = data[i] | (data[i + 1] << 8)
        if is_utf16_char_ok(cu):
            if buf_start is None:
                buf_start = i
            chars.append(chr(cu))
            i += 2
        else:
            flush(i)
            i += 2
    flush(n)
    return results


# ---- 분류 휴리스틱 ----
RANK_KEYWORDS = ["元帥", "大将", "中将", "少将", "准将", "大佐", "中佐", "少佐",
                 "大尉", "中尉", "少尉", "曹長", "軍曹", "伍長", "兵長", "上等兵", "一等兵",
                 "元帥府", "宇宙艦隊"]

SHIP_HINTS = ["号", "戦艦", "巡航艦", "駆逐艦", "空母", "旗艦"]
PLACE_HINTS = ["星系", "惑星", "要塞", "宙域", "回廊"]

KATAKANA_RE = re.compile(r"^[゠-ヿー・]{2,}$")
PATH_RE = re.compile(r"^[A-Za-z0-9_\\/.:]+\.(exe|dll|txt|dat|tga|bmp|wav|mdx|tcf|cfg|ini|log|bin|res|mp3|avi|scr|fon)$", re.I)
FMT_STR_RE = re.compile(r"%[-+ 0#]*\d*\.?\d*[sd u fx X c p ld lu I64d]")
UI_HINT_RE = re.compile(r"(Button|Dialog|Window|Menu|OK|Cancel|Yes|No|Error|Warning|확인|취소)", re.I)


def classify(text: str):
    tags = []
    if "String.txt" in text or "string.txt" in text.lower():
        tags.append("string_txt_reference")
    if PATH_RE.match(text.strip()):
        tags.append("file_path")
    if FMT_STR_RE.search(text) and len(text) < 40:
        tags.append("format_string")
    if any(k in text for k in RANK_KEYWORDS):
        tags.append("rank_military")
    if any(k in text for k in SHIP_HINTS):
        tags.append("ship_name_candidate")
    if any(k in text for k in PLACE_HINTS):
        tags.append("place_name_candidate")
    if KATAKANA_RE.match(text.strip()):
        tags.append("person_name_candidate_katakana")
    if UI_HINT_RE.search(text):
        tags.append("ui_text")
    if not tags:
        tags.append("uncategorized")
    return tags


def main():
    with open(EXE_PATH, "rb") as f:
        data = f.read()

    file_size = len(data)
    sections = parse_pe_sections(data)

    print(f"[*] EXE 크기: {file_size} bytes, 섹션 {len(sections)}개")
    for s in sections:
        print(f"    {s['name']:10s} file=[{s['file_start']:#x},{s['file_end']:#x}) "
              f"rva={s['virtual_address']:#x} vsize={s['virtual_size']:#x}")

    cp932_hits = scan_cp932(data)
    utf16_hits = scan_utf16le(data)

    print(f"[*] cp932 후보 {len(cp932_hits)}건, utf16le 후보 {len(utf16_hits)}건")

    all_records = []
    for offset, text in cp932_hits:
        all_records.append({
            "offset": offset,
            "offset_hex": hex(offset),
            "encoding": "cp932",
            "section": section_for_offset(sections, offset),
            "length": len(text),
            "text": text,
        })
    for offset, text in utf16_hits:
        all_records.append({
            "offset": offset,
            "offset_hex": hex(offset),
            "encoding": "utf16le",
            "section": section_for_offset(sections, offset),
            "length": len(text),
            "text": text,
        })

    all_records.sort(key=lambda r: r["offset"])

    exe_strings_doc = {
        "source": {
            "exe_path": EXE_PATH,
            "file_size": file_size,
            "note": "1차 소스 EXE 바이트 직접 스캔. 이전 사이클 JSON 비참조.",
        },
        "sections": sections,
        "scan_params": {
            "min_len": MIN_LEN,
            "encodings": ["cp932", "utf16le"],
        },
        "count": len(all_records),
        "strings": all_records,
    }

    # ---- 분류 문서 ----
    classified = {}
    string_txt_refs = []
    for rec in all_records:
        tags = classify(rec["text"])
        for tag in tags:
            bucket = classified.setdefault(tag, {"count": 0, "examples": []})
            bucket["count"] += 1
            if len(bucket["examples"]) < 50:
                bucket["examples"].append({
                    "offset_hex": rec["offset_hex"],
                    "encoding": rec["encoding"],
                    "section": rec["section"],
                    "text": rec["text"],
                })
        if "string_txt_reference" in tags:
            string_txt_refs.append({
                "offset_hex": rec["offset_hex"],
                "encoding": rec["encoding"],
                "section": rec["section"],
                "text": rec["text"],
            })

    classified_doc = {
        "source": exe_strings_doc["source"],
        "total_strings": len(all_records),
        "category_counts": {k: v["count"] for k, v in sorted(classified.items(), key=lambda kv: -kv[1]["count"])},
        "categories": classified,
        "string_txt_load_clues": string_txt_refs,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_ALL, "w", encoding="utf-8") as f:
        json.dump(exe_strings_doc, f, ensure_ascii=False, indent=1)
    with open(OUT_CLASSIFIED, "w", encoding="utf-8") as f:
        json.dump(classified_doc, f, ensure_ascii=False, indent=1)

    print(f"[+] 전수: {OUT_ALL} ({len(all_records)}건)")
    print(f"[+] 분류: {OUT_CLASSIFIED}")
    print(f"[+] String.txt 참조 단서: {len(string_txt_refs)}건")
    for c, n in sorted(classified_doc["category_counts"].items(), key=lambda kv: -kv[1]):
        print(f"    {c:32s} {n}")


if __name__ == "__main__":
    main()
