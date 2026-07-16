# LOGH VII Revival 코드베이스 우려사항 지도

> 감사 기준: 2026-07-16 `main` / `origin/main` (`630b9c663040e24304028be10a4ffc62134bc27f`, divergence `0/0`)  
> 범위: 최신 main과 현재 작업트리의 사용자 복원 파일을 읽기 전용으로 감사했다. 클라이언트·서버 코드, 테스트, Wine 런타임, 바이너리 또는 캡처 자산은 수정하지 않았다.  
> 인식 표시: **입증**은 현재 코드·파일·명령 결과로 확인한 사실, **문서 주장**은 현행 문서에 있지만 이 checkout에서 원증거를 재실행하지 못한 사실, **추정**은 아직 입증해야 하는 가설이다.

## 집행 요약

| 우선순위 | ID | Stop/Go 판정 | 핵심 위험 |
|---|---|---|---|
| P0 | C01 | Stop | 현행 문서가 인용한 run5/run9 라이브 증거 디렉터리가 checkout에 없어 헤드라인 회귀를 재현할 수 없다. |
| P0 | C02 | Stop | 명시적 `WINEPREFIX`가 없는 Wine 진단이 기존 `~/.wine`을 수정했고, 현재 live harness는 macOS+Wine 경계를 지원하지 않는다. |
| P0 | C03 | Stop | 실행 클라이언트 해시 계보가 여러 계열이고 Frida/패치 주소 가드가 계열별로 통합되지 않았다. |
| P0 | C04 | Stop | 19-row `0x030b`는 admission 안전 캡일 뿐 `DAT_009d2fa8` null과 전략 FSM state 2 정체를 해결하지 못했다. |
| P0 | C05 | Stop | 81개 전략 명령 중 factory 2개만 확인됐고 79개는 미해결이며, 실제 실행·CP·ledger·timer/job이 없다. |
| P0 | C06 | Stop | 검증 DB/문자열 복원물은 untracked `content/`에 있고 production은 별도 `server/data/seed` 정보를 소비한다. |
| P0 | C07 | Stop | 평문 password/dev credential, rate-limit/TLS 부재, PCAP·로그의 계정/세션 정보가 외부 배포 경계와 분리되지 않았다. |
| P1 | C08 | Fix first | TCP 요청 루프가 동기 SQLite/UoW에 결합돼 PostgreSQL 전환과 동시성을 막는다. |
| P1 | C09 | Isolate | 전체 한글화은 CP932/CP949, DBCS, glyph, IME, chat wire 계약이 미확정이다. |
| P1 | C10 | Review | 원본 EXE·CD 파생물·매뉴얼·이미지·외부 데이터는 권리/라이선스 결정 없이 배포하면 안 된다. |
| P1 | C11 | Fix | 이미 tracked된 캡처·런타임·생성물이 `.gitignore`를 우회해 재현성과 저장소 위생을 훼손한다. |
| P1 | C12 | Decide | 56개 untracked 복원/도구 파일의 소유·선별·검증 결정이 없다. |
| P1 | C13 | Isolate | 원본 클라이언트 리마스터 트랙이 삭제된 Unity 계약과 매니페스트에 여전히 엇갈린다. |
| P1 | C14 | Bound | EXE 전수 분석 커버리지가 낮고 생성 audit에 삭제된 경로와 오래된 snapshot이 있다. |

## P0 — 즉시 중단 게이트

### C01. 라이브 증거가 현재 main에서 재현 불가능

**입증**

- `docs/logh7-requirements-current.md:15` 및 `AGENTS.md:13`은 `.omo/live-qa/m4-ship-master-20260716-run5-aligned19/`를 19-row 라이브 근거로 인용한다.
- `AGENTS.md:12`, 현행 문서는 run9을 두 클라이언트 월드 진입·재로그인·서버 재시작 영속성 기준으로 삼는다.
- 이 checkout에서 두 인용 디렉터리 모두 없다. `.gitignore`는 `.omo/live-qa/*`를 제외하므로 새 clone에서 문서 주장만 남는 구조다.
- `docs/logh7-requirements-current.md:21`의 `460 total / 458 pass / 0 fail / 2 skip`, `132/132`, `16/16`은 **문서 주장**이며 이 감사에서 Wine으로 재실행하지 않았다.

