# Lifecycle Runbook: Ops

## Status
PARTIAL — Docker(29.3.1)·`docker-compose.yml`·`server/Dockerfile` 실재하나 **운영 배포 대상 없음**(로컬 인프라 스켈레톤). CI/CD·Terraform·AWS·Sentry·CloudWatch는 NOT_CONFIGURED. PostgreSQL은 마이그레이션 타깃 skeleton — 기본 부팅은 SQLite.

## Read This When
서버 기동·컨테이너·데이터 저장소·라이브 QA 환경을 다룰 때.

## Preconditions
`docs/agent/tool-capabilities.md`로 도구 실재 확인. 라이브 QA는 `docs/logh7-roadmap-current.md`의 P0 게이트 상태 확인.

## Inputs
`.ai/task.md` 계약, 대상 환경(로컬 dev / compose / wine 라이브 QA).

## Procedure
1. 로컬 서버: `cd server && npm start` (또는 `serve:playable` / `serve:wire-only` / `serve:packet-lab`).
2. 컨테이너: `docker compose up --build` — named volume(pgdata, serverdata)로 재시작 간 보존.
3. 라이브 QA(원본 클라이언트): 저장소 밖 run 전용 win32 `WINEPREFIX`만 사용, 기본 `~/.wine` 금지. EXE hash·image base·sentinel 불일치는 launch/attach/patch 전 fail-closed.
4. 헬스 확인: compose의 pg healthcheck(`pg_isready`) 실재. 서버 자체 health endpoint는 UNKNOWN — 확인 후 이 문서 갱신.

## Human Approval Gates — 자동 실행 금지
- `server/migrations/*.sql` 적용 (PG 전환 자체가 미완)
- 라이브 계정·캐릭터 데이터(`server/data/`) 삭제·초기화
- named volume 삭제 (`docker compose down -v`)
- 라이브 QA 세션 중 서버 재시작 (영속성 검증 시나리오로 계획된 경우 제외)
- 비밀값 조회 (훅이 차단)
- 프로덕션 배포·terraform: 대상 자체가 없음 — 생기면 이 문서에 게이트부터 정의

## Verification
기동 후 로그로 바인딩 포트(47900) 확인. 라이브 QA는 증거(로그·스크린샷) 필수.

## Failure Handling
기동 실패 → `/debug`. 게이트 차단(`runtime_support_manifest_missing` 등)은 우회하지 말고 게이트 요구사항을 채운다 — fail-closed는 버그가 아니다.

## Completion Criteria
의도한 프로세스 상태 + 검증 증거 + 데이터 손실 없음.

## State Files to Update
`.ai/current-state.md`. 라이브 run 산출물은 `_workspace/` 관례(gitignored) — 영수증 경로를 기록.

## Handoff Requirements
실행 중인 프로세스·사용한 WINEPREFIX·run 영수증 경로를 `.ai/handoff.md`에.
