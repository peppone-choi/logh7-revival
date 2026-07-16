# LOGH VII Revival

## 미션

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII (LOGH VII)** 를 되살린다.
원본 클라이언트(archive.org CD)에 자체 구현 서버를 붙여 멀티플레이 온라인 게임으로 복원한다.

## 현재 기준 (2026-07-16)

- 2026-07-05 리셋 전 스냅샷은 커밋 `5bd249c`다. 옛 코드는 참고용으로만 복원하고 현재 구현에 그대로 되살리지 않는다.
- M0.5/M1/M2/M3는 완료했다. run9에서 두 원본 클라이언트의 월드 진입, 이동 브로드캐스트, 재로그인·서버 재시작 영속성을 통과했다.
- M4는 부분 진행이다. production SQLite runtime의 `EnterWorld`·`MoveGrid`가 동기 CQRS/UoW를 거치며, 성공한 `0x0b01`만 위치와 `GridMoved` 1건을 함께 커밋한다.
- production `0x030b`는 SQLite 함선 catalog 63행 가운데 원본 클라이언트가 라이브에서 수용한 선두 19행만 `undefined4* + 1`의 4바이트 헤더 뒤 `0x8c` stride로 보낸다. 20행 이상은 admission 정지를 재현하므로 금지한다. 이 slice는 두 클라이언트 월드 진입과 `0x0b01`/`0x0b07` 이동을 보존하지만 함선 마커 root `DAT_009d2fa8`은 여전히 null이고 전략 FSM은 state 2에서 진행하지 않는다.
- 로그인 클라이언트 영역은 원본 `644×484`를 유지하고, 로그인 뒤 게임 영역만 `1920×1080`으로 전환한다.
- 현재 주력은 M4 전략 커맨드·서버 데이터이며, 전체 한글화·전술/전투·운영은 아직 완료가 아니다.

## 소스 오브 트루스

- `artifacts/logh7-cd/Logh7.bin|.cue` — https://archive.org/details/logh-7 CD 이미지 (md5 검증 완료: `bf87c6a8...`/`8784...`, gitignored — 없으면 재다운로드)
- `docs/reference/*.pdf` — 공식 매뉴얼 5종 (게임 규칙의 근거)
- `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md` — 현재 요구사항·구현 경계·운영 기준
- `.omo/plans/logh7-execution-plan-current.md` — 현재 실행 순서와 완료 게이트
- `docs/logh7-document-index-current.md` — 현행·역사 문서 라우팅 인덱스
- `docs/logh7-reference-haul.md` — 트랙별 외부 레포·도구·방법론 라우터. 관련 작업 전에 반드시 읽되 캐논 근거로 쓰지 않는다.

## 개발 규칙

- **CodeGraph 필수**: `.codegraph/`가 있으면 코드 위치/호출경로/영향범위 질문은 codegraph 먼저, rg로 확인.
- **참고 목록 필수**: LOGH VII 작업은 `docs/logh7-reference-haul.md`의 해당 트랙을 먼저 읽는다.
- **Blocked-Loop Rule**: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회면 접근을 전환하고 블로커 보고서를 쓴다.
- 코드 주석은 한글로 쓴다 (캐논 일본어 용어·바이너리 오프셋은 원문 유지).
- 라이브 검증 없이 완료 주장 금지. 테스트 출력·스크린샷 등 증거를 남긴다.

## 참고 방법론 적용 기준

- **증거 우선순위**: `docs/logh7-reference-haul.md`는 방법론 라우터이지 캐논 데이터가 아니다. 게임 규칙·값·와이어 판정은 CD, 공식 매뉴얼, 정본 EXE, 패킷, 라이브 관측으로 다시 입증한다.
- **백엔드·프런트엔드 경계**: MHServerEmu 사례처럼 원본 클라이언트는 표시와 입력 의도, 제한적 prediction만 맡는다. 자체 서버가 입력 검증, 상태 권위, 영속화, 다른 클라이언트 브로드캐스트를 맡는다.
- **RE 도구 차용**: Frida 예제와 Ghidra 자동화 레포는 훅·전수 분석 패턴만 참고한다. 정본 EXE 해시와 오프셋을 매 실행에서 확인하고, 외부 코드는 라이선스 확인 없이 복사하지 않는다.
- **한글화 의사결정**: CP932 자산을 임의로 UTF-8 저장하지 않는다. 전체 한글화는 CP949 자산 변환과 SJIS tunneling + GDI proxy/font/IME 경로를 같은 시나리오로 비교한 뒤 선택하며, 원본 백업·해시 guard·rollback을 필수로 둔다.
- **외부 레포 격리**: 참고 레포는 `/reference/` 아래에서만 clone하고 커밋하지 않는다. 프레임워크를 바로 도입하지 말고 현재 프로토콜·서버 경계에 필요한 패턴만 최소 이식한다.