**영향**: 19-row, movement, 영속성, FSM 정체의 어떤 회귀도 새 checkout에서 동일 입력/바이너리로 재검증할 수 없다. 문서 수치를 release gate로 사용하면 안 된다.

**Exit proof**

1. 클라이언트/patch/server/seed 해시, Wine 버전·prefix recipe, 명령, packet/log 요약, screenshot, test XML을 포함한 작고 redacted receipt를 tracked 경로에 저장한다.
2. fresh clone + 격리 Wine prefix에서 run9 영속성과 run5 19-row 동작/FSM 실패를 반복하고 receipt hash가 일치한다.
3. 문서의 모든 live 주장이 존재하는 receipt ID로 역참조된다.

### C02. Wine 기본 prefix 부수효과 하네스 이식성 부재

**입증**

- PATH에 `wine`이 없어 app bundle의 Wine binary를 절대 경로로 조회했다.
- 명시 `WINEPREFIX`가 없는 `--version`/`--help` 진단 자체가 `/Users/apple/.wine` 내 `system.reg`, `user.reg`, `userdef.reg`의 mtime을 2026-07-16 13:11 KST로 바꾸었고 wineboot/winemenubuilder 오류와 `invalid .so library ... too old?`를 남겼다.
- `tools/live/logh7_agent_drive.py`는 import 시 `ctypes.windll.user32/kernel32`를 사용하고, multi-client probe는 Windows HWND/SendInput·PID Frida attach·`node` PATH를 전제한다. macOS host + Wine window/PID 경계와 다른다.
- 저장소 코드에 `WINEPREFIX` 조정 구현이 없다.

**영향**: 단순 버전 점검도 사용자의 기존 bottle을 변경할 수 있다. 현재 자동화를 Wine에서 그대로 돌리면 잘못된 프로세스에 attach하거나 window 조작·screenshot이 실패할 수 있다. 이 감사는 즉시 Wine 추가 실행을 중지했으며 기존 prefix를 삭제/복원하지 않았다.

**Exit proof**

1. 모든 launcher가 존재하지 않던 프로젝트/런 전용 `WINEPREFIX`와 32-bit 구성, Wine build hash, locale/font/D3D8/network recipe를 강제한다.
2. host PID ↔ Wine PID, Frida attach, Quartz/X11 window 탐색, 입력, screenshot을 단일 smoke run에서 입증한다. host Python에서 `ctypes.windll`을 호출하지 않거나 Python 자체를 bottle 안에서 실행한다.
3. 실행 전/후 filesystem snapshot에서 전용 prefix 밖의 변경이 0개임을 검증한다.
4. 원본 client live/integration은 Wine, Node/Python unit는 native로 돌릴지 또는 Windows runtime도 bottle에 넣을지 실행 matrix를 명시한다. 후자라면 Wine 내 Node/Python/network까지 별도 입증한다.

### C03. 정본 EXE 계보와 RE/패치 주소 표준이 분기됨

**입증**

- tracked CD 클라이언트 `.omo/re-galaxy/g7mtclient.exe`와 현재 install 본은 SHA-256 `bd19263c...`로 일치한다.
- 현행 RE/한글화 문서와 패치 계보에는 `9c97...`, `24d79... → 5bdd64...`, `5bdd64... → 825635...` 계열이 함께 존재한다.
- 패치 매니페스트는 source hash, original/patched/rollback bytes, offset/overlap 검증을 이미 제공한다. 문제는 가드 부재가 아니라 **런별 클라이언 계보가 하나의 receipt로 결합되지 않은 것**이다.
- Frida script의 절대 주소는 특정 image layout에 속한다. 현재 install hash가 주소 가정과 일치한다는 런타임 증거는 이 audit에서 확인하지 못했다.

