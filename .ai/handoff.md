# Agent Handoff

## Goal
플랫폼별 client runtime 하네스를 Codex와 Claude에 동일 적용하고, macOS Wine 실제 실행 결과를 검증한 뒤 작업 브랜치를 commit·push·PR merge한다.

## Current result
- `tools/live/logh7_wine_live_qa.py`는 `win32`와 unsupported host를 parser·prefix·subprocess 전에 반환한다. Python API도 Windows에서 Wine 전용 인자 없이 호출할 수 있다.
- native Windows는 `tools/logh7_ui_explorer.py`/시나리오 direct harness로 위임한다. 이 어댑터의 EXE SHA 기록은 lineage authority가 아니므로 공통 hash·PE metadata·sentinel·run9 gate를 먼저 닫는다.
- macOS/Linux Wine은 명시적 `PREFIX_MODE=win32|wow64`를 지원한다. Wine Stable 11에서는 pure win32 대신 WoW64를 사용했고 `#arch=win64`는 prefix 형식이다.
- canonical/Codex/Claude live-QA skill과 canonical/Claude orchestrator가 동기화됐고 bootstrap은 `OK=26 MISSING=0 STALE=0`이다.
- 서버 47900 ready와 실제 client process 시작을 확인했다. 서버는 `0x0034/0035/0036/0030` 뒤 `invalid-credentials`/login-ng를 기록했다.
- client는 exit 3으로 종료됐고 로그인 시 runtime error는 사용자 화면 관측이다. Wine launch·서버 도달만 확인됐으며 cross-platform 전체 pass는 아니다.
- 서버·client·Wine process와 port는 정리됐고 registry는 복구됐다. 최초 drive cleanup receipt는 false였으며 exact mapping 복원·cleanup 재격리·directory identity·예외 release를 수정하고 단위 테스트했다. 수정 후 live cleanup은 미확인이다.

## Files changed
- Runtime/tests: `tools/live/logh7_wine_live_qa.py`, `tools/tests/test_logh7_wine_live_qa.py`.
- Harness: canonical/Codex/Claude `logh7-wine-live-qa`, canonical/Claude `logh7-orchestrator`, Codex·Claude live-qa agents, `scripts/agent/required-skills.tsv`.
- Current docs: live-QA, roadmap, lineage, remaster, team spec, execution plan, prompt/ops/verification/tool-capability/context docs, Codex·Claude manuals, `AGENTS.md`, `CLAUDE.md`.
- State: `.ai/task.md`, `.ai/key-facts.md`, `.ai/known-issues.md`, `.ai/current-state.md`, `.ai/handoff.md`, `.ai/ownership.md`.
- External configured vault: `은하영웅전설 7 리바이벌/현재 상태.md`, `로드맵.md` (미커밋).

## Verification result
- Python compile exit 0, native UI unittest 14/14 exit 0, drive isolation/exception/layout 회귀 12/12 exit 0, 서버 serial 499 tests/495 pass/0 fail/4 skip exit 0.
- Codex hooks 26/26, bootstrap `OK=26 MISSING=0 STALE=0`, skill validators, repo diff check, canonical↔Codex↔Claude live-QA mirror equality: exit 0.
- 최신 전체 Wine unittest는 빠른 commit·push 지시로 완료 전에 중단했으므로 통과로 세지 않는다.
- 독립 drive-lease/registry cleanup 최종 재리뷰: BLOCKER 0 / MAJOR 0 / MINOR 0.
- 실제 live receipt: client exit 3, registry restored, 최초 drive release false. server trace는 invalid credentials/login-ng까지 fresh 관측했다.

## Failed approaches and recovery
- `basedpyright`·`yaml-ls`가 없어 apply 후 LSP가 반복 실패했다. 설치 범위를 추가하지 않고 알려진 환경 기준선으로 문서화한 뒤 `py_compile`/unittest/YAML parser/skill validator로 검증했다.
- native UI suite 최초 1건은 macOS `/var`와 `/private/var` alias 비교로 실패했다. `TMPDIR=/private/tmp` 고정 후 14/14 통과했다. 해당 UI 코드·테스트는 수정하지 않았다.
- 존재하지 않는 추정 문서 게이트·orchestrator metadata 경로와 `pgrep` sysmond 진단은 실제 파일 검색, 제어된 test session ID 회수로 전환했다.

## Remaining work
- 최신 사용자 지시에 따라 이번에는 명시적 staging, commit·push까지만 수행한다. PR·merge는 보류한다.
- login-ng 이후 runtime error 원인 규명과 successful login/gameplay 재검증.
- 수정된 drive mapping cleanup의 fresh live receipt.
- native Windows 직접 실행과 Linux Wine 실기 검증.
- 사용자 소유 `.codex/config.toml` dirty 변경을 계속 보존한다.
- Obsidian vault 두 노트는 이 결과로 갱신하되 별도 저장소의 기존 dirty 상태를 보존한다.

## Files to read first
`.ai/task.md`, `.ai/current-state.md`, `.agents/skills/logh7-wine-live-qa/SKILL.md`, `.agents/skills/logh7-orchestrator/SKILL.md`, `docs/logh7-wine-live-qa.md`, `docs/agent/verification.md`.
