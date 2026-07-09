# LOGH VII 재현-상태 매트릭스 — 2026-06-25

원본 UI 레퍼런스 134장(`.omo/reference/`, `CATALOG.md`) 대비 리바이벌 재현 상태.
출처: 워크플로 `w62bxbk5a` screenshots 도메인(디스크 134장 재확인) + loop-state 라이브 증거.

## 레퍼런스 분포 (디스크 재확인, 합 134)

4gamer.net 35 · cdn.gamemeca.com 26 · game.watch.impress 34 · toshichan 19 ·
gamemeca/(레거시 uu1-3/en001-011) 12 · itmedia 5 · dengeki 3.

**toshichan 19장 = 화면-타입 명명**(1:1 매핑 가능, 캐논 재현 타겟):
strategy(전략맵) · compnel1/2/3(커맨드윈도우 ⑦=C002 타겟) · card(직무카드 ⑥) ·
lobby(시설 내 장소) · stay(拠点選択/기지 패널) · tactics/tactics2(전술맵) ·
captain/personal/status(인물/직무 스탯) · warp/rader/search/chat/panel/map/return(HUD).

## 9개 필수 카테고리 매트릭스

| # | 화면 | 캐논 레퍼런스 | 현 재현 상태 | 최대 시각 갭 | 게이트 |
|---|------|-------------|-------------|-------------|--------|
| 1 | 로그인 | (4gamer/impress) | ✅ 라이브 | — | — |
| 2 | 로비/시설 내 장소 | `toshichan/80952a_lobby.jpg`, `gamemeca/uu1-3` | ✅ 라이브(월드진입 달성) | 시설 내부 메뉴 항목 표시 | — |
| 3 | 캐릭터 생성 | (8단계 폼) | ✅ 라이브 | — | — |
| 4 | 전략맵 | `toshichan/74fcc3_strategy.jpg` | 🟡 부분(다색 항성+그리드+HUD 렌더) | **성계별 함대/전력 수치(예 타나토스 73000) 미매핑 렌더 경로** | 렌더 경로 RE |
| 5 | 커맨드 윈도우(⑦) | `toshichan/c8858b_compnel1.jpg`(+2/3) | 🔴 비작동 | command-table count=0, 메뉴 미populate | **C002**(클라 정적 카탈로그, fleet-render 선결) |
| 6 | 직무카드(⑥) | `toshichan/140660_card.jpg`, `gamemeca/uu3` | 🔴 레퍼런스만 | 패널 오픈/카드 렌더 전무 | C002(패널 오픈 클릭) |
| 7 | 기지/拠点選択 패널 | `toshichan/0a2715_stay.jpg` | 🔴 레퍼런스만 | 支配陣営名/統治者名/守備隊長名 미표시 | 패널 소비처 RE + 클릭 |
| 8 | 전술맵 | `toshichan/0285b9_tactics.jpg`, `0572d0_tactics2.jpg` | 🟡 부분(서버푸시 시 모드전환 UI 패널 출현, live10) | 풀 전술 배틀필드 렌더 미완 | 전술 시드 데이터 + mode-render 게이트 |
| 9 | 함대전 | `gamemeca/en004/008` | 🟡 서버권위 전투 구현(0x405/0x426) | 인-월드 시각 전투 렌더 미검증 | 전술맵 진입 |

## 핵심 함의

- **라이브 달성**: 로그인·로비·캐릭생성·전략맵 기본 렌더(1~4 기본).
- **공통 게이트 = C002**(5,6,7 시각 해금). 신규 확정(c002-impl): 명령 카탈로그는 **클라 정적 블롭**
  (`+0x3416d8`, FUN_004c4a10) → 서버 못 먹임. 유일 레버 = **활성 셀 아군 함대 선택가능화**
  (own-cell/fleet-render) → FUN_004f6b00 유효 idx → rowCount>0 → row 클릭 → 0x0b01.
- **성계 6개 갭**: galaxy.json 80성계 vs 레퍼런스 "86성계" 주장 — 미해소(전술 별개).

## 다음

- 라이브 ui_explorer 스크린샷 ↔ 캐논 레퍼런스 시각 diff로 카테고리별 갭 정량화.
- C002 라이브 클릭 실험(c002-impl nextAction): 월드진입+아군함대 렌더 후 fleet 위젯 클릭 →
  g_StrategyClient(0x5393830) +0xf4(→2)·+0xd4(rowCount>0)·+0xd6 판독.
