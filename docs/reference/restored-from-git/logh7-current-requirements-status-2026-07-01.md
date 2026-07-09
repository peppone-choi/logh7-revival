# LOGH VII Current Requirements / Status - 2026-07-01

이 문서는 현재 목표와 사용자 요청을 한곳에 모은 최신 요구사항 레지스터다. 기존 문서가
`active-goal-register`, `completion-matrix`, `manual-feature-condition-audit`, `loop-state`로
나뉘어 있어, 실제 진행 판단은 이 문서를 우선 보고 세부 근거 문서로 내려간다.

## 현재 정리 수준

- 요구사항 수집: 높음. 대화에서 나온 핵심 요구는 아래 항목으로 반영했다.
- 근거 연결: 중간. 일부는 매뉴얼/EXE/테스트 근거가 붙어 있고, 일부는 아직 live 검증이 없다.
- 실제 플레이 가능 상태: 낮음. 월드 진입과 전략맵 표시는 일부 확인됐지만, 전술 GUI/객체 풀과 상호작용 루프는 아직 미완성이다.
- 완료 표현 금지: "모드 전환만 성공"처럼 확인된 수준만 말한다.

## 상태 표기

- 완료: 테스트 또는 live로 확인됨.
- 부분: 코드/데이터는 있으나 live나 소비 화면 검증이 부족함.
- 진행 중: RE/구현/테스트가 이어지는 중.
- 미검증: 요구사항은 등록됐지만 확인 증거가 부족함.
- 차단: 특정 클라이언트 상태/데이터 게이트 때문에 다음 단계가 막힘.

## 1. 계정 / 세션 / 시작 흐름

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 세션은 DB/메모리 레지스트리로 관리 | 부분 | `server/src/server/logh7-session-registry.mjs` 존재 | 세션 선택 live와 registry 단일 출처 검증 |
| 기본 초기 세션은 하나만 둠 | 부분 | 세션 registry 기본값 구현 흔적 | 기본값이 하나만 내려오는지 테스트/라이브 확인 |
| 세션 선택 이름은 `이제르론 서버` | 부분 | 세션 이름 수정 요구 등록 | 0x2006 응답과 클라 표시 스크린샷 확인 |
| 세션 선택 화면의 일본어/임시 이름 제거 | 부분 | 서버 데이터와 클라 하드코딩 양쪽 의심 | 0x2006 소비 함수와 클라 literal 추적 |
| 공개 회원가입 페이지는 유저 기능 | 부분 | `logh7-public-account-web.mjs` 존재 | 어드민 경로가 아닌 공개 라우트 검증 |
| 가입 시 서버 계정 DB에 생성 | 부분 | account registry 구현 흔적 | 가입 후 DB/파일/메모리 상태 확인 |
| 가입 계정으로 레거시 클라이언트 로그인 | 부분 | 로그인 경로 구현 흔적 | 실제 클라 로그인 live 검증 |
| 가입/로그인 후 기본 세션 선택값 설정 | 미검증 | 요구사항 등록 | account -> session binding 상태 확인 |
| 클라/서버 실행 인자를 없애고 env로 관리 | 진행 중 | 요구사항 등록 | 남은 CLI 인자와 `LOGH_*` 환경값 정리 |
| `LOGH_*` 환경값을 통합 env로 합침 | 진행 중 | 요구사항 등록 | 서버/RE tools/launcher env map 재검토 |
| `ui_explorer start` 같은 dev 명령은 유저용이 아님 | 진행 중 | 요구사항 등록 | dev-only 문서/명령과 사용자 실행 경로 분리 |

## 2. 캐릭터 생성 / 삭제 / 선택 / 표시

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 임시 캐릭터가 아니라 실제 신규 캐릭터 생성 | 부분 | 0x1008 생성, 0x2004 카드 목록 테스트 존재 | 생성 캐릭터가 계정 registry에 남고 재표시되는지 live 확인 |
| 생성된 캐릭터 표시/선택 정상화 | 부분 | 사용자 live에서 안 보임/선택 실패 보고 | 0x2004/0x0323/0x0356 필드와 UI 소비 함수 연결 |
| 캐릭터 삭제 정상화 | 부분, live 미통과 | 0x2008 핸들러/테스트 존재 | 삭제 메뉴가 플레이 선택으로 빠지는 상태머신 RE |
| 선택된 캐릭터가 월드 HUD/명령 상태에 반영 | 미검증 | 요구사항 등록 | active player record 0x0204/0x0323/0x0356 live 비교 |
| 황제/placeholder fallback 제거 | 진행 중 | 사용자 live에서 여전히 placeholder 지적 | fallback 생성 지점과 서버 기본 프로필 제거 |
| 캐릭터 필수 값 전부 채움 | 진행 중 | 매뉴얼상 성명, 성별, 생년월일, 신분, 계급, 출신 등 필요 | 0x0323/0x034f/0x0356 필드 전체 매핑 |
| 성/이름/von/동서양식 이름 구분 확인 | 조사 필요 | 사용자 요구 | EXE 표시 함수와 입력 serializer RE |
| `0세`/나이 표시 위치 | 보류 | age label은 원 EXE 동작일 수 있어 "그대로 가라"로 정리 | 굳이 고치지 않음. 다만 필드 오배선은 계속 감시 |

