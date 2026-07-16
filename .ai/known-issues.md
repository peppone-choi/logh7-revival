# Known Issues

에이전트가 작업 전에 알아야 할 미해결 문제. 해결되면 삭제한다.
(출처: 2026-07-16 기준 `docs/logh7-roadmap-current.md`·루트 진입 문서. 상세는 로드맵이 정본)

## 제품 (LOGH VII)

- 함선 마커 root `DAT_009d2fa8`이 여전히 null — 전략 FSM이 state 2에서 진행하지 않음.
- production `0x030b`는 SQLite 함선 catalog 63행 중 선두 19행만 전송 가능. 20행 이상은 클라이언트 admission 정지 재현 — 금지.
- M4 커맨드 카탈로그 81개 중 factory 확인 2개. PCP/MCP ledger, CP charge, timers/jobs, `0x0327` 미확정 재고, disconnect의 `online=false` 영속화 미구현.
- 동기 SQLite bridge는 PostgreSQL 전환 전에 async-capable로 교체 필요. PG는 skeleton(기본 부팅은 SQLite).
- run9/run3/run5 원증거와 당시 exact patch EXE 계보 영수증이 현재 checkout에 없음 — 과거 통과 기록을 fresh release gate로 재사용 금지.
- fresh `--execute --initialize-prefix`는 `runtime_support_manifest_missing`(exit 2, `fullPassEligible=false`)으로 launch 전 차단 — 다음 P0 게이트는 V1 runtime-support manifest와 sentinel 복구. receipt: `_workspace/logh7-revival/runs/20260716T051159Z-recovery01/p0-wine-execute-retry-3b09e461.json` (`sha256 3c216e6b...e5d3e1ea`).

## 인프라·도구

- lint/type check: NOT_CONFIGURED (eslint·tsconfig 없음). 구문 검사(`node --check`, `py_compile`)가 유일한 정적 검사.
- SRV-CORR(PR #8) 리뷰 비차단 follow-up — Claude GHA·CodeRabbit 수렴 2건 + nit 2건 (2026-07-16):
  - `writeTrace`의 correlation `outcome`이 `record.message` 존재로 추론됨 — 정보성 라인에 message가 생기면 오분류. 명시적 outcome 인자 또는 event 기반 분류로 개선.
  - `monotonicTimestampNs = Number(hrtime.bigint())`는 2^53ns(~104일 uptime) 초과 시 정밀도 손실 — 필요시 string 직렬화. 단 23키 스키마 계약 변경이라 proxy(`tools/live`)와 동시 변경+schemaVersion 검토 필요.
  - writeTrace correlation catch 경로(실패 주입) 통합 테스트 미커버.
  - Jira 안내 문구가 다른 진입 문서·문서 인덱스와 동기화됐는지 점검(lifecycle-planning은 갱신됨).
- 테스트 수치(서버 460, Python 16/16 등)는 2026-07-16 historical baseline — exact 명령·환경으로 재실행 전에는 fresh gate 아님.
