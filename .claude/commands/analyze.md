---
description: 기능/영역 분석 — 관련 파일·유사 구현·영향 범위 조사 (코드 수정 금지)
---
# /analyze

이 커맨드는 `docs/agent/prompt-pack.md`의 "기능 분석" 섹션을 로드해 적용한다.

$ARGUMENTS: 분석할 기능, 버그, 또는 코드 영역.

절차 (프롬프트 템플릿: `docs/agent/prompt-pack.md`의 "기능 분석"):

1. `.codegraph/`가 있으면 codegraph로 위치·호출경로·영향범위를 먼저 조회하고 rg로 확인한다.
2. 관련 파일, 유사 구현, 기존 테스트를 탐색한다. LOGH VII 도메인 작업이면 `docs/logh7-reference-haul.md`의 해당 트랙을 먼저 읽는다.
3. 결과에 반드시 포함: 영향 범위, 대안 2개 이상, 권장안, 위험, 사람 결정이 필요한 부분.

제약: **코드를 수정하지 않는다.** 추측과 확인된 사실을 구분해 표기한다 (Observed/Inferred).
결과 저장: 응답으로 제시. 후속 구현으로 이어지면 `.ai/task.md` 계약에 반영.
