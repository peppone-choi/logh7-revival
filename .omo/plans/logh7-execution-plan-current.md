# LOGH VII 부활 — 실행 계획 (2026-07-16 갱신)

M4를 현재 병목으로 두고 production authority, 정본 데이터, 라이브 QA를 분리해 진행한다.

## 현재 위치 (근거 기반)

- M0.5/M1/M2/M3 완료: `4/8 = 50%`; 무거운 M4~M7을 반영한 전체 작업량 대표값은 `35%`다.
- **현재 병목은 M4**다. `createPlayableRuntime`가 production SQLite의 `EnterWorld`·`MoveGrid`에 동기 CQRS/UoW를 주입한다. 성공한 `0x0b01`만 cell과 `GridMoved` 1건을 커밋하며 거부 이동은 무변경이다.
- `0x030b`는 SQLite 함선 63행 중 라이브 안전 선두 19행을 body+4/stride `0x8c`로 전송한다. 20행 이상 admission 정지는 차단했지만 함선 마커 root `DAT_009d2fa8`과 전략 FSM state 2 정체는 미해결이다. 다음 payload 변경 전 exact runtime lookup을 입증한다.
- navigability는 현재 `0x0315 spaceCells ∪ systemCells`와 같고 policy 미주입 시 fail-closed다. 이는 runtime consistency일 뿐 canonical promotion이 아니며 passability/trust data는 provisional/blocked다.
- 원본 EXE live run3 8/8은 JSON store 증거라 production SQLite CQRS와 분리한다.
- fresh gate: UnitShip targeted `132/132`; full server `460 total / 458 pass / 0 fail / 2 pre-existing conditional skips`; Python `16/16`; changed JS LSP error `0`; cell `0` 무변경 probe.

## 미완 경계 (의존순)

1. 81개 catalog 중 factory 확인 2개·미해결 79개. PCP/MCP ledger, CP charge, timers/jobs, 실제 command outcome을 구현한다.
2. galaxy/fleet/facility/economy canon/data를 채운다. `0x0327` 미확정 stock은 근거가 생길 때까지 zero-fill한다.
3. disconnect `online=false`를 영속화하고 동기 SQLite bridge/UoW를 PostgreSQL용 async-capable 경계로 바꾼다.
4. M5 전술·전투를 구현한 뒤 M6 전체 한글화, M7 운영·리마스터로 간다. 일본어/`NO DATA`와 HD remaster는 미완료다.

## 실행 트랙

라이브 QA는 포트 `47900`을 독점하므로 직렬화한다.

- **A — M4 authority/data:** command ledger·cost·timer/job·outcome과 galaxy/fleet/facility/economy 근거를 연결한다.
- **B — persistence/ops:** disconnect와 async UoW를 닫고 PostgreSQL migration·backup을 잇는다.
- **L — live:** 각 M4 command의 실제 wire/UI 반영을 원본 EXE로 확인한다. JSON live 결과를 SQLite production 증거로 대체하지 않는다.

## 증거와 완료 게이트

- live run3: `.omo/live-qa/m4-cqrs-two-client-20260715-run3/results.json` 8/8, SHA256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`, cell `2587`, B notification delta `1`/miss `0`, relogin/restart retention, cleanup.
- run1/run2는 `0x0b01`이 없었던 실패 control이다. run3 harness 변경은 confirm `(1018,656) → (1018,642)`뿐이다.
- M4 완료 게이트는 command별 권위 상태 변경·비용·시간·결과와 client-visible 응답, 실패 무변경, SQLite/PostgreSQL 영속, 원본 EXE live evidence가 모두 있어야 닫힌다.

## 원칙

- 라이브 검증 없이 완료 주장 금지. 자동 테스트 통과를 자연 출력 성공으로 대체하지 않음.
- 정본 부재 값 지어내지 않음(원본 未実装은 0 유지, 채우면 P3 명시).
- 토큰 절약: 실행 haiku/worker, 설계·RE·판정 opus. 라이브 직렬.
- 커밋: 논리 단위 원자적, 정확한 파일만 stage.
