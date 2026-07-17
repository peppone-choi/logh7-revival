# Current State

- Updated at: 2026-07-17
- Latest change: native Windows는 Wine parser·prefix·subprocess 전에 direct harness로 위임하고, macOS/Linux Wine은 명시적 `PREFIX_MODE=win32|wow64`를 사용한다. Wine Stable 11의 pure win32 미지원 때문에 WoW64 prefix와 자동 host-drive 격리·복구 경계를 추가했다.
- Branch: `codex/platform-aware-live-qa`. 최신 사용자 지시에 따라 이번 배포는 commit·push까지만 수행하고 PR·merge는 보류한다.
- Runtime contract: native Windows는 공통 lineage/run9/evidence gate 뒤 검증된 EXE를 직접 실행하며 Wine 입력·명령·placeholder를 쓰지 않는다. macOS/Linux는 absolute Wine toolchain, 저장소 밖 run 전용 `WINEPREFIX`, explicit prefix mode, runtime-support manifest를 fail-closed로 요구한다. `wow64`의 `#arch=win64`는 prefix 형식이며 PE32 client는 그대로 32-bit다.
- Live evidence: 서버 `127.0.0.1:47900` ready와 실제 `G7MTClient.exe` process를 관측했다. server trace는 `0x0034 → 0x0035 → 0x0036 → 0x0030` 뒤 `invalid-credentials`/login-ng를 기록했다. client는 exit 3으로 종료됐고 로그인 시 runtime error는 사용자 화면 관측이다.
- Live verdict: macOS Wine launch와 서버 도달 경로만 확인됐다. successful login/gameplay, native Windows 실기, Linux 실기는 미검증이므로 cross-platform 전체 pass가 아니다.
- Cleanup: 서버는 SIGINT exit 0으로 끝났고 47900은 connection refused, 이번 client/Wine process는 0개였다. registry는 absent 상태로 복구됐다. 최초 drive receipt는 `release=false`; 동일 자동 mapping 복원, cleanup 재격리, prefix 디렉터리 inode 경계, 예외 시 release를 수정해 단위 테스트했지만 수정 후 live cleanup receipt는 아직 없다.
- Harness parity: canonical/Codex/Claude `logh7-wine-live-qa`와 metadata는 byte-identical이고 canonical/Claude orchestrator도 동기화돼 있다. `required-skills.tsv`는 live-QA를 `both`로 배포한다.
- Documentation: live-QA 계약, prompt pack, ops/verification/tool capability, roadmap, lineage, remaster, team spec, execution plan, Codex·Claude manuals, `AGENTS.md`, `CLAUDE.md`를 플랫폼·WoW64 기준으로 현행화했다.
- Fresh verification: Python compile exit 0, native UI unittest 14/14 exit 0, drive isolation/exception/layout 회귀 12/12 exit 0, 서버 serial 499 tests/495 pass/0 fail/4 skip exit 0, Codex hooks 26/26 exit 0, bootstrap `OK=26 MISSING=0 STALE=0`, skill validators·repo diff check·live-QA mirror equality exit 0. 최신 전체 Wine unittest는 빠른 commit·push 지시로 완료 전에 중단했으므로 통과로 세지 않는다.
- Review: 독립 drive-lease/registry cleanup 최종 재리뷰는 BLOCKER 0 / MAJOR 0 / MINOR 0이다.
- Unrun: native Windows 실기, Linux Wine 실기, successful authentication/gameplay, 수정 후 live drive-cleanup receipt. 서버 제품 코드는 변경하지 않았다.
- Isolated baselines: `basedpyright`·`yaml-ls` 미설치와 구체 정보 없는 Fablize/PostToolUse generic failure가 반복된다. 실제 판정은 `py_compile`·`unittest`·parser·skill validator·명령 exit/receipt로 분리한다.
- Preserved concurrent change: 기존 사용자 소유 `.codex/config.toml` 수정은 읽거나 변경하지 않고 작업 diff·검증 대상에서 제외해 보존했다.
- Recommended next action: `.codex/config.toml`과 `_workspace/**`를 제외해 commit·push한다. PR·merge는 사용자 후속 지시까지 보류한다. 제품 follow-up은 login-ng 이후 runtime error 진단과 successful gameplay, 수정 후 cleanup, Windows/Linux 실기 gate다.
