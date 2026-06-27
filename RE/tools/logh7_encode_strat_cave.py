#!/usr/bin/env python3
"""Encode the P0-02 strategic-source code-cave (M1-1) as a build-tool patch descriptor.

Mechanism (Frida positive-control PROVEN, tools/logh7_p0_02_focus_pc.py): at FUN_004c4170
(__fastcall ecx=mainState, "WorldIn_StrategyFieldImport") onEnter, if the inline strategic source's
current cell *(source+0x320) is 0 (source = *(mainState+8)), write the player's home cell there.
That propagates: FUN_004c45f0 sets mainState+0x126714, mode +0x126711=2, root *(DAT_007cd04c+0x11178)
gets the cell -> FUN_004d6310 click-validator passes -> outbound 0x0b01, AND the camera (FUN_004d4e90,
same 0x11178) centers on the home cell (fixes "always (1,1)" Front 3).

Unlike the broad 1-byte `mode 1->0` patch (LIVE-CONFIRMED to break world entry — it mis-routes the
general 0x325 unit delivery), this is SURGICAL: a detour at FUN_004c4170's prologue into an executable
.text-slack cave that touches ONLY source+0x320 and only when it is 0.

==========================================================================================
T07 cave-dynamic-cell: three CELL-source modes, in order of robustness.
------------------------------------------------------------------------------------------
  --cell <imm>      (default 0x9F6=2550)  P3 immediate that matches the server LOGH_PLAYER_FOCUS_CELL
                    seed. NOT scenario-robust: any non-2550 home cell is wrong.

  --cell-mem <abs>  read a u32 cell directly from one absolute RE'd location. Hardened here: the addr
                    is range-checked against the .data section and a `--cell-mem-deref` mode adds one
                    pointer hop (read ptr at <abs>, then u32 at ptr+<off>). Still a *single* static
                    location -> only robust if such a location is found that always mirrors own cell.

  --scan            DYNAMIC. Encodes the verified cave-source RE chain as cave assembly so the cell is
                    read live from the player's own fleet every world-enter (truly scenario-robust):
                      own char-id  = *(mainState+0x3584a0)
                      char array   @ mainState+0x36a8b4, stride 0x2d4, count(int) @ mainState+0x36a5dc
                        -> find rec where *rec == own char-id
                      flagship id  = *(rec+0x24)              (rec[9])
                      grid array   @ mainState+0x41a368, stride 0x58, count(u16) @ mainState+0x41a364
                        -> find gu where *gu == flagship id
                      CELL         = *(gu+0x08)
                    Chain verified against FUN_004c2a80 (own-char + flagship-grid walk) and FUN_004c32a0
                    (line ~398: `iVar14 = mainState+0x41a368+i*0x58; uVar12 = *(iVar14+8)` compared to
                    *(mainState+0x126714) — i.e. gu+0x08 IS the strategic cell field this patch feeds).
                    The scan body is ~100 bytes and DOES NOT FIT the only safe 48-byte int3 cave (see
                    CAVE CAPACITY below); --scan refuses to emit an over-capacity descriptor and prints
                    exactly what is needed (a larger cave / appended .text section).
==========================================================================================

EXE facts (verified against G7MTClient.playable.exe, ImageBase 0x400000, fileoff = VA-0x400000 in .text):
  - Detour site VA 0x004c4170 fileoff 0x0c4170, first instruction `A0 54 A5 7C 00` = mov al,[0x7CA554] (5B).
    Overwrite exactly these 5 bytes with `E9 <rel32>` (jmp cave). ecx=mainState live; eax is scratch.
  - Cave VA 0x005d5290 fileoff 0x1d5290, 48 bytes of 0xCC int3 padding (interior .text, 0 refs — SAFE).
    (The .text-END slack at 0x66acd5 was NOT safe: documented LIVE failure — using it stuck the client
     pre-world. The 28B 0x00 run at 0x4c7a53 is a jump-table gap with an inbound ptr — also NOT safe.)
  - Return target VA 0x004c4175 (the `sub esp,8` that followed the displaced mov al).

CAVE CAPACITY (T07, byte-measured): the single safe int3 cave at 0x5d5290 is exactly 48 bytes. The
immediate/cell-mem cave bodies (38/40 B) fit. The full --scan chain (~100 B) does NOT. A full scan
requires either a larger contiguous safe cave (none exists in committed .text — largest int3 run after
0x5d5290 is 15 B) or an appended executable .text section (breaks the same-length byte-patch regime the
builder relies on; flagged needsLive/needsSection rather than silently emitted).

Usage:
  python tools/logh7_encode_strat_cave.py --show                 # print encoded bytes + verify originalHex
  python tools/logh7_encode_strat_cave.py --write                # write strat-camera-focus.json (immediate)
  python tools/logh7_encode_strat_cave.py --cell-mem 0x7XXXXXX --write
  python tools/logh7_encode_strat_cave.py --scan --show          # encode dynamic chain + capacity report
  python tools/logh7_encode_strat_cave.py --measure-caves        # scan committed .text for safe int3 caves
"""
from __future__ import annotations
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe"
IMAGE_BASE = 0x00400000
DETOUR_VA = 0x004C4170
RETURN_VA = 0x004C4175
# Cave: 48-byte 0xCC inter-function alignment padding, INTERIOR of .text (well inside vsize), 0 refs.
# The earlier .text-END slack (0x66acd5) was NOT safe — documented LIVE failure (client stuck pre-world).
# This interior int3 pad is never executed or referenced. Verified all-0xCC + 0 inbound pointers + 48 B.
CAVE_VA = 0x005D5290
CAVE_PAD = 0xCC  # the bytes we overwrite are int3 padding
CAVE_CAPACITY = 48  # byte-measured run length at CAVE_VA (see --measure-caves)
DISPLACED = bytes.fromhex("a054a57c00")  # mov al,[0x7ca554]
DETOUR_ORIG = DISPLACED                  # the 5 bytes we overwrite

