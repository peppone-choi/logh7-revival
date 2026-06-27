# LOGH VII 함수 RE — G7Start 웨이브 0001 합성

**대상 바이너리:** `G7Start` (게임 런처/설치 부트스트랩 EXE — `G7MTClient.exe`가 아님)
**웨이브 범위:** batch-0000 .. batch-0039 (40개 배치)
**합성 일자:** 2026-06-22
**원장:** `.omo/re-audit/functions/G7Start/ledger.json`

---

## 1. 커버리지

| 항목 | 값 |
|---|---|
| 이번 웨이브 함수 수 | **289** (40배치, 중복 addr 0) |
| 누적 documented (원장) | **289** (원장이 비어 있던 첫 웨이브이므로 = 이번 웨이브) |
| 전체 re_target | **988** (`summary.json` 기준; 전체 1723함수 중) |
| 누적 커버리지 | **289 / 988 = 약 29.3%** |
| 전체 계획 배치 | 78 (`summary.json`) — 이번 웨이브는 0–39 소화, 잔여 40–77 |

신뢰도 분포: **P0-decompile 274 / P3-inferred 15** (정정·환각 의심 0건, 아래 §4 참조).

서브시스템 분포(이번 웨이브): crt 155, ui 66, core 37, render 12, file 8, library 8, input 2, network 1.
카테고리 분포: library 214, wrapper 20, dispatcher 16, accessor 14, state-machine 6, builder 6, parser 6, game-logic 5, render 2.

---

## 2. 핵심 발견 — 정직한 결론

### 2.1 ★ 옵코드 디스패처 `FUN_004ba2b0` 는 이 바이너리에 **없다**
작업 지시는 "옵코드 디스패처 FUN_004ba2b0 의 opcode→handler 표"와 "전략/입력/HUD/grid 게이트 함수"를 요구했으나, **그 주소들(0x4ba2b0, 0x4fef90, 0x507f20, 0x501e30 등)은 메인 게임 클라이언트 `G7MTClient.exe` 소속이며 이 웨이브(G7Start)에는 존재하지 않는다.**

- `G7Start` = MFC 기반 소형 **런처/설치 부트스트랩** EXE.
- 이번 289함수의 실체: 정적링크 MFC 런타임(CWnd/CDialog/COleControl/CDC/CWinThread …) + MSVCRT(strtol/memcmp/strncpy/operator new/gmtime/SEH 언와인드 등) + **런처 고유 함수 약 5개**.
- 게임 와이어 프로토콜·옵코드·전략맵·HUD·grid 게이트 함수는 **전무**. 따라서 opcode→handler 표는 작성 불가(정직하게 "해당 없음").
- 유일한 "strateg"/"dispatch" 문자열 매치(`FUN_0040bf76`)는 MFC operator new 의 **allocation-strategy** 분기로, 게임 전략과 무관(확인 완료).

> 향후 웨이브에서 전략/옵코드 디스패처를 다루려면 RE 대상 바이너리를 `G7MTClient` 로 잡아야 한다. (MEMORY 의 C002·전략시퀀스 작업은 전부 `G7MTClient` 기준.)

### 2.2 런처 고유 함수 (game-logic / 프로젝트 특이) — 실제로 의미 있는 5+개

