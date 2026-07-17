# Tool Capabilities

마지막 검증: 2026-07-17 (이 머신 실사). "일반적으로 가능"과 "이 프로젝트에 설정됨"을 구분한다.

| Capability | Claude Code | Codex | Project configured | Notes |
|---|---|---|---|---|
| File read/write | ✅ | ✅ | ✅ | 민감 파일은 훅 차단 (`coding-rules.md` Enforced) |
| Shell commands | ✅ | ✅ | ✅ | |
| Git | ✅ | ✅ | ✅ | 정책: ADR-LITE-005 (브랜치 커밋 허용, push/merge는 승인) |
| GitHub CLI (`gh`) | ✅ | ✅ | ✅ 설치됨 (2.91.0) | PR 생성은 사용자 승인 후 |
| Node.js | ✅ | ✅ | ✅ v25.9.0 (engines ≥20) | |
| Python 3 | ✅ | ✅ | ✅ 3.14.5 | pytest는 기본 환경 **미설치** — NEEDS_HUMAN_CONFIRMATION (과거 16/16 실행 환경 불명) |
| Docker / Compose | ✅ | ✅ | ✅ 설치됨 (29.3.1), `docker-compose.yml`+`server/Dockerfile` | PG는 skeleton — 기본 부팅 SQLite |
| 레거시 클라이언트 라이브 QA | ✅ | ✅ | ⚠️ PARTIAL — native Windows는 direct harness, macOS/Linux는 run 전용 Wine. 이 Mac의 Wine Stable 11+명시적 WoW64에서 client process와 로그인 패킷 도달을 확인했으나 login-ng·exit 3·runtime error로 gameplay는 실패 | `docs/logh7-roadmap-current.md` P0 참조; native Windows/Linux 실기 미검증 |
| CodeGraph | ✅ MCP + CLI | ✅ CLI | ✅ `.codegraph/` 존재 | 코드 위치·영향범위는 codegraph 먼저 |
| Browser 자동화 | ⚠️ Claude 전용 (Claude-in-Chrome MCP, 세션 연결 시) | ❌ | NOT_CONFIGURED (프로젝트 검증 절차에 미포함) | 클라이언트는 브라우저가 아님 — 라이브 QA는 플랫폼별 native/Wine 하네스 |
| E2E (Playwright 등) | ❌ | ❌ | NOT_CONFIGURED | UI 검증은 원본 클라이언트 + 스크린샷 증거 |
| CI/CD | ✅ (`.github/workflows/ci.yml`·`claude.yml`, `.coderabbit.yaml`) | — | ✅ **라이브** — Secret 등록·CodeRabbit App 설치 완료(2026-07-16), PR #6에서 CI 첫 런 녹색(41s·39s, 489 테스트). Claude GHA 리뷰는 main 병합 후 다음 PR부터(첫 PR 스킵은 공식 정상 동작), CodeRabbit 실리뷰는 50파일 이하 PR에서 | 첫 실리뷰 실측은 Phase 3 소형 PR |
| Jira | ⚠️ `.mcp.json`에 `atlassian` 정의, 활성화는 Claude 로컬 allowlist 필요 | ⚠️ Atlassian Rovo 플러그인 설치됨; 커넥터가 현재 세션에 노출될 때만 사용 | ✅ 사이트 `pepponechoi-jira.atlassian.net`, 프로젝트 **`LOGH7`**("은하영웅전설7 부활") — 분해 루틴 실증 완료. 옛 `pepponechoi` 사이트는 사용하지 않음 | 계획은 로컬 Markdown이 기본 폴백, Jira 분해 루틴은 `docs/agent/lifecycle-planning.md` |
| Sentry / 모니터링 | ✅ `@sentry/node@10.66.0`·`main.mjs` DSN env-guard 배선 | ❌ | ✅ **AC-5 실측 완료(2026-07-16)**: 실 DSN으로 의도적 correlation 검증 실패 1건 캡처(`reported=true`·`flush=true`·exit 0) → API로 수신 확인(org `tekken-75`, 프로젝트 `node`, Issue `NODE-1`) → Seer AI 분석 성공(타입 위반·의도적 테스트임을 식별). DSN·API 토큰은 사람 `~/.zshrc` 보관 — repo 미기록, 에이전트 비대화형 셸은 `source ~/.zshrc` 필요 | DSN 미설정 시 no-op. 채팅 경유로 전달된 토큰은 회전 권장 |
| Terraform / AWS | ❌ | ❌ | NOT_CONFIGURED | 운영 배포 대상 없음 |

## 도구별 어댑터와 공통 정본