# --- verified cave-source RE chain offsets (see module docstring / FUN_004c2a80, FUN_004c32a0) ---
OFF_SOURCE_PTR = 0x08        # source = *(mainState+8)
OFF_SRC_CELL = 0x320        # source+0x320 = strategic current cell (the field we populate)
OFF_OWN_CHARID = 0x3584A0   # *(mainState+0x3584a0) = own char-id
OFF_CHAR_BASE = 0x36A8B4    # char-record array base
OFF_CHAR_COUNT = 0x36A5DC   # char count (int)
CHAR_STRIDE = 0x2D4         # char-record stride (0xb5 dwords)
OFF_FLAGSHIP = 0x24         # char-record+0x24 (rec[9]) = flagship grid-unit id
OFF_GRID_BASE = 0x41A368    # grid-unit array base
OFF_GRID_COUNT = 0x41A364   # grid-unit count (u16)
GRID_STRIDE = 0x58          # grid-unit stride
OFF_GU_CELL = 0x08          # grid-unit+0x08 = cell


# ----------------------------------------------------------------------------------------
# Cave-body encoders
# ----------------------------------------------------------------------------------------
def _emit_tail(b: bytearray) -> None:
    """Append the shared cave tail: displaced `mov al,[0x7ca554]` then `jmp RETURN_VA`."""
    b += DISPLACED
    jmp_pos = len(b)
    b += b"\xe9" + b"\x00\x00\x00\x00"
    rel = (RETURN_VA - (CAVE_VA + jmp_pos + 5)) & 0xFFFFFFFF
    struct.pack_into("<i", b, jmp_pos + 1, struct.unpack("<i", struct.pack("<I", rel))[0])


