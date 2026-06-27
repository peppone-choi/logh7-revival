---
description: LOGH VII 루프 엔지니어링 사이클을 1회 실행한다 (maker/checker 분리, 상태 파일 주도)
argument-hint: "[P0 항목 id 예: P0-02 | auto]"
---

LOGH VII 루프 엔지니어링 사이클을 **1회** 실행한다. 운영 원칙은 `docs/logh7-loop-engineering.md`를 따른다.

대상 항목: `$ARGUMENTS` (비어 있으면 `docs/logh7-loop-state.md`의 첫 번째 `next` 또는 `blocked-needs-evidence` 항목 하나를 고른다).

## 절차 (정확히 이 순서)

1. **상태 읽기.** `AGENTS.md`, `docs/logh7-current-work-register-2026-06-17.md`, `docs/logh7-loop-engineering.md`, `docs/logh7-loop-state.md`를 읽는다. 항목 하나만 고른다.
2. **RE 프리패스 + 증거 수집.** `logh7-loop-explorer` 서브에이전트를 호출해 선택 항목의 RE 프리패스를 자동 수행한다(관련 manual/PDF, 설치 DB/MsgDat/TCF/MDX, EXE 소비 함수, 정적 VA/오프셋, 직전 trace/screenshot). 증거 없이 다음 단계로 가지 않는다.
3. **구현(필요 시).** explorer 증거가 변경을 정당화할 때만 최소 수정한다. 추측성 서버 데이터/번역 문자열을 기본값으로 승격하지 않는다. 데이터 등급(P0/P1/P2/P3)을 코드/문서에 표기한다. 서버는 AI가 작성한 것이므로 필요하면 수정한다.
4. **테스트/문법.** `npm run test:server`(또는 영향받은 `node --test tests/server/<관련>.test.mjs`)와 문법 검사를 돌린다. `run_in_background`로 돌려도 된다.
5. **적대적 검증.** `logh7-loop-verifier` 서브에이전트를 **별도 패스**로 호출한다. maker가 자기 작업을 self-approve하지 않는다. verifier는 실클라/trace/DB/EXE SHA 증거를 요구하고 반례를 찾는다.
6. **실클라 표면(가능 시).** 좌표/마커·한글·전략 명령처럼 실제 클라이언트로만 닫을 수 있는 항목은 `tools/logh7_ui_explorer.py`로 캡처한다. 끝나면 **반드시** 모든 `ui_explorer` 세션을 `stop`으로 닫고, port/process를 정리하고, canonical EXE SHA 복구를 확인한다. Vite/React 화면은 게임 검증으로 세지 않는다.
7. **상태 갱신.** `docs/logh7-loop-state.md`에 증거 경로, 남은 blocker, 다음 항목을 적는다. 이 파일은 사이클 종료 시 메인 에이전트만 수정한다.

## 완료(정지) 조건

`docs/logh7-loop-engineering.md`의 정지 조건을 따른다. 한 사이클은 위 7단계를 마치면 닫는다. 전체 루프는 모든 P0 항목이 `done`이고 실클라 증거가 남았을 때만 닫는다.

## 결정론적 변형

여러 사이클을 자동으로 돌리려면 슬래시 대신 Workflow를 쓴다: `Workflow({ name: "logh7-loop", args: { item: "P0-02", cycles: 1 } })` — explorer→maker→tester→verifier를 결정론적으로 파이프라인한다(`.claude/workflows/logh7-loop.js`).
