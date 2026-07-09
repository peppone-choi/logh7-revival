# LOGH VII 게임 서버 데이터/처리 아키텍처

작성: 2026-06-10. 목표: **실서버 기반 수백~수천명 동접 플레이**. 런타임 = Node.js (의존성 최소, ESM).

## 0. 핵심 원칙 (확정)

- **게임 액션마다 DB 트랜잭션 = 금지.** 수천 동접 × 초당 다수 액션이면 DB가 즉시 병목이 되고 레이턴시가 붕괴한다.
- **authoritative 게임 상태는 전부 메모리에 둔다.** 모든 gameplay CRUD는 인메모리 집합체(aggregate)에서 처리한다.
- **DB는 영속성(durability)만 담당한다** — hot path에 들어가지 않는다.
- 이것이 본질적으로 **CQRS + (선택적) 이벤트 소싱 + tick 기반 시뮬레이션** 패턴이다.

## 1. CQRS 분리

```
Command(write)  클라 명령 → 검증(인메모리 상태 대비) → 인메모리 월드 변이 → 도메인 이벤트 방출
Query(read)     인메모리 read projection에서 즉시 응답 (읽기 부하는 별도 스케일)
```

- 쓰기 모델 = authoritative 인메모리 월드(집합체). 읽기 모델 = 그로부터 파생된 projection(목록/뷰).
- 분리 이유: 읽기와 쓰기의 부하 특성·스케일 축이 다르다. 읽기는 복제/캐시로 수평 확장, 쓰기는 결정적 단일 경로 유지.

## 2. Tick 기반 시뮬레이션 (배칭의 핵심)

- 클라 명령은 도착 즉시 처리하지 않고 **command queue에 모았다가 틱 경계에서 일괄 적용**한다(결정적 순서).
- 이것이 "한 트랜잭션당 하나" 문제의 해법: 한 틱이 수많은 명령을 한 번에 처리하고, 영속화도 틱 단위로 배칭된다.
- **Node 단일 이벤트 루프가 오히려 강점**: 락 없이 결정적 순서로 상태를 변이 → 동시성 버그 원천 차단.
- 전략 시뮬(LOGH)은 틱레이트가 낮아도 된다(예: 권역 업데이트 5~20Hz, 또는 더 느린 도메인 틱). CPU 여유.

## 3. 영속성 레이어 (hot path 밖, 전부 비동기)

세 층으로 분리, 어느 것도 틱 루프를 블록하지 않는다:

1. **이벤트 로그(durability 경계)**: 도메인 이벤트를 append-only 로그에 추가. **group-commit fsync(틱당 1회)**로 수천 명령을
   한 번에 내구화. "명령이 영속됐다"의 기준은 이벤트 로그 append+fsync.
2. **스냅샷**: 주기적(또는 N 이벤트마다) 월드 전체/증분 직렬화. 복구 = 최신 스냅샷 로드 + 이후 이벤트 tail replay → replay 시간 bound.
3. **write-behind**: 변경된 엔티티를 백그라운드 워커가 배치로 DB(Postgres 등)에 flush. 계정/영속/분석 데이터용. hot path 아님.

복구 모델: crash 시 = 스냅샷 + 이벤트 tail replay로 인메모리 월드 재구성. 손실 윈도우 = 마지막 fsync 이후(틱 단위, 무시 가능).

## 4. Node 구현 형태

```
TCP 연결 핸들러(프로토콜 상태머신 login→lobby→world→play)
   → 클라 메시지 디코드 → Command 로 변환 → commandQueue.push()
[게임 루프 / 틱]
   → commandQueue 드레인 → 검증 → 인메모리 월드 변이 → 이벤트 emit
   → 변경분을 persistenceQueue 로 (비동기)
   → 영향받은 클라에게 read projection/이벤트 기반 응답(0x0030 등) 송신
[영속성 워커 (worker_thread/별도 프로세스)]
   → persistenceQueue 소비 → 이벤트 로그 append(fsync 배치) + 스냅샷 + DB write-behind
```

- 인메모리 월드: `Map<entityId, Entity>` 인덱스 + 보조 인덱스(섹터별/소유자별). 순수 JS 객체, 락 프리.
- 영속성은 반드시 별도 워커: 디스크/DB I/O가 틱 루프를 막으면 안 됨.

## 5. 확장성 경로 (수천 → 그 이상)

- **단일 프로세스로 수천 TCP 연결은 충분**(I/O 바운드, 이벤트 루프). 한계점은 시뮬레이션 CPU.
- CPU 한계 도달 시: 월드를 **샤드(은하 섹터/권역별)로 분할**, 샤드별 authoritative 프로세스 + 크로스샤드 메시징(액터 모델).
  처음엔 단일 프로세스로 시작하고, 측정 후 샤딩.
- 읽기 스케일: read projection을 복제(read replica)하거나 게이트웨이에서 캐시.
- 상태 비저장 게이트웨이(TCP 종단/프로토콜) ↔ 상태 보유 시뮬레이션 노드 분리도 가능.

## 6. LOGH VII 도메인 매핑

- RE에서 관측된 엔티티 풀(scan: 600 records × 2540B stride, world/grid init)이 인메모리 월드의 엔티티
  (함대/인물/행성/성계 등). `transportQueueCount`/world·grid init이 도메인 객체 동기화 지점.
- 메시지-패밀리(0x0200 SSLoginOK, 0x0205 SSGameLoginOK, 0x0f01 world, 0x0f03 grid)가 명령/이벤트 종류로 매핑된다.
- 이동 계열(0x0031/0x0032/0x0033)이 첫 gameplay 명령 → 인메모리 엔티티 상태 변이 → projection으로 클라 반영.

## 7. 프로토콜 통합 (현재 RE와의 접점)

- 연결 상태머신(login→lobby→world→play)은 이미 RE 중인 0x0030/GIN7 프로토콜을 디코드해 **명령으로 변환**하고,
  서버 응답(0x0030 inner)은 **read projection/도메인 이벤트에서 생성**한다.
- 즉 프로토콜 레이어(인코딩/암호/프레이밍)와 게임 로직(인메모리 월드/CQRS)은 분리한다 — 프로토콜은 transport,
  게임 상태는 도메인.

## 8. 단계적 도입

지금은 단일 클라 로그인/lobby 진입 RE 단계다. 이 아키텍처는 **gameplay 상태가 생기는 시점**(world 진입 후)부터 필요.
순서: (1) 프로토콜 end-to-end(login→lobby→world) 완성 → (2) 인메모리 월드 + 틱 루프 + 명령 처리 → (3) 이벤트 로그/스냅샷
영속성 → (4) write-behind DB → (5) 측정 후 샤딩. 1·2를 먼저, DB는 마지막.
