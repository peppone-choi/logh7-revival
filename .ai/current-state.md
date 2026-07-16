# Current State

- Updated at: 2026-07-16
- Active agent: Claude Code (메인 세션, Advisor) + 서브에이전트
- Branch: feat/ai-work-system (베이스라인 34b4b36d, main 0e64a152에서 분기)
- Current phase: AI 업무 시스템 고도화 — Phase 2 완료(게이트 PASS), Phase 3 대기
- Completed: 딥 인터뷰 스펙(9.0% PASSED) → ralplan 합의 → 전면 승인 → 브랜치·베이스라인(34b4b36d) → 계약 ACTIVE → **P0-0 스파이크 FEASIBLE** — E2E 슬라이스 확정: `SRV-CORR`(서버 correlation 레코드 builder/validator, 신규 `server/src/server/logh7-correlation-record.mjs` + `logh7-playable-server.mjs:258 writeTrace` 배선, 테스트 `server/tests/logh7-correlation-record.test.mjs`, Sentry 경로 = validate throw). 차선: FRAME-OBS
- In progress: 없음 — Phase 2 완료, Phase 3(E2E SRV-CORR)는 착수 전 task.md allowed-files 확장 필요
- Phase 2 산출물: 2A/2B `.github/workflows/ci.yml`(Node 24 LTS, npm ci+test)·`claude.yml`(GHA v1, 커스텀 리뷰 규칙 5종+방어적 맥락)·`.coderabbit.yaml`(ko-KR, negative path filter 4종) / 2C `@sentry/node@10.66.0` + `main.mjs` env-guard(동적 import — 정적 import는 모듈 로드 5.3초로 테스트 2건 timeout 회귀 유발해 전환) / 2D `.mcp.json`(code-review-graph+atlassian **`/v1/mcp` http로 갱신** — SSE는 2026-06-30 지원종료 공지)·settings.local allowlist 전환(enableAll:false)·`.gitignore`·Jira 분해 루틴(lifecycle-planning)·verification.md 행 추가(+6/-0)·헌법 각 +1줄
- 사람 셋업 점검(2026-07-16, 사용자와 공동 진행, 4/4 완료): ①GitHub Secret `ANTHROPIC_API_KEY` 등록 확인(`gh secret list`) ②CodeRabbit App 설치 — 사람 확인, 라이브 검증은 첫 PR ③Sentry 프로젝트+DSN — `~/.zshrc` 환경변수 보관(repo 미기록), 에이전트 비대화형 셸은 `source ~/.zshrc` 필요 ④Jira — 신규 사이트 `pepponechoi-jira.atlassian.net`, **이 세션의 atlassian MCP 직접 OAuth로 접근 확인**(프로젝트 1개: 키 `SCRUM` "내 소프트웨어 팀"; claude.ai Rovo 커넥터는 여전히 옛 사이트만 grant)
- Files changed: Phase 1 전체 — key-facts.md·inject-key-facts.sh(×2)·stop-doc-gate.sh(×2)·settings(×3) / prompt-pack.md(+6팩)·커맨드 7종 / context-strategy·스텁 2건·TL;DR 3건 / CLAUDE.md·AGENTS.md(추가만)
- Verification run: Phase 2 종료 게이트(메인 세션 신규 실행) — YAML 3건+JSON 2건 파싱, 시크릿/DSN 스캔 0건, 헌법 diff +1/-0×2, verification.md 삭제줄 0, `cd server && npm test`(489/485 pass/0 fail/4 skip, exit 0), `node --check main.mjs`, 무DSN 부팅 스모크(47900 기동+`[sentry] DSN 미설정 — 비활성` 로그), settings.local allowlist 상태 확인, Jira 신규 사이트 프로젝트 조회 성공
- Verification result: PHASE2_GATE=PASS (전부 exit 0). 라이브 미검증(push 승인 후 가능): GitHub Actions 첫 런 녹색, CodeRabbit·Claude GHA 실제 PR 코멘트, 실 DSN Sentry 캡처
- Failed approaches: 없음
- Open questions: Phase 3 착수 시 `.ai/task.md` allowed-files에 신규 `server/src/server/logh7-correlation-record.mjs` 명시 확장 / Jira 프로젝트 키 `SCRUM`→`LOGH7` rename 여부(사람 결정, 이슈 생성 전) / 향후 세션에서 Jira 쓰려면 사람이 settings.local `enabledMcpjsonServers`에 `"atlassian"` 추가(의도적 활성화 정책) / 이슈 생성(Jira·GitHub)은 외부 서비스 쓰기 = 사람 승인 후
- Next action: push·PR 사람 승인 → CI/CodeRabbit/Claude GHA 라이브 확인 → Phase 3 E2E(SRV-CORR)
- Must-read files for next action: `.omc/plans/logh7-ai-work-system-plan.md` §3, `.ai/task.md`, `docs/agent/verification.md`