## 3. 전략맵 / 성계 / 행성 / 천체 / 진영 / 함선

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 행성/천체가 내려오고 화면/객체로 드러남 | 부분 | `galaxy.json`, `planet-economy.json`, world exposure guard | 0x031f/0x0321 패널 live 확인 |
| 성계맵 검증 | 부분 | 85 시스템, 80 positioned, 5 coordinate-pending 문서화 | 5개는 원 서버 소실 데이터로 표시하고 P3 좌표를 canon 승격 금지 |
| 진영 데이터가 내려오고 표시 | 부분 | faction projection 관련 문서/코드 존재 | 캐릭터/함대/성계 owner 표시 live 확인 |
| 함선 데이터 downlink | 부분 | 0x0325 unit/fleet, 0x030b ship master 구현/테스트 | 기본 live delivery 켜고 함선/전대 패널 확인 |
| 무기/전투기/육전대는 원작 근거 우선 | 부분 | 매뉴얼 감사에 ship/fighter/weapon/troop 항목 등록 | static master 0x030b/0x030d/0x030f/0x0311 출처 라벨 고정 |
| 함정/전대/육전대/행성/요새 정보 패널 표시 | 미완료 | 사용자 live에서 안 나온다고 보고 | 우측 하단 아이콘 클릭/패널 request opcode 확인 |
| 격자의 함선 숫자 출력 | 미완료 | 요구사항 등록 | 전략 grid cell unit count 소비 함수 RE |
| 격자와 성계의 국적 출력 | 미완료 | 요구사항 등록 | 0x0315 cell owner, system owner, faction label 연결 |
| 장소별 배경/황거 등 장소 문구 확인 | 진행 중 | constmsg/장소 문자열 추적 요구 | constmsg 역추적, location id -> background mapping RE |
| 서버에 없는 데이터는 개발용으로 작성 | 진행 중 | 정책 등록 | P0/P1/P2/P3 provenance를 데이터에 명시 |

## 4. 전략맵 ↔ 전술맵 / 전투 진입

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 전략맵에서 전술맵 전환 | 부분 | 사용자 확인: 전술맵으로 "바뀌긴" 함 | 모드 전환만 성공으로 기록 |
| 전술 GUI와 객체 표시 | 차단 | `NO DATA`, object pool 미생성 상태 | 0x0317 selector byte와 `client+0x126711` gate live probe |
| 0x033b 전술 unit ship crash 수정 | 부분 | `FUN_00421f80` layout RE, 즉시 crash 제거 | live에서 패널/object 표시까지 확인 필요 |
| 전술맵 NO DATA 제거 | 미완료 | `FUN_00522010`, `FUN_005229d0` literal 경로 조사 대상 | 전술 데이터 request/push 순서 확정 |
| 전략맵 ↔ 전술맵 왕복 | 미검증 | 왕복 live 증거 없음 | tactical entry/exit notify와 pool release 추적 |
| 크래시는 회피가 아니라 원인 수정 | 진행 중 | 런타임 에러창 반복 보고 | crash site, modal state, 입력 데이터 연계 |
| 로딩 백카드/모달 닫힘 | 미완료 | 자동반복 중 누락 지적 | modal owner/window state와 click/hitbox 확인 |
| 워프 항행/월드 진입 반복 문제 | 진행 중 | 워프는 넘어가나 월드 진입 반복 보고 | state transition notify와 server tick 상태 추적 |

## 5. 직무카드 / 커맨드 / 제안 / 명령 / 출병

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 직무카드 동작 | 부분 | 0x0305/0x0307 관련 builder/test 존재 | live GUI 카드 목록과 권한 gate 확인 |
| 커맨드/제안/명령/처리/출병을 드러냄 | 부분 | command engine/dev card 존재 | 각 명령의 target requirement schema 작성 |
| 대상이 필요한 상호작용은 필요할 때 대상 입력 | 진행 중 | 사용자 요구 | fleet/grid/base/character/resource target picker 연결 |
| 카드 자체는 각 권한 카드 | 진행 중 | 매뉴얼상 personal/captain/job cards | 권한/직무/계급/소속별 카드 조건 확정 |
| 전체 노출용 dev 카드는 카테고리별 | 부분 | dev command cards 존재 | 전략/전술/행성/함대/인사/정치/첩보 등 분리 |
| dev 끝나면 제거 가능하게 둠 | 진행 중 | 요구사항 등록 | dev-only flag/module boundary 고정 |
| 매뉴얼 81개 전략 명령과 조건 반영 | 부분 | `strategy-commands.json`, manual audit | cost/wait/result/eligibility/state change 채우기 |
| 소비 opcode와 서버 emit opcode 전체 연결 | 진행 중 | opcode coverage/crossmap 문서 존재 | parser -> builder -> test -> live 4단계 표로 갱신 |

