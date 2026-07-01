"""dgVoodoo2 워터마크 제거 + LOGH 리마스터 설정을 입힌 canonical dgVoodoo.conf 생성기.

배경:
  - 설치 클라(.omo/work/logh7-installed/exe/)는 dgVoodoo2 2.87.2 release D3D8.dll(=D3D8 래퍼)을 쓴다.
  - 이 D3D8.dll은 패킹된 바이너리(.text 엔트로피 ~7.91, 섹션명 stripped)라 워터마크
    렌더 경로를 안전하게 정적 바이트패치할 수 없다(언팩 시 바이트가 변형됨 → 패치 무효 또는 렌더 깨짐).
  - 따라서 워터마크 제거는 conf 레버로만 안전하게 가능하다. dgVoodoo2는 conf의 Version과
    "키-셋 구조"가 빌드와 정확히 맞아야 conf를 채택하고, 안 맞으면 조용히 기본값(워터마크 ON)으로
    폴백한다. 그래서 이 생성기는 임의 편집본이 아니라 **stock 2.87.2 conf 템플릿**을 베이스로
    삼아 key=value만 교체한다(구조적 거부 위험 제거).

동작:
  - STOCK_CONF(.omo/work/dgVoodoo2_87_2/dgVoodoo.conf, 이 DLL과 동봉된 정식 템플릿)을 한 줄씩 읽어,
    OVERRIDES에 있는 키만 같은 줄 정렬을 유지한 채 값을 바꾼다. 나머지 줄(주석/구조)은 그대로 보존.
  - 워터마크 2종(dgVoodooWatermark[DirectX], 3DfxWatermark[Glide]) = false 강제.
  - LOGH 리마스터 그래픽 값(ScalingMode/Resampling/Antialiasing/Filtering/FullscreenAttributes)도
    함께 입혀 기존 설치 conf의 게임 화질 설정을 유지한다(워터마크만 끄고 렌더는 동일).

사용:
  python -m tools.logh7_dgvoodoo_nowatermark            # 산출만(stdout에 결과 SHA)
  python -m tools.logh7_dgvoodoo_nowatermark --deploy   # 설치 디렉터리 conf로 배포(.original 백업 보존)
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 이 DLL(2.87.2)과 동봉돼 배포된 정식 stock conf — 구조적으로 보장된 파서 호환 템플릿.
STOCK_CONF = ROOT / ".omo/work/dgVoodoo2_87_2/dgVoodoo.conf"
INSTALLED_CONF = ROOT / ".omo/work/logh7-installed/exe/dgVoodoo.conf"
INSTALLED_CONF_ORIGINAL = ROOT / ".omo/work/logh7-installed/exe/dgVoodoo.conf.original"

# 키 → 강제할 값. 같은 줄의 들여쓰기/정렬은 유지하고 = 우측 값만 교체한다.
# (워터마크 2종 OFF + 설치본이 쓰던 LOGH 리마스터 화질값. 정적 RE/라이브로 확인된 기존 설치 conf와 동일.)
OVERRIDES: dict[str, str] = {
    # --- 워터마크 제거(핵심) ---
    "dgVoodooWatermark": "false",  # [DirectX] D3D8/9 우하단 "dgVoodoo" 워터마크
    "3DfxWatermark": "false",      # [Glide] Glide 워터마크(이 게임은 D3D8이라 무관하나 함께 off)
    "3DfxSplashScreen": "false",
    "WatermarkDisplayDuration": "1",  # off가 무시되는 모드에서도 우하단 로고가 무한 지속되지 않게 한다.
    # --- LOGH 리마스터 화질(기존 설치 conf 유지) ---
    "FullScreenMode": "false",
    "ScalingMode": "centered",
    "Resampling": "pointsampled",
    "WindowedAttributes": "borderless",
    "FullscreenAttributes": "fake",
    "Filtering": "appdriven",
    # Antialiasing can appear in multiple sections, so every occurrence is set.
    "Antialiasing": "off",
    "RTTexturesForceScaleAndMSAA": "false",
    "SmoothedDepthSampling": "false",
}


def _apply_override(line: str, key: str, value: str) -> str:
    """`key   = oldvalue` 줄에서 정렬(키와 = 사이 공백)을 유지하고 값만 교체한다.

    주석 줄(';'로 시작)이나 'key'가 라인 시작 식별자가 아닌 줄은 건드리지 않는다.
    """
    stripped = line.lstrip()
    if stripped.startswith(";"):
        return line
    # `key` 다음 공백 후 '='가 와야 진짜 설정 줄. 정렬을 보존하려고 '=' 인덱스를 찾아 좌측을 그대로 둔다.
    if "=" not in line:
        return line
    left, _, _right = line.partition("=")
    if left.strip() != key:
        return line
    # CRLF 보존
    newline = ""
    body = line
    if line.endswith("\r\n"):
        newline = "\r\n"
        body = line[:-2]
    elif line.endswith("\n"):
        newline = "\n"
        body = line[:-1]
    left_part = body.split("=", 1)[0]  # 정렬 공백 포함된 좌측
    return f"{left_part}= {value}{newline}"


def build_conf(stock: Path) -> bytes:
    raw = stock.read_bytes()
    text = raw.decode("latin1")  # 1:1 바이트 보존(비ASCII 없음). CRLF 그대로 유지.
    # splitlines를 쓰면 줄끝이 사라지므로 keepends=True로 라인별 CRLF 보존.
    out_lines: list[str] = []
    for line in text.splitlines(keepends=True):
        new = line
        for key, value in OVERRIDES.items():
            candidate = _apply_override(new, key, value)
            if candidate != new:
                new = candidate
                # Antialiasing처럼 키가 여러 섹션에 있으면 break하지 않고 계속(각 줄은 1키만 매칭됨)
        out_lines.append(new)
    return "".join(out_lines).encode("latin1")


def verify(conf_bytes: bytes) -> dict[str, str]:
    """산출 conf가 워터마크 off + Version 일치 + 키-셋 보존을 만족하는지 셀프검증."""
    text = conf_bytes.decode("latin1")
    checks: dict[str, str] = {}

    def get(key: str) -> str | None:
        for line in text.splitlines():
            s = line.lstrip()
            if s.startswith(";") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() == key:
                return v.strip()
        return None

    checks["Version"] = get("Version") or "MISSING"
    checks["dgVoodooWatermark"] = get("dgVoodooWatermark") or "MISSING"
    checks["3DfxWatermark"] = get("3DfxWatermark") or "MISSING"
    checks["3DfxSplashScreen"] = get("3DfxSplashScreen") or "MISSING"
    checks["WatermarkDisplayDuration"] = get("WatermarkDisplayDuration") or "MISSING"
    checks["FullScreenMode"] = get("FullScreenMode") or "MISSING"
    checks["ScalingMode"] = get("ScalingMode") or "MISSING"
    checks["Resampling"] = get("Resampling") or "MISSING"
    checks["WindowedAttributes"] = get("WindowedAttributes") or "MISSING"
    checks["FullscreenAttributes"] = get("FullscreenAttributes") or "MISSING"
    checks["Filtering"] = get("Filtering") or "MISSING"
    checks["Antialiasing"] = get("Antialiasing") or "MISSING"
    checks["RTTexturesForceScaleAndMSAA"] = get("RTTexturesForceScaleAndMSAA") or "MISSING"
    checks["SmoothedDepthSampling"] = get("SmoothedDepthSampling") or "MISSING"
    watermark_ok = (
        checks["Version"] == "0x287"
        and checks["dgVoodooWatermark"] == "false"
        and checks["3DfxWatermark"] == "false"
        and checks["3DfxSplashScreen"] == "false"
        and checks["WatermarkDisplayDuration"] == "1"
    )
    sharp_ok = (
        checks["FullScreenMode"] == "false"
        and checks["ScalingMode"] == "centered"
        and checks["Resampling"] == "pointsampled"
        and checks["WindowedAttributes"] == "borderless"
        and checks["FullscreenAttributes"] == "fake"
        and checks["Filtering"] == "appdriven"
        and checks["Antialiasing"] == "off"
        and checks["RTTexturesForceScaleAndMSAA"] == "false"
        and checks["SmoothedDepthSampling"] == "false"
    )
    checks["watermarkOff"] = "PASS" if watermark_ok else "FAIL"
    checks["sharpBorderless"] = "PASS" if sharp_ok else "FAIL"
    checks["sha256"] = hashlib.sha256(conf_bytes).hexdigest()
    return checks


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the no-watermark dgVoodoo.conf for LOGH VII.")
    parser.add_argument("--stock", type=Path, default=STOCK_CONF)
    parser.add_argument("--out", type=Path, default=INSTALLED_CONF)
    parser.add_argument("--deploy", action="store_true", help="write to the installed exe dir conf (keeps .original backup)")
    args = parser.parse_args()

    if not args.stock.exists():
        fallback = INSTALLED_CONF_ORIGINAL if INSTALLED_CONF_ORIGINAL.exists() else INSTALLED_CONF
        if args.stock == STOCK_CONF and fallback.exists():
            args.stock = fallback
        else:
            print(f"stock conf not found: {args.stock}", file=sys.stderr)
            return 1

    conf_bytes = build_conf(args.stock)
    checks = verify(conf_bytes)

    if args.deploy:
        backup = args.out.with_suffix(args.out.suffix + ".original")
        if args.out.exists() and not backup.exists():
            shutil.copy2(args.out, backup)
        args.out.write_bytes(conf_bytes)
        print(f"deployed: {args.out}")
        if backup.exists():
            print(f"backup:   {backup}")
    else:
        # 산출만: 검증 결과 출력
        pass

    import json
    print(json.dumps(checks, ensure_ascii=False, indent=2))
    return 0 if checks["watermarkOff"] == "PASS" and checks["sharpBorderless"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
