# LOGH VII HUD/UI/Image/Model 리마스터 타겟 리스트 (2026-06-24)

> **목적**: 현재 리바이벌 클라이언트(라이브 스크린샷)와 원본(웹 수집 134장 + `.omo/reference/`) 간의 시각적 격차를 식별하고, 우선순위별로 정리한다.
>
> **입력**: `.omo/reference/CATALOG.md` (134장 원본 레퍼런스), `.omo/ui-explorer/` 라이브 스크린샷, `tools/client_patches/*.json` (기존 패치).
>
> **분류**: login / lobby / strategy map / tactical map / planet interior / command window / status/character / chat
>
> **우선순위**: P0 = 게임플레이/가독성 차단 / P1 = 폴리시/한글화 미완 / P2 = 에셋 품질 향상

---

> **2026-06-24 추가**: `tools/logh7_remaster_hud_tga.py`로 20종 HUD/UI 텍스처를 2배 업스케일한 오버레이 생성 완료(출력 `.omo/work/remaster/hud-overlay/data/image`). 라이브 드롭인 검증은 아직.

## 1. Login (로그인 화면)

### 1.1 Title Texture (P1)
- **문제**: 일본판 타이틀 텍스처 `title_japan.tga`가 기본. 한국판 `title_korea.tga`로 교체 필요.
- **패치**: `login-title-ko.json` — VA 0x00786998 문자열 교체 (`title_japan.tga` → `title_korea.tga`).
- **라이브**: `.omo/ui-explorer/session/shots/045-login-btn.png` — 한국판 타이틀 "은하영웅전설 VII" 확인됨 (패치 적용 상태).
- **잔여**: 타이틀 텍스처 자체의 해상도 업스케일 (원본 640×480 시대, 현재 1920×1080에서 흐릿).
- **에셋**: `data/image/gamemenu/title_korea.tga` — AI 업스케일 또는 원본 고해상도 확보.

### 1.2 Layout (P1)
- **문제**: 원본 640×480 로그인 폼이 1920×1080에서 중앙 정렬되나, 프레임 박스(`window_parts`)는 640 잔류로 어긋남.
- **패치**: `login-native-layout.json` — 1920×1080 네이티브 좌표 재배치 (RE 확인, 라이브 검증 완료).
- **라이브**: `.omo/ui-explorer/session/shots/045-login-btn.png` — ID/PW 칸 + 버튼 함께 중앙정렬 확인.
- **잔여**: `window_parts.tga` 프레임 텍스처 자체가 640×480 기준 → 1920×1080용 고해상도 프레임 에셋 필요.
- **에셋**: `data/image/gamemenu/window_parts.tga`

### 1.3 Background (P2)
- **문제**: 로그인 배경이 단순 스타필드. 원본은 행성/성운이 있는 풍부한 배경.
- **에셋**: `data/image/gamemenu/title_bg*.tga` 또는 `title_back.tga` — 고해상도 교체.

---

## 2. Lobby (로비 화면)

### 2.1 Button Brightness/State (P0 → P1)
- **문제**: 로비 버튼 8개가 전부 어두운(dull) 상태로 렌더. 원본은 활성/비활성 상태에 따라 밝기 차이 있음.
- **패치**: `menufix.json` — 버튼 enable 비트 플립 (라이브 클릭 가능 확인).
- **패치**: `brightbtn.json` — 밝은 스프라이트 강제 (REVERTED, 2026-06-15). 원인=draw-state selector 미해결.
- **라이브**: `.omo/ui-explorer/session/shots/060-ko-lobby.png` — 버튼 어두움, 한글 라벨은 정상.
- **근본**: `gamemenu/menu_parts.tga` 아틀라스에 bright-glossy(active) / dark-navy(disabled) 스프라이트 존재. 게임이 dim state를 선택하는 draw-state/color-modulation selector를 RE 중.
- **에셋**: `data/image/gamemenu/menu_parts.tga` (idx 146 = bright active sprite)
- **다음**: FUN_0051a370 버튼 draw path에서 state→sprite selector RE 후 same-length 패치.