**추정**: 계보가 틀린 상태에서 attach하면 잘못된 함수/글로벌을 관측하거나 패치할 수 있다. 실제 오펨지는 해시 가드 런으로 입증해야 한다.

**Exit proof**

1. CD base → official/update → 1080p → localization/diagnostic 패치를 DAG로 표현한 client-lineage manifest에 각 node의 full hash, PE timestamp/image base, patch manifest, rollback hash를 기록한다.
2. launcher/Frida script가 전체 해시·image base·sentinel bytes가 틀리면 attach 전 fail-closed한다.
3. 모든 live receipt에 실제 process image hash와 주소 프로필 ID가 남는다.

### C04. 19-row admission cap은 전략 복구가 아니다

**입증**

- `server/src/presentation/createPlayableRuntime.mjs:24-42`는 SQLite catalog의 함선 63행 중 `slice(0, 19)`만 production session에 전달한다.
- `server/src/server/logh7-world-records.mjs:1055-1070`의 `0x030b` builder는 body+4, stride `0x8c`, record+0에 `index+1`, model code +6에 0, key를 UTF-16LE로 쓴다. 이 순차 ID/model-zero join은 **provisional**이다.
- `server/tests/logh7-cqrs-orm.test.mjs:204-232`는 63개 DB row가 19개 wire record로 cap되는 구조를 검증하지만 클라이언트 cache/model join을 검증하지 않는다.
- `AGENTS.md:13` 및 `.omo/plans/logh7-execution-plan-current.md:9`은 20행 이상의 admission 정지, 19행에서도 `DAT_009d2fa8 == null`, strategy FSM state 2 정체를 명시한다. 이는 **문서 주장**이며 C01 receipt가 없다.

**영향**: 20~63번 catalog은 영원히 가려지고, 19-row 성공을 model master 정본으로 착각하면 FSM에 필요한 root producer/join을 더 멀게 한다.

**Exit proof**

1. 단일 런 timeline에서 `0x030b` parser, registry allocator, model/cache join, `DAT_009d2fa8` writer/reader, state 2 진입·이탈을 함수 인자/반환값과 함께 trace한다.
2. 안전한 fixture에서 row count 18/19/20 경계와 **한 필드씩** A/B하여 admission과 root 생성을 분리한다.
3. root producer가 확정되기 전에는 추가 payload 조작이나 클라이언트 FSM 직접 변조를 금지한다.
4. 63행 전체를 공개하는 조합이 양 클라이언트의 world entry, marker, movement, post-warp HUD를 모두 자연 출력으로 통과한다.

### C05. 79개 전략 명령과 권위 실행 계약이 비어 있다

**입증**

- `server/src/domain/strategy-command-catalog.mjs:1-8,129-144`는 81개 catalog skeleton이고, 허용된 command도 `not-implemented`를 반환한다.
- test/문서에서 factory와 연결된 command는 warp `0x2b`, intra-system/port `0x2d` 2개이고 79개가 미해결이다.
- `server/src/application/handlers.mjs`에 등록된 domain command는 account/auth/character/authority/EnterWorld/MoveGrid범위이며, strategy execution, PCP/MCP ledger, CP charge, timer/job, outcome handler가 없다.
- SQLite schema에 command ledger, CP balance/reservation, timers/jobs, idempotency/outcome table이 없다. `0x0327` stock은 현재 zero/empty로 보수적 처리된다.

**영향**: client UI 도달이 서버 권위 게임플레이 복원을 의미하지 않는다. 재전송/동시 명령이 CP 중복 차감, 이중 job, 유실된 outcome을 만들 수 있다.

**Exit proof**

