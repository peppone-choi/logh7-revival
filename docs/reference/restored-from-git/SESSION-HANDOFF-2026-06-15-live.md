# Session Handoff — 2026-06-15 (라이브 검증 + 다중 디버깅 세션, post-menufix)

이어가기: 이 문서 + 메모리 `logh7-live-session-2026-06-15`(시작점) + `logh7-menufix-button-enable`.
서버 테스트 베이스라인: `node --test tests/server/*.test.mjs` → **530 pass / 0 fail**. 미커밋(아래 §파일).

## ★ 실행법
**클라 = `.omo/work/logh7-ko-overlay/exe/G7MTClient.korean.menufix.exe`** (korean.exe + 버튼-enable 4바이트 패치).
```
python -m tools.logh7_ui_explorer stop
python -m tools.logh7_ui_explorer start --port 47900 \
  --patched-exe .omo/work/logh7-ko-overlay/exe/G7MTClient.korean.menufix.exe \
  --env LOGH_RELAY=1 --env LOGH_AUTHORITATIVE=1 --env LOGH_CONTENT_DB=1 --env LOGH_NPC_AI=1 \
  --env LOGH_NPC_SEED=1 --env LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_SS_FORMAT=message32 --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_STRAT_GRID=1 --env LOGH_STRAT_FLEET=1 --env LOGH_TACTICS_UNIT=1 --env LOGH_GRID_ENTER=1 \
  --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_STRAT_GALAXY=1 --env LOGH_KO_NAMES=1
```
⚠️ **`LOGH_ROSTER_PUSH=1` 쓰지 말 것** — world 진입(0x206 경로)을 NOW LOADING에서 깨뜨림.
- 새캐릭: `click 128 264`(새캐릭) → `click 747 260`(세션행 더블클릭) → SS-login(flag 0x358375=1) → 캐릭터 생성 8단계 폼.
- world: `click 110 192`(게임시작, start 직후 settle 충분히) → `click 520 270`(캐릭 더블클릭) → NOW LOADING **멈춤**(§미결1).
- 스크린샷: `python -c "from PIL import ImageGrab; ImageGrab.grab().save('shot.png')"` (ui_explorer GDI는 D3D8 검정).
- frida 메모리: `clientBase=*0x7ccffc`; scene seq=`*(*0x2215e2c+4)`; SS flag@+0x358375/+0x35837e; roster@+0x554da4.