## 6. 텍스트 / UI / 클라이언트 패치

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 잘못 뜨는 텍스트 전수 수정 | 진행 중 | display function audit, constmsg 분석 요구 | 표시 함수별 owner/constmsg/data path 연결 |
| 텍스트 setter 203개 후보 확인 | 진행 중 | `RE/docs/logh7-display-function-audit-2026-06-30.md` | 후보별 실제 화면 연결 |
| EXE의 모든 함수 분석 | 진행 중 | `RE/docs/logh7-exe-function-audit-2026-06-30.md` | 우선순위: 표시/입력/상태/네트워크 |
| 오른쪽 아래 두 탭 텍스트 오매핑 | 미완료 | "게임을 중단합니다.", "사운드 설정" 오매핑 보고 | icon/button id와 constmsg index 재확인 |
| 오른쪽 아래 일부 아이콘 클릭 불가 | 미완료 | 사용자 live 보고 | hitbox/font layout/button enable gate 확인 |
| 폰트 크기 18px | 완료, 추가 검토 가능 | font18 live smoke 문서화 | 더 커졌을 때 좌표/클리핑 재검증 |
| 폰트 변경 후 UI 좌표 보정 | 진행 중 | lobby 일부 보정, 전략/전술/모달 남음 | 모든 화면 좌표/hitbox smoke |
| 히라가나/카타카나 안내를 한글화 | 조사 필요 | CP949/UTF-16LE/byte width 제약 이슈 | 문자열 슬롯별 byte budget 확인 |
| 클라 하드코딩이면 클라를 고침 | 진행 중 | 요구사항 등록 | 서버 데이터로 안 되는 화면은 patch 대상화 |

## 7. 매뉴얼 / EXE / 데이터 근거

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 두 가지 버전의 매뉴얼로 기능/조건 더블체크 | 부분 | `gin7manual.pdf`, `gin7manual_unlocked.pdf`, `gin7manual-alt.pdf` audit | 기능별 main/alt page와 조건 차이 표 유지 |
| 매뉴얼 다른 판본의 장소/배경 정보 확인 | 진행 중 | alt manual 존재 | location/background 관련 문구 추출 |
| JSON 스키마만 믿지 않고 새로 RE | 진행 중 | 사용자 요구 | JSON은 후보, EXE/parser/wire로 확정 |
| constmsg 전체 분석 | 진행 중 | 사용자 요구 | 장소/버튼/상태/오류 문자열 역참조 |
| 서버에서 내려주지 않는 건 클라/constmsg/EXE에 있음 | 진행 중 | 정책 등록 | client literal -> caller -> UI surface 추적 |
| codegraph 사용 | 완료, 지속 사용 | `.codegraph` 존재, 15,510 nodes / 48,296 edges sync 기록 | large RE navigation에 계속 사용 |
| lazycodex 사용 | 요구 등록, 적용 방식 확인 필요 | GitHub repo는 agent harness/verified completion 도구 | 설치/명령 사용 가능성 별도 확인 후 실제 루프에 적용 |
| 라이브 클라이언트 검증과 RE 반복 | 진행 중 | ui_explorer/live session 문서 존재 | 한 번에 하나의 가설만 live로 검증 |

## 8. 문서 / 운영 규칙

| 요구사항 | 현재 상태 | 근거 | 다음 작업 |
|---|---|---|---|
| 지금까지 요구한 사항을 리스트화 | 완료 | 이 문서 | 변경 시 이 문서를 먼저 갱신 |
| 문서 수정도 같이 진행 | 진행 중 | 관련 docs 다수 | 구현/RE/live 결과를 상태표에 반영 |
| 완성이라고 말하지 않음 | 완료, 계속 준수 | 사용자 요구 | final/report에서 확인 수준만 표시 |
| 전략맵에 갇히는 문제를 최우선 플레이 루트로 해결 | 진행 중 | 목표 핵심 | tactical GUI/object pool unblock이 다음 최우선 |

## 바로 다음 우선순위

1. 전술 GUI `NO DATA` 해소: 0x0317 selector, `client+0x126711`, `client+0x126718` pool gate를 live probe로 확인한다.
2. 캐릭터 실제 생성/선택/삭제: account registry, 0x2004, 0x0204, 0x0323, 0x0356을 한 경로로 묶는다.
3. 함선/행성/진영/격자 표시: 0x030b, 0x0325, 0x0313, 0x0315, 0x031f, 0x0321의 기본 downlink와 패널 소비를 확인한다.
4. 직무카드/명령 target schema: 매뉴얼 81개 명령을 대상/조건/결과로 변환하고 dev card에서 모두 노출한다.
5. 텍스트/아이콘/hitbox: 우측 하단 패널, 모달, session picker, font18 좌표를 화면별로 검증한다.