1. 81개 command마다 wire factory, permission, precondition, CP cost/source, mutation, timer/job, response/outcome, broadcast, canon grade를 가진 executable ledger가 있다. 미해결은 fail-closed한다.
2. 관측 가능한 command ID/idempotency key로 ledger + state + domain event + outcome이 한 transaction에 commit/rollback된다.
3. 타이머 재시작, 중복 패킷, 두 클라이언트 경쟁, CP 부족, 권한 회수 시나리오를 Wine live + DB 증거로 검증한다.
4. canon 재고가 없는 `0x0327`은 빈 창고 또는 명시적 P3 절차 시뮬레이션 값만 쓰고 정본이라 부르지 않는다.

### C06. 검증 데이터와 production seed가 두 개의 소스 오브 트루스로 분리됨

**입증**

- 작업트리 `content/` 복원물은 16개 파일, 약 4.5 MiB이고 `content/logh7-verified.db`(약 803 KiB), verified JSON, 문자열 worksheet를 포함하지만 모두 untracked다.
- 현재 production `WorldSeedLoader`는 `server/data/seed/*.json`을 소비하고 root `content/logh7-verified.db`를 사용하지 않는다.
- production seed의 provenance는 OCR/manual/official/authored 수준의 광범위 label이고, roster는 fan wiki/Wikipedia/web 자료를 혼합한다.
- 사용자 복원 증거에서 MsgDat 9,582개 문자열의 실파일 대조, 미확정 stat `NULL`, 양 웬리 초상화 확정 범위가 분리돼 있지만, 이 산출물이 main이 아니므로 새 clone은 같은 판정을 재현하지 못한다.

**영향**: 검증된 문자열과 보류된 수치가 게임에 반영되지 않거나, 반대로 근거가 약한 seed가 production 정본으로 승격될 수 있다.

**Exit proof**

1. raw source hash → extractor/version/command → normalized record → confidence/rights → runtime seed를 연결하는 결정적 promotion manifest를 만든다.
2. 필드별 provenance에 source locator/hash, extraction method, trust grade, reviewer, rights status, consumer를 기록한다.
3. clean checkout에서 DB/seed를 재생성했을 때 hash가 일치하고, 미확정 값은 `NULL`/blocked로 남으며 runtime consumer test가 실제 승격된 값을 읽는다.
4. untracked 복원물은 파일별 retain/promote/regenerate/discard 결정과 checksum receipt 없이 일괄 stage하지 않는다.

### C07. 복구용 레거시 인증/패킷을 외부 안전 경계로 착각할 위험

**입증**

- JSON account store와 SQLite account schema가 password를 평문으로 보관하며, dev seed에 `inei00/dummy`, tracked account data에 `dummy/dummy`가 존재한다.
- server의 기본 bind는 loopback이지만 기존 tracked log에 `0.0.0.0` bind 실행 흔적이 있다.
- login rate limit/lockout, TLS, application replay protection을 현재 코드에서 확인하지 못했다.
- `.omo/captures`에 7개 PCAP이 tracked되고 live log는 account name, IP/port, session 페이로드를 남길 수 있다.

**영향**: 서버를 loopback 밖으로 열거나 repo/receipt를 공개할 때 credential exposure, brute force, replay, 개인정보 노출이 발생할 수 있다. 레거시 클라이언트 호환성은 보안을 보장하지 않는다.

**Exit proof**

1. production profile은 평문 password/dev account를 거부하고 password KDF, unique salt, rate limit/lockout, audit redaction을 강제한다.
2. loopback 밖 bind은 명시 flag + startup warning + transport security gateway/VPN 뒤에서만 가능하다.
3. PCAP/log secret scanner와 redaction 테스트가 account/password/token/IP 노출 0건을 입증한 후에만 receipt를 tracked/public 경로로 승격한다.
4. two-client replay/duplicate/authz-negative 테스트가 DB 변경 없음을 증명한다.

## P1 — M4 및 리마스터 병행 전 해소

### C08. 동기 SQLite bridge가 wire loop와 PostgreSQL 전환을 결합함

**입증**

