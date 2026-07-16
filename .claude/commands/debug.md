---
description: 가설 기반 디버깅 — 근본 원인 확인 전 수정 금지
---
# /debug

$ARGUMENTS: 증상 (실패 테스트, 오류 메시지, 잘못된 동작).

절차 (프롬프트 템플릿: `docs/agent/prompt-pack.md`의 "근본 원인 디버깅", 스킬: systematic-debugging):

1. `docs/agent/failure-cases.md`에서 같은 패턴의 기존 실패 사례를 먼저 확인한다.
2. 증상과 근본 원인을 구분하고, 최소 3개 가설을 근거와 함께 세운다.
3. 각 가설에 확인/기각 실험을 설계해 실행한다. 근본 원인 확인 전에는 수정하지 않는다.
4. 수정 후 회귀 검증: 재현 케이스 + `bash scripts/agent/verify-changes.sh --file <경로>` (필요시 `--full`).
5. 새로운 실패 패턴이면 `docs/agent/failure-cases.md`에 OBSERVED로 추가한다.

금지: 실패 테스트 삭제·약화·skip, 원인 미확인 상태의 추측성 수정 반복.
중단 조건: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 접근 전환 + 블로커 보고 (Blocked-Loop Rule).