- Claude 전용: `.claude/commands/*`, `.claude/hooks/*`, Claude MCP와 `.claude/agents/`; canonical live-QA skill의 `.claude/skills/logh7-wine-live-qa/` 미러.
- Codex 전용: `.codex/hooks.json`, `.codex/hooks/*`, `.codex/agents/*.toml`, `.agents/skills/logh7-{start-task,analyze,implement,debug,verify,review,checkpoint,skill-manager}`.
- 공통 정본: `scripts/agent/*`, `docs/agent/` Runbook, `.ai/` 상태 파일, canonical `.agents/skills/`, codegraph CLI.
- 양쪽 Command·Hook·Skill은 얇은 어댑터이며 절차를 복제하지 않고 공통 정본을 호출한다.

## 설치 스택 (하네스)

- 에이전트 팀: `.claude/agents/` + `.codex/agents/` — extract-miner, re-analyst, wire-engineer, server-dev, localizer, live-qa (frontmatter model 없음 — 호출 시점에 지정)
- 프로젝트 스킬 정본: `.agents/skills/`. 기존 도메인 스킬과 Codex 워크플로 7종 + `logh7-skill-manager`를 Codex가 프로젝트 범위에서 발견한다.
- 플러그인: oh-my-claudecode, gptaku(pumasi/insane-loop/insane-harness/insane-review)
- 인덱스: codegraph(`.codegraph/`), code-review-graph MCP
- 스킬 부트스트랩: Codex SessionStart는 매 프로젝트 오픈마다 `bootstrap-skills.sh --check`를 fail-open으로 실행하며 네트워크를 사용하지 않는다. 필요 시 `logh7-skill-manager`가 기존 스킬 확인 → skills.sh 검색 → 출처·본문·스크립트·권한 검토 → `--install <owner/repo> --skill <name> --reviewed` 순서로 `.agents/skills/`에만 복사 설치한다. 래퍼는 `--agent codex --copy --yes`를 고정하고 `-g`·`--global`, 옵션형 이름, 매니페스트 경로 이탈, 기존 스킬 덮어쓰기를 거부한다. 설치 후 frontmatter·`skills-lock.json` source/hash·`skills list --json`을 확인한다.

## 하네스 변경 이력

