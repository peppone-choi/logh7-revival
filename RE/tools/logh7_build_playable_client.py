"""Reproducibly build the canonical PLAYABLE LOGH VII client EXE.

The playable client = the localized base EXE (`G7MTClient.korean.exe`) plus an ordered,
drift-checked stack of same-length binary patches that fix client-side regressions the
server cannot reach. Each patch spec lives version-controlled under `tools/client_patches/`
so the final EXE is reproducible and can never silently drift back to the broken state.

Why this exists (anti-regression): the lobby menu buttons (NewChar/Lottery/Delete/Session)
are HARDCODED disabled by scene 0x16 (`FUN_0051a370`) — they only become clickable when the
`menufix` patch is applied. This builder produces the one canonical artifact that must be
deployed. `ui_explorer start` now selects that playable EXE by default, and `stop` verifies the
same EXE SHA that was installed when the session began instead of assuming the old vanilla SHA.

Patch stack (applied in this order; each is same-length and drift-checked against the
running file state before it is written):
  1. menufix  — tools/client_patches/menufix.json  (enable lobby buttons 1-4)
  2. dlgfix   — tools/client_patches/dlgfix.json    (generic-dialog confirm-button labels)
  3. earlygrid-ringclear — tools/client_patches/earlygrid-ringclear.json
                 (let real 0x0313/0x0315 strategic markers reach live render tables)
  4. strat-camera-focus — tools/client_patches/strat-camera-focus.json (center camera on the owned strategic fleet)
  5. hud-msgdat-groupfix — tools/client_patches/hud-msgdat-groupfix.json
                 (right/HUD detail labels: constmsg group 0x68 -> 0x63)
  6. hud-character-status-msgdatfix — tools/client_patches/hud-character-status-msgdatfix.json
                 (character HUD status/title: constmsg group 0x67 login errors -> 0x60 character UI labels)
  7. mission-msgdat-subidfix — tools/client_patches/mission-msgdat-subidfix.json
                 (left mission selector: constmsg group 0x6a subId 0x09..0x15 -> source-backed mission labels)
  8. sector-label-hardcoded-ko — tools/client_patches/sector-label-hardcoded-ko.json
                 (strategic system labels: hardcoded CP932 星系 strings -> CP949 Korean)
  9. tactical-grid-msgdat-boundaryfix — tools/client_patches/tactical-grid-msgdat-boundaryfix.json
                 (tactical/grid panel: constmsg group 0x16 boundary-crossing lookups -> real groups)
 10. galaxy-screen-starname-msgdat-boundaryfix — tools/client_patches/galaxy-screen-starname-msgdat-boundaryfix.json
                 (in-world screen: constmsg group 0x16 boundary-crossing star-name lookup -> group 0x18)
 11. galaxy-screen-grid-format-msgdat-boundaryfix — tools/client_patches/galaxy-screen-grid-format-msgdat-boundaryfix.json
                 (in-world screen: constmsg group 0x16 boundary-crossing grid label lookup -> group 0x17)
 12. hud-hardcoded-stat-labels-ko — tools/client_patches/hud-hardcoded-stat-labels-ko.json
                 (character HUD stat labels: hardcoded CP932 航続 -> CP949 Korean)
 13. font-face — tools/client_patches/font-face.json (global GDI face -> Pretendard)
 14. font-cleartype — tools/client_patches/font-cleartype.json (GDI text quality 4 -> 5)
 15. login-title-ko — tools/client_patches/login-title-ko.json
                 (load the official Korean title asset; preserves the original logo artwork)
 16. login-native-layout — tools/client_patches/login-native-layout.json
                 (native-resolution login/initial scene canvas plus object layout; no letterbox)
 17. login-commandline-bootstrap — tools/client_patches/login-commandline-bootstrap.json
                 (use the RE-confirmed static 127.0.0.1:47900/ginei00/dummy client bootstrap)
 18. login-blank-password-local-ok — tools/client_patches/login-blank-password-local-ok.json
                 (temporary native-login hitbox regression guard: server auth remains authoritative)
 19. lobby-res — tools/client_patches/lobby-res.json
                 (retarget the lobby canvas to the checked-in 1920x1080 native build)
 20. lobby-native-layout — tools/client_patches/lobby-native-layout.json
                 (move lobby scene anchors for that native canvas; no letterbox)
 21. brightbtn — tools/client_patches/brightbtn.json (optional; force bright/active button
                 sprite state — added once the RE for the dim-button regression lands)
The rejected `lobby-fullscreen-display` path is not part of the default stack: live use showed
that keeping the 1024x768 UI basis while requesting a 1920x1080 display stretches the lobby.

Opt-in 그래픽/리마스터 배선 (T24, 모두 기본 OFF — DEFAULT_STACK 및 기본 빌드 SHA 불변):
  --remaster-res    : 커스텀 --patches 목록이 누락했을 때만 네이티브 로비 리마스터 스택
                      (lobby-res + lobby-native-layout)을 보충 append. 기본 스택은 이미 포함하므로
                      기본 빌드에는 영향 없음(보충용 호환 플래그).
  --widescreen-ui   : Path B 진단 패치(widescreen-ui.json) 1개를 append. FUN_004ea460의 2D UI 스케일러를
                      X·Y 동일 비율(uniform-scale, 비왜곡 island)로 강제한다. lobby-res와 사이트가 겹치지 않아
                      함께 쓸 수 있으나, 네이티브 좌표 리마스터(lobby-native-layout)와는 접근이 다른 A/B 진단용.
  --hd-textures     : EXE 패치 아님. 최대 LOD(Hi) 텍스처/dgVoodoo AA·이방성·샤픈은 무패치 경로이므로
                      `python tools/logh7_graphics_config.py --remaster`로 적용하라는 안내만 출력하고
                      빌드 산출물은 바꾸지 않는다(SHA 불변 보장).

Usage:
  python -m tools.logh7_build_playable_client \
      [--base .omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe] \
      [--out  .omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe] \
      [--patches menufix dlgfix ...] [--remaster-res] [--widescreen-ui] [--hd-textures] [--deploy]
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import shutil
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_codepage_patch import apply_byte_patches
from tools.logh7_client_exe import (
    CANONICAL_KOREAN_EXE,
    CANONICAL_PLAYABLE_EXE,
    CLIENT_PATCH_DIR,
    INSTALLED_CLIENT_EXE,
    UI_EXPLORER_BACKUP_EXE,
    sha256_file,
)
from tools.logh7_rsrc_patch import DEFAULT_MAP as DEFAULT_RSRC_MAP
from tools.logh7_rsrc_patch import cmd_patch as patch_resources_to_korean

ROOT = Path(__file__).resolve().parents[1]
PATCH_DIR = CLIENT_PATCH_DIR
DEFAULT_BASE = CANONICAL_KOREAN_EXE
DEFAULT_OUT = CANONICAL_PLAYABLE_EXE
INSTALLED_EXE = INSTALLED_CLIENT_EXE
UIEXPLORER_BACKUP = UI_EXPLORER_BACKUP_EXE
CANONICAL_KOREAN_STRING = ROOT / ".omo/work/logh7-ko-overlay/exe/String.txt"
CANONICAL_KOREAN_MSGDAT_DIR = ROOT / ".omo/work/logh7-ko-overlay/data/MsgDat"
# String.txt 1-based 라인 번호 → cp949 한글 번역. 오버레이에 없는 핵심 메시지 보충.
STRING_CRITICAL_OVERRIDES = {
    59549: "서버에서 연결이 끊겼습니다. 게임을 종료합니다.",
}
RESOURCE_LOCALIZATION_MAP = DEFAULT_RSRC_MAP
OFFICIAL_KOREAN_TITLE_RELATIVE = Path("data/image/gamemenu/title_korea.original.tga")
KOREAN_TITLE_RELATIVE = Path("data/image/gamemenu/title_korea.tga")
LOGIN_TITLE_ALIAS_RELATIVE = Path("data/image/gamemenu/title.tga")
# Ordered default stack. Keep this aligned with the launcher defaults that enable the real
# strategic galaxy grid; without earlygrid-ringclear, LOGH_STRAT_GRID_EARLY can stall 0x0314.
# strat-camera-focus: own-fleet cell(DAT_007cd04c+0x11178) 미설정 → 카메라가 빈 공간을 보고 전략맵이
# 안 보이던 §1.3 블로커를 닫는다. 2026-06-20 라이브 확정: 포함 시 월드진입 후 전략 그리드가 렌더되고
# 카메라가 홈셀로 센터링(미포함이면 검은 성운만). docs/logh7-fleet-render-re.md §5-6.
DEFAULT_STACK = [
    "menufix",
    "dlgfix",
    "earlygrid-ringclear",
    "strat-camera-focus",
    "hud-msgdat-groupfix",
    "hud-character-status-msgdatfix",
    "mission-msgdat-subidfix",
    "sector-label-hardcoded-ko",
    "tactical-grid-msgdat-boundaryfix",
    "galaxy-screen-starname-msgdat-boundaryfix",
    "galaxy-screen-grid-format-msgdat-boundaryfix",
    "hud-hardcoded-stat-labels-ko",
    # chat-target-labels-ko 제외: 이 code-cave detour(0x516038 -> cave)가 적용된 빌드는
    # 클라를 VA 0x50cf52에서 0xc0000005(액세스 위반)로 크래시시킨다(2026-06-21 라이브+이벤트로그 확정).
    # v8(7c3abbad, 정상 기동)에는 이 패치가 없었고, 추가한 빌드(321aafcf)부터 기동 불가였다.
    # 패치 스펙(tools/client_patches/chat-target-labels-ko.json)은 재인코딩용으로 보존하되,
    # detour/cave를 안전하게 다시 검증하기 전까지 기본 스택에서 제외한다.
    "font-face",
    "font-cleartype",
    "login-title-ko",
    # login-native-layout 제외(2026-06-22 사용자 결정 "타이틀/로그인은 640x480으로 해도 돼"):
    # 이 패치는 로그인 씬을 640x480 -> 1920x1080으로 옮기는 부분 HD-리마스터인데,
    # 입력칸/버튼/라벨/루트레이어만 1920-class로 이동시키고 이를 감싸는 window_parts 9-slice
    # 프레임 박스(FUN_0051cda0 상단 하드코딩 0x1ae x 0x14a, VA < 0x51cf92)는 미이동이라
    # 같은 group 0x54 안에서 프레임은 640-class·컨트롤은 1920-class로 어긋나 폼이 배경/프레임에서
    # 떠 보였다. 스택에서 빼면 로그인 씬 전체가 균일한 640x480로 복귀해 프레임+컨트롤이 함께 정렬된다.
    # 스펙(tools/client_patches/login-native-layout.json)은 차후 HD 완성용으로 보존만 한다.
    # login-commandline-bootstrap 제외(2026-06-22 사용자 결정 "테스트용 id(ginei00) 없애고 만들지말고"):
    # 이 패치는 DAT_0078660c 게이트의 je(VA 0x0051a496)를 NOP해 로그인 씬을 항상 InputFromCommandLine
    # 경로(FUN_0051a370 case 0x6e)로 강제, 정적 argv 테이블(0x0076ee04 = exe,127.0.0.1,47900,ginei00,1,dummy)로
    # ginei00 자동 로그인시킨다. 빼면 정상 수동 로그인 폼이 복귀하는데 — RE 확정(FUN_004b6480): 정상 폼 경로도
    # 같은 argv 테이블을 쓰되 argv[1]=127.0.0.1은 폼이 안 건드려 기본값 유지, FUN_0051bc20이 폼에 타이핑한 ID를
    # argv[3](PTR_s_ginei00_0076ee10)에 재지정한다. 즉 수동 폼도 127.0.0.1:47900에 "타이핑한 실계정"으로 연결되고
    # ginei00은 빈 폼 제출 시에만 쓰이는 폴백 → 자동생성 테스트 계정이 사라진다(실 가입/캐릭생성 흐름 테스트 가능).
    # 4클라 E2E용 per-client 오토로그인 변종(G7MTClient.autologin.*.exe)은 별도 빌드로만 이 패치를 쓴다.
    # 스펙(tools/client_patches/login-commandline-bootstrap.json)은 그 변종 빌드용으로 보존만 한다.
    "login-blank-password-local-ok",
    "lobby-res",
    "lobby-native-layout",
]

REMASTER_RES_STACK = ["lobby-res", "lobby-native-layout"]
# Path B 진단 스택(opt-in 전용). widescreen-ui는 FUN_004ea460 2D 스케일러를 X·Y 동일비율로 강제하는
# same-length 바이트패치 1개라 lobby-res(0x51a7xx push 사이트)와 겹치지 않는다. 기본 스택엔 절대 넣지 않는다.
WIDESCREEN_UI_STACK = ["widescreen-ui"]
CONFLICTING_PATCH_SETS = [
    ("lobby-fullscreen-display", "lobby-res"),
]


def build(base: Path, out: Path, patch_names: list[str]) -> dict:
    if not base.exists():
        raise SystemExit(f"base EXE not found: {base}")
    # Patch specs are applied exactly as listed (no auto-append). brightbtn (the bright-button
    # sprite-state patch) is REVERTED out of the default stack per user request 2026-06-15
    # ("일단 버튼 이미지는 되돌려"); its spec is kept for later but only included if explicitly
    # passed via --patches.
    names = list(patch_names)
    for left, right in CONFLICTING_PATCH_SETS:
        if left in names and right in names:
            raise SystemExit(f"patches are mutually exclusive: {left} and {right}")

    work = bytearray(base.read_bytes())
    tmp = out.parent / (out.name + ".tmp")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(bytes(work))

    applied_all: list[dict] = []
    for name in names:
        spec_path = PATCH_DIR / f"{name}.json"
        if not spec_path.exists():
            raise SystemExit(f"patch spec not found: {spec_path}")
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        patches = spec["patches"]
        # apply_byte_patches drift-checks each site against the current file state.
        applied = apply_byte_patches(tmp, tmp, patches)
        applied_all.append({"name": name, "desc": spec.get("desc", ""), "verified": spec.get("verified", ""), "sites": [p.to_json() for p in applied]})

    with contextlib.redirect_stdout(io.StringIO()):
        rsrc_exit = patch_resources_to_korean(tmp, tmp, RESOURCE_LOCALIZATION_MAP)
    if rsrc_exit != 0:
        raise SystemExit("failed to localize Win32 .rsrc strings")

    tmp.replace(out)
    manifest = {
        "base": str(base),
        "baseSha256": sha256_file(base),
        "out": str(out),
        "outSha256": sha256_file(out),
        "stack": names,
        "rsrcMap": str(RESOURCE_LOCALIZATION_MAP),
        "patches": applied_all,
    }
    (out.parent / (out.stem + ".playable-manifest.json")).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def restore_official_login_title(installed_root: Path) -> dict[str, str | bool]:
    source = installed_root / OFFICIAL_KOREAN_TITLE_RELATIVE
    if not source.exists():
        raise SystemExit(f"official Korean login title asset is missing: {source}")
    target = installed_root / KOREAN_TITLE_RELATIVE
    alias = installed_root / LOGIN_TITLE_ALIAS_RELATIVE
    shutil.copy2(source, target)
    shutil.copy2(source, alias)
    return {
        "restored": True,
        "source": str(source),
        "target": str(target),
        "alias": str(alias),
        "bytes": str(target.stat().st_size),
        "note": "official original-logo Korean title asset restored; generated glyph overlay is not deployed",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the canonical playable LOGH VII client EXE.")
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--patches", nargs="*", default=DEFAULT_STACK)
    parser.add_argument("--remaster-res", action="store_true",
                        help="compatibility option: append the native lobby remaster stack "
                             f"({' + '.join(REMASTER_RES_STACK)}) when a custom --patches list omits it. "
                             "This uses the checked-in 1920x1080 lobby canvas plus native "
                             "scene-coordinate retargeting; regenerate both lobby patches for "
                             "other target resolutions.")
    parser.add_argument("--widescreen-ui", action="store_true",
                        help="opt-in (default OFF): append the Path B diagnostic widescreen-ui patch "
                             "(force the FUN_004ea460 2D UI scaler to a single uniform X==Y ratio). "
                             "Distinct byte sites from lobby-res so it composes; this is an A/B "
                             "diagnostic, NOT the default native-coordinate remaster.")
    parser.add_argument("--hd-textures", action="store_true",
                        help="opt-in (default OFF): NOT an EXE patch and does not change the built EXE. "
                             "Print the patch-free HD command (max LOD textures + dgVoodoo AA/aniso/"
                             "sharpen): `python tools/logh7_graphics_config.py --remaster`.")
    parser.add_argument("--deploy", action="store_true",
                        help="copy the built EXE to the installed client AND the ui_explorer restore-backup "
                             "so `ui_explorer stop` can no longer revert to the menu-disabled EXE")
    args = parser.parse_args()

    patch_names = list(args.patches)
    if args.remaster_res:
        patch_names = [name for name in patch_names if name != "lobby-fullscreen-display"]
        # Append (in order) any remaster patch not already requested, preserving the existing stack.
        for name in REMASTER_RES_STACK:
            if name not in patch_names:
                patch_names.append(name)
    if args.widescreen_ui:
        # Path B 진단 패치를 opt-in append. 이미 들어 있으면 중복 추가하지 않는다(드리프트 방지).
        for name in WIDESCREEN_UI_STACK:
            if name not in patch_names:
                patch_names.append(name)
    # --hd-textures는 EXE를 바꾸지 않는 무패치 경로 안내일 뿐이라 patch_names에 영향 없음(SHA 불변).
    hd_textures_note = None
    if args.hd_textures:
        hd_textures_note = (
            "HD textures/AA are patch-free and do NOT alter this EXE. Run: "
            "python tools/logh7_graphics_config.py --remaster "
            "(max LOD Hi + dgVoodoo 16x aniso + 4x MSAA + lanczos-3)."
        )

    manifest = build(args.base, args.out, patch_names)
    # Windows cp949 consoles cannot print every patch note (some specs cite Japanese source text).
    # Keep the on-disk manifest UTF-8, but make stdout ASCII-safe so builds do not fail at the end.
    print(json.dumps(manifest, ensure_ascii=True, indent=2))
    if hd_textures_note is not None:
        print(json.dumps({"hdTextures": False, "note": hd_textures_note}, ensure_ascii=False, indent=2))

    if args.deploy:
        shutil.copy2(args.out, INSTALLED_EXE)
        shutil.copy2(args.out, UIEXPLORER_BACKUP)
        if CANONICAL_KOREAN_STRING.exists():
            installed_string = INSTALLED_EXE.parent / "String.txt"
            installed_string_backup = INSTALLED_EXE.parent / "String.txt.original"
            # 원본 String.txt를 백업한 뒤, 한글 오버레이를 라인 단위로 병합.
            # 오버레이가 128줄짜리 부분 번역인 경우에도 원본 59550줄 구조를 유지해
            # 번역되지 않은 라인(예: 59549번 연결 끊김 메시지)이 여전히 게임에서
            # 읽힐 수 있게 한다. (바이트 단위 병합, 줄바꿈은 \r\n)
            orig_bytes = (INSTALLED_EXE.parent / "String.txt").read_bytes()
            overlay_bytes = CANONICAL_KOREAN_STRING.read_bytes()
            orig_lines = orig_bytes.split(b"\r\n")
            overlay_lines = overlay_bytes.split(b"\r\n")
            merged_lines = list(orig_lines)
            for i, line in enumerate(overlay_lines):
                if i < len(merged_lines):
                    merged_lines[i] = line
            # 핵심 누락 메시지 보충 (1-based 라인 번호)
            for line_no, text in STRING_CRITICAL_OVERRIDES.items():
                idx = line_no - 1
                if idx < len(merged_lines):
                    merged_lines[idx] = text.encode("cp949", errors="ignore")
            installed_string_backup.write_bytes(orig_bytes)
            installed_string.write_bytes(b"\r\n".join(merged_lines))
        installed_msgdat = INSTALLED_EXE.parents[1] / "data" / "MsgDat"
        if CANONICAL_KOREAN_MSGDAT_DIR.is_dir():
            installed_msgdat.mkdir(parents=True, exist_ok=True)
            for source in CANONICAL_KOREAN_MSGDAT_DIR.glob("*.dat"):
                shutil.copy2(source, installed_msgdat / source.name)
        login_title = restore_official_login_title(INSTALLED_EXE.parents[1])
        print(json.dumps({
            "deployed": True,
            "installed": str(INSTALLED_EXE),
            "backup": str(UIEXPLORER_BACKUP),
            "string": str(INSTALLED_EXE.parent / "String.txt"),
            "stringBackup": str(INSTALLED_EXE.parent / "String.txt.original"),
            "msgdat": str(installed_msgdat),
            "loginTitle": login_title,
            "note": "ui_explorer start uses the canonical playable EXE by default; stop verifies session-start SHA",
        }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
