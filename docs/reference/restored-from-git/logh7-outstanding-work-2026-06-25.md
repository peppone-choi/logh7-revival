# LOGH VII 미결 작업 통합 레지스터 — 2026-06-25

사용자 지시 폭주 정리(컨텍스트 압축 대비 단일 진실원). 관련 상세 = `SESSION-HANDOFF-2026-06-25.md`,
`logh7-client-state-journal.md`, `logh7-remaster-roadmap-2026-06-25.md`, `logh7-completion-matrix-2026-06-25.md`.

## 이번 세션 달성(✅)
- ★실유저 수동 로그인(autologin 없이)→캐릭생성→월드진입 full flow (창모드 로그인→1920 풀스크린 자동전환, 0x7000→0x0f02).
- ★캐논 NPC 위계 시드 라이브(0x0323 ×26)=자동황제 픽스 실증(서버 1151 PASS).
- ui_explorer 창모드 지원+ClientToScreen 좌표. 로그인폼 좌표 정정(374,290/376,318/352,347).
- 매뉴얼→데이터 11 JSON. MDX 위치부재 확정. 갤럭시 웹검증(2회랑/사르가소). 레퍼런스 134장 시각카탈로그.

## 미결 작업(우선순위 순)

| # | 작업 | 상태 | 핵심 |
|---|------|------|------|
| W1 | **signup-first 실계정 흐름** | next | accept-any 우회 말고 진짜 회원가입. `logh7-admin.mjs adminCreate(dbPath,acct,pw)`(scrypt+GIN7)로 계정생성→`--account-db`로 **strict 로그인**. React SPA(src/main.jsx)는 데모→실 registry 배선 검토. 웹 signup 폼 동작화 |
| W2 | **UI 버튼 전체 좌표 맵** | next | ad-hoc 금지. 로그인폼+로비메뉴7+로비서브메뉴+캐릭생성8단계+인월드HUD 좌표를 `docs/logh7-ui-coordinate-map.md`로 |
| W3 | **대기화면(로비) UI 재배치** | partial | `lobby-native-layout.json`(13패치 RE확정, 미적용)+`lobby-res`+charsel/gamemenu-right/soukan-hud/window-dialog-native-layout 완성→스택적용→라이브검증. 현재 기본레이아웃 스케일 |
| W4 | **로비 메뉴 5종 동작** | partial | 게임시작(150,200)/새캐릭작성(150,255 ✅)/캐릭삭제(150,375)/세션변경(150,435)/환경설정(150,495). 각 서버핸들러 검증+구현 |
| W5 | **캐릭 삭제+재생성 distinct** | in_progress | 사용자: Reinhard 삭제→새로. 삭제=로비기능(서버 delete 핸들러 구현여부 미확인). 별개캐릭=초상화여러개+이름다르게 |
| W6 | **NPC 시드 정제** | next | rank 클램프(현재 title만), NPC명 unmask(캐논명 노출), 소스=canon-initial-cards.json(매뉴얼인물 한정), 라이브 기본 effective화 |
| W7 | **매뉴얼 데이터 배선** | next | content/manual 11종(session/character/terrain/ranks/cards/operations/logistics/combat/canon-initial-cards/troops/ship-verify)→서버 소비 배선 |
| W8 | **갤럭시 위치/지형** | next | galaxy.json 위치권위 정제(p101), terrain필드(plasma/sargasso 수동큐레이션), 특수천체(bh3/ns3) 위치. 전략맵 미니맵 위젯 라이브확인 |
| W9 | **로그인 버튼 배경 스프라이트 누락** | bug | draw-state 이슈. 클릭은 작동하나 배경 안 그려짐 |
| W10 | **in-world 상호작용(C002)** | blocked | 명령메뉴/선택 서브시스템. fleet-render own-cell 선결+라이브 클릭실험 |
| W11 | **리마스터** | next | HUD/UI 텍스처(6% TGA), 모델(0% MDX). AI 초해상 바이너리 부재 |

## 실행 순서(프론트엔드 흐름 우선 — 사용자 강조)
W1(signup) → W2(버튼맵) → W3(대기화면 재배치) → W4/W5(메뉴+캐릭) → W6(NPC정제) → W7(매뉴얼배선)
→ W8(갤럭시) → W10(C002) → W11(리마스터). W9는 W3와 함께.

라이브 검증은 메인 직렬(stop 시 SHA 복원). 서버구현은 워크플로/에이전트 병렬 가능.
