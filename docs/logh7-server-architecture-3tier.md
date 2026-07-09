# LOGH VII 서버 백엔드 — 3티어 · CQRS · ORM

작성: 2026-07-09

## 목표

원본 클라 호환 **권위 게임 서버**를 Hibernate급 영속성 규율로 운영한다.
와이어 코덱은 프로토콜 어댑터이고, 게임 진실(truth)은 도메인+영속 계층이 소유한다.

## 3티어

| 티어 | 경로 | 책임 |
|---|---|---|
| **Presentation** | `server/src/presentation/` | TCP 0x0030 프레이밍, 세션 소켓, 트레이스. 도메인 모름. |
| **Application** | `server/src/application/` | CQRS 커맨드/쿼리 버스, 유스케이스 핸들러, 트랜잭션 경계. |
| **Domain + Infrastructure** | `server/src/domain/`, `server/src/infrastructure/` | 엔티티·규칙 / ORM·UnitOfWork·Repository·SQLite. |

기존 `server/src/server/*` 와이어 코덱은 **프로토콜 포트(어댑터)** 로 유지한다.

## CQRS

- **Command** (쓰기): `LoginWithGin7`, `CreateCharacter`, `EnterWorld`, `MoveGrid`, `GridChat`
- **Query** (읽기): `GetAccountCharacters`, `GetWorldPlayer`, `GetFleetAtCell`
- 커맨드 핸들러만 UnitOfWork 를 flush 한다. 쿼리는 읽기 전용 스냅샷.

## ORM / Hibernate 규율

| 개념 | 구현 |
|---|---|
| Session / UnitOfWork | `infrastructure/persistence/UnitOfWork.mjs` |
| Identity map | entity key → 인스턴스 1개 |
| Dirty tracking | `revision` + `_dirty` 플래그, flush 시만 SQL |
| Transaction | SQLite `BEGIN IMMEDIATE` … `COMMIT` / `ROLLBACK` |
| Repository | `AccountRepository`, `CharacterRepository`, `WorldStateRepository` |
| Fail-closed | 커맨드 검증 실패 시 flush 없음, 와이어 NG |

DB 파일: `server/data/logh7.sqlite` (유저 환경 실경로).

## 요청 흐름

```
G7MTClient ──TCP──▶ Presentation(playable)
                      │ decode wire
                      ▼
                   CommandBus.execute(MoveGrid)
                      │
                      ▼
                   Handler ──▶ Domain rules
                      │
                      ▼
                   UnitOfWork.flush() ──▶ SQLite
                      │
                      ▼
                   Notify builders ──▶ Presentation broadcast
```

## 비범위

- 분산 샤딩, Kafka, 다중 리전
- Hibernate 바이트코드 인핸스 / JPA 애노테이션 1:1 복제
