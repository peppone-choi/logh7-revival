# LOGH VII 활성 목표 장부 v2

작성일: 2026-06-30 KST

이 문서는 현재 `/goal` 원문을 대체하지 않는다. `/goal`은 그대로 보존하고, 사용자가 추가로 요구한 항목까지 합쳐 실제 작업 순서와 검증 상태를 관리하는 최신 장부로 쓴다.

## 원칙

- 실제 레거시 클라이언트에서 확인한 것만 `live-verified`로 표시한다.
- 서버 단위 테스트만 통과한 것은 `server-tested`로 표시한다.
- Ghidra/EXE 근거만 있는 것은 `RE-confirmed`로 표시한다.
- 추정, 개발용 더미, P2/P3 보강 데이터는 화면에 나오더라도 완성으로 부르지 않는다.
- 크래시와 런타임 에러는 숨기지 않고 원인을 고친다.
- Vite/React 화면은 레거시 게임 플레이 검증으로 인정하지 않는다.

## P0: 플레이 루트

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| 전략맵에서 전술맵 GUI까지 정상 전환 | 진행 중 | 전환은 되는 듯하지만 전술 GUI가 `NO DATA`/에러 상태. 전술 데이터 소비 opcode와 GUI 표시 함수를 다시 추적한다. |
| 전술맵 `NO DATA` 제거 | 미완료 | `FUN_00522010`, `FUN_005229d0` 등 literal `NO DATA` 반환 경로와 전술 데이터 테이블을 대조한다. |
| 전략맵 ↔ 전술맵 왕복 | 미완료 | 현재 왕복 루트는 live-verified 아님. |
| 로딩 백카드/모달 닫힘/런타임 에러 | 미완료 | live error window와 modal state를 캡처해 원인 함수에 연결한다. |
| 크래시 수정 | 미완료 | 크래시 회피가 아니라 crash site와 입력/데이터 원인을 고친다. |

## P0: 계정/세션

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| 세션 DB/메모리 레지스트리 관리 | 부분 구현 | `server/src/server/logh7-session-registry.mjs` 존재. live/session picker 검증 필요. |
| 기본 초기 세션 하나만 유지 | 부분 구현 | 서버 기본값 확인 및 테스트 보강 필요. |
| 세션 이름 `이제르론 서버` | 부분 구현 | 세션 선택 화면 live 확인 필요. |
| 세션 선택 일본어/임시 이름 제거 | 부분 구현 | `session-select-hardcoded-ko` 패치와 server data 양쪽 확인 필요. |
| 공개 회원가입 페이지 | 부분 구현 | `server/src/server/logh7-public-account-web.mjs` 존재. 사용자 기능으로 동작하는지 다시 테스트. |
| 가입 후 서버 계정 DB 생성 | 부분 구현 | 계정 registry 테스트와 실제 클라 로그인 연결 재검증 필요. |
| 가입 계정으로 레거시 클라이언트 로그인 | 부분 구현 | 최신 SHA/환경에서 live 재검증 필요. |
| 가입/로그인 후 기본 세션 선택값 | 미검증 | 클라 session picker와 서버 selected session state 확인 필요. |
| dev 실행 인자 제거/env 통합 | 미완료 | `LOGH_*` 잔존 env와 `ui_explorer start` 사용자 노출 경로 정리 필요. |

## P0: 캐릭터

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| 임시 캐릭터 대신 실제 신규 캐릭터 생성 | 부분 구현 | 0x1008 생성/0x2004 카드 목록 테스트 존재. 최신 live 확인 필요. |
| 생성 캐릭터 표시/선택 | 부분 구현 | 서버 테스트 있음. 사용자가 live에서 안 보임/선택 안 됨을 보고했으므로 재검증 필요. |
| 캐릭터 삭제 | 부분 구현, live 미통과 | 서버 0x2008 핸들러와 테스트 존재. 클라 상태머신이 기대하는 응답/refresh를 RE로 확정 중. |
| 삭제 메뉴가 플레이 선택으로 빠지는 문제 | 조사 중 | `FUN_0051a370` state 0x1b -> 0x29 -> 0x2a 흐름 및 `FUN_0043f040/70` delete serializer 확인 중. |
| 캐릭터 카드 `0세` | live-failing | 2026-06-30 font18 live smoke에서 `신참 0세`가 여전히 보임. 0x2004 서버 필드 수정만으로 해결되지 않았거나 기존 `dummy:1` 프로필/클라 표시 필드가 다름. 다음 RE 대상. |
| 성/이름/von/동서양식 이름 | 조사 필요 | 표시/생성/저장 필드 전체 RE 필요. |
| 캐릭터 필수 값 채우기 | 진행 중 | 0x0323/0x0356/0x2004 필드 누락 여부 점검 필요. |

