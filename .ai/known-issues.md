# Known Issues

에이전트가 작업 전에 알아야 할 미해결 문제. 해결되면 삭제한다.
(출처: 2026-07-17 기준 `docs/logh7-roadmap-current.md`·루트 진입 문서. 상세는 로드맵이 정본)

## 제품 (LOGH VII)

- 전략맵 fleet roster/멤버리스트가 빈 상태 — LOGH7-58 Warp의 관문. **2026-07-17 라이브 A/B로 이전 진단 정정**(`_workspace/liveqa-20260717-logh7-58-staging/`, native Windows):
  - **정정①(roster는 비지 않는다)**: 이전 known-issue "tactical-entry 시퀀스 방출되나 스테이징 미완/빈 roster"는 오판이었다. 0x0325 레코드/roster는 라이브에서 정상(25유닛: player 0x8 + NPC 24, 레이아웃 dual-parser 확증, 0x033b unitId==0x0325 매칭 회귀가드 통과). "빈 roster" 진단은 **오타 게이트로 인한 오판**이었다: 실행 서버 코드가 7 빠진 `LOGH_TACTICAL_ENTRY`를 읽어, 운영자가 프로젝트 관례 `LOGH7_TACTICAL_ENTRY=1`로 켜도 **침묵 no-op**이 되어 0x033b/0x0f1f가 실제로는 방출된 적이 없었다(직전 ingame run world-enter 트레이스 `0x0206,0x0204,0x0325,0x0323`뿐이 그 증거). → 커밋으로 코드가 정본 이름 `LOGH7_TACTICAL_ENTRY`(7 포함)를 읽도록 통일(code/test/docs), 토글이 실제 방출을 바꾸는지 assert하는 재발방지 테스트 추가.
  - **정정②(핵심, world-enter arm은 크래시)**: 게이트 on으로 0x033b/0x0f1f를 world-enter에 방출하면 클라 FSM은 이전 정체를 통과하지만 **grid-init-spawn(0x0f02) 버스트 ~560ms 뒤 read ECONNRESET로 결정적 크래시(2/2 재현)**. 게이트 off 대조(같은 캐릭터/코드)는 같은 버스트를 정상 소화하고 전략맵 렌더+0x0300 heartbeat 지속(소켓에러 0건). → **world-enter(전략맵 문맥)에 battle 전술 arm을 붙이는 게 크래시 트리거이자 주입 지점 오배치**(전략맵 진입 ≠ 전술 battle arm). 기본 off 유지(안정), 전술 codec은 `LOGH7_TACTICAL_ENTRY=1` opt-in만 방출.
  - **정정③(진짜 남은 블로커)**: 게임플레이 블로커는 **전략맵 함대 멤버리스트 "NO DATA"** — 전술 시퀀스와 무관한 **별개의 전략 멤버/유닛 스폰 데이터 경로**다(gate off 안정 런에서도 멤버리스트 공란). `DAT_009d2fa8` null / "FSM state 2"는 이 전략 스테이징의 원인이 아니다(state 2는 battle 전술 arm 목표). **re-analyst가 클라 파서로 전략 멤버리스트를 채우는 opcode/데이터 경로를 규명 중.**
  - **다음 프로브**: (a) 전략맵 멤버리스트를 채우는 정확한 opcode/데이터 경로 RE 확정(grid-init-spawn 버스트 0x0b09/0x0b0a/0x031x/0x0356 중 어느 것이 멤버/유닛을 스테이징하는지, 필요한 필드가 서버에서 채워지는지). (b) 전술 시퀀스가 필요한 올바른 FSM 주입 지점(battle 진입 시점) RE 확정. (c) gate-on 크래시 트리거 프레임 이분탐색(버스트 프레임 1개씩 격리 A/B).
