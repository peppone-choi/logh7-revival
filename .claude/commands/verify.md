---
description: 현재 diff 분류 후 verification.md 행렬에 따라 검증 실행
---
# /verify

이 커맨드는 `docs/agent/prompt-pack.md`의 "검증" 섹션을 로드해 적용한다.

$ARGUMENTS: (선택) 검증 범위 — 비우면 현재 작업트리 전체 diff.

절차 (정본: `docs/agent/verification.md`):

1. `git status --short`와 `git diff --stat`로 변경 파일을 분류한다 (server JS / tools Python / 문서 / 설정).
2. 변경 유형별 최소 검증을 실행한다:
   - 단일 파일: `bash scripts/agent/verify-changes.sh --file <경로>`
   - 서버 전체: `cd server && npm test`
   - 전체: `bash scripts/agent/verify-changes.sh --full`
3. **실행한 명령과 종료 코드를 그대로 기록한다.** 실행하지 않은 검증은 "미실행"으로 구분해 보고한다.
4. 라이브 동작 변경(와이어·클라이언트 관련)은 테스트 통과만으로 완료 주장 금지 — 라이브 증거 필요 여부를 명시한다.
5. 결과를 `.ai/current-state.md`의 Verification 항목에 갱신한다.

금지: 실패 로그 은폐, 미실행 검증을 통과로 기록, 환경 오류(도구 부재)를 제품 성공으로 해석.