## P0: 월드 데이터와 객체 노출

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| 행성/천체 표시 | 부분 구현 | `galaxy.json`, `planet-economy.json`, world-content exposure 존재. live 객체 표시 검증 필요. |
| 진영 데이터 표시 | 부분 구현 | faction/name consumer 문서 존재. live 미검증. |
| 함선 데이터 downlink | 부분 구현 | 0x0325/0x030b 관련 builder/test 존재. live 패널 표시 미검증. |
| 무기/전투기/육전대 | 부분 구현 | static info opcodes 존재 여부 재점검. 패널 표시 미검증. |
| 함정/전대/육전대/행성/요새 정보 패널 | 미완료 | 오른쪽 아래 아이콘 클릭 문제와 함께 확인. |
| 격자 함선 숫자 출력 | 미완료 | 전략 grid object count/label 소비 함수 확인 필요. |
| 격자/성계 국적 출력 | 미완료 | grid cell owner/faction 표시 경로 확인 필요. |
| 개발용 데이터 작성 | 진행 중 | 원작/매뉴얼/EXE 근거 우선, 없으면 P2/P3/DEV provenance 명시. |

## P0: 커맨드/상호작용

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| 직무카드 | 부분 구현/불안정 | 과거 0x0305/0x0307 충돌 정정 있음. 새 route로 재확인 필요. |
| 커맨드/제안/명령/처리/출병 대상 선택 | 부분 구현 | `logh7-command-targets`, `logh7-dev-command-cards`, executor 존재. live GUI 연결 미검증. |
| 전체 노출용 dev 카드 카테고리화 | 부분 구현 | dev card 모듈 존재. 제거 가능 분리와 live 노출 확인 필요. |
| 모든 소비 opcode 확인 | 진행 중 | opcode index/crossmap 문서와 전체 EXE 감사 결과를 연결한다. |
| 서버 데이터 opcode와 클라 소비 opcode 연결 | 진행 중 | RE-confirmed parser -> builder -> test -> live의 네 단계로 추적한다. |

## P0: 클라이언트/RE/텍스트/UI

| 항목 | 상태 | 증거/다음 작업 |
|---|---|---|
| CodeGraph 사용 | 완료 | `.codegraph` 초기화, 15,510 nodes / 48,296 edges sync 완료. |
| 표시 함수 203개 감사 | 완료, 적용 진행 | `RE/docs/logh7-display-function-audit-2026-06-30.md`. |
| 모든 EXE 함수 감사 | 완료, 적용 진행 | `RE/docs/logh7-exe-function-audit-2026-06-30.md`, 18,485 funcs. |
| 잘못 뜨는 텍스트 전수 수정 | 진행 중 | 표시 함수별 owner/constmsg/data path 연결 필요. |
| 오른쪽 아래 탭/아이콘 텍스트 | 미완료 | "게임을 중단합니다.", "사운드 설정" 오매핑 확인 필요. |
| 오른쪽 아래 아이콘 일부 클릭 안 됨 | 미완료 | font/layout/hitbox 보정과 버튼 enable gate 확인 필요. |
| 히라가나/카타카나 안내 한글화 | 조사 필요 | CP949/UTF-16LE/클라 byte width 제약 확인. |
| 폰트 크기 추가 확대 | live-smoke-verified | 2026-06-30 요청 반영: `font-readable-size`를 18px-ish로 상향. 새 canonical SHA `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c`, 바이트 `6a12`/`83c0059090` 확인. live smoke screenshots `font18-initial`, `font18-game-start`에서 메뉴/캐릭터 카드/뒤로 버튼 즉시 클리핑 없음. 전략/전술/모달은 추가 검증 필요. |
| 폰트 변경 후 UI 좌표 보정 | 진행 중 | lobby/character selection 일부 보정 완료. 전략/전술/모달은 남음. |

## 현재 우선순위

1. 캐릭터 삭제/선택 흐름: RE로 클라 기대 응답 확정 후 서버 수정과 live 검증.
2. 전술맵 `NO DATA`/모달/런타임 에러: literal 반환 함수와 전술 데이터 opcodes를 매칭.
3. 행성/진영/함선/부대/무기: 이미 있는 builder와 content를 실제 패널/객체 표시까지 연결.
4. 전략/전술 왕복과 오른쪽 아래 아이콘: hitbox, command dispatch, state transition을 live로 확인.
5. loop-state 갱신: 매 작업마다 RE/server-test/live 상태를 분리해 기록.
