# Current Task

## Completed Contract: Codex harness parity

- Status: DONE — 2026-07-17. Codex native hooks, eight workflow skills, and vetted project-only skills.sh acquisition implemented and locally verified. Live activation remains the user's `/hooks` trust checkpoint.
- Goal: Claude Code용 아직이던 업무·검증 하네스를 Codex 네이티브 스키마·훅·워크프로로 직접 실행하고, 외부 스킬 갭이 피요할 때 skills.sh에서 검증한 다은로드·프로젝트 스코프로 설치한다.
- In scope: Codex `apply_patch` payload 호환, git-root 경로, 세션별 상태 격리, Claude 커맨드 7종 대응 Codex 워크프로 스킬, SessionStart 로컬 갭 점검, skills.sh 검색·검토·품질·Codex 프로젝트 설치, 회귀 검증, 관련 문서·상태 현행화.
- Out of scope: 비밀 읽기·의존성 열람, 검증 없이 외부 스킬 실제 설치, push·PR·merge, 자동 훅 신뢰 생략.
- Acceptance criteria: (1) 하위 cwd에서도 훅 동작, (2) `apply_patch` 비밀 차단·후검증, (3) 세션별 Codex 상태 격리, (4) 7개 업무+skills.sh 관리 스킬 발견, (5) 외부 갭 부재 시에 skills.sh 검색·품질·안전 국여로 프로젝트 설치(`-g` 금지), (6) 회귀 검증·Codex strict config exit 0.
- Constraints: 시크릿 접근 금지, 스킬 설치는 반드시 프로젝트 스코프, 출처와 검증 제한은 `skills-lock.json`에 남긴다.
- Allowed files: `.codex/hooks.json`, `.codex/hooks/**`, `.agents/skills/logh7-*/**`, `scripts/agent/{bootstrap-skills.sh,required-skills.tsv,test-codex-hooks.sh}`, `.github/workflows/codex.yml`, `docs/agent/**`, `AGENTS.md`, `.gitignore`, `.ai/**`.
- Protected concurrent files: `CLAUDE.md`, `.codex/config.toml` (현재 미컷 보존).
- Required verification: `bash scripts/agent/test-codex-hooks.sh`, `bash scripts/agent/verify-changes.sh --file <변경 스크립트>`, JSON/TOML/SKILL 링크, `codex --strict-config --version`, 하위 cwd 훅 시물레이션.
- Human checkpoints: 수정 후 Codex `/hooks` 해시 신뢰, push·PR·merge, 외부 스킬 업데이트·설치 불가 의심 대로 외부 연결 자동화 정책이 종료한 경우.

## Historical completed contract (2026-07-16)

- Status: DONE — 2026-07-16 완료. Phase 0~3 전체 종결: PR #6(Phase 1+2, `be6499a3`)·PR #8(Phase 3 SRV-CORR, `3fd847b1`) merge, GitHub Issue #7 종료, Jira LOGH7-6/7/8 완료 전환. 최종 검증: merge 시점 fresh `npm test` 499/495/0/4 exit 0, AC-5 Sentry `NODE-1` 캡처+Seer AI 분석. (승인 이력: 사람 "전면 승인"·PR별 push/merge 승인. 계획 정본: `.omc/plans/logh7-ai-work-system-plan.md`)
- Goal: 기존 AI 하네스를 실전 개발용으로 고도화 — NIAH 키팩트 카드·재주입 훅·신선도 게이트, 프롬프트 팩 커맨드 배선(7섹션 표준)+도메인 팩 4종, 컨텍스트 전략 통합, 최소 CI·Claude GHA·CodeRabbit·Sentry·Jira MCP 연동, E2E는 M4-OBS-001 서버-테스트 슬라이스 1건 완주로 판정
- User value: 사람+에이전트가 같은 하네스로 기획→구현→테스트→리뷰→모니터링을 증거 기반으로 완주할 수 있다
- In scope: 계획 §3 Phase 0~3 전체 (P0-0 스파이크, 1A NIAH, 1B 팩, 1C 컨텍스트·스텁, 1D 헌법 3줄, 2A CI, 2B GHA+CodeRabbit, 2C Sentry, 2D MCP 정의/활성화 분리, 3 E2E)
- Out of scope: 과제 제출물·HEART 지표, CLAUDE.md·AGENTS.md 전면 개편, AWS/Terraform/Docker, MCP 서버 자작, 옛 코드(5bd249c) 부활, 게임 기능 자체 구현(E2E 슬라이스 내용물은 별도 계약)
- Acceptance criteria: 계획 §4 AC-0~AC-9 (판정 명령 포함)
- Constraints: 헌법 최소 증분(라우팅 3줄 내외), 기존 훅 4종 회귀 금지(additive만·fail-open 재주입), main 직접 커밋 금지, 시크릿은 사람 등록, Codex 레인에서 push/PR/merge/의존성/핵심 훅 변경 금지, key-facts ≤40줄
- Related issue: GitHub PR #6(Phase 1+2, merge 완료 `be6499a3`) / **Issue #7**(Phase 3 SRV-CORR) / Jira: **LOGH7-8**(Task, Issue #7과 1:1) · LOGH7-7(Story) · LOGH7-6(Epic) — 사이트 `pepponechoi-jira.atlassian.net`, 프로젝트 `LOGH7`
- Allowed files: `docs/agent/**`, `.claude/**`, `.codex/**`, `.ai/**`, `.github/**`, `.mcp.json`, `.coderabbit.yaml`, `scripts/agent/**`, `CLAUDE.md`, `AGENTS.md`, `server/src/**`(Sentry 한정), `server/tests/**`(E2E 슬라이스), 현행 docs TL;DR 헤더(roadmap 등). **Phase 3 확장(2026-07-16 전체 승인·Issue #7)**: 신규 `server/src/server/logh7-correlation-record.mjs`, `server/src/server/logh7-playable-server.mjs`(writeTrace 배선 한정)
- Protected files: `.env*`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `terraform.tfstate*` (훅으로 차단됨)
- Required verification: `docs/agent/verification.md` 행렬 + 계획 §6 Phase 종료 게이트
- Human approval checkpoints: push·PR·merge 각 시점 / 시크릿 등록(사람 직접) / 계약 밖 변경 재승인. 핵심 훅 변경·`@sentry/node` 추가는 2026-07-16 전면 승인에 포함(계획에 명시된 범위 한정)

<!--
이 파일은 사람이 작성하거나 승인하는 작업 계약이다.
- 승인: 2026-07-16 사용자 "전면 승인" (ralplan 합의 계획 기준)
- 완료되면 DONE으로 바꾼 뒤 .ai/handoff.md에 결과를 남긴다.
-->
