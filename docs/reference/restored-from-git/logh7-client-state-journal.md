# LOGH VII 클라이언트 상태 저널

사용자 지시(2026-06-25): "지금 현재 클라 상태도 기록하고 **테스트 할 때마다 기록**해. 언제부턴가 제자리 걸음이었어."
→ 모든 라이브/실클라 테스트는 여기에 1항목 이상 추가. 전진/정체/회귀를 명시한다.

기록 형식: `[#N] YYYY-MM-DD HH:MM | EXE SHA | 구동내용 | trace 옵코드 | 스크린샷 | 결과 | 직전대비 델타`

canonical playable SHA = `992dc7e2` (정정 2026-06-25, 이전 c1523a5e stale).
라이브 절차: logh7-live 스킬 — autologin emp1 + PowerShell 포그라운드 ~35초 유지, stop 시 SHA 복원 필수.

---

## [#0] 2026-06-25 ~21:45 | 세션 착수 idle 베이스라인 (라이브 미구동)

- **클라 상태**: `G7MTClient.exe` 미실행. LOGH 게임/인증 서버 미기동(리스닝 포트에 47xx 없음;
  관측 포트 5040/5357/6379(redis)/6463/7680 = 무관 시스템/도구).
- 다수 `node` 프로세스 = 현재 백그라운드 워크플로(`wrom96m62` 증거스윕 재실행, `wnnrff5mi`
  레퍼런스 134장 시각검수)의 에이전트. python 1개(stale 가능).
- **알려진 현재 기능 상태**(라이브 마지막 확정 2026-06-23 live3-auto 기준):
  - ✅ 무클릭 월드진입(autologin emp1 + 포그라운드 ~35s): 0x7000→…→0x0f02, 전략맵 다색항성+그리드+HUD.
  - ✅ 수신 0x0323 15/15 바이트정합. 서버 test ~1137–1145 PASS.
  - 🔴 C002(0x0b01 전략명령): 미해금. 신확정 = 명령카탈로그 클라정적 → fleet-render + 라이브 클릭 실험으로 환원.
  - 🟡 전술맵: 서버푸시 시 모드전환 UI 패널만(풀 렌더 미완). 직무패널/拠点패널: 레퍼런스만.
