# Tool Capabilities

마지막 검증: 2026-07-16 (이 머신 실사). "일반적으로 가능"과 "이 프로젝트에 설정됨"을 구분한다.

| Capability | Claude Code | Codex | Project configured | Notes |
|---|---|---|---|---|
| File read/write | ✅ | ✅ | ✅ | 민감 파일은 훅 차단 (`coding-rules.md` Enforced) |
| Shell commands | ✅ | ✅ | ✅ | |
| Git | ✅ | ✅ | ✅ | 정책: ADR-LITE-005 (브랜치 커밋 허용, push/merge는 승인) |
| GitHub CLI (`gh`) | ✅ | ✅ | ✅ 설치됨 (2.91.0) | PR 생성은 사용자 승인 후 |
| Node.js | ✅ | ✅ | ✅ v25.9.0 (engines ≥20) | |
| Python 3 | ✅ | ✅ | ✅ 3.14.5 | pytest는 기본 환경 **미설치** — NEEDS_HUMAN_CONFIRMATION (과거 16/16 실행 환경 불명) |
| Docker / Compose | ✅ | ✅ | ✅ 설치됨 (29.3.1), `docker-compose.yml`+`server/Dockerfile` | PG는 skeleton — 기본 부팅 SQLite |
| Wine (라이브 QA) | ✅ | ✅ | ⚠️ PARTIAL — wine-11.0 설치, 단 P0 게이트(run 전용 WINEPREFIX·계보 manifest) 통과 전 launch 차단 | `docs/logh7-roadmap-current.md` P0 참조 |
| CodeGraph | ✅ MCP + CLI | ✅ CLI | ✅ `.codegraph/` 존재 | 코드 위치·영향범위는 codegraph 먼저 |
| Browser 자동화 | ⚠️ Claude 전용 (Claude-in-Chrome MCP, 세션 연결 시) | ❌ | NOT_CONFIGURED (프로젝트 검증 절차에 미포함) | 클라이언트는 브라우저가 아님 — 라이브 QA는 Wine 하네스 |
| E2E (Playwright 등) | ❌ | ❌ | NOT_CONFIGURED | UI 검증은 원본 클라이언트 + 스크린샷 증거 |
| CI/CD | ✅ (`.github/workflows/ci.yml`·`claude.yml`, `.coderabbit.yaml`) | — | ✅ **라이브** — Secret 등록·CodeRabbit App 설치 완료(2026-07-16), PR #6에서 CI 첫 런 녹색(41s·39s, 489 테스트). Claude GHA 리뷰는 main 병합 후 다음 PR부터(첫 PR 스킵은 공식 정상 동작), CodeRabbit 실리뷰는 50파일 이하 PR에서 | 첫 실리뷰 실측은 Phase 3 소형 PR |
| Jira | ⚠️ `.mcp.json`에 `atlassian`(`/v1/mcp` http — SSE 지원종료 공지 반영) 정의 커밋, 활성화는 `.claude/settings.local.json` allowlist 사람 추가 필요(현재 미포함) | ❌ (Atlassian MCP 미정의) | ✅ 사이트 `pepponechoi-jira.atlassian.net`, 프로젝트 **`LOGH7`**("은하영웅전설7 부활") — 분해 루틴 첫 실행 실증(2026-07-16, 직접 OAuth): Epic LOGH7-6 / Story LOGH7-7 / Task LOGH7-8(↔GitHub Issue #7 제목 병기+코멘트). 옛 `pepponechoi` 사이트는 suspended — 사용 안 함. 엔드포인트 교체로 세션 재인증 1회 필요할 수 있음 | 계획은 로컬 Markdown이 기본 폴백, Jira 분해 루틴은 `docs/agent/lifecycle-planning.md` |
| Sentry / 모니터링 | ✅ `@sentry/node@10.66.0`·`main.mjs` DSN env-guard 배선 | ❌ | ✅ 프로젝트 생성·DSN 발급 완료(2026-07-16, 사람 `~/.zshrc` 보관 — repo 미기록, 에이전트 비대화형 셸은 `source ~/.zshrc` 필요) | DSN 미설정 시 no-op. 실캡처·AI 분석은 Phase 3 실측(AC-5) |
| Terraform / AWS | ❌ | ❌ | NOT_CONFIGURED | 운영 배포 대상 없음 |

## Claude 전용 vs 공통

- Claude 전용: `.claude/commands/*` 슬래시 커맨드, MCP 도구(codegraph MCP, context7 등), 서브에이전트(`.claude/agents/`).
- 공통 (Codex 포함): `scripts/agent/verify-changes.sh`, `docs/agent/` Runbook, `.ai/` 상태 파일, `.codex/hooks/`(미러), codegraph CLI.
- Claude Command·Hook은 얇은 래퍼다 — 절차 정본은 항상 `docs/agent/`와 `scripts/agent/`에 있다.

## 설치 스택 (하네스)

- 에이전트 팀: `.claude/agents/` + `.codex/agents/` — extract-miner, re-analyst, wire-engineer, server-dev, localizer, live-qa (frontmatter model 없음 — 호출 시점에 지정)
- 프로젝트 스킬: logh7-orchestrator, ghidra, protocol-reverse-engineering, rev-frida, find-skills, test-driven-development, verification-before-completion, systematic-debugging (+ `.codex/skills/` 4종)
- 플러그인: oh-my-claudecode, gptaku(pumasi/insane-loop/insane-harness/insane-review)
- 인덱스: codegraph(`.codegraph/`), code-review-graph MCP

## 하네스 변경 이력

| 날짜 | 변경 | 대상 | 사유 |
|---|---|---|---|
| 2026-07-05 | 초기 구성 | 전체 | 리셋 후 재시작 |
| 2026-07-05 | Advisor Strategy 도입 | agents frontmatter model 제거, 호출시 계층화 | 비용 대비 지능 최적화 |
| 2026-07-09 | Fable 오케스트레이션 4계층 전역 설치 | `~/.claude/fable/` (deep-reasoner/runner·sonnet→Opus 리매핑·PreToolUse 게이트), 토글 `fable on/off/status` | 권고를 물리 차단으로 |
| 2026-07-09 | 플러그인·스킬 추가 | oh-my-claudecode, gptaku, 프로젝트 스킬 | 오케스트레이션·RE 도구 보강 |
| 2026-07-14 | 참고 레포 트랙 도입 | `docs/logh7-reference-haul.md` + gitignored `reference/` | 방법론 차용, 코드 이식 금지 |
| 2026-07-16 | Agent OS 부트스트랩 | `.ai/`, `docs/agent/`, `.claude/commands/`, 보호·검증 훅, `scripts/agent/`, 진입 문서 재구조화 | 근거: `.ai/decisions.md` ADR-LITE-001~005 |
| 2026-07-16 | AI 업무 시스템 고도화 착수 | 부트스트랩 베이스라인 커밋(34b4b36d, feat/ai-work-system), `.ai/task.md` ACTIVE | 딥 인터뷰 스펙 + ralplan 합의 계획(`.omc/plans/logh7-ai-work-system-plan.md`) 사람 전면 승인. 예정: NIAH 재주입 훅·팩 배선·CI·GHA·CodeRabbit·Sentry·`.mcp.json` |
| 2026-07-16 | Phase 1 기반 하네스 완성 | NIAH: `.ai/key-facts.md`(24줄)+`inject-key-facts.sh`(UserPromptSubmit, fail-open, `.codex` 미러)+stop-doc-gate 신선도 additive(+10줄) / 팩: 신규 6종(7섹션)+커맨드 7:팩 매핑 / 컨텍스트: context-strategy 4섹션+redirect 스텁 2건+TL;DR 3건 / 헌법: CLAUDE.md·AGENTS.md 라우팅 추가만(삭제 0) | 종료 게이트 PASS(훅 10종 bash -n, JSON 3, fail-open 시뮬, README 참조 100%, 4케이스 격리 fixture 회귀 0). `.mcp.json` 라우팅 줄은 Phase 2D에서 추가(참조 대상 실재 후) |
| 2026-07-16 | Phase 2 외부 연동 배선 | CI: `.github/workflows/ci.yml`·`claude.yml`, `.coderabbit.yaml` / Sentry: `@sentry/node`+`main.mjs` DSN env-guard / MCP: `.mcp.json` 신규 커밋(`code-review-graph`+`atlassian` SSE, 시크릿 0)+`settings.local.json` `enableAllProjectMcpServers:false` 전환·명시 allowlist(`code-review-graph`만, atlassian 의도적 미활성)+`.gitignore` 1줄 / 기획: Jira Epic→Story→Task 분해 루틴 문서화(`lifecycle-planning.md`) | 정의/코드 배선은 완료, **활성화 전부 사람 셋업 대기**(GitHub Secret·CodeRabbit App·Sentry DSN·Jira 사이트 재활성화) — 각 행 상세는 위 표. Phase 3 E2E에서 실측 예정 |

참고: `fable on`이면 `ANTHROPIC_DEFAULT_SONNET_MODEL=claude-haiku-4-5`로 sonnet 고정 서브에이전트(OMC 실행 에이전트 등)까지 haiku로 강등된다.
