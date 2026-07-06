#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
차원 T: g7mtclient.exe .rdata/.data 고정 stride 레코드 배열 전수 탐지기.
목적: 성계(85/86)·행성(281/300) 개수에 가까운 배열 후보를 찾아 필드추정.
필드추정: (a)좌표후보 int16/int32/float 쌍, (b)작은 정수 열거값(타입/진영),
(c)포인터열(문자열 VA -> 문자열 덤프해 성계명 대조).
근거는 실제 바이트/오프셋으로만. 이전 사이클 JSON 값 복사 금지.
"""
import json, os, struct, sys
import pefile

EXE = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
OUT = r"E:\logh7-revival\server\content\extracted\exe-data-tables-sweep.json"
TARGET_COUNTS = [85, 86, 281, 300]  # 우선 관심 개수


def main():
    pe = pefile.PE(EXE)
    IB = pe.OPTIONAL_HEADER.ImageBase
    data = open(EXE, "rb").read()

    # 섹션 맵: (va_start, va_end, foff, rawsize, name)
    secs = []
    for s in pe.sections:
        nm = s.Name.decode(errors="replace").strip("\x00")
        secs.append((s.VirtualAddress, s.VirtualAddress + s.SizeOfRawData,
                     s.PointerToRawData, s.SizeOfRawData, nm))

    def va_to_foff(rva):
        for vs, ve, fo, rs, nm in secs:
            if vs <= rva < ve:
                return fo + (rva - vs)
        return None

    def sec_of_va(rva):
        for vs, ve, fo, rs, nm in secs:
            if vs <= rva < ve:
                return nm
        return None

    # 유효 VA 범위(포인터 판정용): 절대주소 IB+rva 가 초기화된 섹션을 가리키면 참
    def abs_ptr_target_foff(absval):
        rva = absval - IB
        return va_to_foff(rva), sec_of_va(rva)

    def read_cstr(foff, maxlen=64):
        if foff is None:
            return None
        end = data.find(b"\x00", foff, foff + maxlen)
        if end == -1:
            end = foff + maxlen
        raw = data[foff:end]
        if not raw:
            return None
        return raw

    def decode_str(raw):
        for enc in ("cp932", "ascii"):
            try:
                s = raw.decode(enc)
                if all(31 < ord(c) or c in "\t" for c in s):
                    return enc, s
            except Exception:
                pass
        return None, None

    scan_secs = [s for s in secs if s[4] in (".rdata", ".data")]

    # ---------- (c) 포인터 테이블 탐지 ----------
    ptr_tables = []
    for vs, ve, fo, rs, nm in scan_secs:
        blob = data[fo:fo + rs]
        i = 0
        n = len(blob) - 4
        while i <= n:
            # 이 위치부터 연속 유효 문자열 포인터 런 길이 측정 (4바이트 정렬)
            run = []
            j = i
            while j <= n:
                v = struct.unpack_from("<I", blob, j)[0]
                tfoff, tsec = abs_ptr_target_foff(v)
                if tfoff is None:
                    break
                raw = read_cstr(tfoff)
                enc, s = decode_str(raw) if raw else (None, None)
                if s is None or len(s) < 1:
                    break
                run.append((v, s, enc))
                j += 4
            if len(run) >= 20:
                rva = vs + i
                ptr_tables.append({
                    "section": nm, "rva": hex(rva),
                    "fileOffset": hex(fo + i),
                    "count": len(run),
                    "nearTarget": min(TARGET_COUNTS, key=lambda t: abs(t - len(run))),
                    "sampleStrings": [r[1] for r in run[:12]],
                    "encGuess": run[0][2],
                })
                i = j
            else:
                i += 4
    ptr_tables.sort(key=lambda r: -r["count"])

    # ---------- (a/b) 고정 stride 수치 배열 탐지 ----------
    # 방법: 후보 stride마다, 각 레코드 첫 필드를 여러 해석으로 보고 '작은 정수/좌표'
    # 처럼 보이는 연속 런의 길이를 측정. count가 타깃 근방인 것을 우선.
    num_tables = []
    strides = list(range(2, 65))
    for vs, ve, fo, rs, nm in scan_secs:
        blob = data[fo:fo + rs]
        for stride in strides:
            i = 0
            limit = len(blob) - stride
            while i <= limit:
                # int16 해석: 첫 2바이트가 -20000..20000 (좌표 후보)
                run = 0
                j = i
                while j <= limit:
                    v16 = struct.unpack_from("<h", blob, j)[0]
                    if -20000 <= v16 <= 20000:
                        run += 1
                        j += stride
                    else:
                        break
                if run >= 40 or (run >= 60 and stride <= 8):
                    cnt = run
                    near = min(TARGET_COUNTS, key=lambda t: abs(t - cnt))
                    if abs(near - cnt) <= 8 or cnt in TARGET_COUNTS:
                        rva = vs + i
                        rec_hex = blob[i:i + stride * 3].hex()
                        num_tables.append({
                            "section": nm, "stride": stride,
                            "rva": hex(rva), "fileOffset": hex(fo + i),
                            "count": cnt, "nearTarget": near,
                            "delta": cnt - near,
                            "first3RecordsHex": rec_hex,
                        })
                    i = j
                else:
                    i += stride
    # 타깃 근접 + 개수 우선
    num_tables.sort(key=lambda r: (abs(r["delta"]), -r["count"]))

    out = {
        "source": {"exe": EXE, "imageBase": hex(IB),
                   "sections": [{"name": n, "vaStart": hex(vs), "rawSize": rsz}
                                for vs, ve, fo, rsz, n in secs]},
        "targetCounts": TARGET_COUNTS,
        "pointerTables": {"count": len(ptr_tables), "candidates": ptr_tables[:40]},
        "numericStrideTables": {"count": len(num_tables),
                                 "topByTargetProximity": num_tables[:60]},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps({
        "written": OUT,
        "ptrTableCandidates": len(ptr_tables),
        "ptrTopCounts": [(t["count"], t["section"]) for t in ptr_tables[:8]],
        "numTableCandidates": len(num_tables),
        "numExactTargetHits": [(t["count"], t["stride"], t["section"], t["rva"])
                               for t in num_tables if t["delta"] == 0][:20],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