- production `0x030b`는 SQLite 함선 catalog 63행 중 선두 19행만 전송 가능. 20행 이상은 클라이언트 admission 정지 재현 — 금지.
- M4 커맨드 카탈로그 81개 중 factory 확인 2개. PCP/MCP ledger, CP charge, timers/jobs, `0x0327` 미확정 재고, disconnect의 `online=false` 영속화 미구현.
- 동기 SQLite bridge는 PostgreSQL 전환 전에 async-capable로 교체 필요. PG는 skeleton(기본 부팅은 SQLite).
- run9/run3/run5 원증거와 당시 exact patch EXE 계보 영수증이 현재 checkout에 없음 — 과거 통과 기록을 fresh release gate로 재사용 금지.
- macOS Wine Stable 11은 pure win32 prefix를 지원하지 않아 명시적 WoW64 prefix가 필요하다. 하네스는 이를 지원하지만 다른 Wine 배포판과 Linux 실기는 미검증이다.
- 2026-07-17 native Windows 라이브 런에서 lineage PASS·서버 47900·로그인 성공(로비 진입)을 확인했다. macOS `invalid-credentials`/login-ng의 원인은 QA 하네스 `tools/logh7_ui_explorer.py` `_hw_type_text` 첫 글자 누락으로 확정(제품 버그 아님). **원인 정밀화(라이브 재검증)**: 포커스 레이스가 아니라 **창 세션의 첫 `KEYEVENTF_UNICODE` 주입이 삼켜진다**(이후 unicode 문자는 정상). 필드 클릭 focus로도 재현. `313b666e`의 SHIFT warm-up은 VK 이벤트라 unicode 파이프라인을 워밍 못 해 **FAIL**(재검증 증거 `_workspace/liveqa-20260717-winnative-reverify/`). **v2 수정(`6c593202`) 라이브 PASS**: `_build_type_sequence`가 진짜 문자 앞에 자기상쇄 `[unicode 더미 'x'][VK_BACK]` warm-up을 prepend. 2026-07-17 native Windows 라이브 재검증에서 `inei00`이 **1회 입력에 온전히** 들어가고(스크린샷), pw도 첫 글자 온전, 로그인→로비 end-to-end, 서버 `authOk=true`·client==server id 일치, cleanup clean (증거 `_workspace/liveqa-20260717-winnative-reverify2/`). **first-char-drop 종결.** (v1 SHIFT는 두 번 `nei00`으로 FAIL했다.) macOS `invalid-credentials`도 같은 메커니즘이라 이 수정으로 해소된다(macOS 실기 재확인은 별도). in-game gameplay·relogin·persistence와 run9 frozen baseline·Linux 실기·전체 Wine suite는 미종결.
- native Windows 직접 실행 분기는 2026-07-17 실기 login-success로 검증됨(gameplay는 미종결).
- LOGH7-47 fail-closed 가드: 기존 `logh7_ui_explorer.py cmd_start`는 EXE hash 기록만 하고 검증 없이 launch하던 갭이 있었다. 2026-07-17 `tools/live/lineage_guard.py`(공유 `check_client_lineage`)와 `--lineage-manifest` 게이트를 추가 — manifest 주어지면 Popen 이전에 sha256·image base·sentinel을 대조해 불일치 시 blocked receipt + exit 3으로 launch를 차단(양성/음성 단위테스트 통과·직접 리뷰 fail-closed 확인). **라이브 실증 PASS(2026-07-17, `_workspace/liveqa-20260717-guard/`)**: 실제 EXE로 hash/imageBase/sentinel 불일치 3종 각각 exit 3·`lineage-blocked.json`·g7mtclient 미기동, 일치 manifest는 정상 launch. cp949 기본 콘솔에서 receipt print의 non-ASCII(일본어 EXE 경로·기호)로 UnicodeEncodeError→exit 1 크래시하던 결함은 콘솔 print를 ASCII-safe(`ensure_ascii=True`)로 고쳐 exit 3로 정정(cp949 재현 확인). **잔여**: (a) live-qa 스킬이 native launch에 `--lineage-manifest`를 넘기도록 갱신해야 실전 강제됨. wine 경로 `validate_lineage`는 `inspect_pe`만 공유로 추출(동작 보존). wine_live_qa 단위테스트는 이 Windows 호스트에서 fixture `os.symlink` 권한 부재로 실행 불가(기존 환경 제약, 회귀 아님).