- `server/src/presentation/createPlayableRuntime.mjs`는 `dispatchCommandSync`를 session에 주입한다.
- `server/src/server/logh7-world-session.mjs:73-79`는 TCP router가 synchronous라는 이유로 sync dispatch를 사용한다.
- `server/src/persistence/Database.mjs`와 `UnitOfWork.mjs`는 `node:sqlite` `DatabaseSync`, `BEGIN IMMEDIATE`, 동기 prepare/run에 의존한다.
- PostgreSQL migration/connection skeleton은 있지만 production boot path에 연결되지 않았다.
- disconnect은 `logh7-world-session.mjs:818-825`에서 in-memory `inWorld=false`만 설정하고 persisted character `online=false`를 commit하지 않는다.

**영향**: 긴 DB transaction이 socket 요청 처리를 막고, Postgres adapter를 붙이면 sync contract가 깨진다. 재시작/abrupt disconnect 후 online 상태가 잘못 남는다.

**Exit proof**

1. application port, UoW, repository, event append가 Promise-based transaction contract로 통일되고 wire loop가 await/backpressure/cancellation을 명시한다.
2. SQLite/PostgreSQL contract suite가 동일 command, rollback, event atomicity, uniqueness, reconnect/disconnect에서 동일한 결과를 낸다.
3. disconnect/error/server restart 후 DB `online=false`와 세션 0개를 입증한다.
4. two-client concurrent command 테스트로 starvation, duplicate event, lost update가 0건임을 보인다.

### C09. 전체 한글화의 인코딩·폰트·IME 계약이 미확정

**입증**

- 현재 클라이언트는 CP932 자산, ANSI GDI, `GetGlyphOutlineA`, 자체 DBCS 분류기를 사용한다. wide-char 경로는 확인되지 않았다.
- HANGUL charset `0x81`을 CP932에 쓴 시도는 mojibake를 내어 SHIFTJIS `0x80`으로 돌렸고, 현재 확인 범위는 창 제목/메뉴와 일부 `.rsrc`다.
- tracked localization 범위는 전체 MsgDat 9,582개보다 현저히 작고, CP949 recipe/test는 작업트리 untracked다.
- chat IME, byte length, control token, save/load, packet round-trip, glyph fallback은 미확정이다.

**추정**: CP949 lead-byte 규칙이 CP932 분류기/특수 byte `0x8140`과 충돌하거나, GDI proxy/SJIS tunneling이 Wine DLL loading 및 폰트 fallback을 달리할 수 있다.

**Exit proof**

1. 같은 문자열/화면/채팅 시나리오로 CP949 asset conversion과 SJIS tunneling + GDI proxy/font/IME를 격리 prefix에서 A/B한다.
2. 해시 guard·byte budget·control token·round-trip test, 원본 backup/rollback, font 라이선스 receipt가 모두 있다.
3. 로그인 644×484, 본게임 1920×1080, 로비/월드/전략/대화/채팅, 두 client 송수신에서 mojibake/잘림/토큰 손상 0건을 screenshot+packet으로 검증한다.

### C10. 저작권·라이선스·배포 권한이 기술 provenance와 분리됨

**입증**

- repository root에 프로젝트 `LICENSE`, `COPYING`, `NOTICE`가 없고 `server/package.json`은 private이지만 license가 없다.
- tracked tree에 원본 PE client, 공식 매뉴얼 PDF, CD 파생 자산/추출물, screenshot, PCAP, fan wiki/Wikipedia/web-derived roster·이미지가 포함된다.
- `docs/logh7-reference-haul.md`는 외부 repo를 방법론으로만 쓰고 GPL/AGPL 코드를 라이선스 확인 없이 복사하지 말라고 지시한다.

**주의**: 이 문서는 법률 판단을 하지 않는다. 다만 archive.org에서 접근 가능하다는 사실은 재배포/수정/공개 권한을 의미하지 않는다.

**Exit proof**

1. 배포 대상별 code/data/binary/manual/screenshot/PCAP/font/model/AI output·derivative의 소유자, license/permission, allowed use, attribution, redistribution 판정을 담은 SBOM/rights ledger가 있다.
2. 권리 미확인 원본은 다운로드/사용자 제공 recipe로 분리하고 public artifact/release에서 자동 제외한다.
3. 권리 전문가의 검토가 필요한 항목은 `legal-review-required`로 fail-closed하고, external code의 SPDX/NOTICE가 완전하다.

