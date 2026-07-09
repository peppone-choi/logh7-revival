# LOGH VII 전략/커맨드/직무카드 패널 리마스터 (2026-06-26)

라이브에서 전략맵 HUD 렌더가 확인된 뒤, 기존 20종(HUD_SET) 외의 **대형 UI 패널**을
Lanczos 업스케일하여 캐논 클라 이미지 트리에 드롭인 배포한다.

## 도구
`RE/tools/logh7_remaster_hud_tga.py`
- type-1(256색 팔레트, 8bpp, bottom-up) TGA를 직접 디코드 → RGBA → Lanczos 업스케일
  + 가벼운 언샤프 → **type-2 32bpp BGRA** 재인코딩(D3DX8 CD3DXImage가 content magic으로
  로드하므로 더 큰 치수 드롭인 가능). 알파 보존.
- 이번 세션 추가:
  - `PANEL_SET` (40종 대형 패널 목록).
  - `--set panel` 플래그.
  - **max_dim 캡(기본 2048)**: 32bpp 비압축 TGA라 1024² 원본을 4x 하면 4096²=64MB로
    폭증한다. 긴 변이 2048을 넘지 않도록 배율을 자동 하향(1024²→2x, 512²→4x, 640×480→3x 등).
  - `--deploy`: 두 캐논 이미지 트리(dist + vendor)에 드롭인 + **원본 자동 백업**.
  - 경로 보정: `client/` 는 저장소 루트, `.omo`는 RE 안으로 정션 → REPO를 루트로 재해석.

## 업스케일 대상 (40 패널)
HUD_SET(20종) 및 이미 업스케일된 type-2 파일, min(w,h)<100 인 작은 32px 아이콘 뱅크
(icon_down/mover/nfocus/none)는 제외하고 선별:

- **shokumu_card** 6종 — 직무카드 명령/직무 패널(제국·동맹) + parts (★사용자 명시 타겟)
- **gamemenu** 10종 — menu_parts(인게임 메뉴), title 4종, 로고 3종, jinei/kekka
- **rader** 3종 — parts, rader, rader_parts (레이더)
- **soukan** 1종 — soukan_parts (拠点/총관 패널 부품)
- **window** 9종 — dialog_parts, cursor_parts, ending_parts×2, menu_parts,
  offline_window, resize_window_parts, sentaku_dd_window, wakusei_parts
- **Field** 9종 — ShipMark, icon_action, icon_country32, icon_set, idou_parts,
  idou_kaiten_pointer, mk_unitcircle_blue/red, unit_range
- **chat** 1종 — chat_parts
- **icon** 1종 — system_icon_parts

## 배포 위치 (양쪽 캐논 트리)
- `client/dist/logh7-client/data/image/`  (40 파일)
- `client/vendor/logh7-installed/data/image/`  (40 파일)
- 합계 80 파일 쓰기, 오류 0.

## 백업 (원본 무손상)
- `.omo/work/remaster/panel-original-backup-2026-06-26/dist/`   (40 원본, type-1/8bpp)
- `.omo/work/remaster/panel-original-backup-2026-06-26/vendor/` (40 원본, type-1/8bpp)
- 오버레이(업스케일 산출 + _preview PNG): `.omo/work/remaster/panel-overlay/data/image/`

## 크기 증가
- 트리당 **7MB → 301MB (+293MB)**, 두 트리 합 **+587MB**.
- 최대 파일은 2048² 캡으로 **16MB**(이전 4x 무제한이면 64MB였음). 캡 적용 후
  최초 4x 대비 ~37% 절감(961MB → 587MB).
- ⚠ 패키지 비대: dist/vendor 양쪽 보유라 배포 패키지에는 한 트리(dist)만 포함하거나
  대형 패널(menu_parts/wakusei/sentaku_dd) 선별이 향후 검토 필요.

## 테스트 (직렬 권위)
- `npm run test`(server): **1187 tests / 1169 pass / 0 fail / 18 skipped** — 무회귀
  (에셋 데이터 변경이라 서버 로직 무관, 회귀 없음 재확인).

## 라이브 렌더 검증 (대기)
- 자산은 D3DX8 content-magic 로드라 EXE/코드 수정 불필요(드롭인).
- ⏳ 실클라(ui_explorer) 기동 → 전략맵·게임메뉴·직무카드·拠点 패널 출현 시
  업스케일 텍스처 렌더 육안 확인 필요. logh7-live 스킬로 후속 검증.
