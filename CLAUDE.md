# LOGH VII Revival — Claude Code Operating Rules

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII**를 원본 클라이언트(archive.org CD) + 자체 권위 서버로 되살린다.
원본 클라이언트가 1차 제품이자 호환 오라클이다. 2026-07-05 전체 리셋 — 옛 코드는 커밋 `5bd249c`에서 참고만 하고 되살리지 않는다.

## Read Order

1. `.ai/task.md` — 현재 작업 계약. **EMPTY면 사람 승인 전 구현 금지.**
2. `.ai/decisions.md` — 인간 승인 결정 (ADR-LITE)
3. `docs/agent/README.md` — 작업 유형별 문서 라우팅. **모든 문서를 읽지 않는다.**
4. `.ai/current-state.md`, `.ai/handoff.md` — 세션 재개 시
5. 현재 작업 유형의 Runbook (`docs/agent/lifecycle-*.md`)
6. 관련 코드·테스트 — `.codegraph/` 먼저, rg로 확인

## Source of Truth

- 마일스톤·현재 구현 상태·M4 선행 게이트(P0→P1→P2)·데이터 승격 규칙: `docs/logh7-roadmap-current.md`
- 클라이언트 계보(EXE hash·image base·sentinel·패치 manifest): `docs/logh7-client-lineage-current.md` — 중간 산출물을 pristine/canonical로 부르지 않는다
- 참고 방법론 라우터: `docs/logh7-reference-haul.md` — 착수 전 해당 트랙 필독, 캐논 근거 승격·코드 이식 금지
- 현행·역사 문서 분류: `docs/logh7-document-index-current.md` — 역사 문서의 코드 경로는 리셋 전 기준이므로 불신
- CD 이미지 `artifacts/logh7-cd/`(gitignored, md5 검증)·공식 매뉴얼 `docs/reference/*.pdf` — 게임 규칙의 근거
- 미해결 문제·게이트 차단 현황: `.ai/known-issues.md`
- 문서와 코드가 충돌하면 코드·테스트가 우선 — 충돌은 Instruction Conflict로 보고 (`AGENTS.md` 형식)

## Project Commands

- 테스트: `cd server && npm test` / 서버: `cd server && npm start` (포트 47900)
- 변경 검증: `bash scripts/agent/verify-changes.sh --file <경로>` 또는 `--full`
- 검증 행렬 정본: `docs/agent/verification.md`

## Mandatory Work Loop

Explore → Plan → (필요시 범위 확인) → Implement minimally → Verify → Review diff → Update state → Report.
커맨드 진입점: `/start-task` `/analyze` `/implement` `/debug` `/verify` `/review` `/checkpoint`.
Blocked-Loop Rule: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 접근 전환 + 블로커 보고.

## Human Approval Required

- 비가역 아키텍처·프로토콜·스키마 결정, 의존성 추가·대규모 업그레이드
- push, PR 생성, merge, main 직접 커밋 — 작업 브랜치 commit은 검증 후 허용 (`.ai/decisions.md` ADR-LITE-005)
- 마이그레이션 적용, 라이브 데이터(`server/data/`) 삭제, docker volume 삭제
- 테스트 삭제·약화, 보안 정책 변경, `CLAUDE.md`·`AGENTS.md`·훅·승인 게이트의 핵심 변경
- 캐논 데이터 승격, 외부 서비스 쓰기

## Never

- 라이브 검증 없이 완료 주장 — 테스트 출력·스크린샷 등 증거 필수. 과거 수치는 historical baseline이지 fresh gate가 아니다
- 존재하지 않는 명령·API·경로 사용, 미실행 검증을 통과로 기록
- 비밀 파일(`.env*`, `*.pem`, `*.key` 등) 읽기·출력 — 훅이 차단
- 참고 레포 코드 이식, CP932 자산 임의 UTF-8 변환
- 기본 `~/.wine` 사용, EXE hash·image base·sentinel 불일치 상태로 launch/attach/patch — fail-closed는 버그가 아니다
- 다른 에이전트 소유 파일 수정 (`.ai/ownership.md`)

## Verification Before Completion

`docs/agent/verification.md` 행렬대로 실행하고 명령·종료 코드를 기록한다. 미실행 검증은 미실행으로 보고한다.

## Context Management

`docs/agent/context-strategy.md`. **Fable 비용 규칙**: 메인 세션은 Advisor 전용 — 긴 파일 읽기·전수 탐색·구현 노동 금지, 서브에이전트(opus/haiku, **model 명시 필수**)에 위임하고 결론만 받는다. effort 기본 low~medium. 라우팅·브리프 기준: `docs/agent/collaboration-protocol.md`.
RE 작업은 "죽은 게임 복원·자체 서버 호환성" 목적을 항상 명시해 방어적 맥락을 유지한다.
**키팩트 카드**: `.ai/key-facts.md`(≤40줄)가 매 턴 자동 주입된다(`inject-key-facts` 훅). 파생 원천(roadmap·known-issues·task.md) 변경 시 카드도 함께 갱신한다 — stop-doc-gate가 강제.

## Handoff Protocol

세션 종료·컨텍스트 리셋 전 `/checkpoint` — `.ai/current-state.md`·`handoff.md`·`ownership.md` 갱신.
**문서 현행화 게이트(Stop 훅 강제)**: 파일을 변경한 턴은 관련 `docs/` 현행 문서, 루트 `AGENTS.md`·`CLAUDE.md`, `.ai/current-state.md`, (`LOGH7_VAULT_DIR` 설정 머신에서는) 옵시디언 볼트까지 갱신해야 끝난다. 반영할 것이 없으면 그 근거를 보고에 명시한다.

## 하네스

- logh7 도메인 작업(자산추출·RE·프로토콜·서버·한글화·라이브QA)은 `logh7-orchestrator` 스킬로 분해. 단순 질문은 직접 응답.
- 에이전트 팀: `.claude/agents/` 6종 (frontmatter model 없음 — 호출 시점에 지정).
- 설치 스택·도구 실사·하네스 변경 이력: `docs/agent/tool-capabilities.md`.
- 커맨드 7종은 `docs/agent/prompt-pack.md`의 대응 팩(7섹션)을 명시 로드한다 — 매핑 표는 그 문서 앞머리.
