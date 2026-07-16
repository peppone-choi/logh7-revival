# Decisions (ADR-LITE)

인간이 승인한 결정만 `approved`가 된다. 에이전트는 `proposed`까지만 기록한다.

## ADR-LITE-001 진입 문서 재구조화

- Date: 2026-07-16
- Status: approved
- Decision: `CLAUDE.md`·`AGENTS.md`를 짧은 부트스트랩 문서로 개편하고, 상세 내용(방법론·아키텍처 경계·위임 원칙)은 `docs/agent/`와 기존 `docs/` 현행 문서로 이동한다.
- Context: 기존 두 파일이 각 9~12KB로 컨텍스트를 소모하고, 마일스톤 상세는 이미 `docs/logh7-roadmap-current.md`가 정본이었다.
- Alternatives: 최소 추가(링크만), 건드리지 않음(충돌 기록만).
- Consequences: 시작 컨텍스트 감소. 규칙의 원본 위치가 `docs/agent/`로 이동하므로 문서 라우터(`docs/agent/README.md`)가 필수.
- Approved by: 사용자 (2026-07-16 인터뷰)

## ADR-LITE-002 운영 문서 배치

- Date: 2026-07-16
- Status: approved
- Decision: `workflow-before-after.md`, `failure-cases.md`, `lifecycle-*.md` 7개 파일은 파일명을 유지한 채 저장소 루트가 아닌 `docs/agent/` 아래에 둔다.
- Context: 루트가 이미 복잡하고, 라우터·공통 문서와 한 곳에 모이는 편이 탐색에 유리.
- Alternatives: 프롬프트 원안대로 루트 배치.
- Consequences: 루트 스캔만으로는 발견되지 않으므로 `CLAUDE.md`·`AGENTS.md` Read Order에서 명시적으로 라우팅한다.
- Approved by: 사용자 (2026-07-16 인터뷰)

## ADR-LITE-003 훅 정책

- Date: 2026-07-16
- Status: approved
- Decision: 민감 파일 보호(PreToolUse 차단, 표준 목록: `.env*`/`*.pem`/`*.key`/`credentials*`/`secrets*`/`terraform.tfstate*`)와 변경 후 검증(PostToolUse, 구문 검사 + 관련 테스트) 훅을 둘 다 실제 `.claude/settings.json`에 활성화한다. 기존 stop-doc-gate에 `.ai/current-state.md` 갱신 검사를 추가한다.
- Context: 훅 스키마는 기존 동작 중인 `.claude/settings.json`으로 검증됨. 전체 테스트(460개)는 매 편집 실행에 부적합.
- Alternatives: example만 제공, 보호훅만 활성화, 전체 테스트 실행.
- Consequences: 검증 로직은 `scripts/agent/verify-changes.sh`에 두어 Codex도 수동 실행 가능해야 한다.
- Approved by: 사용자 (2026-07-16 인터뷰)

## ADR-LITE-004 상태 계층

- Date: 2026-07-16
- Status: approved
- Decision: `.ai/`를 "현재 작업 세션"의 동적 상태 정본으로 신설한다. `.omo/plans/`는 장기 실행계획, `docs/`는 영구 지식, 옵시디언 볼트는 사람용 뷰로 역할을 분리하고 기존 문서는 이동하지 않는다.
- Context: 상태 저장소가 여러 곳(.omo, docs 핸드오프, 볼트)에 흩어져 세션 재개 시 진입점이 불분명했다.
- Alternatives: 템플릿만 생성, .ai/ 미생성(기존 구조 매핑만).
- Consequences: stop-doc-gate가 `.ai/current-state.md` 갱신을 강제한다 (ADR-LITE-003).
- Approved by: 사용자 (2026-07-16 인터뷰)

## ADR-LITE-005 Git 쓰기 정책

- Date: 2026-07-16
- Status: approved
- Decision: 작업 브랜치에서의 commit은 검증 통과 후 에이전트에게 허용한다. push, PR 생성, merge, main 직접 커밋, 히스토리 재작성은 사용자 승인이 필요하다.
- Context: 부트스트랩 프롬프트 원칙("승인 없이 commit 금지")과 기존 AGENTS.md("메인 Advisor가 커밋 승인")가 충돌. 실제 워크플로는 codex 브랜치 PR 방식.
- Alternatives: 모든 commit 승인 필요, 현행(Advisor 승인) 유지.
- Consequences: `docs/agent/coding-rules.md`와 두 부트스트랩 문서의 Git Safety 절이 이 결정을 따른다.
- Approved by: 사용자 (2026-07-16 인터뷰)

## ADR-LITE-006 클라이언트·서버 레포 분리 및 부트스트랩 클라이언트 배포

- Date: 2026-07-17
- Status: approved
- Decision: 게임을 플레이하는 유저가 받는 클라이언트와 게임을 돌리는 서버를 별도 레포지토리로 분리해 배포한다. 클라이언트는 유저가 쉽게 플레이할 수 있도록 부트스트랩된 버전을 최종 배포본으로 제공한다.
- Context: 현재 저장소는 개발 모노레포로, 최종 유저 배포 경로가 정의돼 있지 않았다. 유저가 내려받아 바로 플레이하는 경험을 위해 배포 단위를 분리한다.
- Alternatives: 모노레포 유지 + 릴리스 아티팩트만 분리, 서버만 별도 분리.
- Consequences: 분리 시점·레포 구성·원본 자산 재배포 범위 검토가 후속 과제로 남는다. 분리 전까지 현 저장소가 개발 정본이며, 부트스트랩 배포본도 클라이언트 계보 fail-closed 기준을 따른다.
- Approved by: 사용자 (2026-07-17 세션 지시)
