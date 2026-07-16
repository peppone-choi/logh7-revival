# Coding Rules

마지막 검증: 2026-07-16 (저장소 실사 기준)

## Enforced (빌드·테스트·훅으로 실제 강제)

- Node.js ≥ 20, ESM(`"type": "module"`) — `server/package.json` engines.
- 테스트: `cd server && npm test` (`node --test`, `server/tests/*.test.mjs`). 실패 시 완료 불가.
- 편집 즉시 구문 검사 + 이름 매칭 테스트: PostToolUse 훅 → `scripts/agent/verify-changes.sh --file` (`node --check`, `python3 -m py_compile`, JSON 파싱, `bash -n`).
- 민감 파일(`.env*`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `terraform.tfstate*`) 접근은 PreToolUse 훅이 차단.
- 실작업 턴은 docs/·`CLAUDE.md`·`AGENTS.md`·`.ai/current-state.md` 현행화 전에 종료 불가 (Stop 훅 stop-doc-gate).
- lint·type check: **NOT_CONFIGURED** (eslint·tsconfig 없음) — 구문 검사가 유일한 정적 강제.

## Observed (코드베이스에서 반복 확인되는 패턴)

- 서버 레이어: `server/src/{presentation,application,domain,infrastructure,server}` — presentation→application→domain 방향, infrastructure는 조립 지점에서 주입 (상세: `architecture.md`).
- 파일 명명: 서버 `logh7-*.mjs`, 테스트 `server/tests/logh7-*.test.mjs`, Python 도구 `tools/logh7_*.py`, Python 테스트 `tools/tests/test_logh7_*.py`.
- 코드 주석은 한글, 캐논 일본어 용어·바이너리 오프셋은 원문 유지.
- 마이그레이션: `server/migrations/NNNN_snake_name.sql`, 롤포워드 전용(다운 없음), 자체 `BEGIN;…COMMIT;` (정본: `server/migrations/README.md`).
- 임시 실험 파일은 `tmp-*.mjs` 접두어 (예: `server/tmp-2004-builder.mjs`).

## Preferred (문서·정책으로 요구되나 자동 강제 아님)

- 증거 우선순위: CD·공식 매뉴얼·정본 EXE·패킷·라이브 관측 > 참고 레포. `docs/logh7-reference-haul.md`는 방법론 라우터일 뿐 캐논 근거로 승격 금지.
- 참고 레포 코드는 gitignored `reference/`에만 클론, 라이선스가 다른 코드를 서버에 이식 금지.
- CP932 자산을 임의로 UTF-8 저장 금지. EXE hash·image base·sentinel 불일치는 launch/attach/patch 전에 fail-closed.
- Blocked-Loop Rule: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 접근 전환 + 블로커 보고.
- 라이브 검증 없이 완료 주장 금지 — 테스트 출력·스크린샷 등 증거를 남긴다 (`verification.md`).

## Git Safety (근거: `.ai/decisions.md` ADR-LITE-005)

- 작업 브랜치 commit: 검증 통과 후 에이전트 허용.
- push, PR 생성, merge, main 직접 커밋, 히스토리 재작성, 테스트 삭제·약화: **사용자 승인 필수.**
- `git reset --hard`·작업트리 초기화·다른 에이전트 변경 덮어쓰기 금지.
