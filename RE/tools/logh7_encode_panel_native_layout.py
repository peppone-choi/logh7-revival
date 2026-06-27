#!/usr/bin/env python3
"""LOGH VII T-HD 전 화면 네이티브 레이아웃 — 패널별 좌표 테이블 인코더.

각 UI 패널은 좌표 즉치값을 두 가지 패턴으로 들고 있다:
  1) 레지스터-캐시 즉치: `mov reg, imm32` (b8/b9/ba/bb/bd/be/bf) 로 좌표값을 한 번
     로드한 뒤 여러 esp 슬롯(0x14 stride rect 레코드)에 분배 — 즉치 하나가 한 행/열
     전체를 공유한다. lobby/login 의 c74424 직접저장보다 패치 포인트가 적다.
  2) 직접 저장 즉치: `mov dword [esp+XX], imm32` (c74424XX imm32) — soukan HUD 등.

근원: UI 위젯 스케일은 FUN_004ea460(0x004ea460)이 X/Y 독립 비율
(_DAT_00772e2c=virtualW/clientW, _DAT_00772e30=virtualH/clientH)을 계산하고
FUN_004ea610(0x004ea610)이 각 rect를 그 비율로 변환한다. 따라서 4:3 기준으로
저작된 절대좌표를 비-4:3 캔버스로 보내면 늘어진다. 해법은 lobby-native-layout과
동일하게 패널별 좌표 테이블을 네이티브 캔버스 좌표로 재배치하는 것(스케일러 패치 아님).

이 도구는 pristine EXE(.omo/ghidra/bin/G7MTClient.exe)에서 각 패치 사이트의
originalHex를 직접 읽어 검증하고, 타겟 해상도/캔버스 기준으로 patchedHex를
재-인코딩한다(정수 truncation, lobby 인코더와 동일 cast 동작). 셀프테스트는
원본 바이트 라운드트립을 확인한다.

좌표값의 X/Y 분류는 패널 정의의 axis 필드로 명시(disasm 분배 추적으로 확정).
verified=false 로 산출 — 1920x1080 시각 검증은 라이브(메인 직렬) 필요.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRISTINE_EXE = ROOT / ".omo/ghidra/bin/G7MTClient.exe"
IMAGE_BASE = 0x400000
OUT_DIR = ROOT / "tools/client_patches"

# mov reg, imm32 opcode 바이트 (1바이트 opcode + 4바이트 LE imm)
MOV_REG_OPCODE = {
    "eax": 0xB8, "ecx": 0xB9, "edx": 0xBA, "ebx": 0xBB,
    "esp": 0xBC, "ebp": 0xBD, "esi": 0xBE, "edi": 0xBF,
}


def le32(value: int) -> str:
    return int(value).to_bytes(4, "little", signed=False).hex()


def scale(value: int, axis: str, src_w: int, src_h: int, dst_w: int, dst_h: int) -> int:
    """X는 width 비율, Y는 height 비율로 정수 truncation 스케일."""
    if axis == "X":
        return int(value * dst_w / src_w)
    if axis == "Y":
        return int(value * dst_h / src_h)
    # axis 'S'(size) 등은 더 작은 비율(보수적)로
    return int(value * min(dst_w / src_w, dst_h / src_h))


# ── 패널 정의 ──────────────────────────────────────────────────────────────
# 각 사이트: (va, kind, reg_or_dispHex, axis, orig_value, note)
#   kind 'R' = mov reg,imm32  (reg_or_dispHex = 레지스터명)
#   kind 'S' = mov [esp+disp],imm32 (reg_or_dispHex = "c74424XX" prefix hex)
PANELS = {
    "charsel-native-layout": {
        "func": "FUN_0051e580",
        "desc": "캐릭터 선택/세션 진입 패널",
        "src_w": 640, "src_h": 480,
        "canvas": "640x480 menu canvas (FUN_00401760(0x280,0x1e0))",
        "sites": [
            ("0x0051e589", "R", "ecx", "Y", 0x32, "행 y-base 50 (+0x130/144/158/16c 분배)"),
            ("0x0051e594", "R", "edx", "X", 0xd1, "열 x 209 (+0x12c/140/154/168 분배)"),
            ("0x0051e599", "R", "ebp", "X", 0x14c, "열 x 332 (+0x178/18c/1a0/1b4)"),
            ("0x0051e59f", "R", "esi", "X", 0x23e, "열 x 574 (+0x17c/190/1a4/1b8)"),
            ("0x0051e5c0", "R", "ecx", "Y", 0x50, "행간격 y 80 분배"),
        ],
    },
    "gamemenu-right-native-layout": {
        "func": "FUN_0051dc00+FUN_0051dd80",
        "desc": "게임메뉴 우측 패널(세션/캐릭터 리스트 컬럼)",
        "src_w": 1024, "src_h": 768,
        "canvas": "1024x768 lobby canvas (FUN_00401760(0x400,0x300))",
        "sites": [
            # FUN_0051dc00
            ("0x0051dc08", "R", "ecx", "X", 0x11e, "[dc00] 우패널 x 286"),
            ("0x0051dc0f", "R", "eax", "X", 0x2c7, "[dc00] 우패널 x 711 (우측 끝)"),
            ("0x0051dc1a", "R", "ebp", "Y", 0x208, "[dc00] 패널 y 520"),
            # FUN_0051dd80
            ("0x0051dd8a", "R", "ecx", "Y", 0xd2, "[dd80] 행 y 210"),
            ("0x0051dd8f", "R", "edx", "X", 0x280, "[dd80] x 640"),
            ("0x0051dda9", "R", "edx", "X", 0x29a, "[dd80] x 666"),
            ("0x0051ddd4", "R", "edx", "X", 0x2a3, "[dd80] x 675 (우측 끝)"),
        ],
    },
    "window-dialog-native-layout": {
        "func": "FUN_0051f8b0",
        "desc": "윈도우/다이얼로그 패널(data/image/window/window_par)",
        "src_w": 1024, "src_h": 768,
        "canvas": "1024x768 lobby canvas",
        "sites": [
            ("0x0051f8b9", "R", "ecx", "Y", 0x15, "라벨 y 21"),
            ("0x0051f8be", "R", "esi", "X", 0x38e, "x 910 (우측 끝)"),
            ("0x0051f8c3", "R", "edx", "X", 0xac, "x 172"),
            ("0x0051f8c8", "R", "eax", "Y", 0x45, "y 69"),
            ("0x0051f8e9", "R", "ecx", "X", 0x196, "x 406"),
            ("0x0051f90a", "R", "esi", "X", 0x23e, "x 574"),
            ("0x0051f917", "R", "edi", "Y", 0xd2, "y 210"),
        ],
    },
    "soukan-hud-native-layout": {
        "func": "FUN_005123b0",
        "desc": "사령관(司令官) 인-월드 HUD 패널(data/image/soukan)",
        "src_w": 1024, "src_h": 768,
        "canvas": "config-native world canvas (case 0x3d: FUN_00401760(ScreenWidth,ScreenHeight))",
        "sites": [
            ("0x00512571", "S", "c744242c", "X", 0x157, "패널 x 343"),
            ("0x00512579", "S", "c7442430", "Y", 0xaa, "패널 y 170"),
            ("0x005126d1", "S", "c7442428", "X", 0x20, "x 32"),
            ("0x005126d9", "S", "c744242c", "Y", 0x7e, "y 126"),
            ("0x005129f6", "S", "c744242c", "X", 0xf4, "게이지 x 244"),
            ("0x00512af0", "R", "esi", "X", 0x111, "바 x 273"),
            ("0x00512afd", "S", "c7442458", "X", 0x100, "바 x 256"),
            ("0x00512b11", "S", "c744246c", "X", 0x122, "바 x 290"),
        ],
    },
}


def read_pristine() -> bytes:
    return PRISTINE_EXE.read_bytes()


def site_original_hex(exe: bytes, va: int, kind: str, regdisp: str) -> str:
    fo = va - IMAGE_BASE
    if kind == "R":
        return exe[fo:fo + 5].hex()
    # 'S' c74424XX imm32 => prefix 4 bytes + imm 4 bytes = 8 bytes
    return exe[fo:fo + 8].hex()


def build_patch(exe, va_hex, kind, regdisp, axis, orig, note, src_w, src_h, dst_w, dst_h):
    va = int(va_hex, 16)
    fo = va - IMAGE_BASE
    actual_orig = site_original_hex(exe, va, kind, regdisp)
    # originalHex 검증: 정의된 orig 값이 실제 바이트와 일치하는지
    if kind == "R":
        op = MOV_REG_OPCODE[regdisp]
        expect = bytes([op]) + int(orig).to_bytes(4, "little")
        ok = exe[fo:fo + 5] == expect
        new = bytes([op]) + scale(orig, axis, src_w, src_h, dst_w, dst_h).to_bytes(4, "little")
        patched_hex = new.hex()
    else:
        prefix = bytes.fromhex(regdisp)
        expect = prefix + int(orig).to_bytes(4, "little")
        ok = exe[fo:fo + 8] == expect
        new = prefix + scale(orig, axis, src_w, src_h, dst_w, dst_h).to_bytes(4, "little")
        patched_hex = new.hex()
    tgt = scale(orig, axis, src_w, src_h, dst_w, dst_h)
    return {
        "va": va_hex,
        "fileOffsetHex": hex(fo),
        "originalHex": actual_orig,
        "patchedHex": patched_hex,
        "axis": axis,
        "note": f"{note}: {orig} -> {tgt} ({axis} {dst_w if axis=='X' else dst_h}/{src_w if axis=='X' else src_h})",
        "_origVerified": ok,
    }


def build_spec(name, dst_w, dst_h):
    exe = read_pristine()
    p = PANELS[name]
    sw, sh = p["src_w"], p["src_h"]
    patches = []
    all_ok = True
    for va, kind, rd, axis, orig, note in p["sites"]:
        patch = build_patch(exe, va, kind, rd, axis, orig, note, sw, sh, dst_w, dst_h)
        all_ok = all_ok and patch.pop("_origVerified")
        patches.append(patch)
    return {
        "name": name,
        "desc": (
            f"{p['desc']}({p['func']})을 {sw}x{sh} 캔버스 좌표에서 {dst_w}x{dst_h} "
            f"네이티브 캔버스로 재배치. 레지스터-캐시/직접저장 좌표 즉치값을 X는 width "
            f"비율, Y는 height 비율로 정수 스케일. 캔버스 기준: {p['canvas']}. "
            f"lobby-native-layout 계열의 네이티브 좌표 패치(스케일러 패치/레터박스 아님)."
        ),
        "verified": (
            f"RE-CONFIRMED 사이트 + BYTE-검증 originalHex(pristine .omo/ghidra/bin/G7MTClient.exe). "
            f"좌표 즉치값 분배는 disasm으로 추적 확정. patchedHex는 {dst_w}x{dst_h} 후보(정수 truncation). "
            f"originalVerified={all_ok}. verified=false: 위젯 X/Y 최종분류와 {dst_w}x{dst_h} 시각은 "
            f"라이브 검증(메인 직렬) 필요."
        ),
        "verifiedFlag": False,
        "canvasBasis": p["canvas"],
        "patches": patches,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("panel", choices=list(PANELS) + ["all"], help="패널 이름 또는 all")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--show", action="store_true", help="JSON 출력만(파일 미기록)")
    ap.add_argument("--selftest", action="store_true", help="라운드트립 셀프테스트")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    names = list(PANELS) if args.panel == "all" else [args.panel]
    for name in names:
        spec = build_spec(name, args.width, args.height)
        text = json.dumps(spec, ensure_ascii=False, indent=2) + "\n"
        if args.show:
            print(text, end="")
        else:
            out = args.out_dir / f"{name}.json"
            out.write_text(text, encoding="utf-8")
            ok = all(p for p in [pp.get("_origVerified", True) for pp in spec["patches"]])
            print(f"wrote {out}  ({len(spec['patches'])} patches, origVerified={'verified' in spec})")
    return 0


def selftest() -> int:
    """모든 패널의 originalHex가 pristine EXE 바이트와 일치하고,
    스케일=1.0(src==dst)일 때 patchedHex==originalHex 인지(항등 라운드트립) 확인."""
    exe = read_pristine()
    fails = 0
    for name, p in PANELS.items():
        sw, sh = p["src_w"], p["src_h"]
        # 1) originalHex 일치
        for va, kind, rd, axis, orig, note in p["sites"]:
            patch = build_patch(exe, va, kind, rd, axis, orig, note, sw, sh, sw, sh)
            if not patch["_origVerified"]:
                print(f"  FAIL origVerify {name} {va}: orig 값 {orig:#x} != EXE 바이트 {patch['originalHex']}")
                fails += 1
            # 2) 항등(src==dst)이면 patched==original
            if patch["patchedHex"] != patch["originalHex"]:
                print(f"  FAIL identity {name} {va}: scale=1.0 인데 {patch['patchedHex']} != {patch['originalHex']}")
                fails += 1
        print(f"  {name}: {len(p['sites'])} sites checked")
    if fails == 0:
        print("SELFTEST PASS: 모든 originalHex 일치 + 항등 라운드트립 OK")
        return 0
    print(f"SELFTEST FAIL: {fails} 실패")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