### C11. tracked runtime/capture/generated 자산이 저장소에 누적됨

**입증**

- tracked 파일은 약 4,143개/611.56 MiB, Git object pack은 약 1.35 GiB다.
- tracked `.omo` 634개/약 129.76 MiB, `.omo/live-qa` 515개, `.omo/captures` 14개(PCAP 7개)다.
- tracked `server/data/agent-drive` 678개/약 259.84 MiB, `server/content/generated` 782개/약 116.28 MiB, `server/data/**` 699개/약 260.79 MiB다.
- `.gitignore`가 이 경로를 현재 제외해도 기존 tracked 파일은 계속 버전 관리된다.
- Git LFS는 현재 환경에 설치되지 않았고 `.gitattributes`도 없다. 로컬 ignored `.omo/work` 포함 증거 자산은 약 9.7 GiB이다.

**영향**: clone/checkout/CI 비용, private data 노출, generated snapshot 표류, 진짜 소스 변경 리뷰 노이즈가 커진다.

**Exit proof**

1. 각 큰 경로를 source / deterministic-generated / compact-evidence / volatile-runtime / restricted-original로 분류한 inventory가 있다.
2. main에는 source, lock/manifest, 작고 redacted proof만 남고 나머지는 checksum 기반 artifact store/recipe로 이동한다. 기존 히스토리 rewrite는 별도 승인·백업 없이 하지 않는다.
3. clean clone 크기, untracked runtime 위생, secret/PCAP scan, generated reproducibility CI 게이트가 있다.

### C12. 사용자 복원 파일과 legacy 도구의 통합 결정이 없음

**입증**

- 감사 시점 untracked은 56개/약 4.78 MiB이며 `content/`, provenance/초상화/문자열/렌더 문서, Python/Node 도구, test, hooks, virtual-env metadata를 포함한다.
- 이 파일은 production runtime에 연결되지 않았고 fresh clone에 없다.
- `.omo/venv-vision` 내 환경 메타/심볼릭 링크는 다른 머신 재생성을 보장하지 않는다.

**영향**: `git add -A`는 연관 없는 사용자 자산, hook, environment, 미확인 data를 한번에 commit할 수 있다. 반대로 핵심 복원 파이프라인을 누락하면 검증 결과가 사라진다.

**Exit proof**

1. dirty-worktree checkpoint에 path, owner, source hash, intended role, retain/promote/regenerate/discard 판정을 남긴다.
2. 승격된 도구만 source + fixture + test + deterministic receipt로 작은 commit에 포함한다.
3. venv/hook/머신 상태는 설치 recipe와 lockfile로 대체하고 별도 승인 없이 stage하지 않는다.

### C13. 원본 클라이언트 리마스터와 삭제된 Unity 트랙의 충돌

**입증**