- LOGH7-45/44/46(P0 잔여)은 이 native Windows 호스트에서 라이브 완료 불가로 판정(2026-07-17 rsm-explore). **LOGH7-45**: `fullPassEligible`이 코드 어디서도 true로 산출되지 않는다(`tools/live/logh7_wine_live_qa.py:4171,4396`에 리터럴 `False`만, 모든 테스트 assertFalse) → AC-3(`fullPassEligible=true`) 관측 자체가 불가하므로 산출 코드 추가 필요(b). `--execute --initialize-prefix`는 `create_preflight_receipt(:4147)`·`main()(:4560)`이 non-darwin/linux를 즉시 blocked(exit 2)로 막아 **Wine 호스트(macOS/Linux) 필요**(c). wine 단위테스트 62개는 setUp의 POSIX symlink 생성으로 이 Windows 호스트에서 실행 불가. **LOGH7-44**(5단계 계보 integration, `LOGH7_LINEAGE_INTEGRATION=1`)·**LOGH7-46**(run9/run3/run5 evidence)은 Wine 호스트 + 실제 설치 데이터 + frozen run9 baseline(현재 checkout에 없음) 필요. 주의: `fullPassEligible` 산출 코드를 Wine 호스트 검증 없이 blind 구현하면 "가짜 pass 신호" 위험(불변식 위반)이라 검증 전 보류.

## 인프라·도구

- ~~CI Claude GHA review job 실패~~ **RESOLVED (2026-07-18, PR #195 merge `2056ebd4`)**. 경위: (1) org 변수 `ANTHROPIC_MODEL=claude-opus-4-8[1m]`의 1M 접미사 → env override로 정정(PR #175). (2) 그 뒤에도 review가 init 성공 후 첫 API 호출에서 **비용 $0·num_turns 1·is_error:true**로 즉시 실패 지속(#176~#193). 처음엔 계정 레벨(크레딧/접근)로 추정했으나 **오판**. (3) 실제 근본원인: workflow가 action v1이 지원 안 하는 **최상위 `model:` 입력**을 넘겨("Unexpected input" 경고) 첫 턴이 깨진 것. `model:` 입력 제거 + `claude_args --model claude-opus-4-8`(v1 정식 경로)로 이동해 해결 — PR #195 자신의 review job이 24s에 PASS로 실증. **이제 test·CodeRabbit·review 3면 green.** env `ANTHROPIC_MODEL`은 org 변수 [1m] 덮어쓰기용 유지.
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

## 유닛 스테이징 = 게임플레이 게이트 블로커 (2026-07-18, 라이브 확정)

- **증상**: native Windows 라이브(LOGH7-197)에서 로그인→전략맵까지 정상이나 **시드 캐릭터("aa")가 전략맵에 선택 가능한 함대가 없다.** 그래서 클라가 `0x032e`(함대정보 요청)를 방출하지 않아 서버 `0x032f`도 0건 → 멤버리스트 NO DATA. 증거: `_workspace/liveqa-20260718-197-fleetmember/`.
- **파급**: 이 하나가 멤버리스트·함대 선택·이동(0x0b01)·Warp(0x2b) 전부의 **선행 블로커**. 0x032f 서버 빌더(codec/outfit-party-record.mjs:61)·핸들러(logh7-world-session.mjs:812)는 준비됐으나 라이브 도달 불가(in-process e2e만 통과).
- **진단 완료(2026-07-18) → 근본원인 (a) 서버 스테이징 갭**: 캐릭터 "aa"는 함대(unit_id=1)는 있으나 **cell=0(off-grid)**. `createCharacterEntity`(entities.mjs:76)·`CreateCharacter`(handlers.mjs:80)가 cell 기본 0, 0x1006 생성 경로가 cell 미지정 → 신규 캐릭터 항상 cell=0 → 0x0325 unit[0].cell/commander(+0x08)=0 → 클라 선택 가능 함대 없음 → 0x032e 미방출. (0x0325 방출·유닛 포함은 정상; 위치만 0. B53 라이브: 유효 cell 2588이면 클라 렌더·warp 성공, off-grid면 실패 — 정합.)
- **수정(commit `382ac752`, 브랜치 `codex/logh7-197-fleet-spawn-cell`)**: `getFactionCapitalCell(power)`(제국2=2588 오딘, 동맹3=2014 하이네센, 근거 `initial-deployment.json` 홈 함대, 미상=0 무날조). enterWorld에서 `!(p.cell>0)`이면 수도 셀 투영(비파괴 — DB cell=0 유지, 세션 투영, 첫 이동/warp 시 실 cell 영속; cell>0 불변=회귀방지). 단위테스트 95 pass: cell=0 캐릭터의 0x0325가 세력 수도로 스테이징됨 assert. **라이브 미검증(포트 후속)**: 원작 클라에서 aa 함대 아이콘 렌더+0x032e→0x032f 확인 필요.
- **다음 문**: 유닛 스테이징 완결 → 0x032e→0x032f 라이브 재검증 → 함대 선택→이동→Warp.
