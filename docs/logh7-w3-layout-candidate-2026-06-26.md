# W3 로비 네이티브 레이아웃 후보 빌드 + byte-verify (2026-06-26)

★캐논 미교체. 후보 빌드(별도 산출물)만 생성. 라이브검증 후 승격 결정.

## 0. 요약

- 캐논 playable SHA = `992dc7e25c4d…` (live-test-standard 고정) — **빌드 후 재확인=불변** (`992dc7e2`).
- 후보 빌드 SHA = **`bf0d4cc075dc4f5f9fbc791badc0805c5f47c3f17ce4ec71f5b11195d707c029`**
  - 산출물: `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable-w3layout.exe`
  - base = `G7MTClient.korean.exe` SHA `466725e2…` (= KOREAN_CLIENT_SHA256, 정합)
  - 스택 = DEFAULT_STACK(18) + W3 네이티브 레이아웃 4종 = **22 패치 스펙**, `--deploy` 미사용.

## 1. 패치 현황 (적용/미적용 — 캐논 DEFAULT_STACK 기준)

DEFAULT_STACK(`logh7_build_playable_client.py:120`)에 **이미 포함**된 로비 레이아웃 패치:
- **`lobby-res`** (8 site, 1024x768→1920x1080 캔버스) — 적용 中. live-1920 probe(2026-06-20) 확정.
- **`lobby-native-layout`** (13 site, 씬 앵커 재배치) — 적용 中. 1920 native no-stretch prior live evidence.
  - (※의뢰문 "lobby-native-layout 13 RE확정 미적용"은 부정확 — 캐논 스택에 이미 들어있음. 새로 추가되는 것은 아래 4종.)

W3 후보에 **새로** 추가(캐논 미적용 → 후보 빌드에만):
| 패치 | site | canvasBasis | verifiedFlag |
|---|---|---|---|
| charsel-native-layout | 5 | 640x480 menu | **false** |
| gamemenu-right-native-layout | 7 | 1024x768 lobby | **false** |
| soukan-hud-native-layout | 8 | config-native world | **false** |
| window-dialog-native-layout | 7 | 1024x768 lobby | **false** |

4종 모두 `verifiedFlag:false` (originalVerified=True, 시각/위젯 X/Y 분류는 라이브 미검증).

## 2. byte-verify 결과

빌드 엔진(`build()` → `apply_byte_patches`)이 site별 originalHex를 현재 파일 상태에 drift-check.
mismatch 시 SystemExit → **22 스펙 전부 통과 = 빌드 성공**.

독립 재검증(vanilla `.omo/ghidra/bin/G7MTClient.exe` 대조 + 후보 EXE 대조):
- **lobby-native-layout 13 site**: 후보에 patchedHex 전부 존재 = OK.
- **W3-new 4종 27 site**: vanilla originalHex 일치 + 후보 patchedHex 일치 + 길이 동일(same-length) = **27/27 OK**.
- 캐논 playable EXE SHA `992dc7e2` = **불변(미교체 확인)**.

## 3. 정렬 위험 평가 (login-native 640 적용 전례 기반 정적 평가)

전례: login-native-layout은 1920 재배치가 window_parts 프레임(640 잔류)과 어긋나 정렬이슈 → 사용자 "640으로 해도 돼"로 640 균일 적용. 교훈 = **패치 캔버스 basis ≠ 실제 렌더 캔버스면 over/under-scale로 어긋남.**

각 W3 패치의 위험(렌더 캔버스 정합 여부):
- **gamemenu-right-native-layout (1024→1920)** — basis 1024x768 = lobby-res가 retarget한 로비 캔버스와 동일. 스케일 비율(1920/1024)이 lobby-res와 정합. **상대적 저위험.** → **후보 포함.**
- **window-dialog-native-layout (1024→1920)** — 동일 1024 로비 캔버스 basis, lobby-res 정합. **상대적 저위험.** → **후보 포함.**
- **charsel-native-layout (640→1920, 3x)** — basis가 640x480 menu 캔버스. 로비는 lobby-res로 1920 retarget됨. charsel 패널이 1920 로비 캔버스 위에 그려진다면 640 기준 3x 스케일은 **login-native 640 트랩과 동형(over-scale)** = **고위험.** → 후보엔 빌드되어 있으나 라이브에서 charsel/세션 진입 패널을 우선 확인, 어긋나면 **제외(640 유지) 또는 1024 basis 재산출** 결정.
- **soukan-hud-native-layout (1024→1920)** — basis = config-native **world** 캔버스(ScreenWidth/Height). 이건 **인-월드 HUD**(로비 아님). world 캔버스용 `-res` 패치는 스택에 없고, world 실해상도=GraphicConfig 의존. 1920 가정이 틀리면 어긋남 + **월드진입(입력/월드 라이브 블로커)에 게이팅되어 로비 shot으로 검증 불가.** = **검증 불가 위험.** → 빌드엔 포함(byte-safe)되나 **로비 단계 승격 판단 대상 아님**(별도 월드 라이브 사이클 필요).

정리: 저위험 **포함 권장** = gamemenu-right, window-dialog. 고위험/검증불가 = charsel(라이브 우선 확인), soukan-hud(월드 게이팅, 보류).

## 4. 라이브검증 절차 (★캐논 미교체 — 후보 EXE로만)

캐논 `G7MTClient.exe`(installed)·`G7MTClient.playable.exe` **건드리지 않음**.

1. stale node kill (라이브 스킬 규칙).
2. ui_explorer를 **후보 EXE 명시 기동**:
   `ui_explorer start --patched-exe RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable-w3layout.exe --env ...`
   (`--deploy` 미사용 = installed 트리·canonical SHA 불변. ui_explorer는 backup/restore로 세션 종료 시 원복.)
3. BOTHTEC 스플래시 ~30s 대기(포그라운드 유지) 후 로그인.
4. 로비 진입 → **shot**: 로비 메뉴/서브메뉴 정렬(lobby-native+res 회귀 없음 확인).
5. 새캐릭/세션 진입 패널 → shot: **charsel 패널 정렬**(640 트랩 여부 = 핵심 판정).
6. 윈도우/다이얼로그 팝업 → shot: window-dialog 정렬.
7. (gamemenu-right = 세션/캐릭 리스트 컬럼) shot.
8. soukan-hud는 월드진입 필요 → 현 로비 사이클에선 스킵(별도 월드 사이클).
9. stop → 캐논 SHA(`992dc7e2`) 원복 확인.
10. 결과를 `docs/logh7-client-state-journal.md`에 기록(전진/정체/회귀).

## 5. 승격 조건

후보 → 캐논(DEFAULT_STACK) 승격은 **아래 전부 충족 시에만**:
- 라이브 shot에서 해당 패널이 1920 캔버스에 **시각적 정합**(어긋남·over-scale 없음).
- 기존 로비(lobby-res/native) **회귀 없음**.
- charsel: 640 트랩 미발생 확인(어긋나면 1024 basis 재산출 또는 제외).
- soukan-hud: 별도 **월드진입 라이브**로 world 캔버스 정합 확인 전까지 **승격 보류**(로비 검증으로 불충분).
- 승격 시 `verifiedFlag:true` 갱신 + DEFAULT_STACK 추가 + 새 canonical playable SHA 재기록 + live-test-standard·ui_explorer 영향 재확인.

저위험 2종(gamemenu-right, window-dialog)이 통과하고 charsel만 어긋나면 **부분 승격**(2종만 DEFAULT_STACK 추가, charsel/soukan 보류) 가능.
