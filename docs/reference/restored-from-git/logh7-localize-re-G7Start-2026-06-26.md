# LOGH VII 런처 RE + 한글화 표면 — G7Start (+ Gin7UpdateClient 서버설정) — 2026-06-26

> ★ **적대검증 결과 = FAIL → 아래 정정 적용(2026-06-26).** 본문 일부 수치/주장을 다음으로 정정해 읽을 것:
> 1. **RT_STRING 앱 고유 = 14개(101–114)가 아니라 16개(101–116).** 누락된 **115/116 = DirectX9 부적합/설치실패 일본어 메시지**(한글화 대상). 번역 초안 추가 필요.
> 2. **`0x46c0xx cp932 .data 라벨 ~7개` 주장 철회(미입증).** 실제 0x46c000~는 비트맵/바이너리 데이터. 앱 고유 cp932는 레지스트리 서브키(0x4315a8)·PDF 파일명 `銀英伝７マニュアル.pdf`(0x427900)·`%s%d です`(0x431678)뿐. 패치 우선순위/위험 항목 재작성.
> 3. **copyright VA 0x46b278 오인(폐기).** copyright 문자열은 DLG 100 템플릿 내 UTF-16 리소스 소속(원문 오타 `reserverd` 포함).
> 4. 폰트 함정 확정: 다이얼로그 100/102/129/130/131 전부 `ＭＳ Ｐゴシック` per-template → 문자열만 한글로 바꾸면 모지바케, **DLGTEMPLATE 폰트 face 교체 + 라이브 렌더 검증 필수**.
> 5. §3 서버설정은 G7Start 아닌 **Gin7UpdateClient 소속**(정정됨). 서버 의미부여(4787=HTTP/47900=게임)는 INI 라벨 기반 P1.

**대상 바이너리:** `G7Start.exe` (게임 스타터/설치 부트스트랩; 424KB, MFC42)
- dist: `client/dist/logh7-client/G7Start.exe`
- 동일물: `client/vendor/logh7-installed/G7Start.exe`
- Ghidra 인덱스: `.omo/ghidra/export/G7Start/{functions.jsonl,strings.tsv,symbols.tsv}`
- 기존 웨이브: `docs/logh7-function-re-g7start-wave-0001.md` (289함수 P0/P3)

**조사 성격:** 읽기 전용 정적 RE + 리소스 덤프. 라이브/바이트 패치 미수행.
**ImageBase:** 0x00400000. 섹션: .text 0x401000 / .rdata 0x427000 / .data 0x431000 / .rsrc 0x43a000.

> ⚠️ **바이너리 역할 정정.** 작업지시 §3은 "Gin7UpdateClient 한정 업데이트 서버 설정"을 요구하나, 그 메커니즘은 **별도 바이너리 `Gin7UpdateClient.exe`(1.06MB)** 소속이다. G7Start는 *스타터/설치 런처*로 레지스트리·DirectX·자식 EXE 기동만 담당하고 네트워크/SERVER.INI를 직접 읽지 않는다. 본 문서는 G7Start 흐름·한글화를 주(主)로, Gin7UpdateClient 서버설정을 §3에서 별도 확정한다.

---

## 1. 유저 대면 흐름 (시작 → 종료)

G7Start는 모달 메인 다이얼로그(`DIALOG id=102`, OnInitDialog=`FUN_00403090 @0x403090`)를 띄우는 MFC 다이얼로그 앱이다. 4개 오너드로우 비트맵 버튼(`BITBTN`)이 4개 작업으로 라우팅된다(라벨은 RT_STRING 102–105).

### 1.1 기동 / OnInitDialog — `FUN_00403090 @0x00403090`
- `GetSystemMenu` → 시스템 메뉴에 구분선 + **"…のﾊﾞｰｼﾞｮﾝ情報(&A)…"** 항목(메뉴 ID 0x10, 문자열 STR 101) 추가 → 버전정보 다이얼로그(`DIALOG id=100`) 연결.
- `FUN_00401fd0(..., s_TITLE_BG_00431660)` → 리소스명 **`"TITLE_BG"`** (RT_BITMAP) 로드 → 타이틀 배경 페인트.
- 폼 폰트 = **`ＭＳ Ｐゴシック`**(MS PGothic, 다이얼로그 템플릿 내 하드코딩) + 일부 `Tahoma`(STR 107).

