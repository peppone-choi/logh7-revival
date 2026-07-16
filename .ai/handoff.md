# Agent Handoff

## Goal
사용자가 Codex와 프로젝트의 AI 자동 업무 관리·검증 시스템으로 업무를 시작하고 완료하는 방법을 Markdown 매뉴얼로 제공한다.

## Current result
`docs/agent/codex-user-manual.md` 작성과 라우터 연결이 완료됐다. 매뉴얼은 처음 설정부터 Jira 업무 선택, 작업 계약, 스킬 사용, 구현·검증·리뷰, 외부 승인, 실패·재개, 완료 체크리스트까지 사용자 여정을 다룬다.

## Decisions already made
- 문서 위치는 운영 문서 정본인 `docs/agent/`다.
- 기술 문서 어조는 `~합니다`로, 독자 명칭은 `사용자`로 통일했다.
- 교안 예시를 복제하지 않고 현재 프로젝트의 실제 하네스·승인 규칙을 우선했다.
- Jira는 상태 정본, `.ai/task.md`는 현재 실행 계약 정본, GitHub는 코드 논의·PR 연결로 설명했다.
- Atlassian 도구는 Codex 작업에 Rovo 커넥터가 노출될 때만 사용하고, 없으면 로컬 Markdown으로 폴백한다.

## Files changed
- 신규: `docs/agent/codex-user-manual.md`
- 라우팅: `docs/agent/README.md`
- 현행화: `docs/agent/lifecycle-planning.md`
- 계약·상태: `.ai/task.md`, `.ai/current-state.md`, `.ai/handoff.md`, `.ai/ownership.md`

## Verification result
- `git diff --check` → exit 0.
- `bash scripts/agent/verify-changes.sh --file <path>` → 매뉴얼, README, planning, task, current-state, handoff, ownership 각 exit 0.
- 관련 문서 내부 링크 대상 9개 → 모두 존재.
- 구조 확인 → 매뉴얼 461줄, H1~H3 제목 41개.
- 제품 코드·서버 테스트 → NOT RUN, 문서 전용 변경이라 비대상.

## Failed approaches and recovery
- NFD 파일명을 대화의 문자열로 직접 재사용한 첫 PDF 추출은 파일을 찾지 못했다. `/Users/apple/Downloads`에서 `[1`~`[4` 접두 파일을 검색하는 방식으로 전환해 네 PDF의 텍스트 추출을 exit 0으로 완료했다.
- PDF 내 일부 embedded font mismatch 경고가 있었지만 텍스트 파일이 생성됐고 네 문서의 표지 렌더를 직접 확인했다. 원본 PDF는 수정하지 않았다.
- 첫 ownership 패치는 Markdown 표 구분자 열 수를 잘못 가정해 실패했다. 실제 파일을 다시 읽고 올바른 문맥으로 적용했다.

## Remaining work
- 사용자가 매뉴얼 내용과 상세 수준을 검토한다.
- 사용자가 작업 브랜치 commit·push·PR 생성·merge를 승인했다.
- 기존 하네스의 `/hooks` 신뢰 checkpoint는 여전히 사람 작업이다.
- 기존 `.codex/config.toml` dirty 변경은 이 작업과 무관하며 보존했다.

## Files to read first
`docs/agent/codex-user-manual.md`, `.ai/task.md`, `.ai/current-state.md`, `AGENTS.md`, `docs/agent/tool-capabilities.md`.
