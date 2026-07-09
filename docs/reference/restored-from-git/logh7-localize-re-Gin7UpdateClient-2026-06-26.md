# LOGH VII — Gin7UpdateClient.exe RE + 한글화 표면 조사 (2026-06-26)

> ★ **적대검증 결과 = PASS(바이트정합).** 정정 1건: **RT_STRING 앱 고유 문자열은 block1만 ~12개가 아니라 block1+block2(ID 1~31, ~30개)에 걸침** — block2(메인터넌스/디스크용량/다운로드실패 메시지 등)도 유저 대면 일본어 한글화 대상.
> ★ **업데이트 서버 설정(권위)**: `SERVER.INI [UPDATE] SERVER_ADDRESS/SERVER_PORT`(GetPrivateProfile, FUN_00404dc0). **코드 디폴트 = `202.8.80.179:47902`**(작업지시의 "4787"은 오류). `FUN_00405310` = TYPE=1 섹션으로 다중 업데이트 서버. 레지스트리는 IE 프록시 상속용만. 서버 미가동 시 connect 실패→"アップデート失敗" 다이얼로그→graceful 종료(크래시 없음 단정은 분기 추적/라이브 1회로 보강 권장). 운영자는 동봉 SERVER.INI에서 update 서버를 지정.

대상: `client/dist/logh7-client/Gin7UpdateClient.exe` (1.0MB, MFC + MSVC 2003/VS7.1, 동일물 `client/vendor/logh7-installed/`, `.omo/work/logh7-installed/exe/`)
역할: **자동 업데이터** — 게임 실행 전 패치 서버에 접속해 버전 비교 → 변경 파일 다운로드 → 적용 → 본 클라(`.\exe\G7MTClient.exe`) 기동.
RE 인덱스: `.omo/ghidra/export/Gin7UpdateClient` (functions.jsonl / strings.tsv / symbols.tsv).
기존 웨이브: `docs/logh7-function-re-gin7updateclient-wave-0001.md` (310함수 문서화).
조회 도구: `python RE/tools/logh7_redex.py --export .omo/ghidra/export/Gin7UpdateClient <cmd>`.

---

## 1. 유저 대면 흐름 (시작 → 종료) 함수 경로