### 2.2 Layout (P1)
- **문제**: 로비 씬 640×480 기준 앵커 테이블 → 1920×1080에서 비율 왜곡.
- **패치**: `lobby-native-layout.json` — 앵커 테이블 1920×1080 재배치 (라이브 확인).
- **라이브**: `.omo/ui-explorer/session/shots/060-ko-lobby.png` — 좌측 메뉴 + 우측 패널 위치 확인.
- **잔여**: 캐릭터 선택 화면(`.omo/ui-explorer/session/shots/080-char1-select.png`)도 동일 레이아웃 문제.

### 2.3 Character Select Portrait (P1)
- **문제**: 캐릭터 선택 화면 초상화가 작고 흐릿. 원본(uu3.jpg)은 고해상도 초상화.
- **라이브**: `.omo/ui-explorer/session/shots/080-char1-select.png` — 2행 초상화, 작은 크기.
- **에셋**: Face/*.tcf 초상화 아틀라스 — 고해상도 교체 또는 AI 업스케일.
- **패치**: `face-atlas-expand.json` — gaf cap 50→51, 새 초상화 슬롯 추가 (라이브 미확인).

---

## 3. Strategy Map (전략맵)

### 3.1 HUD Labels — NO DATA (P0)
- **문제**: 전략맵 하단 HUD에 "NO DATA" 또는 잘못된 레이블 표시.
- **원인**: constmsg 그룹 0x68(크기 3)에서 subId 0x03..0x1a 조회 → NO DATA.
- **패치**: `hud-msgdat-groupfix.json` — 그룹 0x68 → 0x63 (status/date labels, 크기 27)로 21개 call-site 재배치.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 좌하 인물 패널, 중앙 미니맵, 우하 정보 패널. 일부 한글 레이블 정상, 일부 "NO DATA".
- **잔여**: `hud-character-status-msgdatfix.json` — 그룹 0x67(로그인 에러) → 0x60(캐릭터 UI)로 재배치. "이미 탈퇴하셨습니다." → "캐릭터 스테이터스".

### 3.2 Hardcoded Stat Labels (P0)
- **문제**: HUD 능력치 레이블이 CP932 하드코딩 → CP949 모지바케.
- **패치**: `hud-hardcoded-stat-labels-ko.json` — VA 0x0078d59c `航続` → `항속` (4바이트 same-length).
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 좌하 인물 패널 능력치 레이블 확인 필요.

### 3.3 Sector Labels — Mixed Encoding (P0)
- **문제**: 성계명 뒤에 CP932 `星系`/`星系内宇宙`가 붙어 모지바케.
- **패치**: `sector-label-hardcoded-ko.json` — VA 0x0078d4ac `星系内宇宙` → `성계내우주`, VA 0x0078d4c8 `%s星系` → `%s성계`.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 좌상 성계명 "베큘라" 확인, 접미사 확인 필요.

### 3.4 Star Names — ConstMsg Boundary Cross (P0)
- **문제**: 갤럭시 화면 성계명 조회가 그룹 0x16 경계를 넘어섬.
- **패치**: `galaxy-screen-starname-msgdat-boundaryfix.json` — g0x16/s0x86 → g0x18/s0x07 (flat 1410: 알비스).
- **패치**: `galaxy-screen-grid-format-msgdat-boundaryfix.json` — 3행 텍스트 중간 행 g0x16/s0x7b → g0x17/s0x00.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 성계명 "베큘라" "발할라" 확인.

### 3.5 Fleet Marker Visibility (P0)
- **문제**: own-fleet 함대 마커가 전략맵에 보이지 않음.
- **패치**: `strat-camera-focus.json` — code-cave detour, home cell 쓰기. `strat-camera-focus-scan.json` — 스캔 버전.
- **패치**: `strat-source-mode.json` — 소스 모드 관련.
- **라이브**: `.omo/ui-explorer/session/shots/095-fleet-marker.png` — 함대 마커 미확인 (어두운 배경).
- **근본**: `FUN_004d6310` camera-focus + `DAT_007cd04c+0x11178` own_cell 설정. 라이브 복잡한 상호작용.
- **참고**: 원본(en011.jpg)에는 성계 옆 초록 함선/전력 숫자(73000, 8944 등) 표시 — 이는 own-fleet 렌더와 다른 경로.

### 3.6 Grid/Terrain Labels (P1)
- **문제**: 전술/그리드 패널 레이블이 그룹 0x16 경계를 넘어 NO DATA.
- **패치**: `tactical-grid-msgdat-boundaryfix.json` — 7개 call-site 재배치 (g0x16 → g0x17/g0x18).
- **라이브**: 전술맵 진입 시 `.omo/ui-explorer/session/shots/101-switch-strategic.png` — 전술맵 전환 확인, 그러나 전술 데이터 불완전.

### 3.7 Background Quality (P2)
- **문제**: 전략맵 배경 스타필드가 저해상도, 반복 패턴 눈에 띔.
- **원본**: `.omo/reference/gamemeca/en011.jpg` — 풍부한 성운, 다양한 항성 색상, 항행 궤도선.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 어두운 단조로운 배경, 항성 2개만 보임.
- **에셋**: `data/image/galaxy/galaxy_back.tga` 또는 `Null_galaxy.mdx` — 고해상도 교체 또는 AI 생성.

### 3.8 Minimap (P2)
- **문제**: 중앙 하단 미니맵이 작고 저해상도.
- **원본**: en011.jpg — 미니맵에 성계 위치, 그리드, 현재 위치 사각형 표시.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 미니맵에 "X" 표시만, 세부 정보 부족.
- **에셋**: `data/image/gamemenu/*.tga` 미니맵 관련 텍스처.

---

## 4. Tactical Map (전술맵/전투)

### 4.1 Tactical Data Incomplete (P0)
- **문제**: 전술맵 진입은 가능하나 placeholder 데이터로 인해 렌더 stall/crash.
- **패치**: `LOGH_BATTLE_ENTRY_PROBE` — 서버 푸시 우회 (1071 테스트 통과).
- **라이브**: `.omo/ui-explorer/session/shots/101-switch-strategic.png` — 전술맵 전환 확인, 그러나 완전 전술데이터(NPC_SEED 시드셋) 필요.
- **원본**: `.omo/reference/gamemeca/uu1.jpg` — 3D 함선 모델(ブリュンヒルト), 함선 상태 패널, 커맨드 그리드, 레이더.
- **원본**: `.omo/reference/gamemeca/en008.jpg` — 다수 함대 미사일/빔 일제사격, 피격 폭발, 배경 행성.
- **잔여**: 전술 데이터 완전 구현 (NPC_SEED, 함선 스탯, 전투 시퀀스).

### 4.2 3D Ship Models (P2)
- **문제**: 전술맵 3D 함선 모델이 저폴리, 텍스처 해상도 낮음.
- **원본**: uu1.jpg — 브륀힐트, 요츤하임 등 상세 3D 모델.
- **에셋**: `data/model/Ship/*.mdx` — MDX 모델 고해상도 교체 또는 AI 업스케일.
- **참고**: `tools/logh7_extract_mdx.py` — MDX 추출 도구 존재.

### 4.3 Combat Effects (P2)
- **문제**: 빔/미사일 효과, 폭발 효과가 단순.
- **원본**: en008.jpg — 집중빔 일제사격, 다채로운 폭발.
- **에셋**: `data/image/effect/*.tga` 또는 `data/image/battle/*.tga` — 효과 텍스처 교체.

### 4.4 Ship Status Panel (P1)
- **문제**: 우상 함선 상태 패널(DEAD/GUN/ENGINE/NAV/SCREEN) 레이아웃/텍스처.
- **원본**: uu1.jpg — 원형 게이지 + 시스템 상태 아이콘.
- **에셋**: `data/image/battle/*.tga` — 상태 패널 텍스처.

---

## 5. Planet Interior (행성 내부)

### 5.1 Location Navigation (P0)
- **문제**: 행성 내 장소(집무실, 함교, 회의실 등) 네비게이션 미구현.
- **원본**: `.omo/reference/gamemeca/uu3.jpg` — 방 안에 인물 초상화 다수 물리 배치 + 우측 직무카드 + 우하 시설내 로비.
- **원본**: `.omo/reference/gamemeca/en10101010101010101010.gif` — 행성 내부 + 직무카드.
- **라이브**: 현재 C002 게이트로 인해 행성 내부 진입 불가.
- **잔여**: C002 서브시스템 구성 완료 후 구현.

### 5.2 Duty Cards (직무권한카드) (P0)
- **문제**: 직무카드 패널 미오픈. 원본에는 13장 보유, 직무(개인/작전/군무상서) + 커맨드 그리드.
- **원본**: `.omo/reference/gamemeca/uu3.jpg` — 우측 직무카드: 艦隊司令官 + 스탯 + 커맨드(이동·작전계획·퇴역/참가·첩보/지원·망명·상금투입/설득·반란·사임/체포허가·임명·승진·파면/특별경비·연료보급).
- **원본**: `.omo/reference/toshichan/140660_card.jpg` — 직무권한카드 상세.
- **라이브**: 서버푸시 로스터(0x1200~0x120f) 수신 확인, 패널 오픈은 C002 게이트 선결.

### 5.3 Character Portrait Placement (P1)
- **문제**: 행성 내부 인물 초상화 물리 배치.
- **원본**: uu3.jpg — 메클린거, 켐프, 로이엔탈, 미터마이어, 키르히아이스, 바렌, 파렌하이트, 랑 등 다수 초상화.
- **에셋**: Face/*.tcf — 초상화 아틀라스.

### 5.4 Facility Sub-menu (P1)
- **문제**: 시설 내 하위 장소 메뉴(旗艦桟橋/航路管理センター 등).
- **원본**: `.omo/reference/toshichan/80952a_lobby.jpg` — 宇宙港 警戒ロビー.
- **에셋**: `data/image/gamemenu/*.tga` — 시설 메뉴 텍스처.

---

## 6. Command Window (커맨드윈도우)

### 6.1 Command Menu Empty (P0)
- **문제**: C002 커맨드윈도우(명령 아이콘 그리드)가 빈 상태. rowCount=0.
- **원본**: `.omo/reference/toshichan/c8858b_compnel1.jpg` — コマンドウィンドウ: 명령 아이콘 + 旗艦/艦艇/司令官/要塞 탭.
- **원본**: `.omo/reference/toshichan/8dabea_compnel2.jpg` — 탭2.
- **원본**: `.omo/reference/toshichan/d1e080_compnel3.jpg` — 탭3.
- **원본**: `.omo/reference/gamemeca/en004.jpg` — 넷마블 한국판: 커맨드윈도우 + 한글 채팅.
- **라이브**: C002 서브시스템 미구성으로 인해 명령 메뉴 빌드(FUN_004f5cb0)가 rowCount=0 반환.
- **근본**: 6-레이어 구성 (패널 위젯 → catGate → officer 데이터 → 함대선택 → 명령메뉴 → dispatch).
- **패치**: `c002-force-scene-setup.json` — FUN_0054e570 강제 실행 (2바이트 same-length).

### 6.2 Command Icons (P1)
- **문제**: 커맨드 아이콘 그리드 텍스처가 저해상도.
- **원본**: en004.jpg — 4×4 아이콘 그리드, 각 아이콘 선명.
- **에셋**: `data/image/gamemenu/command*.tga` 또는 `data/image/icon/*.tga` — 아이콘 텍스처 교체.

---

## 7. Status/Character (인물 스테이터스)

### 7.1 Character HUD (P0)
- **문제**: 좌하 인물 스테이터스 패널에 잘못된 텍스트/NO DATA.
- **패치**: `hud-character-status-msgdatfix.json` — 그룹 0x67 → 0x60.
- **패치**: `hud-hardcoded-stat-labels-ko.json` — CP932 → CP949.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 좌하 인물 패널: 초상화 + 이름 + 능력치(일부 한글, 일부 깨짐).
- **원본**: `.omo/reference/toshichan/ddcc72_status.jpg` — 인물 스테이터스(능력 8종: PCP統率政治運用情報/MCP指揮機動攻撃防御).
- **원본**: `.omo/reference/gamemeca/uu3.jpg` — 뮐러 소장, 체력·PCP·統率/政治/運用/情報·指揮/機動/攻撃/防御·影響力·功績.

### 7.2 Ability Values (P1)
- **문제**: 능력치 값 디코드/표시가 일부 오류.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 능력치 숫자 확인 필요.
- **참고**: `docs/logh7-manual-canon.md` — 능력치 8종 정의.

---

## 8. Chat (채팅)

### 8.1 Chat Input Layer (P0)
- **문제**: 인-월드 채팅 입력 UI가 열리지 않거나 입력이 안 됨.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/006-click-chat-input.png` ~ `012-click-chat-tab.png` — 채팅 탭 클릭, 입력 시도, 그러나 실제 입력 미확인.
- **원본**: `.omo/reference/gamemeca/en004.jpg` — 넷마블 한국판: "루페발: 빨랑 좀 지원 좀 해줘…ㅜㅜ", "렌츠: 좀만 기둘려", "키르히하이스: ㅋㅋㅋ".
- **잔여**: 채팅 입력 위젯 오픈 메서드 RE, 텍스트 위젯 입력 경로 구현.
- **패치**: `chat-target-labels-ko.json` — REVERTED (크래시 원인, 2026-06-21). `tools/client_patches/chat-target-labels-ko.json`은 SPEC만 유지, 적용 금지.

### 8.2 Chat Font (P1)
- **문제**: 채팅 폰트가 Pretendard로 설정되었으나, 일부 상황에서 폰트 렌더 문제.
- **패치**: `font-face.json` — `MS UI Gothic` → `Pretendard`.
- **패치**: `font-cleartype.json` — ANTIALIASED_QUALITY → CLEARTYPE_QUALITY.
- **라이브**: `.omo/ui-explorer/c002-grid-fallback-20260624/shots/001-after-login.png` — 채팅 영역 텍스트 확인 필요.

---

## 9. General Graphics/Runtime (전역 그래픽)

### 9.1 Resolution/Fullscreen (P1)
- **문제**: 640×480 기준 UI가 1920×1080에서 네이티브 렌더되지 않음.
- **패치**: `lobby-res.json`, `lobby-fullscreen-display.json` — 해상도/전체화면.
- **패치**: `widescreen-ui.json` — DIAGNOSTIC ONLY (uniform-scale, default에서 제외).
- **런타임**: `GraphicConfig.txt` — ScreenWidth/ScreenHeight, ModelTextureLevel/BGTextureLevel/StarsModelLevel=0 → max로 상향.

### 9.2 dgVoodoo Watermark (P1)
- **문제**: D3D8 래퍼 dgVoodoo2 우하단 워터마크.
- **패치**: `dgvoodoo-nowatermark.json` — conf 레버로 워터마크 off (`dgVoodooWatermark=false`).
- **라이브**: 모든 스크린샷에 우하단 "dgVoodoo" 표시 — 제거 필요.

### 9.3 Cursor Clip (P1)
- **문제**: 멀티모니터/창모드에서 커서가 게임창 밖으로 새어 나감.
- **패치**: `cursor-clip.json` — SPEC ONLY, 미적용. 권장=`tools/logh7_cursor_clip.py` 외부 클립.
- **근본**: 클라가 ClipCursor를 한 번도 호출하지 않음 (RE 확인).

### 9.4 Texture Quality (P2)
- **문제**: `GraphicConfig.txt` 모든 텍스처 레벨이 0 (최저).
- **런타임**: `ModelTextureLevel=0`, `BGTextureLevel=0`, `StarsModelLevel=0` → max 값으로 상향.
- **효과**: 3D 모델, 배경, 항성 텍스처 해상도 향상.

### 9.5 AI Upscale / Remaster Pipeline (P2)
- **현황**: `tools/logh7_remaster_hud_tga.py` — HUD 20개 텍스처 라이브 드롭인 가능.
- **제한**: 생성형 AI 도구 부재 (2026-06-23 핸드오프).
- **타겟**: `data/image/gamemenu/*.tga`, `data/image/galaxy/*.tga`, `data/image/battle/*.tga` — 전수 업스케일.

---

## 10. Summary Table (요약)

| Screen | Target | Priority | Issue | Patch/Asset | Live Screenshot | Ref Screenshot |
|---|---|---|---|---|---|---|
| Login | Title texture | P1 | 일본판 타이틀 | `login-title-ko.json` | `session/shots/045-login-btn.png` | — |
| Login | Layout | P1 | 640→1920 정렬 | `login-native-layout.json` | `session/shots/045-login-btn.png` | — |
| Login | Background | P2 | 단조로운 배경 | `title_bg*.tga` 교체 | — | — |
| Lobby | Button brightness | P0→P1 | 어두운 버튼 | `brightbtn.json` (REVERTED) | `session/shots/060-ko-lobby.png` | — |
| Lobby | Layout | P1 | 비율 왜곡 | `lobby-native-layout.json` | `session/shots/060-ko-lobby.png` | — |
| Lobby | Portrait | P1 | 작은 초상화 | `face-atlas-expand.json` | `session/shots/080-char1-select.png` | — |
| Strategy | HUD labels | P0 | NO DATA | `hud-msgdat-groupfix.json` | `c002-grid-fallback/shots/001.png` | en011.jpg |
| Strategy | Stat labels | P0 | 모지바케 | `hud-hardcoded-stat-labels-ko.json` | `c002-grid-fallback/shots/001.png` | — |
| Strategy | Sector labels | P0 | Mixed encoding | `sector-label-hardcoded-ko.json` | `c002-grid-fallback/shots/001.png` | — |
| Strategy | Star names | P0 | Boundary cross | `galaxy-screen-starname*.json` | `c002-grid-fallback/shots/001.png` | — |
| Strategy | Fleet marker | P0 | 마커 미표시 | `strat-camera-focus.json` | `session/shots/095-fleet-marker.png` | en011.jpg |
| Strategy | Grid labels | P1 | NO DATA | `tactical-grid-msgdat*.json` | `session/shots/101-switch-strategic.png` | — |
| Strategy | Background | P2 | 저해상도 | `galaxy_back.tga` 교체 | `c002-grid-fallback/shots/001.png` | en011.jpg |
| Strategy | Minimap | P2 | 세부 정보 부족 | 미니맵 텍스처 | `c002-grid-fallback/shots/001.png` | en011.jpg |
| Tactical | Data complete | P0 | Placeholder crash | `LOGH_BATTLE_ENTRY_PROBE` | `session/shots/101-switch-strategic.png` | uu1.jpg, en008.jpg |
| Tactical | 3D models | P2 | 저폴리 | `Ship/*.mdx` 교체 | — | uu1.jpg |
| Tactical | Effects | P2 | 단순 효과 | `effect/*.tga` 교체 | — | en008.jpg |
| Tactical | Ship status | P1 | 패널 텍스처 | `battle/*.tga` | — | uu1.jpg |
| Planet | Location nav | P0 | 미구현 | C002 선결 | — | uu3.jpg, en10101010.gif |
| Planet | Duty cards | P0 | 패널 미오픈 | C002 선결 | — | uu3.jpg, 140660_card.jpg |
| Planet | Portrait place | P1 | 물리 배치 | Face/*.tcf | — | uu3.jpg |
| Planet | Facility menu | P1 | 서브 메뉴 | `gamemenu/*.tga` | — | 80952a_lobby.jpg |
| Command | Menu empty | P0 | rowCount=0 | `c002-force-scene-setup.json` | — | compnel1.jpg, en004.jpg |
| Command | Icons | P1 | 저해상도 | `command*.tga` 교체 | — | en004.jpg |
| Status | Character HUD | P0 | 잘못된 텍스트 | `hud-character-status*.json` | `c002-grid-fallback/shots/001.png` | ddcc72_status.jpg |
| Status | Ability values | P1 | 디코드 오류 | 서버 데이터 | `c002-grid-fallback/shots/001.png` | uu3.jpg |
| Chat | Input layer | P0 | 입력 안 됨 | RE 진행 중 | `c002-grid-fallback/shots/006-012.png` | en004.jpg |
| Chat | Font | P1 | 렌더 문제 | `font-face.json`, `font-cleartype.json` | — | en004.jpg |
| General | Resolution | P1 | 640 기준 | `lobby-res.json`, `GraphicConfig.txt` | 전체 | — |
| General | Watermark | P1 | dgVoodoo 표시 | `dgvoodoo-nowatermark.json` | 전체 | — |
| General | Cursor clip | P1 | 커서 유실 | `cursor-clip.json` (SPEC) | — | — |
| General | Texture quality | P2 | 레벨 0 | `GraphicConfig.txt` 상향 | — | — |
| General | AI upscaling | P2 | 생성형 부재 | `logh7_remaster_hud_tga.py` | — | — |

---

## 11. Dependency Graph (의존성)

```
C002 서브시스템 구성 (6-레이어)
  ├── 1. 패널 위젯 구성 (FUN_0054e570) ← c002-force-scene-setup.json
  ├── 2. catGate 전이 (FUN_004fd7a0)
  ├── 3. officer 데이터 (0x0325 756B 레이아웃 RE)
  ├── 4. 함대선택 (FUN_004f6600)
  ├── 5. 명령메뉴 build (FUN_004f5cb0)
  └── 6. 명령 dispatch (FUN_004f93c0 → 0x0b01)
       └── Planet interior (직무카드, 행성내장소)
       └── Command window (커맨드윈도우)
       └── Chat input (채팅 명령)

한글화 (병행 가능)
  ├── MsgDat constmsg 그룹 재배치 (hud-msgdat-groupfix, galaxy-screen*, tactical-grid*)
  ├── 하드코딩 CP932 → CP949 (hud-hardcoded-stat-labels-ko, sector-label*)
  └── 폰트 (font-face, font-cleartype)

그래픽 품질 (병행 가능)
  ├── dgVoodoo 워터마크 제거
  ├── GraphicConfig.txt LOD 상향
  └── 텍스처 AI 업스케일 (logh7_remaster_hud_tga.py)
```

---

## 12. Next Actions (권장 순서)

1. **P0 텍스트/레이블**: `hud-msgdat-groupfix`, `hud-character-status-msgdatfix`, `hud-hardcoded-stat-labels-ko`, `sector-label-hardcoded-ko`, `galaxy-screen*`, `tactical-grid*` — same-length 패치, 라이브 검증 빠름.
2. **P0 C002**: Layer 1 패널 위젯 구성 RE → `c002-force-scene-setup.json` 확장 또는 자연 트리거 구현.
3. **P1 버튼 밝기**: `brightbtn.json` draw-state selector RE 완료 후 적용.
4. **P1 로비/로그인 레이아웃**: `login-native-layout`, `lobby-native-layout` 라이브 재확인.
5. **P2 에셋**: `logh7_remaster_hud_tga.py`로 HUD 텍스처 드롭인 테스트.

---

*Document compiled from: `.omo/reference/CATALOG.md`, `.omo/ui-explorer/*/shots/`, `tools/client_patches/*.json`, `docs/SESSION-HANDOFF-2026-06-23.md`, `docs/logh7-playable-client-build.md`, `docs/logh7-original-ui-reference-2026-06-23.md`.*
