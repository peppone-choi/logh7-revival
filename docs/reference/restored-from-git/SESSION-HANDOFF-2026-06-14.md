# Session Handoff — 2026-06-14 (post-/clear continuation)

This session was very long. Read this + `MEMORY.md` (and the memory files it points to) + the
Task board to continue seamlessly after `/clear`. Server tests baseline: **`node --test
tests/server/*.test.mjs` → 456 pass / 0 fail** (world-init-probe test is flaky under full-suite
concurrency; passes standalone). Original client EXE intact: SHA `2848be76…`.

## ✅ Completed this session
- **#1 캐릭터 도메인 RE**: 4-axis wire spec (portraits / original-select / 0x1008 create / signup).
- **#3 + #10 포트레잇 툴**: `tools/logh7_canon_face_registry.py` (CLI, tested 9/9) + `tools/standalone/`
  (standalone CLI + **`logh7_face_registry.html` GUI**) + README. **Deployed to Desktop**:
  `C:\Users\user\Desktop\LOGH7-PortraitTool\` (html, py, README, roster.json, canon-face-registry.json,
  canon-portraits/ 446 PNGs).
- **#5 회원가입**: `src/server/logh7-account-registry.mjs` (scrypt+salt+timingSafe, persist 0600, account
  cap, fail-lockout, anti-enum, label-validate) + `createAccountStore({registry, allowRegister})` +
  serve-auth `--account-db <path>` / `LOGH_ACCOUNT_DB`. Adversarial security review applied. 14 tests.
- **(다) NPC AI 틱 배선**: `logh7-auth-server.mjs` setInterval tick (opt-in `LOGH_NPC_AI=1`, needs
  authoritative) → runNpcTick → broadcast to in-world conns; clearInterval on close. 3 tests
  (`logh7-auth-server-npc.test.mjs`). **Unblocks solo play.** Run:
  `LOGH_RELAY=1 LOGH_AUTHORITATIVE=1 LOGH_CONTENT_DB=1 LOGH_NPC_AI=1 npm run server:auth`.
- **MsgDat 재인코더**: `tools/logh7_msgdat_encode.py` (HFWR offset-table = record indices → length-safe
  CP949 re-encode; tested 8/8). `tools/logh7_codepage_patch.py` (drift-checked same-length EXE patcher).
- **#8 콘텐츠/명령 인벤토리**: full DONE14/PARTIAL8/MISSING13 + roadmap (top: NPC tick [done], static
  info-record push at world-load, battle-ops bind). Output: task w3d7uai0a.
- **#9 한글판 클라 아카이브**: NOT archived (re-verified). Only JP assets survive (logh-7 CD + G7UPD040514.exe).
  New: Korean Netmarble site path `netmarble.net/cp_site/spacewar/` archived but login-gated, no binary.
- **#11 이름추출 스윕 (결정적)**: **Gin7 게임파일에 캐릭터/함선 이름 전무** (1790+ files). Server-authoritative;
  client has only `$token$` templates + visual assets + star/planet index (Null_galaxy.mdx: star_01_G..79,
  planet IDs). **이름은 외부 소싱이 유일경로** — 가장 효율적 경로 = **전작 RE**: IV EX `G4XCHREX.DAT` (1629B char DB),
  Game VI `Cvdat*.bin` (XOR-0x2F, stride 24, scenario→char), `Fltdat/Foce` (E:\DGGL\Games\…). 매뉴얼=80성계.
- **#12 클라검증 RE (결정적)**: authoritative content가 지켜야 할 계약. **크래시 불변식**: focusId(0x3584a0)가
  캐릭터배열의 record[0]와 반드시 매치(아니면 HUD FUN_004c7290 null→FUN_0058ee70 크래시); unit count ≤600;
  name ≤13 UCS-2 (초과 시 인접필드 오염); **face는 tcf 슬롯 해석 실패 시 빈칸(크래시 아님)**. Output: task wevhgk44k.

## 🟡 한글화 (#2) — 미해결, 핵심 정리 (가장 큰 미결)
파이프라인은 완성(CP949 constmsg/String.txt + HANGEUL charset + 굴림 폰트명 패치 + MsgDat 인코더). **벽**:
- 이 머신 `GetACP()=65001`(UTF-8 ACP). 게임 변환 `MultiByteToWideChar(DAT_03350674,…)`이 UTF-8로 → CP949 깨짐.
- 시도+결과: charset패치=폰트OK / 폰트명굴림=단독무효 / **codepage push패치(FUN_00600394 ff35→push949)=공백(blank!)** /
  manifest activeCodePage=ko-KR(외부+임베드 둘다)=무효(2003 MSVCRT) / **LR ko-KR + 굴림 EXE = 로그인다이얼로그 Latin-1 모지바케**
  (LR v1.6.0가 HookSetWindowTextA 제거 → Win32 다이얼로그 미후킹) / 인게임 텍스트(텍스처폰트)는 "**굴림 한글 깨짐 = 옛 스타크래프트식**"(DBCS 바이트 쪼갬 or 코드페이지 미적용).
- ctypes 증명: 이 머신에서 `MBToWC(949,9,"게임 시작"cp949)→정상 n=5`. 즉 949 접근은 옳음. push패치가 blank된 이유 미규명.
- **다음 결정타(추측패치 금지)**: ① **frida로 메뉴렌더 MBToWC의 실제 (codepage/바이트/return) 캡처** — 단 `tools/logh7_frida_mbtowc.py`의
  frida API 버그 수정 필요: `Module.getExportByName('kernel32.dll','MultiByteToWideChar')` → frida 17.x는
  `Process.getModuleByName('kernel32.dll').getExportByName('MultiByteToWideChar')` (또는 Module.getGlobalExportByName).
  ② 캡처 결과 codepage가 65001이면 **DAT_03350674 store를 949로 강제**: FUN_005fff07 store @VA 0x5fffc9, 그 앞 가드
  `83 ff 02 75 05`(VA 0x5fffc4)→`b8 b5 03 00 00`(mov eax,0x3b5). store 2곳(0x5fffc9, 0x5ffffc). 또는 IAT 후킹.
  ③ 동시에 "굴림 깨짐"이 DBCS 분할이면 텍스처폰트 caller FUN_004eb100(이미 u16 wide 읽음 → 상류 변환이 진짜 원인).
- 산출물: 패치본들 `.omo/work/logh7-ko-overlay/exe/` (G7MTClient.exe=charset+굴림, .cp949.exe=+codepage push[blank],
  .komanifest.exe=+manifest[무효]). KO constmsg/String.txt = `.omo/work/logh7-ko-overlay/data/…`. 카탈로그 `content/localization/constmsg-ko.json`(60).

## 🟡 남은 작업 + 정확한 다음 단계
- **#2 한글화**: 위 frida 캡처 → DAT_03350674=949 패치 (최우선). 메모리 [[logh7-localization-cp932-wall]].
- **#4 엔티티 재정초**: ⚠️ **현 face 레지스트리 신뢰불가** (atlas_slot=글로벌 hed인덱스를 local로 오용; AI분류 무시 지시). 사용자: "모든 포트레잇 재명명". 경로 = 포트레잇 HTML GUI(전 포트레잇 공백, 사람이 명명) + 전작 IV EX/VI DB RE. canon-face-registry.json에 _WARNING 박음.
- **#6 캐릭터 생성/선택**: face 게이트 done. 남음: 0x1006 레이아웃(라이브캡처), create→world 0x0323 연결, faction/sex match(power→faction enum). #12 검증계약 준수.
- **#7 2인 E2E**: 서버측(릴레이+전투+NPC) 준비됨. 블로커=in-world controllability(gridActive=0) 라이브-RE + 2클라 동시구동(foreground-steal). 계획 docs/logh7-2player-e2e-plan.md.
- **필러박스/창크기**: 게임 `[F9]` 풀스크린 토글 존재. dgVoodoo2 d3d8 `ScalingMode=stretched_ar`(사용자 DGGL 보유, GTX1660Ti).

## 🔧 환경/Gotcha (post-clear 필수)
- **머신 GetACP=65001 (UTF-8 ACP)** — 모든 ANSI 한글화의 근본 변수. .NET4.8/VC++/3.5 설치됨.
- **Python app-execution-alias 존재** → 가끔 Microsoft Store 팝업 (Settings>앱 실행 별칭에서 python OFF 권장).
- **Locale Remulator** 다운+셋업됨: `.omo/tools/locale-remulator/Locale_Remulator.1.6.0/`. CLI: `LRProc.exe <GUID> <exe>`.
  LRConfig.xml에 "Run in Korean (NoAdmin)" guid `0f9a7b21-1c4d-4e8a-9f33-7a5e6b1c2d3e` (CP949/ko-KR) 추가함.
  하니스 `tools/logh7_lr_launch.py` (--patched-exe로 굴림EXE 오버레이). **주의: LR v1.6.0가 HookSetWindowTextA 제거** → Win32 다이얼로그 미적용.
- **ui_explorer** (`tools/logh7_ui_explorer.py`): 실클라+서버 구동, `start --no-patch --env LOGH_*`, `stop`이 EXE SHA복원. 창모드 시 login 좌표 빗나감.
- 백그라운드 워크플로우 결과는 `C:\Users\user\AppData\Local\Temp\claude\…\tasks\<id>.output`.

## Memory 포인터 (recall)
logh7-localization-cp932-wall, logh7-face-group-and-create-gate, logh7-signup-implemented,
logh7-run-procedure-and-status, logh7-g201-combat-implemented(NPC 배선 정정), logh7-prior-games-dggl(전작 DB),
logh7-info-records-wire(0x0323), logh7-face-id-encoding.
