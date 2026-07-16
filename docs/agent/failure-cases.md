# Failure Cases — 재발 방지 오류 메모리

발표문이 아니라 **재발 방지용 메모리**다. 새 실패를 겪으면 OBSERVED로 추가한다.
OBSERVED = 이 저장소에서 실제 확인·문서화된 사례. PREVENTIVE = 실제 사례는 없으나 예방 규칙.

## AI-Failure-001: 증거 없는 과거 통과 기록을 릴리스 게이트로 재사용

- Status: OBSERVED
- Category: 허위 완료 / 증거 관리
- Trigger: 과거 세션의 "통과" 요약(run9 멀티플레이, run3/run5, 서버 460 pass, Python 16/16)을 근거로 현재 상태를 검증됐다고 보고하려 함.
- Incorrect behavior: 원증거(로그·스크린샷)와 당시 exact patch EXE 계보 영수증이 현재 checkout에 없는데도 fresh gate로 재사용.
- Detection signal: 증거 파일 경로·sha256 영수증을 요구했을 때 제시 불가.
- How it is caught: `docs/agent/verification.md` 보고 규칙 — 수치는 historical baseline이며 exact 명령·환경 재실행 전에는 fresh gate 아님.
- Immediate recovery: 해당 주장을 "historical baseline"으로 정정하고, 재실행 계획 또는 "미검증" 명시.
- Recovery prompt: "방금 통과라고 보고한 각 항목에 대해 (1) 실행한 exact 명령 (2) 종료 코드 (3) 산출물 경로를 제시하라. 셋 중 하나라도 없으면 그 항목을 '미검증(historical baseline)'으로 재분류하고 보고를 다시 작성하라."
- Permanent prevention: `verification.md` 보고 규칙, `.ai/current-state.md`의 Verification run/result 분리 기록.
- Related rule: `verification.md`, `coding-rules.md` Preferred.
- Evidence: `docs/logh7-roadmap-current.md` 현재 상태 절 (run9/run3/run5 원증거 부재 판정, 2026-07-16).

## AI-Failure-002: 클라이언트 수용 한계 미확인 데이터 확장 (0x030b admission 정지)

- Status: OBSERVED
- Category: 잘못된 전제의 자동 확산 / 라이브 검증 생략
- Trigger: SQLite 함선 catalog 63행을 `0x030b`로 전량 전송하도록 확장.
- Incorrect behavior: 원본 클라이언트의 수용 한계를 확인하지 않고 서버 데이터 기준으로 전송량을 늘림 → 20행 이상에서 클라이언트 admission 정지 재현.
- Detection signal: 라이브 접속 시 클라이언트가 월드 진입 단계에서 멈춤.
- How it is caught: 라이브 QA (원본 클라이언트 = 호환 오라클) — 테스트만으로는 잡히지 않음.
- Immediate recovery: 선두 19행 slice로 롤백.
- Recovery prompt: "클라이언트 가시 변경을 되돌려라: 마지막으로 라이브에서 수용이 확인된 slice/값으로 복원하고, 확장은 클라이언트 수용 한계를 라이브에서 단계적으로 확인한 뒤 1단계씩 진행하라. 각 단계의 라이브 증거를 남겨라."
- Permanent prevention: 와이어·클라이언트 가시 변경은 라이브 증거 필수 (`verification.md` 행렬), 원본 클라이언트를 호환 오라클로 취급.
- Related rule: `verification.md` 와이어 행, `docs/logh7-roadmap-current.md` M4 절.
- Evidence: `docs/logh7-roadmap-current.md` — "20행 이상은 admission 정지를 재현하므로 금지".

## AI-Failure-003: 기술적 환각 — 리셋 전 경로·미검증 API·존재하지 않는 명령

- Status: PREVENTIVE
- Category: 기술적 환각
- Trigger: 2026-07-05 전체 리셋 이전 문서(`logh7-requirements-current.md` 등 역사 문서)의 코드 경로를 현재 코드로 신뢰, 또는 학습 지식의 API·CLI 옵션을 검증 없이 사용.
- Incorrect behavior: 존재하지 않는 파일 경로 참조, 현 Node 버전에 없는 옵션 사용, 설치되지 않은 도구(pytest 등) 실행을 전제.
- Detection signal: `node --check`·테스트·훅의 즉시 실패, rg/ls로 경로 부재 확인.
- How it is caught: PostToolUse 검증 훅(구문), `verification.md` 실재 명령 목록, codegraph 조회.
- Immediate recovery: 경로·명령을 저장소 실사로 재확인하고 잘못된 참조를 수정.
- Recovery prompt: "방금 참조한 파일 경로·명령·API 각각에 대해 저장소 내 실재 근거(ls/rg 출력, package.json, 실제 사용 예)를 제시하라. 근거가 없는 항목은 제거하거나 UNKNOWN으로 표시하고 다시 진행하라."
- Permanent prevention: 역사 문서의 코드 경로 불신 규칙, `tool-capabilities.md`의 설치 실사 표.
- Related rule: `context-strategy.md` (historical 문서 배제), `tool-capabilities.md`.
- Evidence: 없음 (예방 목적 — 실제 발생 시 OBSERVED로 승격).

## AI-Failure-004: 범위 이탈 — 요청하지 않은 리팩터링·외부 코드 이식

- Status: PREVENTIVE
- Category: 범위 이탈
- Trigger: 버그 수정 중 "주변 정리", 참고 레포(MHServerEmu 등) 코드의 직접 이식, CP932 자산의 임의 UTF-8 변환, `client-unity/` 임의 부활.
- Incorrect behavior: `.ai/task.md` 계약 밖 파일 수정, 라이선스가 다른 외부 코드 복사, 승인 없는 의존성 추가.
- Detection signal: `git diff --stat`에 계약의 Allowed files 밖 파일 등장.
- How it is caught: `/implement` 전제 조건(계약·소유 확인), 리뷰 단계의 diff 대조, stop-doc-gate가 변경을 가시화.
- Immediate recovery: 범위 밖 변경을 되돌리고(`git checkout -- <파일>`, 단 다른 에이전트 변경은 건드리지 않음), 필요하면 계약 갱신을 사람에게 요청.
- Recovery prompt: "`git diff --stat` 결과를 `.ai/task.md`의 Allowed files와 대조하라. 계약 밖 변경은 각각 (a) 되돌리거나 (b) 왜 필요한지 한 줄 근거와 함께 계약 갱신을 요청하라. 어느 쪽인지 파일별로 명시하라."
- Permanent prevention: `.ai/task.md`의 Allowed/Protected files, `coding-rules.md` Preferred (외부 코드 이식 금지).
- Related rule: `.claude/commands/implement.md`, `coding-rules.md`.
- Evidence: 없음 (예방 목적).
