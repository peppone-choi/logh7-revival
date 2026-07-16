# Agent Documentation Router

에이전트 공통 문서의 라우터. **모든 문서를 읽지 말고 현재 작업에 필요한 것만 선택한다.**
(Progressive Disclosure — 근거: `context-strategy.md`)

## Always Read (작업 시작 시)

1. `.ai/task.md` — 현재 작업 계약
2. `.ai/decisions.md` — 인간 승인 결정
3. `.ai/current-state.md`, `.ai/ownership.md` — 세션 재개·병렬 작업 시
4. `project-overview.md` — 이 프로젝트가 처음인 세션만

## Read by Task Type

| 작업 유형 | 읽을 문서 |
|---|---|
| 신규 기능 | `architecture.md`, `coding-rules.md`, `lifecycle-planning.md`, `lifecycle-testing.md` |
| 버그 수정·테스트 실패 | `failure-cases.md`, `verification.md`, `lifecycle-testing.md` |
| 코드 리뷰 | `lifecycle-review.md`, `coding-rules.md`, `verification.md` |
| 배포·운영·인프라 | `lifecycle-ops.md`, `tool-capabilities.md` |
| 문서화 | `project-overview.md`, `architecture.md` |
| 병렬·다중 에이전트 작업 | `collaboration-protocol.md`, `lifecycle-collaboration.md` |
| 긴 작업 재개 | `.ai/current-state.md`, `.ai/handoff.md` |
| 작업 방식 선택 (사람/AI 역할) | `workflow-before-after.md` |
| 프롬프트 작성 | `prompt-pack.md` |

## LOGH VII 도메인 라우팅 (기존 정본 유지)

| 주제 | 정본 |
|---|---|
| 마일스톤·현재 구현 상태·데이터 승격 규칙 | `../logh7-roadmap-current.md` |
| 클라이언트 계보 (EXE hash·패치) | `../logh7-client-lineage-current.md` |
| RE·프로토콜·자산·한글화 방법론 (트랙별 참고 레포) | `../logh7-reference-haul.md` |
| 현행·역사 문서 분류 | `../logh7-document-index-current.md` |

## Do Not Load by Default

- 현재 작업 유형과 무관한 lifecycle 문서
- `docs/`의 역사 문서 (`logh7-document-index-current.md`가 historical로 분류한 것)
- `prompt-pack.md` (프롬프트를 실제로 작성할 때만)
- 과거 로그, 긴 예시, 폐기된 계획