| addr | 추정 역할 | 핵심 근거 |
|---|---|---|
| `FUN_00402db0` (file) | **레지스트리 설치경로 확인 + 클라EXE 존재 검사.** `HKLM\<DAT_004315a8>` 열어 `Install` 문자열값(`s_Install_004315a0`)을 +0x1cc 버퍼로 읽고, 끝에 `\` 없으면 `DAT_0043157c`(`\`) 붙이고, `DAT_00431580` 접미(`exe\G7MTClient.exe` 단편)로 풀패스 빌드 후 `CreateFileA(GENERIC_READ, OPEN_EXISTING)` 로 존재 검사. 성공 시 `param_1+0xc4 = 1`(install-found 플래그). | RegOpenKeyExA samDesired 0x20019, FUN_0040bdde sprintf |
| `FUN_004029e0` (core/builder) | **런처 앱/네트워크-런치 컨텍스트 생성자.** vtable `PTR_FUN_00427860` 설치, this+0xCC 에 CString `"exe\G7MTClient.exe"` 초기화(번들 클라 경로), this+0xC4 플래그 0 클리어. | open_question: 자식프로세스 디스크립터 vs 설정홀더 단정 불가(생성자만으로) |
| `FUN_00403090` (ui/state-machine) | **런처 메인 타이틀 다이얼로그 OnInitDialog.** About 메뉴(string 0x65) 추가, WM_SETICON, `TITLE_BG` 비트맵 로드, `DAT_004315dc` 버튼레이아웃 테이블(stride 0x24=9 int)로 자식버튼 생성·배치, 굵은 라벨 폰트(CreateFontA weight 700). `DAT_004356ac!=0` 시 `FUN_00403ba0` 로 버튼 enable 토글. | 버튼 테이블 0x4315dc..0x43166c, string id 0x66+i |
| `FUN_00403580` (ui/dispatcher) | **'Setup/Install' 명령 핸들러.** `FUN_00403950`(Ordinal_11 OS/winsock 버전코드 <8 게이트) → 권한승격/확인 다이얼로그 `FUN_0041a06f`(==1 진행) → `FUN_00403bf0`(DirectX9 디렉터리 체크) → 다이얼로그 최소화 → `FUN_00403970("SETUP.EXE")` 실행 → `FUN_00402db0` 로 설치 재확인 → 필요 시 재부팅(`FUN_00403b00` ExitWindowsEx)+EndDialog. | s_SETUP_EXE_0043166c, string 0x6e/0x6f/0x70/0x71/0x72 |
| `FUN_004037d0` (ui/game-logic) | **앱 부트스트랩: 외부 설치기 조건부 실행.** 스택 CDialog 생성, `FUN_0041a06f`==1(IDOK='run setup') 이면 `WinExec("SETUP.EXE", SW_SHOW=5)` 후 마무리(`FUN_00403ba0`/`FUN_0041d215`/`FUN_0041a359`). 배치 내 유일 프로젝트 특이 함수. | WinExec |
| `FUN_00403970` (file/wrapper) | **자식 프로세스 동기 실행.** `DAT_00431588` 템플릿+`DAT_004356a8` 인자로 커맨드라인 빌드, 현재디렉터리를 작업디렉터리로 `CreateProcessA` → `WaitForSingleObject(INFINITE)` → CloseHandle. 실패 시 FormatMessageA. | "SETUP.EXE" 등 자식 실행 경로 |
| `FUN_00403bf0` (network/game-logic) | **현재디렉터리\DirectX9 에 대한 Winsock 스타일 디렉터리/호스트 해석.** 인라인 strcat `"\DirectX9"`, 컨텍스트 상태 6 신호 → Winsock `Ordinal_5`(소켓핸들 +0x1c, 플래그 0x10018) → 상태 9. 결과 -1=실패/1=성공(+0xa.. 세팅). | s__DirectX9_00431694, Ordinal_5 |

> 주의: `FUN_00403bf0` 의 subsystem 라벨 "network" 는 Winsock 오디널 사용에서 비롯됐으나, 실제로는 **DirectX9 설치 서브디렉터리 존재/해석** 보조 루틴이다(게임 net 프로토콜 아님).

### 2.3 입력(input) 서브시스템 함수 — 게임 인-월드 입력 아님
- `FUN_0040a768` (input/dispatcher): **MFC 액셀러레이터/커맨드 변환.** 액셀러레이터 테이블(stride 9 DWORD) 스캔→커맨드클래스(1..7) 매핑→스택 `AFX_EVENT`(type 3=command) 구성→`this-0xD4` 커맨드타깃으로 `FUN_00406d9e` 디스패치. = MFC 표준 액셀러레이터 처리이지 게임 키입력 경로가 아님.
- `0x00421abf thunk_FUN_00421ac4` (input/library): thunk.

### 2.4 UI 메시지 디스패처류 (참고용)
게임 옵코드 디스패처는 없지만, 윈도우 메시지 디스패처/서브클래스 프록은 다수 존재(전부 정적 MFC 런타임):
- `FUN_0041b761` = **MFC `CWnd::OnWndMsg`** (512엔트리 해시 메시지맵 캐시 `DAT_004358c8`, WM_COMMAND 0x111 / WM_NOTIFY 0x4e / WM_ACTIVATE 6 / WM_ENTERIDLE 0x20 특수처리, 0x31-case switch 로 멤버함수 호출).
- `FUN_00416b10` = MFC 3D-controls 서브클래스 WndProc(WM_CTLCOLOR 0x132–0x138 리맵, 0x1943/0x1944 → 0x3ee).
- `FUN_00418460` = MFC 툴팁/서브클래스 WndProc(comctl 버전 인지).
- `FUN_00416e80` = UI 스키닝 CBT 훅 프로시저(HCBT_CREATEWND nCode==3).
- `FUN_00417210` = 클래스명별 표준컨트롤 메시지훅 디스패처(`DAT_0042addc` stride 0x10 테이블).
- `FUN_0040ec28`, `FUN_00405462`, `FUN_0040b0dd`, `FUN_004141e7` 등 = 그 외 MFC 디스패처/명령 라우팅.

### 2.5 렌더 함수 (런처 UI 페인팅)
- `FUN_00417770` = 오너드로우 버튼-패밀리 페인트(푸시/체크/라디오/그룹박스; 글리프 아틀라스 `DAT_004390d0` BitBlt, DrawTextA, 포커스 사각형).
- `FUN_00417430` = 3D 프레임 버튼 오너드로우(요철 프레임, PatBlt, 비활성 회색 `DAT_004390bc`).
- `FUN_00416360` = 플랫룩 비클라이언트 보더 페인트 서브클래스 프록 (**유일하게 opcodes=[`0x11ef`]** — `SendMessageA(0x11ef)` 커스텀 상태 질의, WM 옵코드가 아니라 사설 윈도우 메시지).
- `FUN_00416980` = 버튼 스킨 시스템컬러 캐시 재빌드(`GetSysColor` 8색 `DAT_0042ae80` 인덱스 테이블).
- `FUN_00402010` = 비트맵 → DDB+팔레트 로드(CreateDIBitmap, "BITMAP is NULL." 로그).

### 2.6 COM/OLE / ADO 데이터 (정적 MFC, 게임 무관)
`FUN_004082cf`(OLE-DB 로우셋 바인딩), `FUN_00408f48`(ADO 레코드셋 컬럼→VARIANT 마샬), `FUN_004065b1`(IPersistStorage/Stream OLE 영속), `FUN_00406a2a`(DirectDraw7/D3D8 GUID 열거 헬퍼 — render/game-logic P3) 등. 모두 MFC/OLE 런타임이며 LOGH 콘텐츠와 무관(open_question 에 GUID 미해명 명기).

### 2.7 부트스트랩 초기화 (MFC 3D-controls 런타임)
`FUN_004166b0`(서브클래스 서브시스템 init, 아톰 등록, `DAT_00439080` enable 플래그), `FUN_00418ae0`(DLL_PROCESS_ATTACH, GetVersion → `DAT_004390a0` OS버전 워드), `FUN_00416610`(WIN.INI `kanjimenu`/`hangeulmenu` → 메뉴 폰트높이 `DAT_00439b84` 0x1e/0x1f). — **한글/일본어 메뉴 메트릭은 여기서 결정**(런처 한정).

---

## 3. opcode→handler 표
**해당 없음 (N/A).** 이 바이너리에 게임 와이어 옵코드 디스패처가 없다(§2.1). 이번 웨이브에서 opcodes 필드가 채워진 함수는 `FUN_00416360` 1건뿐이며, 값 `0x11ef` 는 게임 옵코드가 아니라 MFC 사설 윈도우 메시지(`SendMessageA(0x11ef)`)다.

---

## 4. verify 적발 — 정정/환각/파라미터·오프셋 오류

이번 웨이브 배치 산출물에는 **별도 verify 패스 결과 파일이 부재**하며, 산출 JSON 자체에 정정/환각 표기 필드도 없다. 합성 검토(addr 중복·신뢰도·과잉단정) 결과:

- **환각/과잉단정 적발: 0건.** P3-inferred 15건은 모두 `open_questions` 에 한계를 정직하게 명시(예: `FUN_004082cf`/`FUN_004065b1` 의 OLE GUID 미해명, `FUN_004029e0` 의 객체 정체성 미확정, `FUN_0041a7c9` 의 0x110→WM_INITDIALOG 추론, `FUN_00408879` 의 0x30바이트 디스크립터 의미). 확정으로 단정하지 않음 → 정직 원칙 부합.
- **파라미터 오류(paramError): 적발 0건.** thiscall/fastcall 함수에서 ecx=this 를 `extraout_ECX` 로 읽는 디컴파일 아티팩트는 함수 본문에 정확히 주석 처리됨(예: 두 `~CWnd` 0x0041affd·0x00421ce4 COMDAT 중복 폴드 명시).
- **오프셋 오류(offsetError): 적발 0건.** 단, 검증은 디컴파일 자체 일관성 기준이며 라이브/바이트 대조는 수행하지 않음(이 바이너리는 런처라 라이브 검증 대상 아님).
- **주의(정정은 아님):** 작업 지시의 "FUN_004ba2b0 opcode 디스패처/전략·HUD·grid 게이트"는 **바이너리 오배정**(G7MTClient 소속)이다 — 이 웨이브 산출물의 오류가 아니라 작업 지시 전제의 불일치. 향후 해당 작업은 G7MTClient 인덱스로 라우팅 필요.

---

## 5. fail / partial 배치 (정직 명시)

- **fail 배치: 없음.** 40개 배치(0–39) 전부 유효 JSON 파싱, 합 289함수.
- **partial 배치(저밀도):** 일부 배치는 함수 수가 적다(정상 — 큰 함수 1~2개로 14000자 예산 소진). 명시:
  - batch-0012 = 1함수(`FUN_0040f78f`), batch-0016 = 1(`FUN_004065b1`), batch-0018 = 1(`FUN_00417770`), batch-0019 = 1(`FUN_0041b761`), batch-0024 = 1(`FUN_004098b4`), batch-0028 = 1(`FUN_00408f48`).
  - batch-0014/0015/0017/0021/0023/0025/0027/0031/0032/0034 = 2~3함수.
  - 이는 실패가 아니라 함수 크기 편차에 따른 정상 분할. 누락 addr 없음(289 unique).
- **표적 밀도 주의:** 이번 289함수 중 게임 콘텐츠 직결은 §2.2 의 5~7개뿐. 나머지 ~282개는 MFC/MSVCRT 런타임(런처 바이너리의 본질). 이는 런처 EXE 의 정상적 구성으로, "비게임 런타임 문서화"가 과다해 보이나 re_target 988 정의에 포함된 함수들이다.

---

## 6. 다음 웨이브

- **다음 웨이브 시작 배치 = 40** (batch-0040).
- 잔여: batch 40–77 (38배치), re_target 988 중 약 699함수 미문서.
- **권고:** G7Start 는 런처라 게임 로직 산출이 희박하다. 전략/옵코드/HUD/grid·C002·와이어 작업은 **별도 G7MTClient 인덱스**(`.omo/ghidra/export/G7MTClient`)를 RE 대상으로 잡아야 실제 게임 디스패처(FUN_004ba2b0 등)에 도달한다. G7Start 잔여 배치는 런처 완결성 목적상 계속 진행하되 게임 발견 기대치는 낮게 둘 것.
