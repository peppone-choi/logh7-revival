# Known Issues

에이전트가 작업 전에 알아야 할 미해결 문제. 해결되면 삭제한다.
(출처: 2026-07-17 기준 `docs/logh7-roadmap-current.md`·루트 진입 문서. 상세는 로드맵이 정본)

## 제품 (LOGH VII)

- 함선 마커 root `DAT_009d2fa8`이 여전히 null — 전략 FSM이 state 2에서 진행하지 않음.
- production `0x030b`는 SQLite 함선 catalog 63행 중 선두 19행만 전송 가능. 20행 이상은 클라이언트 admission 정지 재현 — 금지.
- M4 커맨드 카탈로그 81개 중 factory 확인 2개. PCP/MCP ledger, CP charge, timers/jobs, `0x0327` 미확정 재고, disconnect의 `online=false` 영속화 미구현.
- 동기 SQLite bridge는 PostgreSQL 전환 전에 async-capable로 교체 필요. PG는 skeleton(기본 부팅은 SQLite).
- run9/run3/run5 원증거와 당시 exact patch EXE 계보 영수증이 현재 checkout에 없음 — 과거 통과 기록을 fresh release gate로 재사용 금지.
- macOS Wine Stable 11은 pure win32 prefix를 지원하지 않아 명시적 WoW64 prefix가 필요하다. 하네스는 이를 지원하지만 다른 Wine 배포판과 Linux 실기는 미검증이다.
- 2026-07-17 macOS live run은 client process와 `0x0034/0035/0036/0030` 로그인 패킷 흐름까지 도달했으나 `invalid-credentials`/login-ng, client exit 3, 사용자 관측 runtime error로 종료됐다. successful login/gameplay와 cross-platform 전체 pass는 미종결이다.
- native Windows 직접 실행 분기는 플랫폼 simulation으로만 검증됐다. Windows 실기 클라이언트·스크린샷 증거는 별도 live run 전까지 미검증이다.

## 인프라·도구

- Codex 프로젝트 훅은 로컬 payload 회귀 26/26을 통과했지만, `.codex/hooks.json` 변경 hash를 사용자가 `/hooks`에서 신뢰하고 새 task를 시작하기 전까지 라이브 활성은 미검증이다.
- Codex Pre/Post 훅은 현재 `apply_patch`와 Bash 경로를 보호·후검증한다. 통합 실행기나 웹 도구 등 훅 matcher 밖의 경로는 자동 차단 범위가 아니므로 `AGENTS.md` 계약과 수동 검증이 계속 적용된다.
- 로컬 `basedpyright`·`yaml-ls`가 설치돼 있지 않아 PostToolUse LSP 단계는 실패를 보고한다. 이 작업에서는 설치 범위를 추가하지 않았으며 Python은 `py_compile`·`unittest`, YAML은 parser·skill validator로 대체 검증한다.
- 최초 live drive cleanup receipt는 자동 `D:`/`D::` 재생성을 외부 변경으로 오인해 `release=false`였다. 동일 target 복원, cleanup 재격리, prefix 디렉터리 inode 경계와 예외 release는 단위 테스트를 통과했지만 수정 후 fresh live cleanup receipt는 아직 없다.
- Fablize/PostToolUse가 실제 명령 결과와 별개로 구체 정보 없는 generic `tool failure`를 반복 보고한다. 명령 exit/receipt로 실제 실패를 별도 판정하며 이 generic 보고는 원인 미해결 하네스 기준선으로 격리한다.

- lint/type check: NOT_CONFIGURED (eslint·tsconfig 없음). 구문 검사(`node --check`, `py_compile`)가 유일한 정적 검사.
- SRV-CORR(PR #8) 리뷰 비차단 follow-up — Claude GHA·CodeRabbit 수렴 2건 + nit 2건 (2026-07-16):
  - `writeTrace`의 correlation `outcome`이 `record.message` 존재로 추론됨 — 정보성 라인에 message가 생기면 오분류. 명시적 outcome 인자 또는 event 기반 분류로 개선.
  - `monotonicTimestampNs = Number(hrtime.bigint())`는 2^53ns(~104일 uptime) 초과 시 정밀도 손실 — 필요시 string 직렬화. 단 23키 스키마 계약 변경이라 proxy(`tools/live`)와 동시 변경+schemaVersion 검토 필요.
  - writeTrace correlation catch 경로(실패 주입) 통합 테스트 미커버.
  - Jira 안내 문구가 다른 진입 문서·문서 인덱스와 동기화됐는지 점검(lifecycle-planning은 갱신됨).
- 테스트 수치(서버 460, Python 16/16 등)는 2026-07-16 historical baseline — exact 명령·환경으로 재실행 전에는 fresh gate 아님.
- 스킬 부트스트랩(2026-07-17, bootstrap-skills.sh 도입) 잔여 — 사람 결정 필요 3건:
  - `agent/skills/`(점 없는 최상위 디렉터리)는 skills.sh도 인식 못 하는 고아 — 폐기 여부 결정.
  - `docs/logh7-work-plan-current.md` "필수 스킬" 표가 `.claude/agents/*.md` 실제 참조보다 넓음 — persona에 humanizer/style-guide/karpathy-guidelines 추가 여부 결정.
  - `skills-lock.json`의 humanize·humanize-redo 항목 skillPath가 실제 파일과 불일치(stale) — lock 정리 여부 결정.

`logh7-orchestrator`의 Claude STALE은 2026-07-17 플랫폼별 live-QA 직접 지시를 canonical 선택 근거로 삼아 `.agents` 판으로 동기화해 해소했다.