def encode_cave(cell: int, cell_mem: int | None, passthrough: bool = False,
                cell_mem_deref_off: int | None = None) -> bytes:
    """Assemble the cave body. Returns the raw bytes placed at CAVE_VA.

    passthrough=True emits ONLY the displaced instruction + jmp back (no ecx deref, no write) —
    a transparent detour, to isolate detour-mechanism bugs from the write logic.

    cell_mem is None     -> write immediate `cell` into source+0x320.
    cell_mem set, deref None -> write u32 read from absolute [cell_mem].
    cell_mem set, deref off  -> read ptr at [cell_mem], then u32 at [ptr+off] (one pointer hop).
    """
    if passthrough:
        b = bytearray()
        _emit_tail(b)
        return bytes(b)
    b = bytearray()
    b += b"\x50"                                   # push eax
    b += b"\x8b\x41\x08"                           # mov eax,[ecx+8]   (source)
    b += b"\x85\xc0"                               # test eax,eax
    jz_pos = len(b); b += b"\x74\x00"              # jz L_done
    b += b"\x83\xb8" + struct.pack("<I", OFF_SRC_CELL) + b"\x00"  # cmp dword [eax+0x320],0
    jnz_pos = len(b); b += b"\x75\x00"            # jnz L_done
    if cell_mem is None:
        # mov dword [eax+0x320], imm32   -> C7 80 <disp32> <imm32>
        b += b"\xc7\x80" + struct.pack("<I", OFF_SRC_CELL) + struct.pack("<I", cell & 0xFFFFFFFF)
    elif cell_mem_deref_off is None:
        # mov edx,[cell_mem] ; mov [eax+0x320],edx
        b += b"\x8b\x15" + struct.pack("<I", cell_mem & 0xFFFFFFFF)   # mov edx,[abs]
        b += b"\x89\x90" + struct.pack("<I", OFF_SRC_CELL)            # mov [eax+0x320],edx
    else:
        # mov edx,[cell_mem] ; mov edx,[edx+off] ; mov [eax+0x320],edx
        b += b"\x8b\x15" + struct.pack("<I", cell_mem & 0xFFFFFFFF)   # mov edx,[abs]   (ptr)
        b += b"\x8b\x92" + struct.pack("<I", cell_mem_deref_off & 0xFFFFFFFF)  # mov edx,[edx+off]
        b += b"\x89\x90" + struct.pack("<I", OFF_SRC_CELL)            # mov [eax+0x320],edx
    l_done = len(b)
    b += b"\x58"                                   # pop eax
    _emit_tail(b)
    b[jz_pos + 1] = (l_done - (jz_pos + 2)) & 0xFF
    b[jnz_pos + 1] = (l_done - (jnz_pos + 2)) & 0xFF
    return bytes(b)


def encode_scan_cave() -> bytes:
    """Assemble the DYNAMIC own-fleet cell scan as cave assembly (ecx=mainState live).

    Registers: pushes/pops eax,esi,edi,edx so the host function sees no clobber and ecx is untouched.
    All conditional exits target L_done via rel8 short jumps (body < 128 B). FLAGS not preserved (the
    host re-runs `sub esp,8; test al,al` after the displaced mov al, exactly as the original prologue).
    """
    b = bytearray()
    b += b"\x50"                                   # push eax
    b += b"\x56"                                   # push esi
    b += b"\x57"                                   # push edi
    b += b"\x52"                                   # push edx

    b += b"\x8b\x51\x08"                           # mov edx,[ecx+8]        ; source
    b += b"\x85\xd2"                               # test edx,edx
    jz_src = len(b); b += b"\x74\x00"             # jz  L_done
    b += b"\x83\xba" + struct.pack("<I", OFF_SRC_CELL) + b"\x00"  # cmp dword [edx+0x320],0
    jnz_set = len(b); b += b"\x75\x00"           # jnz L_done            ; already set -> skip

    # --- find own char record ---
    b += b"\x8b\x81" + struct.pack("<I", OFF_CHAR_COUNT)   # mov eax,[ecx+0x36a5dc]   ; char count
    b += b"\x85\xc0"                               # test eax,eax
    jle_cc = len(b); b += b"\x7e\x00"            # jle L_done            ; count<=0
    b += b"\x8d\xb1" + struct.pack("<I", OFF_CHAR_BASE)    # lea esi,[ecx+0x36a8b4]   ; char base
    b += b"\x8b\xb9" + struct.pack("<I", OFF_OWN_CHARID)   # mov edi,[ecx+0x3584a0]   ; own char-id
    charloop = len(b)
    b += b"\x39\x3e"                               # cmp [esi],edi
    je_cf = len(b); b += b"\x74\x00"             # je  CHARFOUND
    b += b"\x81\xc6" + struct.pack("<I", CHAR_STRIDE)      # add esi,0x2d4
    b += b"\x48"                                   # dec eax
    jnz_cl = len(b); b += b"\x75\x00"            # jnz charloop
    jmp_done1 = len(b); b += b"\xeb\x00"         # jmp L_done            ; not found
    charfound = len(b)
    b += b"\x8b\x7e" + bytes([OFF_FLAGSHIP])       # mov edi,[esi+0x24]    ; flagship id (disp8)

    # --- find grid-unit by flagship id ---
    b += b"\x0f\xb7\x81" + struct.pack("<I", OFF_GRID_COUNT)  # movzx eax,word [ecx+0x41a364]
    b += b"\x85\xc0"                               # test eax,eax
    jz_gc = len(b); b += b"\x74\x00"             # jz  L_done            ; count==0
    b += b"\x8d\xb1" + struct.pack("<I", OFF_GRID_BASE)    # lea esi,[ecx+0x41a368]   ; grid base
    guloop = len(b)
    b += b"\x39\x3e"                               # cmp [esi],edi
    je_gf = len(b); b += b"\x74\x00"             # je  GUFOUND
    b += b"\x83\xc6" + bytes([GRID_STRIDE])        # add esi,0x58          (disp8)
    b += b"\x48"                                   # dec eax
    jnz_gl = len(b); b += b"\x75\x00"            # jnz guloop
    jmp_done2 = len(b); b += b"\xeb\x00"         # jmp L_done            ; not found
    gufound = len(b)
    b += b"\x8b\x46" + bytes([OFF_GU_CELL])        # mov eax,[esi+0x08]    ; CELL
    b += b"\x89\x82" + struct.pack("<I", OFF_SRC_CELL)    # mov [edx+0x320],eax   ; write cell

    l_done = len(b)
    b += b"\x5a"                                   # pop edx
    b += b"\x5f"                                   # pop edi
    b += b"\x5e"                                   # pop esi
    b += b"\x58"                                   # pop eax
    _emit_tail(b)

    # patch short jumps (all rel8)
    def rel8(at_imm: int, target: int) -> int:
        d = target - (at_imm + 1)
        if not (-128 <= d <= 127):
            raise ValueError(f"rel8 out of range at {at_imm:#x} -> {target:#x} ({d})")
        return d & 0xFF
    b[jz_src + 1] = rel8(jz_src + 1, l_done)
    b[jnz_set + 1] = rel8(jnz_set + 1, l_done)
    b[jle_cc + 1] = rel8(jle_cc + 1, l_done)
    b[je_cf + 1] = rel8(je_cf + 1, charfound)
    b[jnz_cl + 1] = rel8(jnz_cl + 1, charloop)
    b[jmp_done1 + 1] = rel8(jmp_done1 + 1, l_done)
    b[jz_gc + 1] = rel8(jz_gc + 1, l_done)
    b[je_gf + 1] = rel8(je_gf + 1, gufound)
    b[jnz_gl + 1] = rel8(jnz_gl + 1, guloop)
    b[jmp_done2 + 1] = rel8(jmp_done2 + 1, l_done)
    return bytes(b)


