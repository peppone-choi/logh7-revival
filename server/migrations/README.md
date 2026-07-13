# PostgreSQL 마이그레이션 (타깃 — 아직 기본 부팅 경로 아님)

공개 서버 영속성을 SQLite → PostgreSQL 로 전환하기 위한 버전 관리 마이그레이션 디렉터리.
**현재 기본 부팅은 여전히 SQLite** (`node:sqlite`, `Database.mjs`). 이 디렉터리는 다음
배치에서 async PG 포트가 붙을 때 적용할 타깃 정본이다.

## 컨벤션

- 파일명: `NNNN_snake_name.sql` (0001 부터 순번). 순번 오름차순으로 1회씩 적용.
- 각 파일은 자체 `BEGIN; ... COMMIT;` 로 트랜잭션 원자성을 가진다.
- 적용 이력은 `schema_migrations(version INT PRIMARY KEY, applied_at BIGINT)` 에 기록.
  이미 적용된 version 은 건너뛴다(멱등).
- 되돌리기(down)는 두지 않는다 — 롤포워드 전용. 잘못된 마이그레이션은 다음 번호로 교정.

## 현행 SQLite 대비 차이

기존 `Database.mjs` 는 부팅마다 `CREATE TABLE IF NOT EXISTS` 를 전량 실행하는
"항상-생성" 방식이라 진짜 버전 관리가 아니다(`schema_version` 는 상수 3). PG 전환 시
이 파일-기반 순번 러너로 대체해, 스키마 변경을 추적 가능한 증분으로 관리한다.

## 러너

`src/infrastructure/persistence/pg/migrate.mjs` — 최소 러너 스텁. `pg` 풀을 받아
이 디렉터리의 `*.sql` 을 순서대로 적용하고 `schema_migrations` 에 기록한다.
다음 배치에서 서버 부팅(`main.mjs`)이 `DATABASE_URL` 이 설정된 경우에만 호출하도록 연결.