- **델타(직전 대비)**: 본 저널 신설 = 기록 규율 시작. 기능 변화 없음(정체 인지 → 다음 테스트로 전진 측정 개시).
- **다음 테스트(#1 예정) — 방침 전환(2026-06-25 사용자 지시):**
  - **autologin 금지.** 실유저 경로 = 실클라 **수동 로그인** → 캐릭터 생성 → 월드.
  - **로그인은 창모드(테두리 있는 윈도우).** 클릭 미등록 추정 근본 = 윈도우 client-area 원점
    (테두리+타이틀바 오프셋) 무시 또는 풀스크린 좌표 오산. → `GetClientRect`+`ClientToScreen`으로
    client 기준 좌표 매핑(로그인 폼은 640×480 정렬, [[logh7-login-form-align-640-2026-06-22]]).
  - **캐릭터 생성: 초상화 여러 개 + 이름 서로 다르게** → 별개 캐릭터 스폰 확인(현재 "한 캐릭터만" 버그).
  - 목표 trace: 수동 로그인으로 **0x7000** 발신 → 0x0020 로비 → 세션 → 0x1008 캐릭생성 → 0x0f02 월드.
  - 핵심 블로커 = 로그인 입력 레이어([[logh7-login-input-layer-blocked-2026-06-24]]) — 창모드 좌표 보정으로 돌파 시도.

## [#1] 2026-06-25 ~23:00 | ★실유저 수동 로그인(autologin 없이) → 로비/세션 도달 ★전진

- **EXE SHA** 992dc7e2(canonical). **창모드 windowed** 구동, 서버 env `LOGH_ACCEPT_ANY_GIN7=1`.
- **구동**: `start --display-mode windowed` → window-login 자동(수정 좌표) → 로그인 버튼 클릭.
- **trace**: `0x7000`(login, 37B) → `lobby-login-ok`(인증 통과) → `redirect` → **`0x0020` 로비**
  → `0x2000/0x2003/0x2005`(세션 리스트) + `loopback-account-bound`. **로그인 성공.**
- **돌파/수정 3건**:
  1. **로그인 폼 좌표 정정**: 창모드 client 644×484 기준 ID(374,290)/PW(376,318)/로그인(352,347).
     이전 640기반 (325,333)/(325,360)/(323,389)는 어긋나 ID칸 빗나감 → `logh7_window_login.py` 수정.
  2. **서버 strict 함정**: 배너 `[accept-any-GIN7]`는 --account-db 없을 때 무조건 출력되는 오해성 표시.
     실제는 strict → 거부("credential not registered"). **`LOGH_ACCEPT_ANY_GIN7=1`** 필요(logh7-server.mjs:840).
  3. **로그인 후 자동 풀스크린**: 게임이 로그인 성공 시 스스로 640창모드→**1920×1080**로 전환
     (= 사용자 사양 "로그인만 창모드, 이후 풀스크린"을 게임이 네이티브로 수행).
- **로그인 버튼**: 배경 스프라이트 없음(텍스트만)이나 **클릭은 정상 작동**(0x7000 발신). 배경 누락=draw-state 이슈(별도).
- **델타(#0 대비)**: ★MAJOR — autologin 없이 **실유저 수동 로그인 최초 성공**(이전엔 autologin만 월드 도달).
  로그인 입력 레이어가 "막힘"이 아니라 **좌표+서버모드** 문제였음이 확정(입력 자체는 작동).
- **잔여**: 로그인 후 메뉴(세션/캐릭생성) 좌표 = 1920×1080 재캘리브레이션 필요(borderless 시절 좌표 재사용 가능성 점검).
  로그인 버튼 배경 스프라이트 누락.
- **증거**: `.omo/ui-explorer/live-real-login-2026-06-25/` shots(008~012)+trace.jsonl. (세션 미stop 상태=다음 단계 진행 중.)

## [#2] 2026-06-25 ~23:20 | ★★완전 end-to-end: 실로그인→캐릭생성→월드진입 + NPC 위계 라이브

- **흐름 완주**(create-character 21스텝, 1920×1080 풀스크린): 새캐릭→세션 picker(2행)→세션 더블클릭
  →진영(제국)→성별/출신→이름(Lohengram/Reinhard)→**월드 진입**.
- **trace**: `0x7000`→`0x0020`→`0x2005`→`0x2009`→`0x0200`→info(0x0300~031c)→**`0x0f02`**→`0x0313`그리드
  →**`0x0323`×26**→`0x0325`. 전략맵+성계+하단HUD(미니맵 포함) 렌더(shot 30-world).
- **★0x0323 ×26 = 캐논 NPC 위계 시드 라이브 작동**(이전 월드진입은 1~2개=플레이어뿐). **자동황제 픽스
  실증** — 플레이어가 25명 캐논 인물 속 하급사관으로 진입(서버테스트 player≠emperor와 정합).
- **로비 메뉴 5종 좌표(client 1920)**: 게임시작(150,200)·새캐릭작성(150,255)·오리지널추첨(150,315)
  ·캐릭터삭제(150,375)·세션변경(150,435)·환경설정(150,495)·크레딧(150,555).
- **메뉴 동작 상태**: 새캐릭작성 ✅(full flow→월드). 게임시작/삭제/세션변경/환경설정 = 좌표확보, 동작검증 잔여.
- **델타(#1 대비)**: ★★결정적 — "처음 로그인부터 캐릭생성·월드진입 전체"가 autologin 없이 실유저 경로로 동작.
  Stop-hook 핵심 미검증 항목 해소. create-character 명령이 1920 풀스크린서 재캘리브 불필요(기존 좌표 유효).
- **잔여**: 메뉴 4종 동작검증, 별개캐릭(초상화·이름), NPC명 unmask, 로그인버튼 배경, in-world 상호작용(C002).
- stop으로 세션종료+SHA 복원 예정.

## [#3] 2026-06-25 ~23:40 | signup→strict 로그인: 빈 credential 결함 폭로 (정직 기록)

- **signup**: `admin create ginei00 --password-stdin --account-db`(pw "dummy") 성공, admin list 확인.
- **strict 기동**(`LOGH_ACCOUNT_DB`, accept-any OFF) → 라이브 auto-login → **거부**:
  `account:null, "authentication failed"`. 로비 미도달(0x0020 seen:0).
- **근본**: 0x7000 GIN7 credential의 **account 라벨이 빈값**. 필드엔 "ginei00" 렌더되고
  타이핑은 이미 keybd_event(하드웨어, `_type_text`가 우선 사용)인데도 credential엔 안 담김.
  → **클라의 credential 빌드가 필드값을 안 읽는 더 깊은 입력 결함**(별도 클라 RE).
- **★accept-any가 이 빈 credential을 통과시켜 #1/#2 "로그인 성공"을 만든 것**(account='unknown' 폴백).
  사용자의 signup-first 주장이 정확히 이 결함 폭로. 진짜 strict 로그인은 미해결.
- **델타**: 후퇴 아님 — #1/#2 흐름(좌표·버튼·풀스크린전환·NPC시드)은 유효, 단 **인증 자격이 실은 빈값**임을
  정직 확인. 다음: 클라 0x7000 credential 빌드 경로 RE(어느 버퍼에서 account/pw를 읽는지) 또는 TOFU로 우회 테스트.
- 세션 stop+SHA 복원(992dc7e2) 확인.

## [#4] 2026-06-25 ~24:00 | 상태전환 라이브 데모 시도 — 드라이브 플래키로 우회 (정직)

- 목표: 월드 진입 후 0x0f1f 서버푸시 / Frida invoke로 상태전환 실증(전략맵 교착 돌파).
- 새 세션(47901) 4회 시도 — **수동 로그인 클릭이 0x7000 미발신**(trace 빈값, 화면 650×533 로그인/타이틀 "NO DATA" 유지).
  스플래시 35초 대기·포그라운드 클릭 선행에도 동일. **#1~#2 세션(47900)은 동일 코드로 성공**했으므로
  코드/좌표 문제 아님 = **창 포그라운드/스플래시/타이틀-advance 타이밍 환경 플래키**(툴 SetForegroundWindow가
  스플래시 구간 포그라운드를 지속 확보 못 함; 첫 세션은 디버깅 중 반복 클릭으로 우연히 통과).
- **결정(사용자 "막히면 다른 방안")**: 플래키 수동 클릭 드라이브 중단. SHA 복원.
- **다른 방안(다음)**: 월드 진입을 **확실한 경로**로 — autologin 변종 + PowerShell 포그라운드 ~35초 홀드
  (메모리 #8 무클릭 월드진입 검증됨; 상태전환 데모엔 진입수단 무관)로 월드 도달 → **0x0f1f(byte0=1) 서버푸시**
  또는 **Frida invoke `FUN_0054e570(DAT_02215e2c,2/3)`**(하네스 `tools/logh7_state_invoke_probe.py`) → +0x357e88/+0x126711
  변화 + 스크린샷 전/후. 별도: 로그인 드라이브 신뢰화 = login에 PowerShell 포그라운드-홀드 적용(툴 개선).
- **준비 완료 자산**: 상태전환 결정적 RE(`docs/logh7-game-state-change-re-2026-06-25.md`), 0x0f1f 레버, Frida invoke 하네스. 실증만 남음.

## [#5] 2026-06-25 ~24:15 | 환경 블로커 확정: 라이브 월드진입 전면 실패(포그라운드 락 추정)

- autologin.emp1 + `keep_foreground.py`(50s) 무클릭 진입도 **trace 빈값**(0x7000 미발신, 0x0f02 seen:0).
- **세션 내 모든 라이브 월드진입 실패**(수동 클릭 4회 + autologin). **첫 세션 47900은 동일 코드로 성공** →
  코드/좌표/RE 아님. 유력 근본 = **반복 SetForegroundWindow → Windows 포그라운드 락**(연속 호출 후 OS가
  포그라운드 전환 차단 → D3D8 스플래시 미통과 → 로그인/연결 자체가 안 일어남, 그래서 trace 완전 빈값).
- 모든 데모 경로(0x0f1f 푸시·Frida invoke)가 **클라가 월드에 있어야** 동작하는데 월드 진입이 막혀 교착.
- **결정(막히면 다른 방안)**: 라이브 그라인딩 중단, SHA 복원, clean. **환경 리셋(재부팅/락 타임아웃) 후
  깨끗한 1세션에서** autologin-bootstrap-emp1(부트스트랩 변종, #8 검증본) + keep_foreground로 월드진입 →
  0x0f1f 서버푸시(1순위) 또는 Frida invoke FUN_0054e570 → 상태전환 실증.
- 변치 않는 성과: 상태전환 결정적 RE·0x0f1f 레버·Frida 하네스·full-flow(세션1 실증)·NPC시드. 실증은 환경복구 후 1스텝.

## [#6] 2026-06-26 | ★전진: 재구조화 후 풀 플로우 라이브 성공 + 전략맵 렌더 + C002 RE 라이브 입증

- **#5 포그라운드 락 블로커 극복**: 깨끗한 1세션(`ui_explorer start`, 연속 SetForeground 그라인딩 없음)으로 성공.
- **풀 플로우 자율 작동**: 0x7000 로그인→0x0020 로비(블루 HUD 렌더, shot 027)→**0x1008 캐릭생성(클릭 닿음, 창모드)→0x0f02 월드진입**→0x0313 그리드×2→**0x0323×26(NPC 캐논 위계 시드+플레이어)**→0x0325×2. 클라 147→238MB.
- **전략맵 렌더 확정**(shot 049): 다색 항성(청 좌상·주황 중앙·적 우측 = 분광형, "단일 청색" 아님)·전략 그리드·성운배경·HUD 하단바(플레이어 초상화+스탯바·중앙 미니맵/레이더·우측 커맨드 패널, 리마스터 텍스처).
- **★마우스 블로커 부분 해소**: 캐릭생성 클릭이 닿음(창모드). 단 in-world 별 클릭(512,300/512,410)은 **0x0b01/0x0400 미발생** = C002 RE 라이브 입증(클릭은 닿으나 mode2/명령메뉴 게이트가 emit 차단, 마우스 아님). 60+사이클 "마우스 블로커" 가설 정정 — 진짜는 mode 게이트.
- **재구조화 통합 라이브 검증**: client/(캐논 playable)+server/(serve-auth 47900, RE/tools 하네스, RE/.omo 정션) 전부 작동.
- 환경: 캐논 playable `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, 세션 `.omo/ui-explorer/live`. 증거 shots 027(로비)/049(월드).
- **★L2 상태전환 부분 라이브 확정(2차 run)**: 캐논 server/ 로직을 RE/src/server에 동기화 후 `LOGH_STATE_TRANSITION_PROBE=1`+full world env로 재기동→월드(0x0f02·0x0323×51·0x0325·0x031f 기지경제·0x0321 시설)→**0x0f1f(+0x0f06) 푸시 발화**→**중앙 모드전환 UI 패널 출현**(shot 075 before 無→076 after 有). 배경은 전략맵 유지=완전 전술 렌더는 추가 데이터 필요(RE/live10 정합). **서버푸시 상태전환 경로 라이브 작동.** stop SHA 992dc7e2 복원·verified.
- **다음 라이브**: 완전 전술 렌더(전술 시드 데이터+mode byte) · G2 별개캐릭(2개 생성→picker 2카드 distinct) · C002 0x35f35a Frida read-only probe(상충 해소).
- **★L2 완전전술 시도(3차 run)**: 전술 시드 완성(buildBattleEntryParticipants, arg0:1) + `LOGH_BATTLE_ENTRY_PROBE`로 월드→**완전 openBattleField 시퀀스 전부 발화**(0x0349·0x033b·0x0341·0x0343·0x0337×2·0x042f NotifyChangeMode·0x0f1f). 그러나 **화면 여전히 전략맵**(shot 101). = 전술 데이터·arm은 다 전달되나 **시각 전환은 client-local mode byte 게이트**에 막힘(서버 mode 플립 불가, FUN_004c1c30 0x42f 핸들러 mode 미변경 RE 정합).
- **★★수렴 확정**: 맵전환(전술 시각)·C002 명령(0x0b01)·직무/기지 패널 오픈이 **전부 동일 client-local mode byte(0x35f35a/0x126711/0x126718) 게이트**로 funnel. **이 mode byte 하나를 풀면 셋 다 해금.** 서버푸시는 데이터/arm까지만(라이브 3회 입증). 종결=라이브 0x35f35a Frida read-only probe(상충 해소: 실값·param_1=DAT_007ccffc 여부·0x35f35a vs 0x126711 실제 분기)→off-default 클라 force.
- ★교훈: 라이브 도구는 RE/(cwd)서 `python -m tools.logh7_ui_explorer`, .omo=RE/.omo 정션, 캐논 서버 로직은 server/→RE/src/server 동기화 필요(하네스가 RE/src/server 기동). node 절대 안 죽임=G7MTClient만 taskkill. **단일 최대 unlock=mode byte 라이브 해소.**
- **★★mode byte 라이브 probe(4차, `tools/logh7_c002_mode_probe.py` read-only)**: `base(DAT_007ccffc)=0xf305020`, **`mode_byte_126711=2`(mode2/전략맵)**, `mode2_active_2a58f8=0x10001`(데이터有), **`mode0_active_126718=0`·mode0 region 0/64(빈 grid)**. **★상충 해소: 월드는 mode2**(메모리 "mode0 관측"=오류 정정, 객체 식별오인 3회째 교훈). C002 근본 = mode2(enqueue)/mode0(consume FUN_0050d230) 배타 + **mode0 grid 빈 상태**라 클릭 enqueue돼도 consume 불가 = 0x0b01 미발생. **단순 force/토글 아님**(60+사이클 아키텍처 프런티어 라이브 확정). 종결후보=mode0 grid를 채우거나(서버 0x0317 grid emit으로?) 자연 mode2→mode0 전환 흐름 RE. 이건 깊은 프런티어 — 막히면 우회(다른 트랙 병행).
- **★C002 candidate(b) 라이브 반증(5차 run)**: `LOGH_GRID_SELECTOR_PROBE=1 LOGH_GRID_SELECTOR_VALUE=65536`(0x0317 byte[2]=1)로 월드→0x0317 발사(trace ×1)했으나 **mode_byte_126711=여전히 2**(mode0 미활성·grid 빈 0/64). = mode 결정 `FUN_004b68f0`은 **월드진입 1회 latch**라 진입 후 0x0317 셀렉터 변경은 너무 늦어 +0x126711 미변경. **post-entry 레버로 C002 closure 불가 확정.** 남은 길=(a)pre-entry 셀렉터 set(전략렌더 충돌 위험) (c)자연 mode2↔mode0 전환 흐름 RE(원작 상호작용 시퀀스, autologin 흐름엔 부재 추정). **C002=genuine 깊은 프런티어, 다른 트랙 병행이 합리적.**
- **★C002 own-fleet 자연트리거 라이브(6차 run, 최종)**: `LOGH_PLAYER_FOCUS_CELL=1 LOGH_FULL_UNIT_LOCATION=1`로 월드→**own-fleet 스프라이트 여전히 미렌더**(shot 148=항성만, case0 1회성 타이밍 RE "needsLive" 확정). 중앙 own-cell 클릭(512,387)×2→**0x0b01/0xb00/0x0400 전부 0, mode 여전히 2**. = own-fleet 미렌더+클릭해도 mode 배타로 명령 미발생. **★C002 = 다층 깊은 프런티어 최종 확정**: (1)own-fleet 렌더(case0 타이밍) (2)선택 latch (3)명령메뉴 FUN_004f6040 미구축 (4)mode2/mode0 배타 — 4층 전부 autologin/서버푸시 흐름엔 원작 UI 상호작용 시퀀스가 부재. **server-push/lever/click 전부 라이브 반증(6 run). 종결=명령메뉴 서브시스템 구현(A1, 멀티데이 고위험) or 원작 상호작용 흐름 복원.** 그라인딩 중단, 다른 트랙 병행이 합리적.
- **★리마스터 라이브 렌더검증(7차 run)**: 리마스터(HUD20+패널40+AI텍스처16+초상화19)를 라이브 트리(.omo/work/logh7-installed)에 정합 배포 후 월드진입→**전략맵이 리마스터 자산으로 무손상 렌더**(shot 174: AI 텍스처 항성글로우·HUD·플레이어초상화·패널, D3DX8 magic 로드, 크래시 0). 고해상 같은 아트라 시각차는 미세하나 **리마스터 deliverable 라이브 작동 확정.** stop SHA 992dc7e2 복원. **리마스터(텍스처/초상화/HUD/패널)=배포+렌더검증 완료**(고해상 셀확대는 EXE 아틀라스 deep-RE 별도).
- **★W3 로비 네이티브 레이아웃 후보 라이브 반증(8차 run)**: 후보 EXE(`G7MTClient.playable-w3layout.exe` bf0d4cc0, charsel/gamemenu-right/window-dialog 1920 네이티브 추가)로 로비→**중앙 패널 스트레치/프레임 어긋남**(shot 176, 캐논 027의 깔끔한 둥근 패널 대비 깨짐). = login-native 640트랩 동형 = **1920 네이티브 레이아웃 정렬 이슈 라이브 재확인**. **후보 미승격, 캐논 992dc7e2 유지**(사용자 "640으로 해도 돼"가 정답). lobby-res+lobby-native 13패치는 이미 캐논 적용중. stop SHA 원복. byte-verify는 PASS였으나 시각 정렬이 문제(패치 정확≠레이아웃 정합).
- **★★C002 정밀 최종 확정 — 다른방안 selection-latch probe(9차 run)**: 월드는 mode2 정상(이전 오인). `widget_probe`(FUN_00507f20) = 525회 실행되나 클릭 3회에도 **전 위젯 +0xb00=+0xb01=+0xb02=0** = **선택latch 미발화**. closure_pc로 event-9 enqueue 814회 강제해도 **0x0b01 미발생**(클라 생존) = force 도구는 틀린 event-9 경로(수신확인 노드). **★진짜 break 확정: 선택가능 게임객체(own-fleet 스프라이트·기지 마커)가 autologin/서버푸시 월드서 clickable 위젯으로 미렌더 → 클릭 hit 실패 → +0xb00 미발화 → 명령메뉴(FUN_004f6040) 미빌드 → 0x0b01 불가.** mode/event-9/latch-force 전부 무관(라이브 반증 누적). **C002 단일 정밀 블로커 = own-fleet/기지 마커의 selectable 렌더(case0 1회성 타이밍).** 종결=case0 own-fleet 렌더 조건 deep-RE/수정 or 실유저 수동로그인 흐름(autologin이 렌더 스킵 추정) or 고위험 src-force. **9 라이브 run으로 C002 전 경로 정밀 배제 완료.**
- **★real-login 다른방안 탐색(10차 run)**: ui_explorer `--display-mode windowed` + `login --account --password-stdin`(run_login_flow)로 **진짜 수동 로그인 작동**(0x7000→0x0020 로비→0x2005). 캐릭생성(Reinhard Lohengram)→**창모드→풀스크린 자동전환 작동**(사용자 사양 "로그인만 창모드→이후 풀스크린" 라이브 확정, 창 1924×1084). ★**+0xb00 선택latch 발화**(10 run 중 처음 — 로비/다이얼로그 위젯서 선택 메커니즘 작동 입증). **단 char-creation 확인 다이얼로그("정말…하시겠습니까?" 예/아니오)가 클릭·키보드(Enter/Space hw) 둘 다 무반응 = "예아니오 다이얼로그 EXE버그"(메모리 기록)**가 real-login→월드 별도 블로커. autologin 흐름은 이 다이얼로그 우회해 월드 직행. **= 전체 real-user 흐름에 깊은 client-side 블로커 2개: ①char-creation 확인 다이얼로그 EXE버그(real-login→월드 차단) ②own-fleet selectable 렌더(autologin-월드서 C002 차단). 둘 다 EXE/client-render deep-RE 필요.** 10 라이브 run으로 autologin·real-login 양 경로 정밀 탐색 완료.
- **★★★C002+다이얼로그 수렴 확정(11차 run)**: 다이얼로그 버그 후보 A(`FUN_0056f960` 게이트 `0x56f9ac` NOP×6, byte-verified) 빌드→real-login 라이브 → **다이얼로그 여전히 미반응**. = RE 판별 (b) 확정: **입력 poller(FUN_0054ee60)가 FUN_004b68f0 mode 분기로 미호출**이라 dispatch 자체가 안 돌아 게이트 패치가 moot. **★단일 깊은 root 수렴: char-creation 확인 다이얼로그·C002 명령(0x0b01)·own-fleet selectable 렌더·맵전환·전술맵·직무패널이 전부 `FUN_004b68f0` mode 디스패처 라우팅 하나에 gate.** mode는 월드진입 1회 latch(0x35f35a 셀렉터), autologin/서버푸시 흐름이 interactive(menu) mode로 라우팅 안 함. **11 라이브 run + 전 도구 + 양 로그인경로로 정밀 수렴.** 종결=FUN_004b68f0 mode 라우팅 patch(A1, 정밀 타겟됐으나 전체 영향·크래시 전례=고위험) or 원작 상호작용 시퀀스 복원.

## [#7] 2026-06-26 ~08:49 | ★charsel 배경↔내용 정합 패치 라이브 검증(picker 패널 정합 확인)

- **배경**: 사용자 보고 "캐릭생성 화면 배경 패널은 옮겨갔는데 내용 좌표는 안 옮겨감"(클릭좌표 아닌 EXE 렌더 정합 버그). 근본 = `charsel-recenter.json`이 FUN_0051e580 앵커 2바이트(+304,+146)만 이동 → 배경 1패널만 중앙, 내용(FUN_0051f8b0 등)은 네이티브 잔류.
- **수정**: explorer RE로 FUN_0051ca30 빌더 체인 전 앵커 매핑 → 내용 앵커 **8 사이트**(FUN_0051dc00 X/Y, FUN_0051dd80 X/Y, FUN_0051f8b0 MAIN X/Y + 행 레이아웃 상대베이스 add ecx,0x12c / add eax,0x86) 전부 +304/+146로 `charsel-recenter.json`에 추가(폭 즉치 2개는 640트랩이라 제외). **빌드 drift-check: 10 사이트 originalHex 전부 pristine 일치 PASS**, 테스트 EXE SHA `fff62ac1`.
- **라이브**(`--patched-exe charsel-test.exe --display-mode windowed`, 창모드 자동로그인): 로비(shot 349)→"게임시작"류 클릭→**캐릭터 picker(shot 357/363)**: 패널 배경 프레임이 화면 중앙(~938px, native 655서 recenter됨)으로 이동했고 **내용(초상화·스탯·텍스트)이 프레임 안에 정합** = 내용 앵커가 배경을 따라 이동함 라이브 확인. ★이전 "배경만 이동" 어긋남이 picker 패널 계열에선 해소.
- **미완(정직)**: 8단계 **생성 폼**(FUN_0051f8b0 진영 라디오/이름칸) 직접 캡처는 **로비 메뉴/빈슬롯 클릭 좌표 불확실성**(드라이버 네비게이션 플래키, 패치와 무관)으로 미도달. 빈슬롯 더블클릭·하단 결정버튼이 폼으로 안 넘어감(좌표 재캘리브 필요). FUN_0051f8b0 앵커도 동일 검증법으로 패치했으므로 신뢰도 높으나 **그 화면 자체 라이브 정합은 사용자 육안 확인 권장**(사용자가 원 버그 목격·라이브 환경 보유).
- **정리**: G7MTClient 종료, `stop`로 install EXE 캐논 **992dc7e2 복원 확인**, 47900 해제.
- **델타(#6 대비)**: ★전진 — charsel 부분 recenter 버그의 근본(다중 패널 독립 앵커) 확정 + 8 사이트 byte-verified 패치 + picker 패널 라이브 정합. 잔여=8단계 폼 화면 육안 1확인 + (필요시)REVIEW 4앵커(SUB 605,206 / 사이드 15,134).
- **증거**: shots 349/357/360/363(`.omo/ui-explorer/session/shots/`), `RE/tools/client_patches/charsel-recenter.json`(10 사이트), `docs/logh7-charsel-recenter-fix-2026-06-26.md`.

## [#8] 2026-06-26 ~09:1x | ★charsel 8단계 진영선택 폼 도달 — 핵심 정합 검증 성공(공동 라이브)

- **사용자 공동 구동**(포그라운드 유지). 테스트 EXE `G7MTClient.charsel-test.exe`(charsel-recenter 10사이트), 창모드.
- **네비 정정**: 지난 실패 원인 = 로비 메뉴 (150,255)가 **첫 항목 "게임 시작"**(actual y~250)을 눌러 로그인 picker로 감(좌표맵 255 stale). 스샷 측정으로 **"새 캐릭터 작성" = actual (150,310)** 확정 → 클릭 → **새캐릭 세션 picker(shot 367, 진영 엠블럼 2행 정합)** → 세션행 더블클릭(800,320) → **8단계 진영선택 폼 도달(shot 370)**.
- **★핵심 검증**: 폼 "소속할 세력을 선택해 주십시오"에서 **진영 라디오(은하제국/자유행성동맹)+제목이 배경 프레임 안에 정합** = 내용 앵커 8사이트 패치 라이브 작동 확정. **사용자 핵심 불만("배경만 옮겨가고 내용 안 따라옴") 해소.**
- **⚠️ 잔여**: 하단 버튼 행 중 **"취소" 버튼+좌측 탭이 패널 프레임 왼쪽으로 돌출**("다음으로"는 프레임 안 정합). = 버튼 행 앵커 1개 미이동 → 정밀 RE로 해당 앵커 식별 후 +304(/+146) 추가 예정(REVIEW 후보 블라인드 적용은 정합된 "다음으로" 깰 위험이라 RE 선행).
- **정리**: G7MTClient 종료, install EXE 캐논 **992dc7e2 복원**, 47900 해제.
- **델타(#7 대비)**: ★전진 — 8단계 생성 폼 자체 도달+핵심 정합 라이브 확정(이전엔 picker까지만). 로비 메뉴 좌표 정정(150,310)도 부산물(ui-coordinate-map 갱신 대상). 잔여=버튼 행 1앵커.
- **증거**: shots 365/367/370(`.omo/ui-explorer/session/shots/`).

## [#9] 2026-06-26 ~09:4x | ★★charsel 진영 라디오/엠블렘 중앙 정합 완료 (근본=유일 미패치 앵커 0x595e83)

- 사용자 정정 목표: "라디오 버튼이랑 엠블렘 전체가 중앙에 위치해야지"(배경 매칭이 아니라 콘텐츠 센터링).
- 4차 RE 정적 한계(모든 charsel 패널이 동일 (300,134)/panel 0x39 즉치라 라이브 빌더 구분 불가) → **enumeration 직접 수행**: 바이너리 전체 (300,134) 앵커쌍 **17개 중 16개 패치됨, 1개 미패치** 발견 = **VA 0x595e83(X)/0x595e8b(Y), foff 0x195e83/0x195e8b** = 진영 라디오/엠블렘 패널(네이티브 300 잔류 → 라디오 ~600px 좌측몰림 근본). 나머지 16개는 604로 이동했으나 이 1개만 안 움직여 어긋났던 것.
- **수정**: 이 1쌍 +304/+146 추가 → charsel-recenter.json **38 사이트**. 빌드 drift-check 38/38 PASS(테스트 EXE `0809d3ba`).
- **★라이브 검증 성공**(shot 384): 진영 라디오(은하제국/자유행성동맹)·제목·하단 버튼(취소/다음으로)이 **전부 패널 중앙 정합**. 좌측몰림 완전 해소. 사용자 요구 충족.
- **정리**: G7MTClient 종료, install EXE 캐논 **992dc7e2 복원**, 47900 FREE.
- **델타(#8 대비)**: ★★완료 — charsel 진영 페이지 콘텐츠 센터링 라이브 확정. 방법론 교훈: 동일-즉치 앵커 다수 시 정적 RE보다 **바이너리 전수 enumeration + 패치셋 diff**가 결정적(4 RE 에이전트가 못 집은 걸 1 스캔이 해결).
- **잔여**: 후속 step(성별/이름/능력치/초상화) 화면도 동일 정합인지 1확인 + charsel-recenter DEFAULT_STACK 승격(캐논 SHA 갱신) 결정.
- **증거**: shot 384, `RE/tools/client_patches/charsel-recenter.json`(38 사이트).

## [#10] 2026-06-26 | ★C002 R1 라이브 실행 + 리마스터 렌더 검증 + full-flow(게임시작 경로)

- **캐논 playable** windowed 기동 → 게임시작(150,250)→기존캐릭 더블클릭(820,350)→**월드 진입**(shot 404 전략맵: 분광형 항성+그리드+하단 HUD). full-flow(login→월드) 라이브 확정.
- **★리마스터 렌더 검증**: SR 배포 534 텍스처(함선/모델) + 캐논 playable로 월드 전략맵 **무손상 렌더, 크래시 0**. 리마스터 deliverable 라이브 OK.
- **★C002 R1 poll 실행**(`tools/logh7_c002_r1_poll.py`, 빌드만 했던 도구 첫 실행): base=0xf308020, **selector(0x35f35a)=0, mode_byte=2, mode0_active=0, mode2_active=65537, own_cell(+0x11178)=2588(0xa1c)**. → **selector 0 고정 = autologin/game-start 흐름엔 selector 라이터 없음 → mode2 잠금**(mode-dispatcher RE 라이브 입증). own_cell은 2588로 설정됨(strat-camera-focus).
- **★C002 결론 정밀화**: selector는 **월드진입 1회 latch**(post-entry 쓰기 무효=0x0317 post-entry 실패 동형). 자연 라이터=char-select 시퀀스(real-login)인데 **예/아니오 다이얼로그 버그로 real-login→월드 차단** → **C002 클러스터(맵전환/전술/직무패널/다이얼로그) 진짜 critical path = 다이얼로그 버그 선결**(또는 pre-entry selector-set 정확값+타이밍). EXE-force는 60+사이클 반증.
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타**: ★전진 — 미실행이던 R1 도구 라이브 실행+baseline 확정, 리마스터 렌더 라이브 검증, full-flow 재확정. C002는 다이얼로그-선결로 정밀 수렴(우회: 다른 도메인 병행).

## [#11] 2026-06-26 | ★★★깊은 프런티어 돌파: mode2→mode0 전환 = 전략맵→전술뷰 라이브 전환 (60+사이클 미해결)

- **돌파 RE**(`docs/logh7-mode0-breakthrough-2026-06-26.md`): mode 전환 = FUN_004b68f0 1회 latch, selector(+0x35f35a) 제어와이어=0x0317 byte[2]. ★journal #6 selector-단독 실패 이유=post-entry라 latch 지나침. **해법=selector + 0xb0a value=1 재arm 조합(latch 재통과)**. mode0 데이터=FUN_004c32a0 TacticsImport([+0x126711]==0)이 +0x404xxx 소스(인바운드 0x33b/0x345 ResponseTactics 서버푸시)로 채움. 0x0b01=클라 send(서버 0x0b07 직접푸시 우회 가능).
- **★L1 라이브 성공**: 캐논 playable + `LOGH_GRID_SELECTOR_PROBE=1 LOGH_GRID_SELECTOR_VALUE=65536 LOGH_STRAT_SEQ_START=1`(+world env) → 게임시작→월드 → **mode_byte_126711=0**(이전 전 run 2!)·**mode0_active_126718=1**(이전 0!)·mode2_active=0 = **mode2→mode0 전환 라이브 확정**. 서버푸시 단독·EXE force 無.
- **★시각 전환**: shot 416 = 전략맵이 **전술/3D 함선뷰로 전환**(분광항성 전략맵 → 성운 속 3D 함선 1척). = 사용자 목표 **"자유로운 맵 전환"+"전술 맵"** 동시 개방. mode0_region 1/64만 충전(함선1척) → **L2(소스충전 0x33b/0x345)로 완전 전술맵** 예정. 크래시 0(이전 "mode0 빈→stall" 우려 불식, 1/64라도 클린 렌더).
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타**: ★★★MAJOR 돌파 — 60+사이클 막혔던 mode 전환을 **서버푸시 레시피(L1)**로 라이브 개방. C002 클러스터(맵전환·전술·직무패널)의 핵심 게이트 돌파. 잔여=L2 완전충전·전술 인터랙션·0x0b01(L4 0x0b07 우회 가능).
- **증거**: shot 416, mode_probe 출력(mode_byte=0/mode0_active=1), `docs/logh7-mode0-breakthrough-2026-06-26.md`.

## [#12] 2026-06-26 | ★L2 라이브: L1+BATTLE_ENTRY = 전술맵 로드 트리거 성공, NOW LOADING 정체(0x345 데이터 갭)

- **L1 + `LOGH_BATTLE_ENTRY_PROBE=1`(+DELAY 2500) 결합**: mode_byte=0·mode0_active=1(전환 재현) + **전술맵 로드 시퀀스 트리거**. shot 421/422 = **"NOW LOADING — Legend of the Galactic Heroes" 로딩화면 + 3D 기함** (416 부분전환보다 진전 = 정식 전술 진입 로드).
- **★정밀 진단**: 3초 후에도 NOW LOADING 정체 = **전술 배틀필드 데이터 불완전→로드 stall**(journal #6 3rd run "전술 시드 불완전→stall"과 정합, 단 그땐 mode 미전환이라 전략맵 유지였고 지금은 mode 전환+로드 트리거까지 진전). 0x33b(기존 G196)는 푸시되나 **완전 전술필드 데이터(synth L2의 0x345 Base 빌더=신설)가 없어** 로드 미완.
- **= 깊은 프런티어 돌파의 마지막 조각 = 0x345 전술-필드 데이터 서버 구현**(login-protocol buildResponseTactics 계열 확장 + login-session 푸시 배선, deferredBattleInners 경로). 이건 서버 코드 변경(no-live 구현+테스트 후 라이브).
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타(#11 대비)**: ★전진 — mode 전환(L1)에 더해 **전술맵 로드 트리거까지 라이브 확정**. 잔여 = 0x345 전술필드 데이터로 NOW LOADING 통과 → 완전 전술맵. mode 게이트(60+사이클 핵심)는 완전 돌파됨, 이제 순수 데이터 충전 문제로 환원.
- **증거**: shot 421/422, mode_probe(mode_byte=0).

## [#13] 2026-06-26 | 0x33b stride 픽스(test-verified) 라이브: mode 전환·stride 정정됐으나 NOW LOADING 잔존(갭2 로스터)

- **서버 픽스(캐논 server/, test-verified 1184/0)**: battle-engine `buildTacticsInformationUnitShipInner`를 클라 reader FUN_004c32a0 정합으로 재작성(47B→**52B/4B헤더/고정31204/mps래퍼**, login-protocol 52B 레이아웃과 byte-동일). 구 47B(헤더2B·stride47·morale/confusion 레이아웃)는 실버그였음. 테스트 오라클도 52B로 갱신.
- **라이브 검증**(`--server-root server` 캐논 직접기동 = 동기화/drift 불요, L1+BATTLE_ENTRY): mode_byte=0·mode0_active=1(전환 작동) + 전술 NOW LOADING 트리거. **그러나 NOW LOADING 잔존**(shot 427) + **mode0_region 여전히 1/64**(유닛 미적재).
- **정밀 진단**: stride(갭1) 수정으로도 유닛이 mode0에 안 채워짐 = **갭2 확정 = 참가 함대 0x325/0x323 로스터 미동반**. FUN_004c32a0가 0x33b 유닛을 0x325(+0x41a368)/0x323(+0x36a5dc)와 cross-match해야 적재하는데 로스터 부재로 스킵→stall. (RE O5 분리: mode0 ✓·stride ✓·로스터 ✗.)
- **= 전술맵 완성 마지막 조각 = 참가 전원 0x325/0x323 prepend**(login-session:1804 postloadPlayerRecord 1기 게이트→전원 확장). 서버 변경+테스트.
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타(#12 대비)**: 0x33b stride 실버그 수정(test-verified) + 정체 진범을 stride→**로스터(갭2)**로 정밀 분리. mode 게이트는 캐논서버서도 완전 작동 재확인.
- **증거**: shot 427, mode_probe(mode_byte=0/mode0_region 1/64), `logh7-tactics-field-impl-2026-06-26.md`.

## [#14] 2026-06-26 | 갭2(로스터 0x325/0x323 prepend) 구현·검증, but NOW LOADING 잔존 → 정확 진단 필요

- **갭2 서버 구현(캐논 server/, workflow maker+verifier, test 1184/0 ×2 non-flaky)**: battle-entry deferredBattleInners = [0x325 로스터유닛 + 0x323 캐릭들 + ...battleSteps]. participants[] 단일소스서 0x33b/0x325/0x323 동일 ID cross-match 보장. 기존 빌더(buildInformationUnitRecordInner/CharacterRecordInner) 재사용. off-default. verifier PASS(byte well-formed·ID 일관). (0x325 fleets는 id 위주 축소폼, faction/cell/boats=0 P3.)
- **라이브 검증(`--server-root server`, 0x33b stride + 갭2 로스터 둘 다 포함, L1+BATTLE_ENTRY)**: mode_byte=0(전환 작동) but **NOW LOADING 잔존**(shot 432), mode0_region 1/64 불변.
- **정직 결론**: 갭1(stride)+갭2(로스터) 둘 다로도 전술 로드 미완 = **stride/로스터보다 더 깊은 다중 레코드/게이트 의존**(RE O5 불확실성 현실화). 추측 레코드 추가는 비효율 — **다음 정공법 = NOW LOADING 완료 게이트/+0x404xxx 전술유닛 적재를 read-only Frida watchpoint로 실측**(어느 레코드/필드/카운트가 비어 FieldMake/MakeTacticsUnit가 stall하는지 정확 분리) → 그 데이터만 채움.
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE. mode0 진입 자체는 안정 재현(L1).
- **델타(#13 대비)**: 갭2 구현·검증 완료(서버측), 라이브로 stride+로스터 불충분 확정 → 전술맵 완성은 정밀 Frida 진단(완료게이트 실측)이 다음. mode 게이트 돌파는 불변(견고).
- **남은 도메인 영향**: 자유 맵전환(mode 전환=작동)·전술맵(로드완료 데이터 미완)·직무패널은 동일 mode 인프라 위 — 전술 데이터 완성이 핵심 잔여.

## [#15] 2026-06-26 | ★Frida 진단: NOW LOADING = 클라 리소스 로드(wire/mode 게이트 아님) — 추측 방향 정정

- **read-only Frida hook**(`tools/logh7_c002_tactics_import_probe.py`): NOW LOADING 정체 5초간 측정 →
  - **FUN_004c32a0(TacticsFieldImport) 0회** · **FUN_004b64c0(FieldMake) 0회** · **FUN_004b68f0(main dispatcher) 0회** · 유닛 factory 0회.
- **★결정적 해석**: main 디스패처조차 안 도는 = NOW LOADING 동안 게임이 **별도 블로킹 로딩 루프**에 있음 = **NOW LOADING은 서버 wire/mode 게이트가 아니라 클라이언트 리소스(전술 배틀필드 3D모델/지형/에셋) 로드**가 미완료라 멈춘 것.
- **= 갭1(stride)/갭2(로스터) = stall 진범 아님 확정**(전술 import 단계 도달 전에 막힘). 두 서버 픽스는 유효한 버그수정이나 NOW LOADING 통과와 무관. **추측(wire 데이터) 방향 정정** — 정밀 Frida 실측이 막아줌(블라인드 레코드 추가 안 한 게 옳았음).
- **전술맵 완성의 진짜 잔여 = 클라 전술 배틀필드 에셋/리소스**(다른 도메인 — content/asset 레벨, journal #6 "완전 전술 렌더는 추가 데이터 필요"·"placeholder 불완전→stall"의 본질). 다음 진단 = NOW LOADING 로딩 루프가 무슨 리소스(파일/모델/맵데이터)를 기다리는지(파일I/O hook 또는 누락 에셋 탐색).
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타**: ★중요 정정 — mode 게이트 돌파는 견고하나, 전술 NOW LOADING은 wire가 아닌 **클라 리소스 로드** 문제로 결정적 재분류. 서버 추측 종료, 에셋 레벨로 전환.

## [#16] 2026-06-26 | NOW LOADING 음영(negative-space) 진단 완료: 파일I/O·네트워크·디스패처 전부 0 = 순수 대기

- **파일I/O probe**(`tools/logh7_fileio_probe.py`, CreateFileA/W·fopen·recv·WSARecv·wire디스패처 FUN_004ba2b0 hook): NOW LOADING 정체 6초 측정 → **total_unique=0**(파일 오픈 0·네트워크 recv 0·wire 옵코드 0).
- 앞선 진단(#15)과 종합: NOW LOADING 중 **파일I/O·네트워크 수신·wire 디스패처(FUN_004ba2b0)·world 디스패처(FUN_004b68f0)·전술 import(FUN_004c32a0)·FieldMake 전부 0회**.
- **★결정적 음영**: 로드 루프가 관측가능 활동 없이 **순수 대기**(스레드 플래그 스핀 / D3D·D3DX 리소스 / 또는 입력대기). 표준 hook(파일/네트워크/디스패처)으론 불투명.
- **배제 확정**: NOW LOADING은 ❌wire-data(import 미도달) ❌파일-리소스(파일I/O 0) ❌네트워크(recv 0). 남은 가설 = 스레드/D3D/입력 — 깊은 계측 필요.
- **다음 진단(fresh 컨텍스트 권장)**: ① NOW LOADING 중 클릭/키 입력 테스트(입력대기 화면인지) ② D3D/D3DX9 로드 함수 hook ③ 스레드 enumerate+상태(블록된 스레드 backtrace) ④ NOW LOADING 렌더 루프(어느 조건 폴링) RE.
- **정리**: 캐논 SHA 992dc7e2 복원, 47900 FREE.
- **델타(#15 대비)**: 전술 NOW LOADING을 wire/파일/네트워크 전부 배제하는 음영 진단 완료 → 순수 대기로 좁힘. mode 게이트 돌파·서버 픽스는 견고. ★세션 극한 포화 — Frida 그라인드 중단, 깊은 계측은 fresh 세션.
