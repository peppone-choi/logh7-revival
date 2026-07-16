# Current State

- Updated at: 2026-07-17
- Latest change (Claude Code 메인+opus 서브에이전트): 강의(딩코딩코 AI 네이티브 개발자 1~4주차) 방법론을 이 레포 하네스(커맨드 7종·훅 5종·에이전트 6종·MCP·승인 경계·검증 행렬)에 맞춰 개작한 Claude Code 사용자 매뉴얼을 `docs/agent/claude-code-ai-업무관리-매뉴얼.md`(457줄)로 저장하고 `docs/agent/README.md` 라우팅 표에 등록했다. 레포에 없는 강의 일반론(claude-squad·Terraform·Langfuse·Ralph Loop 등)은 부록 참고로 격하. 이어서 사용자 지시(2026-07-17)로 루트 `README.md`를 신설(Claude·Codex 매뉴얼 링크, 배포 계획), `docs/logh7-architecture-operations-current.md`에 Distribution and Repository Split Plan 절(클라이언트/서버 레포 분리, 부트스트랩 클라이언트 최종 배포)을 추가, ADR-LITE-006으로 기록했다. 사용자 승인으로 `codex/codex-user-manual` 브랜치에서 commit·push·PR·merge 진행(Codex 선행 7커밋 포함). 검증: `verify-changes.sh --file` 변경 문서 전부 exit 0. `.codex/config.toml` 동시 수정분은 스테이징 제외로 보존.
- Active agent: Codex (root)
- Branch: `codex/codex-user-manual`
- Current phase: Codex AI 자동 업무 관리 시스템 사용자 매뉴얼 작성·검증 완료; 사용자가 작업 브랜치 commit·push·PR·merge를 승인했다.
- Result: `docs/agent/codex-user-manual.md`에 프로젝트 열기, 훅·스킬, 작업 계약, Jira/GitHub, 구현·검증·리뷰, 승인 경계, 체크포인트, 실패 대응, 완료 체크리스트를 사용자 관점으로 정리했다.
- Routing: `docs/agent/README.md`에서 매뉴얼로 진입할 수 있다.
- Planning correction: `docs/agent/lifecycle-planning.md`의 오래된 Codex Jira 부재 설명을 Atlassian Rovo 조건부 사용으로 교체하고, L/복합 M→S급 Sub-task 규칙과 Jira↔GitHub 1:1 매핑을 반영했다.
- Source methodology: 사용자가 제공한 1~4주차 PDF의 컨텍스트·훅·스킬, MCP, DevOps·모니터링, PRD→백로그→완주 방법론을 프로젝트 규칙에 맞게 재구성했다. 원본 PDF는 저장소에 복사하지 않았다.
- Fresh verification: `git diff --check` exit 0; 변경 문서·상태 파일 7개 `verify-changes.sh --file` 모두 exit 0; 관련 문서 링크 대상 9개 존재; 매뉴얼 461줄·제목 41개 확인.
- Unrun: 제품 코드·서버 테스트는 문서 전용 변경이라 실행하지 않았다.
- Preserved concurrent change: 기존 `.codex/config.toml` 수정은 읽거나 변경하지 않고 보존했다.
- Existing human checkpoint: Codex 훅의 라이브 활성화는 사용자가 `/hooks`에서 프로젝트 hook hash를 신뢰한 뒤 새 작업에서 확인해야 한다.
- Recommended next action: 매뉴얼 발행 후 다음 Jira 업무를 새 `.ai/task.md` 계약으로 선택한다.
