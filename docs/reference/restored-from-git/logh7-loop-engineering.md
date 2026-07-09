# LOGH VII 루프 엔지니어링 운영안

작성일: 2026-06-17 KST

적용 대상: `E:\logh7-revival`

참조:
- GeekNews 요약: https://news.hada.io/topic?id=30336
- 원문: https://addyosmani.com/blog/loop-engineering/

## 목적

이 저장소의 작업은 단발 프롬프트로 끝나지 않는다. 목표는 실제 `G7MTClient.exe`로 회원가입, 캐릭터 생성, 접속, 로비, 월드 렌더, 전략 상호작용, 한글 채팅, 성계 좌표 검증까지 반복해서 밀어붙이는 것이다.

루프 엔지니어링 적용 원칙은 다음이다.

- 에이전트에게 매번 새 지시를 주는 대신, 저장소 안의 상태 파일과 정지 조건이 다음 작업을 생성한다.
- maker와 checker를 분리한다. 구현한 쪽이 완료 판정을 독점하지 않는다.
- 모든 완료 주장은 실제 클라이언트 화면, trace, DB 덤프, EXE SHA 복구 여부 중 하나 이상의 증거를 갖는다.
- 루프가 만든 결과를 사람이 이해할 수 있도록 문서를 먼저 갱신한다. 자동화는 판단을 대체하지 않는다.

## 루프 구성 요소 매핑

| 요소 | 이 저장소에서의 적용 |
|---|---|
| Automations | 아직 실제 스케줄은 만들지 않는다. 대신 이 문서의 "자동화 프롬프트"를 Codex Automation 또는 `/goal` 입력으로 그대로 쓸 수 있게 둔다. |
| Worktrees | 병렬 구현은 `codex/<task>` 브랜치 또는 별도 worktree에서만 한다. 같은 파일을 두 agent가 동시에 고치지 않는다. |
| Skills | 프로젝트 지식은 `AGENTS.md`, `docs/logh7-current-work-register-2026-06-17.md`, 이 문서, `docs/logh7-loop-state.md`에 축적한다. 반복 절차가 안정되면 별도 skill로 승격한다. |
| Plugins/connectors | GitHub push/PR, 브라우저 QA, 실제 클라이언트 실행 도구를 사용한다. filesystem만 보는 루프로 완료 판정을 내리지 않는다. |
| Sub-agents | `.codex/agents/logh7-loop-explorer.toml`, `.codex/agents/logh7-loop-verifier.toml` 역할을 사용한다. explorer는 증거 수집, verifier는 완료 조건 반박을 맡는다. |
| Memory/state | `docs/logh7-loop-state.md`가 루프 상태 파일이다. 매 실행은 이 파일을 먼저 읽고 마지막에 갱신한다. |

## 정지 조건

루프는 아래 조건이 모두 충족될 때만 "완료"로 닫는다.

1. `docs/logh7-loop-state.md`의 모든 P0 항목이 `done`이다.
2. 실제 클라이언트로 회원가입부터 월드 진입까지 스크린샷과 trace가 남아 있다.
3. 성계/행성/요새/함대 좌표가 source provenance와 클라이언트 렌더 좌표 양쪽에서 검증됐다.
4. 채팅 한글 왕복이 실제 클라이언트 2개 또는 동등한 송수신 하네스에서 통과했다.
5. 로비 풀스크린은 4:3 비율 유지와 와이드 모니터 좌우 필러가 확인됐다.
6. `0x0b01->0x0b07` 또는 동등한 전략 명령/응답이 관측됐다.
7. 클라이언트, DLL, 데이터 파일 RE 커버리지 행렬이 최신이다.
8. 모든 실행 세션은 종료됐고, EXE SHA 원복 검증이 남아 있다.

## 한 사이클 절차

1. `AGENTS.md`, `docs/logh7-current-work-register-2026-06-17.md`, `docs/logh7-loop-state.md`를 읽는다.
2. `docs/logh7-loop-state.md`에서 첫 번째 `next` 또는 `blocked-needs-evidence` 항목을 고른다.
3. 선택 항목에 대한 RE 프리패스를 자동으로 수행한다. 최소 범위는 관련 manual/PDF 페이지,
   설치 DB/MsgDat/TCF/MDX/EXE 소비자, 직전 trace/스크린샷, 정적 VA/파일 오프셋,
   그리고 해당 UI/패킷을 실제로 읽는 클라이언트 함수다. 이미 했던 RE라도 입력 artifact의
   SHA, 문서 날짜, flag 조합이 바뀌었으면 다시 확인한다.
4. explorer 역할로 증거를 모은다. 코드 수정 전에 관련 문서, trace, 바이너리/데이터 소비자를 확인한다.
5. 필요한 경우 구현한다. 추측성 서버 데이터는 기본값으로 승격하지 않는다.
6. verifier 역할로 반례를 찾는다. 특히 Vite 화면, 메일/HUD 루프, 깨진 한글의 폰트 단정, P2/P3 데이터 과장 여부를 본다.
7. 서버 테스트와 문법 검사를 돌린다.
8. 실제 클라이언트 표면을 다시 탄다.
9. `docs/logh7-loop-state.md`를 갱신한다. 증거 경로, 남은 blocker, 다음 항목을 적는다.

## 자동화 프롬프트

Codex Automation 또는 `/goal`에는 아래 프롬프트를 사용한다.