| 날짜 | 변경 | 대상 | 사유 |
|---|---|---|---|
| 2026-07-17 | 플랫폼별 live-QA 분기 | canonical/Codex/Claude `logh7-wine-live-qa`, canonical/Claude `logh7-orchestrator`, 양쪽 live-qa agent, Wine adapter guard | native Windows에서는 Wine 없이 직접 실행하고 macOS/Linux에서만 격리 Wine 계약 적용 |
| 2026-07-17 | Wine Stable 11 WoW64 실측 | `--prefix-mode wow64`, prefix layout·자동 drive 격리, live receipt | PE32 client process와 서버 로그인 패킷 도달 확인; login-ng·exit 3으로 전체 pass는 미달 |
| 2026-07-05 | 초기 구성 | 전체 | 리셋 후 재시작 |
| 2026-07-05 | Advisor Strategy 도입 | agents frontmatter model 제거, 호출시 계층화 | 비용 대비 지능 최적화 |
| 2026-07-09 | Fable 오케스트레이션 4계층 전역 설치 | `~/.claude/fable/` (deep-reasoner/runner·sonnet→Opus 리매핑·PreToolUse 게이트), 토글 `fable on/off/status` | 권고를 물리 차단으로 |
| 2026-07-09 | 플러그인·스킬 추가 | oh-my-claudecode, gptaku, 프로젝트 스킬 | 오케스트레이션·RE 도구 보강 |
| 2026-07-14 | 참고 레포 트랙 도입 | `docs/logh7-reference-haul.md` + gitignored `reference/` | 방법론 차용, 코드 이식 금지 |
| 2026-07-16 | Agent OS 부트스트랩 | `.ai/`, `docs/agent/`, `.claude/commands/`, 보호·검증 훅, `scripts/agent/`, 진입 문서 재구조화 | 근거: `.ai/decisions.md` ADR-LITE-001~005 |
| 2026-07-16 | AI 업무 시스템 고도화 착수 | 부트스트랩 베이스라인 커밋(34b4b36d, feat/ai-work-system), `.ai/task.md` ACTIVE | 딥 인터뷰 스펙 + ralplan 합의 계획(`.omc/plans/logh7-ai-work-system-plan.md`) 사람 전면 승인. 예정: NIAH 재주입 훅·팩 배선·CI·GHA·CodeRabbit·Sentry·`.mcp.json` |
| 2026-07-16 | Phase 1 기반 하네스 완성 | NIAH: `.ai/key-facts.md`(24줄)+`inject-key-facts.sh`(UserPromptSubmit, fail-open, `.codex` 미러)+stop-doc-gate 신선도 additive(+10줄) / 팩: 신규 6종(7섹션)+커맨드 7:팩 매핑 / 컨텍스트: context-strategy 4섹션+redirect 스텁 2건+TL;DR 3건 / 헌법: CLAUDE.md·AGENTS.md 라우팅 추가만(삭제 0) | 종료 게이트 PASS(훅 10종 bash -n, JSON 3, fail-open 시뮬, README 참조 100%, 4케이스 격리 fixture 회귀 0). `.mcp.json` 라우팅 줄은 Phase 2D에서 추가(참조 대상 실재 후) |
| 2026-07-17 | 옵시디언 볼트 연동 활성화(이 맥) | 볼트 정본은 `github.com/peppone-choi/obsidian-tech-vault` — 머신마다 클론 후 `LOGH7_VAULT_DIR`를 클론 경로로 설정. 이 맥: `"/Users/apple/Desktop/기술팀 옵시디언/최병호"`를 `~/.zshrc`(export)와 `.claude/settings.local.json`(env, gitignored)에 설정 — `stop-doc-gate.sh`·`turn-snapshot.sh`가 참조 | 문서 현행화 게이트의 볼트 검사 활성화 (사용자 지시 2026-07-17). 새 세션부터 훅 env에 반영 |
| 2026-07-16 | Phase 2 외부 연동 배선 | CI: `.github/workflows/ci.yml`·`claude.yml`, `.coderabbit.yaml` / Sentry: `@sentry/node`+`main.mjs` DSN env-guard / MCP: `.mcp.json` 신규 커밋(`code-review-graph`+`atlassian` SSE, 시크릿 0)+`settings.local.json` `enableAllProjectMcpServers:false` 전환·명시 allowlist(`code-review-graph`만, atlassian 의도적 미활성)+`.gitignore` 1줄 / 기획: Jira Epic→Story→Task 분해 루틴 문서화(`lifecycle-planning.md`) | 정의/코드 배선은 완료, **활성화 전부 사람 셋업 대기**(GitHub Secret·CodeRabbit App·Sentry DSN·Jira 사이트 재활성화) — 각 행 상세는 위 표. Phase 3 E2E에서 실측 예정 |
| 2026-07-17 | 프로젝트 단위 스킬 부트스트랩 (+보정) | `scripts/agent/required-skills.tsv`(매니페스트, 사람 갱신)+`scripts/agent/bootstrap-skills.sh`(`--check`/`--sync`/`--once`/`--strict`/`--force` 로컬 전용, `--status`/`--search <query>` skills.sh 조회 수동 전용) 신규, `.claude/settings.json`·`.codex/hooks.json` SessionStart 훅 배선(`--once \|\| true`, fail-open). 최초 구현 후 실사 보정: Codex는 `.codex/agents/*.toml`이 canonical(`.agents/skills/<name>`)을 직접 참조해 물리 복사 불필요로 확인 — binary-triage·grammar-checker·humanize-korean 타깃을 `both`→`claude`로 수정하고 기존에 만든 `.codex/skills/` 물리 복사 3종은 제거, `codex` 타깃 검증 방식을 물리 복사 대조에서 canonical 경로 실존 확인으로 변경 | 실행 근거(보정 전): `--check`(sync 전 MISSING=9)→`--sync`(9건 복사)→`--check`(sync 후 MISSING=0). 실행 근거(보정 후): Claude 6종 스킬 디렉터리 임시 제거 후 `--check`(MISSING=6, codex 4종은 OK로 카운트)→`--sync`(6종 복원, `.codex/skills/` diff 0건 확인)→`--check`(OK=17 MISSING=0 STALE=1). `--search test-driven-development`·`--status`(`npx skills list --json`) 수동 모드 실행 확인, 둘 다 설치 없이 조회만. 잔여 사람 결정 4건(orchestrator stale 반영 여부·`agent/skills/` 폐기·work-plan↔agents 스킬표 불일치·`skills-lock.json` stale 2건)은 미해결로 보고 |
| 2026-07-17 | Codex 네이티브 하네스 parity | `apply_patch` 보호·후검증, git-root/입력 cwd 경로, 세션별 `.codex/state`, 문서·NIAH stop gate, 워크플로 스킬 8종, 매 오픈 로컬 스킬 점검, 검토 확인형 프로젝트 설치 | `test-codex-hooks.sh` 26/26, 스킬 validator 8/8, skills CLI 프로젝트 발견, Codex strict config 통과. 실제 훅 활성화는 사용자의 `/hooks` 신뢰 후 새 task에서 확인 |

참고: `fable on`이면 `ANTHROPIC_DEFAULT_SONNET_MODEL=claude-haiku-4-5`로 sonnet 고정 서브에이전트(OMC 실행 에이전트 등)까지 haiku로 강등된다.