### 1.2 버튼/작업 라우팅
| 작업 | 핸들러 | 동작(정적 증거) |
|---|---|---|
| **インストール(설치)** | `FUN_004035d0 @0x4035d0` | DirectX 버전 < 8 → `FUN_00403bf0`(DirectX9 설치). 이어 `FUN_00403970(SETUP.EXE)` **CreateProcessA**(작업폴더=cwd, cmd `&DAT_00431588`). 성공 후 설치확인 메시지(STR 111/112) + 필요 시 재부팅. |
| **アンインストール(제거)** | `FUN_004037d0 @0x4037d0` | 확인 다이얼로그(`FUN_0041a06f`) → **`WinExec("SETUP.EXE", SW_SHOW)`** (`s_SETUP_EXE_0043166c`). |
| **PDFマニュアル** | `FUN_00403860 @0x403860` | **ShellExecuteA("open", …)** (`&DAT_00431684="open"`). 실패 시 STR 108/109("オンラインマニュアルの表示に失敗…/Acrobat Reader 확인"). |
| **終了(종료)** | `FUN_00403b00 @0x403b00`(재부팅 경로) / 다이얼로그 EndDialog | `ExitWindowsEx(EWX_REBOOT,0)` (설치 후 재부팅 시), 실패 시 STR 113/114. |

### 1.3 게임 클라 런치 경로 — `FUN_004029e0 @0x4029e0` (런처 컨텍스트 생성자)
- vtable `PTR_FUN_00427860` 설치, `this+0xCC` 에 CString **`"exe\G7MTClient.exe"`**(`s_exe_G7MTClient_exe_0043158c`) 초기화 = 번들 게임 클라 상대경로.
- `this+0xC4` install-found 플래그 0 클리어.