## ✅ 완료
- **Task 1 완전**: 새캐릭/추첨/삭제/세션변경 버튼=클라 scene 0x16(FUN_0051a370) 하드코딩 disable배열 [1,0,0,0,0,1,0,1]. **menufix.exe 4바이트 패치**(VA 0x51ab3a/3f/44/49 imm8 00→01, tools/logh7_codepage_patch.py)로 enable. → 세션선택 → **캐릭터 생성 8단계 폼 전부 한글**(세력 은하제국/자유행성동맹·성별·출신 귀족/제국기사/평민/망명자·이름·나이생일·얼굴18장·능력치 통솔~방어·함명). "0x1002 게이트" 이론 frida 반증.
- **0x1008 영문이름 등록 수정**: 클라가 packed 가변길이(NUL종단 UTF-16LE) 직렬화인데 파서가 fixed-slot이라 빈이름→거부. cursor 재작성(power@body0x05, lastname_len@0x08 NUL포함). login-protocol.mjs.
- **회원가입(#6)**: GIN7 인코더 byte-exact(account=u32BE len+UTF16BE, password=u16LE len+UTF16LE, 40B→innerLen39 truncate) + CLI 어드민(`node src/server/logh7-server.mjs admin create|delete|unlock|list|exists --account-db`) + 외부 가입포털(tools/standalone/signup-portal).
- **행성명 KO wiring**: content-source가 content/names/{systems,planets}-ko.json→name_ko, 0x031d buildStaticInformationBaseInner이 **LOGH_KO_NAMES=1**시 KO(UTF-16LE, ルンビーニ→룬비니).
- **IV EX 능력치 디코드**: content/roster/ivex-abilities.json (181, E:\DGGL\Games\G4EXWIN_Win_220604\*.GIN, base 0x7586 stride34). **스케일 0-100 확정**(평균49.6, 라이브 능력치슬라이더 max99). 라인하르트 통솔101/운영96, 얀 지휘97/정치17. canon아키타입: 전투 지휘78/기동76/방어77, 참모 정치87/정보80.
- **능력치 시드(하우스룰)**: content/roster/ability-seed.json(베이스40+출신보정+보너스50) + src/server/logh7-ability-seed.mjs → 0x1008 등록 캐릭터 0x0323(ability@0x188)에 출신시드(플레이어제출 우선).

## 🔍 진단 (근본원인 규명)
- **예/아니오 확인다이얼로그 버튼** = "로그인에 실패했습니다/버전이 다릅니다"로 오표시 = **EXE버그**(제네릭 다이얼로그템플릿 FUN_0056ebf0@0x56ebf0이 버튼라벨을 group103 idx0/1=flat3071/3072 로그인메시지로 하드코딩default; getter FUN_00522010@0x522010). **데이터아님**(constmsg offset테이블 JP/KO 동일). String.txt=write-only 디버그(번역무의미). **다이얼로그 패치 에이전트(ae13d085) 진행중** → .omo/work에 codepage_patch 레시피 산출 예정.
- **세션선택화면 일본어** = 데이터는 이미KO(flat2469 플레이세션선택/2521/2526경과시간/2474은하제국). 원인=CP949/ACP 로케일 표시벽([[logh7-localization-cp932-wall]]) or stale.
- **생성폼 능력치 "기준 0"** = 클라 로컬 위젯 default(서버메시지 아님, FUN_00406b30은 디버그 텍스트직렬화로 오진정정) → 폼수정은 클라패치. 서버는 등록후 0x0323 시드만.
- **★ world진입 NOW LOADING 멈춤(핵심 블로커)**: 게임시작→캐릭더블클릭→0x0205/0x0206 SS게임로그인+conn3 살아있고 0x0426전투broadcast받지만, 클라 world-init walk(0x0f02/0x0300/0x0313/0x0322/0x0323) **0건**. 원인: 마스터게이트 **clientBase+0x35837e**(SSGameLoginOK flag)가 conn3 dispatcher FUN_004ba2b0@0x4ba2b0 **case 0x206에서만 set=1**; world-init walk emitter **FUN_004b78a0의 216 send가 이 flag에 게이트**(flag0→전부침묵). FSM=FUN_004b68f0. **flag 0인 이유 미확정**: 0x0206이 conn3 recv(FUN_004ae0d0→FUN_004b8850 enqueue@+0x3552bc→FUN_004b8950→FUN_004ba2b0) case 0x206을 안 fire. trace상 0x0206과 0x0426(작동) **둘다 conn3·동일framing**(buildEncrypted0030Frame+message32+sub4+decipherKey) — 미스터리.

## ⏳ 미결 (다음 세션 우선순위)
1. **world진입 = ✅해결!(2026-06-15 재개세션)**: 진짜원인=**Task2 0x0304 직무카드핸들러**(buildStaticInformationCardInner)가 world-init walk의 0x0304(=RequestStaticInformationSession; 클라는 empty InformationSession 0x0305 기대)를 non-empty StaticInformationCard로 가로채 → 클라가 0x0305 매칭못해 **send queue(clientBase+0x357ec0) 안비움** → advance(FUN_004b76e0의 FUN_004b7890=FUN_004b8950 게이트, walk-emit FUN_004b78a0) 멈춤. **수정**=login-session.mjs 0x0304핸들러 `&& process.env.LOGH_DUTY_CARDS === '1'` env-gate(default=walker empty 0x0305). **게임시작 click 정확좌표=128,197**(110,192는 버튼밖이라 이전 비결정적!), 캐릭 더블클릭=520,270 → world-init walk(0x0f02/0x0300/0x0313/0x0315/0x031d KO성계명/0x0323) 발생 → **전략맵 진입**(flag 0x35837e/0x358375=1). 0x0206 framing은 처음부터 정상(case0x206 enter f=0→leave f=1 검증). 전략맵 UI한글 확인(게임을중단합니다/사운드설정/황제/통솔/정치). **남은(in-world)**: NO DATA(info 미주입)·능력치0(이 캐릭터)·갤럭시 성계마커 미렌더 → Task2(info-panel)·Task3(0x0b01)·Task4(마커) 라이브 검증. 다른 info핸들러(0x0322/0x0324/0x032a/0x032e/0x034e)도 world-init walk와 충돌하면 동일 env-gate 처리.
2. 다이얼로그 버튼 EXE패치 적용(#8, 에이전트 레시피 완료후 codepage_patch).
3. 능력치 생성폼 "기준" 클라패치(서버 시드는 완료).
4. **필러박스(#5)**: dgVoodoo .omo/tools/dgvoodoo2/extracted/{D3D8.dll,dgVoodoo.conf}를 클라 exe dir에 재배치 + **FullscreenAttributes=fake**(게임 1024×768 모드변경 회피→centered_ar 필러박스). 좌표영향이라 Task2/3/4 후. cmd_stop은 .dat 데이터 안건드림.
5. Task2/3/4 라이브 검증(world진입 후): info-panel/직무카드/전투(코드완료), 0x0b01 in-world조작, 갤럭시마커 렌더.
6. 세션화면 로케일.

## 📁 파일 (미커밋)
- 수정: src/server/{auth-server,battle-engine,content-adapter,content-pack,content-source,info-records,login-protocol,login-session,server,world-state}.mjs + 해당 tests + docs/logh7-character-creation-wire.md.
- 신규: content/names/{systems,planets}-ko.json, content/roster/{ability-seed,ivex-abilities}.json, src/server/{logh7-ability-seed,logh7-admin,logh7-gin7-credential}.mjs + tests, tools/standalone/signup-portal/.
- 클라: .omo/work/logh7-ko-overlay/exe/G7MTClient.korean.menufix.exe (+menufix-patch.json/manifest).

## ⚙️ GOTCHAS
- KO 데이터(.dat) JP로 복원돼 있으면 재적용: `cp .omo/work/logh7-ko-overlay/data/MsgDat/*.dat .omo/work/logh7-installed/data/MsgDat/` + `cp .omo/work/logh7-ko-overlay/exe/String.txt .omo/work/logh7-installed/exe/String.txt.original`. cmd_stop은 exe/String.txt만 복원(.dat 무관).
- 능력치 화면 슬라이더 max=99(스케일 0-100 확정 근거).
- ui_explorer text는 WM_CHAR ord(char)=영문만; 한글/가타카나는 IME 없이 불가.