## 하네스와 현재 구현 경계

- LOGH VII 자산추출·RE·프로토콜·서버·한글화·라이브 QA 요청에는 `logh7-orchestrator` 스킬을 사용한다.
- 원본 클라이언트는 frontend, Node 서버는 authoritative backend다. 경계는 presentation/session → application command → domain authority → persistence 순서로 유지한다.
- run9/run3의 JSON store 라이브 QA와 production SQLite 증거를 분리한다. run3는 SQLite CQRS를 실행하지 않았다.
- `MoveGrid`는 현재 `0x0315`가 내보내는 `spaceCells ∪ systemCells`만 허용하고 정책 미주입 시 fail-closed다. 이는 표시·권위 일치일 뿐 정본 승격이 아니며, `galaxy-passable-cells`와 galaxy trust 데이터는 교차 확인 전까지 provisional이다.
- M4는 81개 catalog 중 factory 확인 2개·미해결 79개다. PCP/MCP ledger, CP charge, timers/jobs, 실제 command outcome, `0x0327` 미확정 재고, disconnect의 `online=false` 영속화가 남았다. 동기 SQLite bridge는 PostgreSQL 전환 전에 async-capable하게 바꾼다.
- M6는 현재 CP932 표시 복구와 일부 `.rsrc` 한글화까지만 완료했다. 일본어가 읽힌다는 사실을 전체 한글화 완료로 보고하지 않는다.
- 리마스터는 로그인 원본 크기와 본게임 1080p 경계를 보존한다. 고해상도 자산은 provenance·원본 fallback·rollback이 갖춰진 뒤 적용한다.
- 2026-07-16 검증 기준선은 이번 UnitShip targeted `132/132`, 전체 server `460 total / 458 pass / 0 fail / 2 pre-existing conditional skips`다. 원본 클라이언트 run5는 두 클라이언트 월드 진입과 `0x0b01`/`0x0b07` 이동을 보존했지만 post-warp HUD idle gate는 실패했고 함선 마커 root는 null이었다. 기존 Python live harness `16/16`, changed JS LSP error `0`, 비항법 cell `0` 무변경 probe도 유지한다.

## 완료 게이트

- 모든 LOGH VII 작업 단위는 종료 전에 루트 `AGENTS.md`를 갱신한다. 해당 작업이 바꾼 현재 상태, 실행 경계, 남은 다음 작업, 검증 근거 중 지속적으로 필요한 내용을 반영한다.
- 같은 작업에서 영향을 받은 `docs/` 현행 문서와 `E:\\obsidian-tech-vault\\1. 프로젝트\\은하영웅전설 7 리바이벌`의 `현재 상태.md`·로드맵도 실제로 수정해 저장소와 볼트가 같은 상태를 가리키게 한다.
- `AGENTS.md` 변경을 diff로 확인하고 현재 코드·로드맵과 모순이 없는지 검증하기 전에는 작업을 완료로 보고하거나 커밋을 최종 승인하지 않는다.
- 단순 진행 로그를 누적하지 않는다. 낡은 지침은 수정·삭제하고, 반복되는 설명은 소스 오브 트루스 한 곳으로 합쳐 문서를 짧고 현행으로 유지한다.

## 위임·토큰 원칙

- 메인 Advisor는 요구사항 분해, 설계 결정, diff·테스트·라이브 증거 검증, 커밋 승인을 맡는다.
- 구현 노동은 경계가 명확한 Worker 한 명에게 우선 위임한다. 부모 Worker의 하위 에이전트 생성은 메인이 명시한 경우가 아니면 금지한다.
- 독립 작업도 필요한 수만 병렬화하고, 같은 파일·같은 증거를 여러 에이전트가 중복 조사하지 않는다.
- 브리프에 파일 경로, 이미 확인한 사실, 금지 범위, 완료 테스트를 넣어 재탐색을 막는다.
- Worker 보고는 그대로 승인하지 않는다. 메인이 변경 diff와 검증 출력을 직접 확인한다.
- 한두 줄 수정, 커밋·푸시, 좁은 문서 정리는 위임 오버헤드가 더 크면 직접 처리한다.
- 같은 증상 3회 또는 새 증거 없는 조사 2회에 도달하면 반복 실행을 중단하고 접근을 바꾼다.