### 1.4 설치경로 확인(레지스트리) — `FUN_00402db0 @0x402db0`
- `RegOpenKeyExA(HKLM, &DAT_004315a8, 0, KEY_READ=0x20019)`.
- **서브키 = `SOFTWARE\BOTHTEC\銀河英雄伝説VII\1.0`** (0x004315a8, cp932 raw 검증). **값 = `Install`**(REG_SZ, s_Install_004315a0).
- 읽은 경로 + (끝 `\` 없으면 `\` 0x0043157c) + `exe\G7MTClient.exe` → `%s%s`(0x431580) → **`CreateFileA(GENERIC_READ, OPEN_EXISTING)`** 존재검사 → 성공 시 `param_1+0xc4 = 1`.
- 키/값 부재 → install-found=0(=미설치 상태로 분기).

### 1.5 DirectX9 체크 — `FUN_00403bf0 @0x403bf0`
- cwd + `"\DirectX9"`(0x00431694) 디렉터리 경로 빌드 → DSETUP `Ordinal_5`(=DirectXSetupGetVersion/Setup) 호출(`0x10018` 플래그). 반환 0/1로 설치/재부팅요구 분기.
- 즉 DirectX9 런타임을 동봉 `DirectX9\` 폴더에서 설치 가능.

**요약 흐름:** 기동(OnInitDialog: TITLE_BG + 시스템메뉴 버전항목) → 레지스트리 Install 확인 → 사용자 버튼 선택 → 설치(DirectX9+SETUP.EXE) / 제거(SETUP.EXE) / PDF(ShellExecute) / 종료. **게임 본체(G7MTClient/Gin7UpdateClient) 기동은 이 EXE의 SETUP 산물이며 G7Start 자체는 47900/4787 네트워크를 다루지 않는다.**

---

## 2. .rsrc 리소스 전수 + 하드코딩 일본어 (한글화 표면)

리소스 언어 = **전부 ja-JP(0x411)**. 다이얼로그/메뉴 텍스트는 **UTF-16LE**, RT_STRING은 리소스(UTF-16LE) 저장. 하드코딩 .data 문자열은 **cp932(Shift-JIS)**.

### 2.1 리소스 타입 인벤토리
| TYPE | 이름 | 엔트리 |
|---|---|---|
| 1 | CURSOR | 2 |
| 2 | BITMAP | 9 (TITLE_BG 등) |
| 3 | ICON | 1 |
| **5** | **DIALOG** | **6** |
| **6** | **STRING** | **13 블록** |
| 12/14 | GROUP_CURSOR/ICON | 1/1 |
| 16 | VERSION | 1 |

> RT_MENU(타입 4) **없음**. 메뉴는 시스템 메뉴에 런타임 AppendMenuA(문자열 STR 101)로 1항목만 추가 → **한글화 대상 메뉴 항목 = 0개(리소스), 1개(문자열 테이블 경유)**.

### 2.2 RT_DIALOG (6개) — 한글화 대상
| id | 용도 | 내장 텍스트(번역대상) | 비고 |
|---|---|---|---|
| **100** | 버전정보 다이얼로그 | 캡션 `銀河英雄伝説VIIスタータのﾊﾞｰｼﾞｮﾝ情報`, `…Version 1.0`, `Copyright (C) 2004 BOTHTEC all rights reserverd.`(sic), `OK` | 폰트 `ＭＳ Ｐゴシック` |
| **102** | 메인 런처 폼 | 캡션 `銀河英雄伝説VIIスターター`. 컨트롤=4× `BITBTN`(오너드로우, **버튼 라벨은 STR 102–105**) | 폰트 `ＭＳ Ｐゴシック` |
| **129** | DirectX 설치 확인 | 캡션 `DirectXインストール確認`, `インストール続行`, `ｷｬﾝｾﾙ`, `お使いのパソコンが「DirectX8」以降に対応…`, `DirectX9.0b をインストール`, `…せずに続行`, `現在ｲﾝｽﾄｰﾙされているDirectXは、` | 폰트 MS PGothic |
| **130** | 재시작 확인 | 캡션 `再起動の確認`, `再起動`, `Windowsへ戻る`, `【再起動】ボタンをクリックすると、Windowsを再起動します。` | |
| **131** | 제거 확인 | 캡션 `アンインストール確認`, `OK`, `ｷｬﾝｾﾙ`, `よろしいですか？` | |

(추가로 ID 30721 = MFC `新規`/`新規(&N)`/OK/Cancel/Help 표준 다이얼로그 = P3 비대상.)

### 2.3 RT_STRING — 앱 고유(101–114) = **한글화 대상**, 나머지(>61000) = MFC42 표준
| ID | 일본어 | 한국어(P1 초안, 검수필요) |
|---|---|---|
| 101 | 銀河英雄伝説VIIスタータ のﾊﾞｰｼﾞｮﾝ情報(&A)... | 은하영웅전설 VII 스타터 버전 정보(&A)... |
| 102 | インストール | 설치 |
| 103 | アンインストール | 제거 |
| 104 | PDFマニュアル | PDF 설명서 |
| 105 | 終了 | 종료 |
| 106 | Version 1.00 | (유지) |
| 107 | Tahoma | (폰트명, 유지/교체검토) |
| 108 | オンラインマニュアルの表示に失敗しました。 | 온라인 설명서를 열지 못했습니다. |
| 109 | …『Adobe Acrobat Reader』が正しくインストール… | …Adobe Acrobat Reader가 올바르게 설치되어 있는지 확인하세요. |
| 110 | 現在インストールされているDirectXは、 | 현재 설치된 DirectX는 |
| 111 | 『銀河英雄伝説VII』のインストールが正常に終了しました。 | 은하영웅전설 VII 설치가 정상적으로 완료되었습니다. |
| 112 | 銀河英雄伝説VIIのインストール確認 | 은하영웅전설 VII 설치 확인 |
| 113 | Windowsの再起動 | Windows 다시 시작 |
| 114 | Windowsの再起動に失敗しました。\n… | Windows 다시 시작에 실패했습니다.\n… |

(STR ID ≥ 61700: MFC 표준 메시지/CFileException — 한글화 불필요. 윈도우 자체 한국어 MFC 메시지로 충분; 건드리면 회귀 위험.)

### 2.4 하드코딩 cp932(.data) — 한글화 대상/비대상
| VA | 문자열 | 등급 |
|---|---|---|
| 0x46c0b2 | `銀河英雄伝説VIIスタータ のﾊﾞｰｼﾞｮﾝ情報(&A)...` | (STR 101 중복) P1 |
| 0x46c0f2 | `インストール` | P1 |
| 0x46c100 | `アンインストール` | P1 |
| 0x46c112 | `PDFマニュアル` | P1 |
| 0x46c124 | `終了` | P1 |
| 0x46c12a | `Version 1.00` | P3(유지) |
| 0x46c152 | `オンラインマニュアルの表示に失敗しました。` | P1 |
| 0x46cddc~0x46d0xx | CFile I/O 오류 메시지(반각카나 다수) | P3(런처 거의 미발생, MFC계열) |
| 0x46b188 | 버전리소스 `ボーステック株式会社`(CompanyName) | P2(메타데이터) |
| 0x46b1c8 / 0x46b380 | 버전리소스 `銀河英雄伝説VIIゲームスタータ`(File/ProductName) | P2 |
| 0x46b278 | `Copyright (C) 2004 BOTHTEC All rights reserved.` | P3(유지) |

**카운트 합계(한글화 대상):**
- RT_DIALOG: **6개** 중 앱 고유 번역대상 **5개**(100/102/129/130/131), MFC 표준 1개(30721=P3). 5개 합산 번역 텍스트 ~25개 문자열.
- RT_MENU: **0개**(리소스 메뉴 없음; 동적 1항목은 STR 101로 처리)
- RT_STRING(앱 고유): **14개**(ID 101–114). MFC 표준(≥61700)은 비대상.
- 하드코딩 cp932(앱 고유 UI): **~7개**(0x46c0xx 버튼/메뉴 라벨 + 오류 1) + 버전리소스 메타 ~5개(P2).

---

## 3. ★Gin7UpdateClient 업데이트/서버 설정 메커니즘 (정적 확정)

> 별도 바이너리 `client/dist/logh7-client/Gin7UpdateClient.exe`. Ghidra: `.omo/ghidra/export/Gin7UpdateClient`. G7Start와 무관하게 게임 본 클라/패치 다운로드 + 게임 기동을 담당(런처 실체).

### 3.1 설정 소스 = **`SERVER.INI`** (INI 파일, 레지스트리/매니페스트 아님)
- 파일경로 빌드 = `"%sSERVER.INI"`(0x0044a5e8, base=실행경로) → **`GetPrivateProfileStringA/IntA`**(0x447d50/0x447d38)로 파싱.
- 섹션 = **`[UPDATE]`**. 파서 헬퍼: `GetSectionKey @0x423618`, `FUN_00423584`(RegCloseKey도 공유하는 INI/레지 유틸 군).
- INI 키(0x0044a5xx 인접 상수):
  - **`SERVER_ADDRESS`**(0x44a5ac) — 업데이트/게임 서버 호스트
  - **`SERVER_PORT`**(0x44a5a0) — 서버 포트
  - **`PROXY_ADDRESS`**(0x44a590) / **`PROXY_PORT`**(0x44a584) — HTTP 프록시(옵션)
  - **`WORK_DIR`**(0x44a550), `BASE_DIR`, `TEMP_DIR`, `STARTUP_APPNAME`
- 다운로드 전송 = **HTTP**(`HTTP/%d.%d` 0x44f478; WinINet 계열). 로그=`UPDATE.LOG`(0x44a668), 에러=`UpdateClient.err`/`update.ini LAST_ERROR`. 신규 EXE=`Gin7UpdateClient.new`(자가 교체).

### 3.2 ★실제 출하 설정 (dist 동봉 파일)
`client/dist/logh7-client/SERVER.INI`:
```
[UPDATE]
VERSION=131
BASE_DIR=.\
SERVER_ADDRESS=127.0.0.1
SERVER_PORT=4787
PORT=47900
```
- **`SERVER_PORT=4787`** = 업데이트(HTTP) 서버 포트. **`PORT=47900`** = 게임 로그인 포트(G7MTClient가 사용). `SERVER_ADDRESS`로 둘 다의 호스트 지정.
- `update.ini`(상태파일): `VERSION=131`, `LAST_ERROR=0x00000003`.

### 3.3 운영자 서버 지정 방법 + 미가동 동작 (한 줄 핵심)
> **운영자는 `SERVER.INI [UPDATE]`의 `SERVER_ADDRESS`/`SERVER_PORT`(4787, HTTP 업데이트)와 `PORT`(47900, 게임 로그인)로 서버를 지정한다(레지스트리/매니페스트 아님). 서버 미가동 시 HTTP 연결 실패 → `update.ini LAST_ERROR` 기록 + `UpdateClient.err`, 패치 단계에서 정지(게임 본체 기동 차단 가능).**

---

## 4. 한글화 계획 (인코딩 · 패치 메커니즘 · 등급)

### 4.1 인코딩 매핑
| 표면 | 저장 인코딩 | 패치 메커니즘 |
|---|---|---|
| RT_DIALOG 캡션/라벨 | UTF-16LE(.rsrc) | **리소스 교체**(ResHacker/`tools/` rsrc patcher, .rc 재빌드 또는 in-place 동일길이) |
| RT_STRING 101–114 | UTF-16LE(.rsrc 문자열블록) | **리소스 교체**(블록 7·8 재작성). UTF-16이라 길이제약 완화 |
| 하드코딩 cp932(.data 0x46c0xx) | cp949(한글)로 in-place | **바이트 in-place**(동일/축소 길이, NUL 종결 유지). cp932 라벨이 STR과 중복이면 리소스만 바꿔도 표시상 충분한지 라이브 확인 필요 |
| 버전리소스(VERSION) | UTF-16LE | 리소스 교체(P2, 선택) |
| Gin7UpdateClient UI(별도) | 본 문서 범위 외(별도 RE) | — |

### 4.2 폰트 함정 (logh7-localize 원칙)
- G7Start 다이얼로그는 폰트 `ＭＳ Ｐゴシック`/`Tahoma`를 **다이얼로그 템플릿에 직접 명시**한다(전역 GDI face 단일 슬롯이 아니라 per-dialog DLGTEMPLATE 폰트). 한글 표시하려면 **DLGTEMPLATEEX 폰트명을 한글 폰트(예: `맑은 고딕`/`Pretendard`)로 교체**하거나, charset이 한글 문자를 렌더하도록 보장해야 함. cp932 라벨을 cp949로만 바꾸고 폰트가 ja면 모지바케 위험.
- charset: 다이얼로그 폰트는 DEFAULT_CHARSET일 가능성 — ANSI 코드페이지(ACP) 의존. 이 호스트 ACP 함정(과거 UTF-8 베타=65001 모지바케 교훈) 동일 적용.

### 4.3 패치 우선순위 / 데이터 등급
- **P0(라이브 검증 후 승격):** 없음(현재 추측번역은 P0 금지).
- **P1(번역 초안, 검수+라이브 후 P0):** RT_STRING 101–105/108–114, RT_DIALOG 100/102/129 캡션·OK, 동일 의미 cp932 0x46c0xx 라벨.
- **P2:** 버전리소스 메타(CompanyName/ProductName), Gin7UpdateClient UI(별도 RE 필요).
- **P3(유지·비번역):** MFC 표준 STR(≥61700), CFile 오류, Version/Copyright 문자열, 폰트명 상수.

### 4.4 최우선 패치 후보
1. **RT_STRING 102–105**(설치/제거/PDF 설명서/종료) — 메인 런처 4버튼 라벨. 유저가 처음 보는 화면, UTF-16 리소스 교체로 안전·고효과.
2. **RT_DIALOG 102 캡션 + DIALOG 100 버전정보** — 창 제목/정보. 폰트 교체와 함께 적용해야 한글 렌더 성립.

---

## 5. 위험 / 불확실

1. **폰트 렌더 미검증(P1).** 다이얼로그 폰트가 `ＭＳ Ｐゴシック`로 박혀 있어, 문자열만 cp949/UTF-16 한글로 바꿔도 ja 폰트+ACP 조합에서 모지바케/빈칸 가능. **라이브(logh7-live)로 한 다이얼로그 먼저 검증 후 일괄 적용 필요** — 단일 호스트 ACP 함정 재발 주의.
2. **cp932 하드코딩 vs RT_STRING 중복(불확실).** 0x46c0xx 버튼 라벨이 STR 102–105와 중복 존재 — 런타임에 어느 쪽을 실제 표시하는지(LoadString vs 임베드) 정적만으로 단정 불가. 리소스만 바꿔 안 보이면 .data in-place 병행 필요. 라이브로 확인.
3. **§3 바이너리 귀속.** 서버설정은 G7Start가 아니라 Gin7UpdateClient 소속(작업지시 표현 정정). SERVER.INI 키/포트(4787 HTTP·47900 game)는 동봉 파일+문자열로 확정했으나, Gin7UpdateClient *함수 레벨* 파서(섹션 분기·실패 정확 동작)는 본 패스에서 deep-RE 미완(별도 웨이브 권장).
4. **RT_DIALOG 129 등 보조 다이얼로그** 텍스트 의미/맥락 미세분류(설치 진행/오류 계열로 추정, P1). 번역 전 각 다이얼로그 컨트롤 ID 매핑 필요.