- 현재 제품 경계는 원본 `G7MTClient.exe` frontend + Node authoritative backend이고, Unity `client-unity/`는 2026-07-04 삭제됐다.
- 그럼에도 `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `server/content/generated` 매니페스트에 삭제된 `client-unity/` 경로와 runtime/export 계약이 다수 남아 있다.
- generated remaster manifest의 `canonicalPromotion`은 blocked이고, data-decode audit에 broken path reference가 남는다.
- 과거 4x `window_parts.tga`는 전략 맵에서는 개선됐지만 lobby 9-slice를 깨뜨린 회귀가 문서화돼 있다.

**영향**: 리마스터 변수가 M4 wire/FSM 가설과 혼합되고, 삭제된 consumer를 위한 생성물이 현재 제품의 계약인 것처럼 유지된다.

**Exit proof**

1. 현행 문서/생성 manifest에 active runtime은 원본 client 하나로 수렴하고 `client-unity/` 참조는 역사 싹소나 장기 선택지로만 이동한다.
2. remaster pack은 원본 파일을 덮어쓰지 않는 별도 overlay/prefix/feature flag이고 source/output hash, tool/model parameters, rights, original fallback, rollback을 가진다.
3. login 644×484과 game 1920×1080 경계, lobby/world/dialog/strategy/tactical 화면, 9-slice, memory/performance를 Wine screenshot+metric으로 확인한다.
4. 같은 server snapshot/wire 입력에서 original vs remaster A/B를 하고 protocol/FSM 트레이스가 동일하다.

### C14. RE 커버리지와 생성 audit의 시점 표류

**입증**

- 2026-07-09 EXE audit은 11,593 functions 중 documented 351, undocumented 11,242로 기록한다(약 3.0%).
- data decode audit review queue는 60개이고, generated audit/manifest에 삭제된 `client-unity` 경로 등 broken reference가 남는다.
- `.codegraph/`가 없고 현 app shell에 `omx`, `node`, `git-lfs`가 PATH/설치 기준에서 없었다. 이는 프로젝트 기능 고장 증거가 아니라 현재 감사 환경 기준선이다.

**영향**: 전수 생성 JSON이 실시간 truth로 오인되고, 핵심 root/FSM 조사를 두고 넓고 얇은 함수 이름 붙이기가 진행될 수 있다.

**Exit proof**

1. RE DB/export와 generated audit에 client full hash, Ghidra/project/tool version, extraction timestamp, input/output hash가 있다.
2. CI가 모든 manifest path/source hash/consumer 존재를 확인하고 broken/stale reference 0개를 강제한다.
3. 함수 수가 아니라 M4 critical slice(`0x030b` parser → registry/root → FSM → command factory/outcome)의 writer/reader/caller/callee/data-flow coverage를 별도 게이트로 삼는다.

## 권장 순서

1. **증거·실행 경계 먼저**: C01 receipt 복구, C02 격리 Wine adapter, C03 client lineage/hash fail-closed, C07 secret/redaction gate를 완료한다.
2. **M4 조사 변수 고정**: C04 exact lookup/root/FSM timeline을 먼저 닫고, 한 번에 하나의 payload 변수만 A/B한다.
3. **서버 권위 실장**: C08 async transaction port를 먼저 만든 뒤 C05 command ledger/CP/timer/job을 수직 slice로 구현한다.
4. **데이터 하나로 통합**: C06 verified → runtime promotion을 결정적으로 만들고, C12 untracked 복원물을 파일별로 선별한다.
5. **현대화는 별도 overlay**: C09 한글화와 C13 리마스터를 M4 wire/FSM 변수에서 분리하고, 각 iteration에 original fallback/rollback/live visual gate를 적용한다.
6. **배포 전**: C10 rights ledger, C11 artifact hygiene, C14 stale-path/critical-slice coverage를 닫지 못하면 public release를 차단한다.

## 완료 판정에 사용하지 말아야 할 것

- 19-row 패킷의 world admission 성공만으로 ship master/model join/FSM 복구를 주장하지 않는다.
- Gradle/Node/Python/Wine 프로세스 exit code만으로 실클라 플레이 성공을 주장하지 않는다.
- ignored 디렉터리의 존재하지 않는 로그 경로를 현행 증거로 사용하지 않는다.
- generated JSON, AI 복원 값, fan wiki 값, 순차 ID, zero-filled model code를 교차 검증 없이 정본으로 승격하지 않는다.
- 사용자의 `~/.wine`, untracked 파일, 외부 참고 repo, 원본 자산을 정리/삭제/일괄 stage하는 것을 자동 구조 개선으로 간주하지 않는다.

## 감사 한계

- 사용자 지시에 따라 Wine 추가 실행을 금지했고, 현재 게임 client/server test를 재실행하지 않았다.
- 이 checkout에 없는 run5/run9 원증거는 문서 주장 이상으로 판독하지 않았다.
- 권리 항목은 기술적 배포 위험을 표시한 것이며 법률 자문을 대체하지 않는다.