def detour_bytes() -> bytes:
    rel = (CAVE_VA - (DETOUR_VA + 5)) & 0xFFFFFFFF
    return b"\xe9" + struct.pack("<I", rel)


def fileoff(va: int) -> int:
    return va - IMAGE_BASE  # .text maps fileoff = VA - ImageBase here (rawptr 0x1000 == vaddr 0x1000)


# ----------------------------------------------------------------------------------------
# Helpers: cave measurement, capstone self-test
# ----------------------------------------------------------------------------------------
def measure_caves(min_len: int = 32):
    """Scan committed .text (excluding the post-vsize END slack) for int3 caves >= min_len.

    Returns list of (fileoff, va, length) and prints a summary. Used to keep the CAVE_CAPACITY
    constant honest and to prove no second large safe cave exists for the full scan.
    """
    if not EXE.exists():
        return []
    d = EXE.read_bytes()
    pe = d.index(b"PE\x00\x00"); coff = pe + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    opt_size = struct.unpack_from("<H", d, coff + 16)[0]
    sec_off = coff + 20 + opt_size
    text = None
    for i in range(nsec):
        o = sec_off + i * 40
        name = d[o:o + 8].rstrip(b"\x00").decode("latin1")
        vsize, va, rawsize, rawptr = struct.unpack_from("<IIII", d, o + 8)
        if name == ".text":
            text = (va, vsize, rawptr, rawsize)
            break
    if text is None:
        return []
    va, vsize, rawptr, _ = text
    body = d[rawptr:rawptr + vsize]  # committed code only
    runs = []
    i = 0; n = len(body)
    while i < n:
        if body[i] == 0xCC:
            j = i
            while j < n and body[j] == 0xCC:
                j += 1
            if j - i >= min_len:
                runs.append((rawptr + i, rawptr + i + IMAGE_BASE, j - i))
            i = j
        else:
            i += 1
    runs.sort(key=lambda r: -r[2])
    return runs