| 단계 | 함수 | 동작 |
|---|---|---|
| 진입 | `entry` 0x00409a2e → MFC WinMain | VC++6/2003 CRT __WinMainCRTStartup. |
| 앱 init / 설정 로드 | **`FUN_00404a80`** 0x00404a80 | ① 단일 인스턴스 뮤텍스(`CreateMutexA`; `GetLastError==0xb7` ERROR_ALREADY_EXISTS면 즉시 return 0 — **이미 실행 중이면 조용히 종료**). ② `GetModuleFileNameA` → 마지막 `\` 까지 잘라 **exe 디렉터리 경로**(`%s` 프리픽스) 산출, `param+0xd4`에 저장. ③ 아래 두 설정 로더 호출. |
| 설정 로드 A | **`FUN_00404dc0`** 0x00404dc0 | `[UPDATE]` 섹션(아래 §3) 읽기. |
| 설정 로드 B | **`FUN_00405310`** 0x00405310 | `SERVER.INI`의 **모든 섹션 열거**(`GetPrivateProfileSectionNamesA`) → `TYPE=1`인 섹션에서 `ADDR`/`PORT` 읽어 서버 후보 리스트 빌드(`FUN_00405550`). |
| 다이얼로그 표시 | RT_DIALOG 130 (메인 진행창), `Progress1`(msctls_progress32), `BTN_CANCEL` | "サーバー接続中" → "ファイルダウンロード" 진행률. |
| TCP 접속 | `FUN_0042f110` mtTCPModule_win32::connect / `FUN_0042a660` (HTTP redirect/connect step) | Winsock `socket/connect/recv/send` (thunk 0x00432a00대). HTTP("Multiterm Http Library ver.1.0") GET. |
| 다운로드 상태머신 | **`FUN_0041f850`** (one-step poll), `FUN_0042b8c0` (body 수신), `FUN_00420260` (`msg_get_update_info_ok` 처리), zlib inflate `FUN_00419340`/`FUN_00419c90` | 파일 받아 임시(`TEMP_DIR`)에 쓰고 `BASE_DIR`에 적용. 진행 로그 `FUN_00405030` → 리스트/에딧 컨트롤. |
| 결과 처리 | **`FUN_00406ed0`** 0x00406ed0 | result code → RT_STRING ID 매핑(완료/실패/중단), `WritePrivateProfileStringA([UPDATE], LAST_ERROR, 0x%08x, SERVER.INI)` 기록 후 결과 다이얼로그 텍스트 표시. |
| 본 클라 기동·종료 | `STARTUP_APPNAME`(기본 `.\exe\G7MTClient.exe`) 실행, `FUN_00404960` 소멸자(로그파일 flush, 뮤텍스 해제) | |

**그레이스풀 동작**: 접속 실패는 `FUN_0042f110`/`FUN_0042a660`에서 Winsock 에러 로그(`[mtTCPModule_win32] connect_wait: connect error`) 후 결과핸들러 `FUN_00406ed0`로 "アップデート失敗"(RT_STRING 11/12) 다이얼로그 → 정상 종료. **크래시 아님**. 단 본 게임 자동 기동까지 가려면 업데이터가 성공 경로를 타야 하므로, **서버 미가동 시 업데이트 단계는 실패로 끝남**(게임 직접 기동은 별도. updater를 우회해 `G7MTClient.exe`를 직접 띄우면 됨 — 우리 운영에선 이미 그렇게 하고 있음).

---

## 2. .rsrc 리소스 전수 (한글화 대상 표면)

리소스 언어 = **lang=0x0411 (일본어)**. 인코딩: RT_DIALOG/RT_STRING/RT_VERSION 본문은 **UTF-16LE**(Win32 리소스 표준). RT_MENU **없음**(type 4 부재; 리소스 타입 present = 1,2,3,5,6,12,14,16).

### 2a. RT_STRING — 앱 전용 (블록1, ID 1~16) ★ 한글화 1순위
| ID | 일본어 | 의미 | 등급 |
|---|---|---|---|
| 1 | 銀河英雄伝説VIIアップデータ | 창 타이틀 | P0 |
| 2 | GIN7 UPDATE CLIENT | (영문, 유지) | P2 |
| 3 | %supdate.ini | 파일명 포맷(번역 금지) | P2 |
| 4 | 閉じる | 닫기 | P0 |
| 5 | ｷｬﾝｾﾙ | 취소 | P0 |
| 6 | ＭＳ Ｐゴシック | 폰트 face(§4 폰트함정) | P1 |
| 7 | サーバー接続中 | 서버 접속 중 | P0 |
| 8 | ファイルダウンロード | 파일 다운로드 | P0 |
| 9 | ダウンロード完了 | 다운로드 완료 | P0 |
| 10 | \r\n\r\nダウンロードが終了しました | 다운로드가 끝났습니다 | P0 |
| 11 | アップデート失敗 | 업데이트 실패 | P0 |
| 12 | \r\n\r\nアップデートに失敗しました | 업데이트에 실패했습니다 | P0 |
| 13 | 作業が中断されました | 작업이 중단되었습니다 | P0 |
| 14 | \r\n\r\n作業が中断されました | (동일) | P0 |
| 15 | バージョン確認終了 | 버전 확인 종료 | P0 |
| 16 | (블록 잔여 슬롯) | — | — |

→ **앱 전용 번역 대상 문자열 ≈ 12개**(ID 1,4,5,7~15). ID 2/3/6은 유지 또는 폰트.

### 2b. RT_STRING — MFC 스톡(블록 3841+, ID ~61680~61880, 반각카나 Shift-JIS 원문) P3
"%1 へのｱｸｾｽは拒否されました。" 등 MFC `AFX_IDP_*` 표준 파일/예외 메시지 다수(수십 개). 유저가 거의 안 보는 경로. **번역 선택**: 한글화해도 무방하나 P3(저우선). 대략 **블록 3841~3868 = 약 100여 항목**.

### 2c. RT_DIALOG (2개)
- **ID 130** (메인 진행 다이얼로그): 타이틀 `銀河英雄伝説VIIアップデータ`, 폰트 `ＭＳ Ｐゴシック`, 컨트롤 `Progress1`/`BTN_CANCEL`(컨트롤 ID 문자열은 번역 금지). 번역 대상 = 타이틀 1 + (캡션 텍스트). **P0**.
- **ID 30721** ("新規" 다이얼로그, MFC 표준 New): `新規`, `新規(&N)`, `OK`, `ｷｬﾝｾﾙ`, `ﾍﾙﾌﾟ(&H)`. **P1**(거의 미사용). 폰트 `MS Shell Dlg`(시스템).

### 2d. RT_VERSION (FileInfo) ★ P1
- ProductName `銀河英雄伝説VIIアップデートクライアント`
- FileDescription `銀英伝VIIアップデートクライアント`
- CompanyName `ボーステック株式会社／株式会社マイクロビジョン`
- LegalCopyright `(C) 2004 MicroVision,Inc.`
→ 속성창에만 노출. 번역 대상 3개(ProductName/FileDescription/CompanyName). **P1**.

### 2e. 하드코딩 .data/.rdata 일본어 — **사실상 없음**
`.data`/`.rdata` 전수 스캔 결과 진짜 일본어 문자열 리터럴 0건(스캔 히트는 전부 vtable 포인터·opcode 오탐). **모든 유저 대면 일본어는 .rsrc에 집중** → 한글화는 리소스 교체만으로 완결. 코드/데이터 in-place 패치 불필요.

---

## 3. ★ 업데이트 대상 서버 설정 메커니즘 (정적 증거 확정)

**설정 파일 = `SERVER.INI`** (updater **자기 실행 디렉터리**에서 읽음). 경로 포맷 `%sSERVER.INI` (str 0x0044a5e8), `%s` = `GetModuleFileNameA` 디렉터리(`FUN_00404a80`). 별도 `update.ini`(`%supdate.ini`, RT_STRING 3)도 같은 디렉터리 — 단 이는 **버전/LAST_ERROR 기록용 런타임 ini**로 보임(WritePrivateProfile 대상). **레지스트리는 프록시 자동검출용으로만 사용**(`Software\Microsoft\Windows\CurrentVersion\Internet Settings`의 `ProxyEnable`/`ProxyServer`를 `FUN_00429040`가 읽음 — IE 프록시 상속). 서버 주소는 레지스트리 아님.

### `[UPDATE]` 섹션 (FUN_00404dc0, `GetPrivateProfileIntA`/`GetPrivateProfileStringA`)
| 키 | 용도 | 기본값(코드 디폴트) |
|---|---|---|
| `VERSION` | 현재 클라 버전(int) | 0 |
| **`SERVER_ADDRESS`** | **업데이트 서버 IP/호스트** | **`202.8.80.179`** (str 0x0044a540) |
| **`SERVER_PORT`** | **업데이트 서버 포트** | **`47902`** (str 0x0044a538) |
| `PROXY_ADDRESS` | 프록시 주소 | (빈값) |
| `PROXY_PORT` | 프록시 포트 | (빈값) |
| `BASE_DIR` | 적용 기준 디렉터리 | |
| `TEMP_DIR` | 다운로드 임시 디렉터리 | |
| `WORK_DIR` | 작업 디렉터리 | |
| `STARTUP_APPNAME` | 업데이트 후 기동할 본 클라 | `.\exe\G7MTClient.exe` (str 0x0044a51c) |
| `LAST_ERROR` | (런타임 기록, 0x%08x) | FUN_00406ed0가 write |

**★ 의뢰서의 "4787"은 사실이 아님 — 정적 디폴트는 `47902`** (다만 ADDR/PORT는 INI 값이 우선이라 운영자가 임의 지정 가능).

### 다중 서버/리다이렉트 섹션 (FUN_00405310)
SERVER.INI의 `[UPDATE]` 외 **임의 섹션을 전부 열거**해, 각 섹션의 `TYPE`(==1이면 채택), `ADDR`, `PORT`를 읽어 서버 후보 리스트(`FUN_00405550`)를 만든다. 즉 운영자는 `[ServerX]` 형태 섹션을 `TYPE=1 / ADDR=호스트 / PORT=포트`로 추가해 서버 풀을 지정할 수 있음.

### ★ 운영자 서버 지정 방법 (결론)
updater와 같은 디렉터리에 `SERVER.INI`를 두고:
```ini
[UPDATE]
VERSION=0
SERVER_ADDRESS=<우리 패치서버 호스트/IP>
SERVER_PORT=<포트>
BASE_DIR=.\
TEMP_DIR=.\temp\
STARTUP_APPNAME=.\exe\G7MTClient.exe
; (선택) 다중 서버:
[Server1]
TYPE=1
ADDR=<호스트>
PORT=<포트>
```
프록시는 `[UPDATE] PROXY_ADDRESS/PROXY_PORT`로 명시하거나 IE 설정(레지스트리) 자동 상속.

### ★ 서버 미가동 시 동작
Winsock connect 실패 → 에러 로그 후 `FUN_00406ed0`가 "アップデート失敗"(RT_STRING 11/12) 다이얼로그 → **graceful 종료(크래시 없음)**. 단 **업데이트 단계는 실패로 끝나며 본 게임 자동기동 경로를 못 탐**. 우리 리바이벌 운영에선 updater를 거치지 않고 `G7MTClient.exe`를 직접 기동하므로 updater 서버는 사실상 불필요(= no-op로 두거나 우리 호스트를 가리켜도 무방).

---

## 4. 한글화 계획 (인코딩·패치 메커니즘·등급)

### 패치 메커니즘
**전부 .rsrc 리소스 교체** (in-place 코드 패치 불필요 — §2e). 방법: pefile/ResourceHacker/`UpdateResource` 류로 RT_STRING 블록1·RT_DIALOG 130·(선택)RT_VERSION을 **UTF-16LE 한국어**로 재기록. lang 0x0411(JP) 슬롯을 그대로 덮거나 0x0412(KO) 추가. RT_STRING 본문은 **UTF-16LE**라서 cp949 이슈 없음 — 한글 그대로 인코딩 가능.

### 폰트 함정 ★
- RT_DIALOG 130 폰트 face = `ＭＳ Ｐゴシック`(전각). 한글 렌더 위해 **단일 전역 폰트 face**(예 Pretendard/맑은고딕)로 교체 필요 — 다이얼로그 템플릿의 폰트 필드(UTF-16) 수정. (본 게임 G7MTClient는 GDI face 0x77402c 전역 1개 함정이 있으나, **updater는 MFC 다이얼로그라 face가 리소스 템플릿에 박혀** 있어 별개. charset 바이트도 다이얼로그 폰트 구조의 charset 필드를 HANGEUL_CHARSET(0x81)로 둘 수 있음.)
- RT_DIALOG 30721은 `MS Shell Dlg`(시스템 매핑) → OS가 한글 폰트로 알아서 렌더, 변경 불필요.

### 등급별 작업
- **P0** (실제 노출, 추측아님·일어 원문 확정): RT_STRING 블록1 ID 1,4,5,7~15 (~12개) + RT_DIALOG 130 타이틀. → 자연 한국어 번역(logh7-localize humanizer).
- **P1**: RT_VERSION ProductName/FileDescription/CompanyName(3), RT_DIALOG 130 폰트 face, RT_DIALOG 30721(거의 미사용).
- **P2**: RT_STRING 2(영문 유지), 3(파일명 포맷 — 번역 금지).
- **P3**: MFC 스톡 RT_STRING 3841+ (~100여, 파일/예외 메시지) — 선택적.
- **번역 금지(코드 참조 리터럴)**: 컨트롤 ID 문자열(`Progress1`/`BTN_CANCEL`), INI 키(`UPDATE`/`SERVER_ADDRESS`/`%sSERVER.INI`/`%supdate.ini`/`STARTUP_APPNAME` 등), 파일명(`G7MTClient.exe`/`Gin7UpdateClient.new`/`UPDATE.LOG`).

---

## 5. 위험 / 불확실

1. **현 운영 우선순위 낮음**: 우리 리바이벌은 updater를 우회하고 `G7MTClient.exe`를 직접 기동(autologin 변종 포함) → updater 한글화는 가시성 낮음. 서버 설정 RE 가치는 "운영자가 패치배포 자동화를 원할 때"로 한정. updater 자체를 안 쓰면 SERVER.INI 한 줄도 불필요.
2. **라이브 미검증**: 본 조사는 **정적 RE 100%**. updater를 실제 기동해 SERVER.INI 키 우선순위·다중서버(`TYPE=1`) 채택·리소스 교체 후 한글 렌더는 라이브 미검증(logh7-live로 별도 확인 필요). 특히 RT_DIALOG 폰트 교체가 깨끗이 렌더되는지 미확인.
3. **MFC 스톡 문자열 인코딩**: 블록 3841+은 원문이 반각카나(Shift-JIS)로 보이나 리소스 본문은 UTF-16 — 교체 시 UTF-16 한글로 일관 처리하면 안전. 추측 번역을 P0로 올리지 말 것(원문 확정된 §2a만 P0).
4. **`47902` vs 의뢰서 `4787`**: 의뢰서 가정과 코드 디폴트가 불일치 — 코드 증거(str 0x0044a538=`47902`)가 권위. 운영자가 INI로 임의 포트 지정 가능하므로 둘 다 가능하나 **디폴트는 47902**.