```text
E:\logh7-revival에서 LOGH VII 루프 엔지니어링 사이클을 1회 실행한다.

반드시 먼저 AGENTS.md, docs/logh7-current-work-register-2026-06-17.md, docs/logh7-loop-engineering.md, docs/logh7-loop-state.md를 읽는다.

docs/logh7-loop-state.md에서 첫 번째 next 항목 하나만 고른다. 구현 전에 해당 항목의 RE 프리패스를 자동으로 수행한다. 최소한 관련 manual/PDF 페이지, 설치 DB/MsgDat/TCF/MDX/EXE 소비자, 직전 trace/스크린샷, 정적 VA/파일 오프셋, 실제 클라이언트 소비 함수를 다시 대조한다. 선택한 항목을 실제 클라이언트 또는 RE 증거로 진전시키고, 구현이 필요하면 최소 수정한다. Vite 화면은 게임 클라이언트 검증으로 세지 않는다. 0x0f08->0x0f09는 전략 플레이로 세지 않는다. P2/P3 데이터를 원본 서버 데이터로 과장하지 않는다.

끝나기 전에 테스트/문법 검사와 실제 표면 QA를 수행하고, 모든 ui_explorer 세션을 stop으로 닫으며, EXE SHA 복구 여부를 확인한다. 마지막으로 docs/logh7-loop-state.md에 증거와 다음 항목을 갱신한다.
```

## 병렬 작업 규칙

- 좌표/마커, 한글/채팅, 회원가입/캐릭터, 풀스크린 필러, 전체 RE 인벤토리는 서로 다른 worktree에서만 병렬화한다.
- 동일 파일 소유권:
  - `src/server/logh7-login-session.mjs`: 회원가입/캐릭터/월드 진입 담당 사이클만 수정한다.
  - `src/server/logh7-login-protocol.mjs`: wire builder 담당 사이클만 수정한다.
  - `docs/logh7-loop-state.md`: 한 사이클 종료 시 main agent만 수정한다.
- 병렬 agent 결과는 바로 merge하지 않는다. verifier가 증거와 테스트를 확인한 뒤 합친다.

## 실패 처리

- 실제 클라이언트가 종료되면 가장 먼저 session stop, port/process 정리, EXE SHA 검증을 한다.
- 실패 원인을 환경 플래그, 서버 trace, 클라이언트 스크린샷, 바이너리 소비자 순서로 분리한다.
- 같은 blocker가 세 번 반복되면 상태 파일의 해당 항목을 `blocked-needs-evidence`로 바꾸고 필요한 증거를 구체적으로 적는다.

## Claude Code 실행 (Codex와 동등)

이 루프는 Codex 전용이 아니다. 같은 maker/checker 분리와 상태 파일 주도 방식을 Claude Code에서도 그대로 쓴다. 매핑은 1:1이다.

| 요소 | Codex | Claude Code |
|---|---|---|
| explorer 서브에이전트 | `.codex/agents/logh7-loop-explorer.toml` | `.claude/agents/logh7-loop-explorer.md` |
| verifier 서브에이전트 | `.codex/agents/logh7-loop-verifier.toml` | `.claude/agents/logh7-loop-verifier.md` |
| 한 사이클 진입점 | Codex Automation / `/goal` 프롬프트 | 슬래시 커맨드 `/logh7-loop [P0-id\|auto]` (`.claude/commands/logh7-loop.md`) |
| 결정론 N사이클 | (없음) | Workflow `logh7-loop` (`.claude/workflows/logh7-loop.js`) |
| 상태 파일 | `docs/logh7-loop-state.md` | 동일 |

### 사람이 한 사이클 돌리기

```text
/logh7-loop P0-02
```

또는 항목을 비우면 상태 파일의 첫 번째 `next`를 자동 선택한다:

```text
/logh7-loop
```

슬래시 커맨드는 위 "한 사이클 절차"를 강제한다: 상태 읽기 → `logh7-loop-explorer`로 RE 프리패스/증거 → 최소 구현 → `npm run test:server` → **별도 패스** `logh7-loop-verifier`로 적대적 검증 → (가능 시) 실클라 표면 → `docs/logh7-loop-state.md` 갱신.

### 결정론적 N사이클 (Workflow)

```text
Workflow({ name: "logh7-loop", args: { item: "P0-02", cycles: 1 } })
```

`explorer → maker → tester → verifier`를 결정론적으로 파이프라인한다. explorer/verifier는 위 두 서브에이전트(읽기 전용)로 고정되고, maker만 코드를 수정한다. 테스트 실패나 verifier fail이면 다음 사이클로 자동 진행하지 않고 멈춰 사람 판단을 받는다. 각 사이클은 공유 파일을 순차 수정하므로 절대 병렬화하지 않는다.

### Claude 스킬 매핑

- `loop` (내장 스킬): 일정 간격 반복 실행이 필요할 때. 이 게임 루프는 사이클마다 실클라/사람 판단이 끼므로 무인 interval보다 `/logh7-loop` 수동 1사이클 + Workflow 결정론 변형을 기본으로 한다.
- `verify` / `code-review`: maker와 분리된 검증 패스의 보조.
- Workflow 도구: 큰 조사/구현을 병렬 fan-out + 적대적 검증으로 돌릴 때. 단, 같은 파일을 동시에 고치는 maker 병렬화는 worktree 격리로만 한다.

### 동일 파일 소유권 (양쪽 공통)

`docs/logh7-loop-state.md`는 한 사이클 종료 시 메인 에이전트만 수정한다. `src/server/logh7-login-session.mjs`(회원가입/캐릭터/월드 진입), `src/server/logh7-login-protocol.mjs`(wire builder)는 담당 사이클만 수정한다. 병렬 결과는 verifier 통과 후에만 merge한다.