def capstone_disasm(cave: bytes) -> list[str]:
    """Disassemble the cave at CAVE_VA with capstone for a human-readable self-test (best effort)."""
    try:
        from capstone import Cs, CS_ARCH_X86, CS_MODE_32
    except Exception:
        return ["(capstone unavailable — skipped disasm self-test)"]
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    return [f"  0x{i.address:08x}: {i.mnemonic:<7}{i.op_str}" for i in md.disasm(cave, CAVE_VA)]


# ----------------------------------------------------------------------------------------
def build_descriptor(cave: bytes, detour: bytes, *, name: str, desc: str, verified: str,
                     fits: bool) -> dict:
    return {
        "name": name,
        "desc": desc,
        "verified": verified,
        "patches": [
            {"va": hex(DETOUR_VA), "fileOffsetHex": hex(fileoff(DETOUR_VA)),
             "originalHex": DETOUR_ORIG.hex(), "patchedHex": detour.hex(),
             "note": "jmp cave (overwrites displaced mov al,[0x7ca554])"},
            {"va": hex(CAVE_VA), "fileOffsetHex": hex(fileoff(CAVE_VA)),
             "originalHex": (("%02x" % CAVE_PAD) * len(cave)), "patchedHex": cave.hex(),
             "note": "cave body (interior int3 pad): if src320==0 set home cell, then displaced mov al, jmp 0x4c4175"},
        ],
        "returnVa": hex(RETURN_VA),
        "caveLen": len(cave),
        "caveCapacity": CAVE_CAPACITY,
        "fitsCave": fits,
    }


