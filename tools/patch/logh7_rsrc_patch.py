#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# uv run tools/patch/logh7_rsrc_patch.py --help
"""LOGH VII 클라이언트의 RT_MENU/RT_DIALOG/RT_STRING을 UTF-16LE 한글로 직접 패치한다.

`.rsrc`를 파싱해 `server/content/localization/hardcoded-ui-ko.json`의 `va_off`,
`text_ja`, `text_ko`를 검증한 뒤 디렉터리 트리·RVA·섹션 크기를 전체 재직렬화한다.
번역이 길거나 짧아져도 뒤의 리소스를 옮기고 PE 헤더를 갱신한다.

`--exe`를 생략하면 `artifacts/logh7-install/**/exe/g7mtclient.exe`를 선택한다.
설치 EXE가 없으면 중단한다. `patch`는 `--expect-sha256`가 필수다.
`--out`을 생략하면 선택된 EXE 자체를 같은 디렉터리의 임시 파일과
`os.replace`로 원자적 교체하며 백업을 만들지 않는다.

해시, `.rsrc` 마지막 섹션 여부, 무편집 라운드트립, 모든 원문/오프셋,
출력 재파싱 중 하나라도 틀리면 쓰기 전에 중단한다.

사용법:
  uv run tools/patch/logh7_rsrc_patch.py dump [exe]
  uv run tools/patch/logh7_rsrc_patch.py selftest [exe]
  uv run tools/patch/logh7_rsrc_patch.py patch --expect-sha256 SHA256 [--exe E] [--out O] [--map M]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAP = ROOT / "server" / "content" / "localization" / "hardcoded-ui-ko.json"
_ARTIFACTS_INSTALL = ROOT / "artifacts" / "logh7-install"


def default_exe() -> Path:
    artifact_candidates = (
        sorted(
            path
            for path in _ARTIFACTS_INSTALL.rglob("*")
            if path.is_file()
            and path.name.lower() == "g7mtclient.exe"
            and path.parent.name.lower() == "exe"
        )
        if _ARTIFACTS_INSTALL.exists()
        else []
    )
    if not artifact_candidates:
        raise FileNotFoundError("installed G7MTClient.exe not found")
    return artifact_candidates[0]


# Sentinel: argparse defaults use this; main() resolves it via default_exe() at run time.
DEFAULT_EXE_SENTINEL = object()

RT_MENU = 4
RT_DIALOG = 5
RT_STRING = 6
RT_NAME = {RT_MENU: "rsrc.menu", RT_DIALOG: "rsrc.dialog", RT_STRING: "rsrc.stringtable"}


# --------------------------------------------------------------------------------------
# PE / section helpers
# --------------------------------------------------------------------------------------
@dataclass
class PE:
    data: bytearray
    e_lfanew: int
    num_sections: int
    sec_table_off: int
    file_alignment: int
    section_alignment: int
    datadir_off: int            # file offset of the optional-header DataDirectory array
    rsrc_index: int             # index in section table of .rsrc


def parse_pe(data: bytes) -> PE:
    if data[:2] != b"MZ":
        raise ValueError("not an MZ/PE file")
    e = struct.unpack_from("<I", data, 0x3C)[0]
    if data[e:e + 4] != b"PE\x00\x00":
        raise ValueError("missing PE signature")
    nsec = struct.unpack_from("<H", data, e + 6)[0]
    opt = struct.unpack_from("<H", data, e + 20)[0]
    sec_table = e + 24 + opt
    file_align = struct.unpack_from("<I", data, e + 24 + 36)[0]
    sec_align = struct.unpack_from("<I", data, e + 24 + 32)[0]
    datadir = e + 24 + 96  # PE32 optional header: DataDirectory at offset 96
    rsrc_index = -1
    for i in range(nsec):
        o = sec_table + i * 40
        name = data[o:o + 8].rstrip(b"\x00")
        if name == b".rsrc":
            rsrc_index = i
    if rsrc_index < 0:
        raise ValueError("no .rsrc section")
    return PE(bytearray(data), e, nsec, sec_table, file_align, sec_align, datadir, rsrc_index)


def section_fields(pe: PE, idx: int):
    o = pe.sec_table_off + idx * 40
    vsize, vaddr, rsize, rptr = struct.unpack_from("<IIII", pe.data, o + 8)
    return o, vsize, vaddr, rsize, rptr


# --------------------------------------------------------------------------------------
# .rsrc directory model
# --------------------------------------------------------------------------------------
@dataclass
class ResData:
    """A leaf: the raw resource blob plus its identity (type/name/lang)."""
    type_id: int
    name_id: int          # high bit set => name string (we keep raw for our 3 RT types: all ID)
    lang_id: int
    code_page: int
    blob: bytearray
    orig_file_off: int    # original file offset of the blob (== va_off base in the JSON)


def parse_rsrc(pe: PE) -> list[ResData]:
    _, vsize, rva0, rsize, ptr0 = section_fields(pe, pe.rsrc_index)
    data = pe.data
    leaves: list[ResData] = []

    def rva_to_off(rva: int) -> int:
        return rva - rva0 + ptr0

    def walk(dir_off: int, depth: int, type_id: int, name_id: int):
        named = struct.unpack_from("<H", data, dir_off + 12)[0]
        idd = struct.unpack_from("<H", data, dir_off + 14)[0]
        for k in range(named + idd):
            eo = dir_off + 16 + k * 8
            nmeid = struct.unpack_from("<I", data, eo)[0]
            offv = struct.unpack_from("<I", data, eo + 4)[0]
            t, n = type_id, name_id
            if depth == 0:
                t = nmeid
            elif depth == 1:
                n = nmeid
            if offv & 0x80000000:
                walk(ptr0 + (offv & 0x7FFFFFFF), depth + 1, t, n)
            else:
                de = ptr0 + offv
                data_rva, data_sz, cp = struct.unpack_from("<III", data, de)
                doff = rva_to_off(data_rva)
                nmeid_lang = nmeid  # at depth 2 the entry id is the language id
                leaves.append(ResData(t, n, nmeid_lang, cp, bytearray(data[doff:doff + data_sz]), doff))

    walk(ptr0, 0, 0, 0)
    return leaves


# --------------------------------------------------------------------------------------
# Inline-string parsers for MENU / DIALOG / STRING blobs
# --------------------------------------------------------------------------------------
@dataclass
class StrSlot:
    """A localizable UTF-16 string inside a resource blob.

    kind: 'menu'/'dialog' = null-terminated inline; 'string' = u16 length-prefixed.
    The blob is rebuilt from these slots + the fixed byte gaps between them.
    """
    file_off: int       # absolute original file offset of the FIRST char (== va_off in JSON)
    text: str
    kind: str


def _read_sz(blob: bytes, i: int):
    """Read a null-terminated UTF-16LE string starting at byte i; return (text, next_i)."""
    units = []
    n = len(blob)
    while i + 1 < n:
        cp = blob[i] | (blob[i + 1] << 8)
        i += 2
        if cp == 0:
            break
        units.append(cp)
    return "".join(chr(c) for c in units), i


def parse_menu(blob: bytes, base_off: int):
    """MENUTEMPLATE: wVersion, cbHeaderSize, then items. Each item: wFlags[, wID], szText\\0.
    POPUP (MF_POPUP=0x10) has no id; MENUITEM has wID. End flag MF_END=0x80."""
    slots: list[StrSlot] = []
    gaps: list[bytes] = []      # bytes between slots (and trailing)
    i = 0
    n = len(blob)
    seg_start = 0
    # header: wVersion(2)=0, cbHeaderSize(2)=0 for standard template
    i = 4
    while i + 1 < n:
        flags = struct.unpack_from("<H", blob, i)[0]
        i += 2
        is_popup = bool(flags & 0x0010)
        if not is_popup:
            # MENUITEM has wID
            if i + 1 < n:
                i += 2  # wID
        # szText null-terminated UTF-16
        str_off = i
        text, i = _read_sz(blob, i)
        # record the gap (everything from seg_start..str_off) then the slot
        gaps.append(bytes(blob[seg_start:str_off]))
        slots.append(StrSlot(base_off + str_off, text, "menu"))
        seg_start = i
        # MF_END (0x80) on this item closes the current popup level
        # template ends when we have closed back to top; simplest robust stop: i>=n
    gaps.append(bytes(blob[seg_start:]))  # trailing
    return slots, gaps


def parse_dialog(blob: bytes, base_off: int):
    """DLGTEMPLATE (not EX): style,dwExStyle,cdit,x,y,cx,cy ; menu ; class ; title ;
    [pointsize, typeface if DS_SETFONT] ; then cdit items, EACH preceded by DWORD-alignment
    padding, laid out style,dwExStyle,x,y,cx,cy,id ; class ; title ; extraCount[+extra].

    Strings are null-terminated UTF-16LE. Because every DLGITEMTEMPLATE must begin on a DWORD
    boundary relative to the template start, naively preserving the original inter-field byte
    gaps breaks once a string changes length — the alignment padding has to be RECOMPUTED. So
    this parser returns a STRUCTURED model and the rebuild path (`_serialize_dialog`) re-emits
    it with correct DWORD alignment for any string length."""
    slots: list[StrSlot] = []
    style, dwext, cdit = struct.unpack_from("<IIH", blob, 0)
    head_fixed_end = 18  # style(4)+exstyle(4)+cdit(2)+x,y,cx,cy(8)

    def read_field(j):
        first = struct.unpack_from("<H", blob, j)[0]
        if first == 0x0000:
            return j + 2, "none", bytes(blob[j:j + 2])
        if first == 0xFFFF:
            return j + 4, "ord", bytes(blob[j:j + 4])
        text, k = _read_sz(blob, j)
        return k, "str", text

    model = {"head": bytes(blob[0:head_fixed_end]), "style": style, "fields": [], "items": []}
    i = head_fixed_end
    for role in ("menu", "class", "title"):
        i, kind, val = read_field(i)
        if kind == "str":
            slots.append(StrSlot(base_off, val, "dialog"))
        model["fields"].append((role, kind, val))
    DS_SETFONT = 0x40
    if style & DS_SETFONT:
        pointsize = bytes(blob[i:i + 2])
        i += 2
        i, kind, val = read_field(i)
        model["font"] = {"pointsize": pointsize, "kind": kind, "val": val}
        if kind == "str":
            slots.append(StrSlot(base_off, val, "dialog"))
    else:
        model["font"] = None

    for _ in range(cdit):
        if i % 4:
            i += 4 - (i % 4)
        fixed = bytes(blob[i:i + 18])
        i += 18
        item = {"fixed": fixed, "class": None, "title": None, "extra": b""}
        i, kc, vc = read_field(i)
        item["class"] = (kc, vc)
        if kc == "str":
            slots.append(StrSlot(base_off, vc, "dialog"))
        i, kt, vt = read_field(i)
        item["title"] = (kt, vt)
        if kt == "str":
            slots.append(StrSlot(base_off, vt, "dialog"))
        extra_count = struct.unpack_from("<H", blob, i)[0]
        i += 2
        extra_bytes = bytes(blob[i:i + extra_count])
        i += extra_count
        item["extra"] = struct.pack("<H", extra_count) + extra_bytes
        model["items"].append(item)
    model["tail"] = bytes(blob[i:])

    _assign_dialog_slot_offsets(model, slots, base_off)
    return slots, ("dialog-model", model)


def _field_bytes(kind, val):
    if kind == "str":
        return val.encode("utf-16le") + b"\x00\x00"
    return val  # 'none' (2B) or 'ord' (4B) raw


def _serialize_dialog(model) -> bytes:
    out = bytearray()
    out += model["head"]
    for _role, kind, val in model["fields"]:
        out += _field_bytes(kind, val)
    if model["font"] is not None:
        out += model["font"]["pointsize"]
        out += _field_bytes(model["font"]["kind"], model["font"]["val"])
    for item in model["items"]:
        while len(out) % 4:
            out += b"\x00"
        out += item["fixed"]
        out += _field_bytes(*item["class"])
        out += _field_bytes(*item["title"])
        out += item["extra"]
    out += model["tail"]
    return bytes(out)


def _assign_dialog_slot_offsets(model, slots, base_off):
    """Recompute each StrSlot.file_off by tracking the serialized position of every string
    field — so a slot.text edit maps back to the correct field."""
    idx = 0
    pos = len(model["head"])
    for _role, kind, val in model["fields"]:
        if kind == "str":
            slots[idx].file_off = base_off + pos
            idx += 1
        pos += len(_field_bytes(kind, val))
    if model["font"] is not None:
        pos += len(model["font"]["pointsize"])
        if model["font"]["kind"] == "str":
            slots[idx].file_off = base_off + pos
            idx += 1
        pos += len(_field_bytes(model["font"]["kind"], model["font"]["val"]))
    for item in model["items"]:
        while pos % 4:
            pos += 1
        pos += len(item["fixed"])
        if item["class"][0] == "str":
            slots[idx].file_off = base_off + pos
            idx += 1
        pos += len(_field_bytes(*item["class"]))
        if item["title"][0] == "str":
            slots[idx].file_off = base_off + pos
            idx += 1
        pos += len(_field_bytes(*item["title"]))
        pos += len(item["extra"])


def parse_stringtable(blob: bytes, base_off: int):
    """STRING table block: exactly 16 entries, each [wLen:u16][wLen UTF16 chars] (no null)."""
    slots: list[StrSlot] = []
    gaps: list[bytes] = []
    i = 0
    n = len(blob)
    seg_start = 0
    for _ in range(16):
        if i + 2 > n:
            break
        ln = struct.unpack_from("<H", blob, i)[0]
        chars_off = i + 2
        text = blob[chars_off:chars_off + ln * 2].decode("utf-16le", "replace")
        # gap = the wLen prefix (and anything before)
        gaps.append(bytes(blob[seg_start:chars_off]))
        slots.append(StrSlot(base_off + chars_off, text, "string"))
        i = chars_off + ln * 2
        seg_start = i
    gaps.append(bytes(blob[seg_start:]))
    return slots, gaps


def parse_blob_strings(rd: ResData):
    if rd.type_id == RT_MENU:
        return parse_menu(rd.blob, rd.orig_file_off)
    if rd.type_id == RT_DIALOG:
        return parse_dialog(rd.blob, rd.orig_file_off)
    if rd.type_id == RT_STRING:
        return parse_stringtable(rd.blob, rd.orig_file_off)
    return None


# --------------------------------------------------------------------------------------
# Full .rsrc re-serialization
# --------------------------------------------------------------------------------------
def _serialize_rsrc(leaves: list[ResData], base_rva: int, base_ptr: int, tail_pad: int) -> bytes:
    """Rebuild a fresh .rsrc section body from the (possibly edited) leaf blobs, reproducing
    the original MS linker layout exactly so an unedited rebuild is byte-identical:

      region 1  directory tables, BREADTH-FIRST:
                  root dir, then ALL level-1 type dirs (type-id sorted),
                  then ALL level-2 name dirs (sorted by (type,name)).
      region 2  data-entry structs (16 B each), one per leaf, sorted by (type,name).
      region 3  resource blobs, each 8-byte aligned, in the ORIGINAL blob file-offset order
                (the linker does not pack blobs in type order — preserving the original order
                 is what makes an unedited rebuild byte-exact). When a blob grew/shrank the
                later blobs simply shift; RVAs are recomputed from the new offsets.

    `base_rva`/`base_ptr` are the .rsrc section's RVA / file offset; `tail_pad` is the number
    of trailing zero bytes after the last blob in the original section body (VirtualSize),
    reproduced so an unedited rebuild matches VirtualSize exactly."""
    def dir_size(num_entries):
        return 16 + num_entries * 8

    # group type -> name -> [leaves]; iterate in SORTED id order (matches linker)
    by_type: dict[int, dict[int, list[ResData]]] = {}
    for rd in leaves:
        by_type.setdefault(rd.type_id, {}).setdefault(rd.name_id, []).append(rd)
    type_ids = sorted(by_type)
    names_of = {t: sorted(by_type[t]) for t in type_ids}

    # --- region 1: directory table offsets (breadth-first) ---
    dir_off: dict = {}
    cur = 0
    dir_off["root"] = cur
    cur += dir_size(len(type_ids))
    for t in type_ids:                       # all level-1 type dirs
        dir_off[("type", t)] = cur
        cur += dir_size(len(names_of[t]))
    for t in type_ids:                       # all level-2 name dirs
        for nme in names_of[t]:
            dir_off[("name", t, nme)] = cur
            cur += dir_size(len(by_type[t][nme]))

    # --- region 2: data-entry structs, in (type,name,lang) order ---
    data_entry_start = cur
    de_order = []
    for t in type_ids:
        for nme in names_of[t]:
            for rd in by_type[t][nme]:
                de_order.append(rd)
    de_off = {id(rd): data_entry_start + i * 16 for i, rd in enumerate(de_order)}
    cur = data_entry_start + len(de_order) * 16

    # --- region 3: blobs, ORIGINAL order, 8-byte aligned ---
    blob_seq = sorted(leaves, key=lambda r: r.orig_file_off)
    blob_off = {}
    for rd in blob_seq:
        if cur % 8:
            cur += 8 - (cur % 8)
        blob_off[id(rd)] = cur
        cur += len(rd.blob)
    body_len = cur + tail_pad
    out = bytearray(body_len)

    def write_dir(off, entries):
        struct.pack_into("<IIHH", out, off + 8, 0, 0, 0, 0)  # ver/chars placeholder
        struct.pack_into("<I", out, off, 0)                  # characteristics
        struct.pack_into("<I", out, off + 4, 0)              # timestamp
        struct.pack_into("<H", out, off + 12, 0)             # #named (all our entries are id)
        struct.pack_into("<H", out, off + 14, len(entries))  # #id
        for k, (eid, is_dir, child) in enumerate(entries):
            eo = off + 16 + k * 8
            struct.pack_into("<I", out, eo, eid)
            struct.pack_into("<I", out, eo + 4, child | (0x80000000 if is_dir else 0))

    write_dir(dir_off["root"], [(t, True, dir_off[("type", t)]) for t in type_ids])
    for t in type_ids:
        write_dir(dir_off[("type", t)],
                  [(nme, True, dir_off[("name", t, nme)]) for nme in names_of[t]])
    for t in type_ids:
        for nme in names_of[t]:
            write_dir(dir_off[("name", t, nme)],
                      [(rd.lang_id, False, de_off[id(rd)]) for rd in by_type[t][nme]])

    for rd in de_order:
        deo = de_off[id(rd)]
        bo = blob_off[id(rd)]
        struct.pack_into("<IIII", out, deo, base_rva + bo, len(rd.blob), rd.code_page, 0)
        out[bo:bo + len(rd.blob)] = rd.blob

    return bytes(out)


def build_rsrc_section(pe: PE, leaves: list[ResData]) -> bytes:
    o, vsize, rva0, rsize, ptr0 = section_fields(pe, pe.rsrc_index)
    # tail pad = original VirtualSize minus the offset just past the last original blob.
    last_blob_end = max((rd.orig_file_off - ptr0) + len(rd.blob) for rd in leaves)
    tail_pad = max(0, vsize - last_blob_end)
    return _serialize_rsrc(leaves, rva0, ptr0, tail_pad)


# --------------------------------------------------------------------------------------
# Apply edits + write new EXE
# --------------------------------------------------------------------------------------
def _apply_korean(leaves: list[ResData], mapping: dict[int, str], report: list,
                  expect_ja: dict[int, str] | None = None, skipped: list | None = None):
    """For each leaf of our 3 RT types, parse strings, swap text where the file offset has a
    Korean override, and rebuild the blob. mapping: {va_off -> korean_text}.

    SOURCE GUARD: if `expect_ja` is given, a slot is swapped only when its CURRENT text equals
    the mapping's recorded `text_ja`. This protects against patching the wrong EXE (e.g. an
    already-Korean build, where the offsets no longer line up and a blind swap corrupts random
    slots). Mismatches are recorded in `skipped` instead of being written."""
    for rd in leaves:
        if rd.type_id not in (RT_MENU, RT_DIALOG, RT_STRING):
            continue
        parsed = parse_blob_strings(rd)
        if not parsed:
            continue
        slots, gaps = parsed
        changed = False
        for si, slot in enumerate(slots):
            ko = mapping.get(slot.file_off)
            if ko is None or ko == "" or ko == slot.text:
                continue
            if expect_ja is not None:
                want = expect_ja.get(slot.file_off)
                # Guard only when we have a recorded source AND it is non-trivial. Some slots
                # carry control/garbage source text (dialog ordinals, empty); skip the guard
                # there to avoid false rejects, but reject a clear JP-source-vs-current mismatch.
                if want is not None and want != "" and slot.text != want:
                    if skipped is not None:
                        skipped.append({"va_off": slot.file_off,
                                        "restype": RT_NAME[rd.type_id],
                                        "expectedJa": want, "actual": slot.text, "to": ko})
                    continue
            report.append({
                "va_off": slot.file_off,
                "restype": RT_NAME[rd.type_id],
                "identity": {
                    "typeId": rd.type_id,
                    "nameId": rd.name_id,
                    "langId": rd.lang_id,
                    "slotIndex": si,
                },
                "from": slot.text,
                "to": ko,
            })
            slot.text = ko
            changed = True
        if not changed:
            continue
        # rebuild blob, fixing string-table length prefixes
        new_blob = _rebuild_with_lengths(slots, gaps, rd.type_id)
        rd.blob = bytearray(new_blob)


def _rebuild_with_lengths(slots, aux, type_id) -> bytes:
    # DIALOG: aux is ("dialog-model", model). slot.text edits were written into the model's
    # fields by reference? No — slots hold the text; push them back into the model, then
    # serialize with correct DWORD alignment.
    if type_id == RT_DIALOG:
        _tag, model = aux
        _push_slots_into_dialog_model(model, slots)
        return _serialize_dialog(model)
    # MENU / STRING: aux is a flat gaps list.
    gaps = aux
    out = bytearray()
    for idx, slot in enumerate(slots):
        gap = bytearray(gaps[idx])
        if type_id == RT_STRING:
            # the wLen prefix is the last 2 bytes of this gap; rewrite to new char count
            enc = slot.text.encode("utf-16le")
            struct.pack_into("<H", gap, len(gap) - 2, len(enc) // 2)
            out += gap
            out += enc
        else:  # MENU: null-terminated inline
            out += gap
            out += slot.text.encode("utf-16le") + b"\x00\x00"
    out += gaps[-1]
    return bytes(out)


def _count_verified_translations(leaves: list[ResData], report: list) -> int:
    actual_by_identity = {}
    for rd in leaves:
        if rd.type_id not in (RT_MENU, RT_DIALOG, RT_STRING):
            continue
        parsed = parse_blob_strings(rd)
        if not parsed:
            continue
        for slot_index, slot in enumerate(parsed[0]):
            actual_by_identity[(rd.type_id, rd.name_id, rd.lang_id, slot_index)] = slot.text

    present = 0
    for change in report:
        identity = change["identity"]
        key = (
            identity["typeId"],
            identity["nameId"],
            identity["langId"],
            identity["slotIndex"],
        )
        if actual_by_identity.get(key) == change["to"]:
            present += 1
    return present


def _push_slots_into_dialog_model(model, slots):
    """Copy each string slot's (possibly edited) text back into the structured dialog model,
    in the SAME order they were emitted in parse_dialog."""
    idx = 0
    new_fields = []
    for role, kind, val in model["fields"]:
        if kind == "str":
            val = slots[idx].text
            idx += 1
        new_fields.append((role, kind, val))
    model["fields"] = new_fields
    if model["font"] is not None and model["font"]["kind"] == "str":
        model["font"]["val"] = slots[idx].text
        idx += 1
    for item in model["items"]:
        kc, vc = item["class"]
        if kc == "str":
            vc = slots[idx].text
            idx += 1
        item["class"] = (kc, vc)
        kt, vt = item["title"]
        if kt == "str":
            vt = slots[idx].text
            idx += 1
        item["title"] = (kt, vt)


class PatchSafetyError(RuntimeError):
    __slots__ = ()


def build_patched(pe: PE, new_rsrc: bytes, out_path: Path):
    data = pe.data
    o, vsize, rva0, rsize, ptr0 = section_fields(pe, pe.rsrc_index)
    # .rsrc must be the LAST section (verified for this EXE); the file is truncated to ptr0
    # then the new (FileAlignment-padded) section is appended.
    new_vsize = len(new_rsrc)
    new_rsize = ((len(new_rsrc) + pe.file_alignment - 1) // pe.file_alignment) * pe.file_alignment
    padded = new_rsrc + b"\x00" * (new_rsize - len(new_rsrc))

    out = bytearray(data[:ptr0]) + padded
    # update section header VirtualSize + SizeOfRawData
    struct.pack_into("<I", out, o + 8, new_vsize)        # VirtualSize
    struct.pack_into("<I", out, o + 16, new_rsize)       # SizeOfRawData
    # update SizeOfImage in optional header (= last section vaddr + aligned vsize)
    sec_align = pe.section_alignment
    aligned_vsize = ((new_vsize + sec_align - 1) // sec_align) * sec_align
    size_of_image = rva0 + aligned_vsize
    struct.pack_into("<I", out, pe.e_lfanew + 24 + 56, size_of_image)
    # update Resource data-directory Size (entry index 2): RVA stays rva0, size = new_vsize
    dd_res = pe.datadir_off + 2 * 8
    struct.pack_into("<I", out, dd_res, rva0)
    struct.pack_into("<I", out, dd_res + 4, new_vsize)

    return bytes(out), {
        "out": str(out_path),
        "rsrcVSize": new_vsize,
        "rsrcRSize": new_rsize,
        "sizeOfImage": size_of_image,
        "fileSize": len(out),
    }


def write_atomic(out_path: Path, data: bytes, mode: int) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp = tempfile.mkstemp(prefix=f".{out_path.name}.", suffix=".tmp", dir=out_path.parent)
    os.close(fd)
    tmp_path = Path(raw_tmp)
    try:
        tmp_path.write_bytes(data)
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, out_path)
    finally:
        tmp_path.unlink(missing_ok=True)


# --------------------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------------------
def cmd_selftest(exe: Path) -> int:
    raw = exe.read_bytes()
    pe = parse_pe(raw)
    o, vsize, rva0, rsize, ptr0 = section_fields(pe, pe.rsrc_index)
    orig_body = raw[ptr0:ptr0 + vsize]
    leaves = parse_rsrc(pe)

    # (a) tree round-trip: serialize with no edits, compare to original (trimmed to vsize)
    rebuilt = build_rsrc_section(pe, leaves)
    tree_ok = rebuilt == bytes(orig_body)

    # (b) string parse/rebuild round-trip per blob
    blob_ok = True
    bad = []
    for rd in leaves:
        if rd.type_id not in (RT_MENU, RT_DIALOG, RT_STRING):
            continue
        parsed = parse_blob_strings(rd)
        if not parsed:
            continue
        slots, gaps = parsed
        rb = _rebuild_with_lengths(slots, gaps, rd.type_id)
        if rb != bytes(rd.blob):
            blob_ok = False
            bad.append((RT_NAME[rd.type_id], rd.name_id, len(rb), len(rd.blob)))

    print(json.dumps({
        "treeRoundTrip": tree_ok,
        "blobStringRoundTrip": blob_ok,
        "rebuiltLen": len(rebuilt),
        "origBodyLen": len(orig_body),
        "badBlobs": bad,
        "leafCount": len(leaves),
    }, ensure_ascii=True, indent=2))
    return 0 if (tree_ok and blob_ok) else 1


def cmd_dump(exe: Path) -> int:
    raw = exe.read_bytes()
    pe = parse_pe(raw)
    leaves = parse_rsrc(pe)
    rows = []
    for rd in leaves:
        if rd.type_id not in (RT_MENU, RT_DIALOG, RT_STRING):
            continue
        parsed = parse_blob_strings(rd)
        if not parsed:
            continue
        slots, _ = parsed
        for slot in slots:
            if slot.text.strip() == "":
                continue
            rows.append({"va_off": slot.file_off, "restype": RT_NAME[rd.type_id], "text": slot.text})
    print(json.dumps({"count": len(rows), "strings": rows}, ensure_ascii=False, indent=1))
    return 0


def _load_mapping(map_path: Path) -> tuple[dict[int, str], dict[int, str]]:
    """Return (ko_by_off, ja_by_off). ja_by_off is the recorded source text used by the
    source-guard in _apply_korean."""
    spec = json.loads(map_path.read_text(encoding="utf-8"))
    ko_out: dict[int, str] = {}
    ja_out: dict[int, str] = {}
    for entry in spec.get("strings", []):
        off = int(entry["va_off"])
        ja = entry.get("text_ja")
        if ja is not None:
            ja_out[off] = ja
        ko = entry.get("text_ko")
        if ko:
            ko_out[off] = ko
    return ko_out, ja_out


def cmd_patch(exe: Path, out: Path, map_path: Path, expected_sha256: str) -> int:
    raw = exe.read_bytes()
    source_sha256 = hashlib.sha256(raw).hexdigest()
    if source_sha256 != expected_sha256.lower():
        raise PatchSafetyError(
            f"source exe hash mismatch: expected {expected_sha256.lower()}, found {source_sha256}"
        )
    pe = parse_pe(raw)
    if pe.rsrc_index != pe.num_sections - 1:
        raise PatchSafetyError(".rsrc is not the last PE section")
    leaves = parse_rsrc(pe)
    _, vsize, _rva0, _rsize, ptr0 = section_fields(pe, pe.rsrc_index)
    if build_rsrc_section(pe, leaves) != raw[ptr0:ptr0 + vsize]:
        raise PatchSafetyError(".rsrc round-trip mismatch")
    mapping, expect_ja = _load_mapping(map_path)
    if not mapping:
        raise PatchSafetyError(f"no text_ko entries in {map_path}")
    missing_sources = sorted(set(mapping) - set(expect_ja))
    if missing_sources:
        raise PatchSafetyError(f"mapping has unguarded offsets: {missing_sources}")
    report: list = []
    skipped: list = []
    _apply_korean(leaves, mapping, report, expect_ja=expect_ja, skipped=skipped)
    applied_offsets = {change["va_off"] for change in report}
    missing_offsets = sorted(set(mapping) - applied_offsets)
    if skipped or missing_offsets:
        raise PatchSafetyError(
            f"resource slot mismatch: skipped={len(skipped)}, missingOffsets={missing_offsets}"
        )
    new_rsrc = build_rsrc_section(pe, leaves)
    candidate, info = build_patched(pe, new_rsrc, out)

    vpe = parse_pe(candidate)
    vleaves = parse_rsrc(vpe)
    present = _count_verified_translations(vleaves, report)

    verify_ok = present == len(report)
    if not verify_ok:
        raise PatchSafetyError(f"candidate verification failed: {present}/{len(report)} translations present")
    write_atomic(out, candidate, exe.stat().st_mode)
    output_sha256 = hashlib.sha256(candidate).hexdigest()
    print(json.dumps({
        "exe": str(exe), **info,
        "sourceSha256": source_sha256,
        "outputSha256": output_sha256,
        "applied": len(report),
        "skippedMismatch": len(skipped),
        "verifiedPresent": present,
        "verifyOk": verify_ok,
        "changes": report,
        "skipped": skipped,
    }, ensure_ascii=True, indent=2))
    return 0


def main(argv) -> int:
    ap = argparse.ArgumentParser(description="Patch RT_MENU/RT_DIALOG/RT_STRING resources to Korean.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("dump", "selftest"):
        p = sub.add_parser(name)
        p.add_argument("exe", nargs="?", type=Path, default=DEFAULT_EXE_SENTINEL)
    pp = sub.add_parser("patch")
    pp.add_argument("--exe", type=Path, default=DEFAULT_EXE_SENTINEL)
    pp.add_argument("--out", type=Path)
    pp.add_argument("--map", type=Path, default=DEFAULT_MAP)
    pp.add_argument("--expect-sha256", required=True)
    args = ap.parse_args(argv)
    exe = args.exe if args.exe is not DEFAULT_EXE_SENTINEL else default_exe()

    if args.cmd == "selftest":
        return cmd_selftest(exe)
    if args.cmd == "dump":
        return cmd_dump(exe)
    if args.cmd == "patch":
        return cmd_patch(
            exe,
            args.out if args.out is not None else exe,
            args.map,
            args.expect_sha256,
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