def verify_sites(cave: bytes) -> tuple[list[str], bool]:
    notes: list[str] = []
    ok = True
    if EXE.exists():
        d = EXE.read_bytes()
        do = fileoff(DETOUR_VA); co = fileoff(CAVE_VA)
        det_actual = d[do:do + 5]
        cave_slack = d[co:co + len(cave)]
        det_ok = det_actual == DETOUR_ORIG
        pad_ok = cave_slack == bytes([CAVE_PAD]) * len(cave)
        ok = det_ok and pad_ok
        notes.append("detour orig @0x%06x = %s (expect %s) -> %s" % (
            do, det_actual.hex(), DETOUR_ORIG.hex(), "OK" if det_ok else "MISMATCH"))
        notes.append("cave pad @0x%06x = all-0x%02x over %d B -> %s" % (
            co, CAVE_PAD, len(cave), "OK" if pad_ok else "NOT-ALL-PAD"))
    else:
        notes.append("EXE not found at %s (skipped verify)" % EXE)
        ok = False
    return notes, ok


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cell", type=lambda x: int(x, 0), default=0x9F6, help="home cell immediate (default 2550)")
    ap.add_argument("--cell-mem", type=lambda x: int(x, 0), default=None, help="abs addr to read u32 cell from (RE result)")
    ap.add_argument("--cell-mem-deref", type=lambda x: int(x, 0), default=None,
                    help="with --cell-mem: read ptr at the abs addr, then u32 at ptr+<this offset> (one hop)")
    ap.add_argument("--scan", action="store_true",
                    help="DYNAMIC: encode the verified own-fleet cell RE chain as cave assembly")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--disasm", action="store_true", help="capstone-disassemble the encoded cave (self-test)")
    ap.add_argument("--measure-caves", action="store_true", help="scan committed .text for safe int3 caves and exit")
    ap.add_argument("--passthrough", action="store_true", help="transparent detour (no write) to isolate mechanism")
    args = ap.parse_args(argv)

    if args.measure_caves:
        runs = measure_caves(min_len=16)
        print(json.dumps({
            "caveVa": hex(CAVE_VA), "declaredCapacity": CAVE_CAPACITY,
            "int3CavesGE16": [{"fileoff": hex(fo), "va": hex(va), "len": ln} for fo, va, ln in runs[:10]],
            "note": ("Only the 0x5d5290/48B run is large enough for a self-contained cave. The full --scan "
                     "chain (~100B) needs a larger cave or an appended .text section."),
        }, indent=2))
        return 0

    if args.scan:
        cave = encode_scan_cave()
        mode_name = "strat-camera-focus-scan"
        cell_label = "DYNAMIC own-fleet scan (mainState+0x3584a0 -> char[0x36a8b4]/0x2d4 -> flagship+0x24 -> grid[0x41a368]/0x58 -> +0x08)"
    elif args.passthrough:
        cave = encode_cave(args.cell, args.cell_mem, passthrough=True)
        mode_name = "strat-camera-passthrough"
        cell_label = "passthrough (no write)"
    else:
        cave = encode_cave(args.cell, args.cell_mem, cell_mem_deref_off=args.cell_mem_deref)
        mode_name = "strat-camera-focus"
        if args.cell_mem is None:
            cell_label = hex(args.cell)
        elif args.cell_mem_deref is None:
            cell_label = "[%s] (u32 from RE'd location)" % hex(args.cell_mem)
        else:
            cell_label = "[[%s]+%s] (one-hop deref from RE'd location)" % (hex(args.cell_mem), hex(args.cell_mem_deref))

    detour = detour_bytes()
    fits = len(cave) <= CAVE_CAPACITY
    site_notes, sites_ok = verify_sites(cave)

    cap_notes = []
    cap_notes.append("caveLen=%d  capacity=%d  -> %s" % (
        len(cave), CAVE_CAPACITY, "FITS" if fits else "OVER CAPACITY by %d B" % (len(cave) - CAVE_CAPACITY)))
    if not fits:
        cap_notes.append("REFUSING to emit a working descriptor: the only safe int3 cave is %d B. "
                         "Full --scan needs a larger contiguous safe cave (none in committed .text — "
                         "next int3 run after 0x5d5290 is 15 B) or an appended executable .text section "
                         "(out of the same-length byte-patch builder regime). needsLive/needsSection." % CAVE_CAPACITY)

    out_obj = {
        "mode": mode_name,
        "cellSource": cell_label,
        "detour": detour.hex(),
        "caveLen": len(cave),
        "caveCapacity": CAVE_CAPACITY,
        "fitsCave": fits,
        "caveHex": cave.hex(),
        "capacity": cap_notes,
        "verify": site_notes,
    }
    if args.disasm or args.show:
        out_obj["disasm"] = capstone_disasm(cave)
    print(json.dumps(out_obj, indent=1, ensure_ascii=False))

    if args.write:
        if not fits:
            print("ABORT --write: cave body (%d B) exceeds the safe cave capacity (%d B). "
                  "Not emitting an over-capacity descriptor that would corrupt adjacent code." % (
                      len(cave), CAVE_CAPACITY), file=sys.stderr)
            return 2
        if not sites_ok:
            print("ABORT --write: detour/cave originalHex did not verify against the EXE.", file=sys.stderr)
            return 3
        verified = (
            "ENCODED + byte-verified against G7MTClient.playable.exe: prologue A0 54 A5 7C 00 @fileoff 0x0c4170; "
            "interior 0xCC int3 cave @VA 0x5d5290 (fileoff 0x1d5290), measured 48 B, 0 inbound refs. "
            "cave body %d B (fits 48). Cell source: %s. " % (len(cave), cell_label) +
            ("DYNAMIC scan chain verified against FUN_004c2a80 (own-char/flagship-grid walk) and FUN_004c32a0 "
             "(gu+0x08 == strategic cell). " if args.scan else
             "Frida positive-control PROVEN the same source+0x320 write closes the chain (validator->pass, "
             "camera centers). ") +
            "NOT yet end-to-end live-confirmed with the STATIC detour — needsLive: apply for one ui_explorer "
            "run, drive to world, click home cell, observe 0x0b01 + camera center."
        )
        desc_text = (
            "P0-02 SURGICAL code-cave (M1-1, T07). Detour FUN_004c4170 prologue into the interior 0xCC int3 "
            "cave at VA 0x5d5290; when *(source+0x320)==0 (source=*(mainState+8)) write the player home cell "
            "so the strategic current cell *(DAT_007cd04c+0x11178) populates -> FUN_004d6310 passes (0x0b01 "
            "enabled) AND the camera centers on the home cell (Front 3). cell source=%s." % cell_label
        )
        cave_desc = build_descriptor(cave, detour, name=mode_name, desc=desc_text, verified=verified, fits=fits)
        out = ROOT / ("tools/client_patches/%s.json" % mode_name)
        out.write_text(json.dumps(cave_desc, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
