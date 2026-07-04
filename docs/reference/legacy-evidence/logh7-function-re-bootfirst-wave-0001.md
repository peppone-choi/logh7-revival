# LOGH VII 함수 RE — BootFirst 웨이브 0001 합성

작성일: 2026-06-22
바이너리: **BootFirst** (배치 0~9 합성, "BootFirst" 웨이브 1)
원장: `.omo/re-audit/functions/BootFirst/ledger.json`

> **정직 고지 (가장 중요한 발견)**: BootFirst 바이너리는 **`Gin7UpdateClient` 업데이터 부트스트랩**이다.
> 진입점(`entry` @0x00401150)이 직접 호출하는 유일한 "프로그램 본체"는 `FUN_00401000` 한 개뿐이며,
> 그 본체는 `Gin7UpdateClient.exe`/`.old`/`.new` 3-way 파일 스왑 + `CreateProcessA` 재기동 루프(재시도 상한 4)다.
> **나머지 68개 함수는 전부 MSVC 6.0 C 런타임(CRT)** — strcpy/memmove/malloc/SBH 힙 매니저/SEH 언와인드/로캘·코드페이지 ctype 초기화/argv·env 파서/CRT startup·exit 다.
> 따라서 **이 웨이브에는 옵코드 디스패처 `FUN_004ba2b0`, 전략/입력/HUD/grid 게이트 함수가 존재하지 않는다.**
> 그 함수들은 게임 클라이언트 `G7MTClient.exe`에 있으며 BootFirst와 다른 바이너리다.
> 본 문서는 작업 지시의 "옵코드 표/게이트 표"를 **억지로 채우지 않고** 비어 있음을 명시한다 (할루시네이션 금지 원칙).

---

## 1. 커버리지

| 항목 | 값 |
|---|---|
| 이번 웨이브 함수 수 | **69** (배치 0~9) |
| 누적 documented | **69** |
| 전체 re_target | **69** |
| 진척률 | **69 / 69 = 100%** |

배치별 함수 수: b0=8, b1=8, b2=1, b3=1, b4=3, b5=3, b6=5, b7=8, b8=14, b9=18 → 합계 69.
누적 documented(69)가 re_target(69)와 일치 → **BootFirst 바이너리 함수 RE 완료**.

---

## 2. 핵심 발견

### 2.1 옵코드 디스패처 `FUN_004ba2b0` opcode→handler 표
**해당 없음 (N/A).** `FUN_004ba2b0`은 BootFirst에 존재하지 않는다(주소 자체가 BootFirst의 .text 범위 0x401000~0x4046f8 밖). 이는 게임 클라(`G7MTClient.exe`)의 전략시퀀스 서버수신큐 함수로, MEMORY.md의 C002 트랙에서 다뤄진 별개 바이너리다. 이 웨이브에서는 디코드할 수 없다 — 향후 G7MTClient 바이너리 웨이브에서 수행해야 한다.

### 2.2 전략/입력/HUD/grid 게이트 함수
**해당 없음 (N/A).** BootFirst에는 전략맵·입력 큐·HUD·grid-enter 게이트 로직이 없다. 이 바이너리는 게임 로직을 전혀 포함하지 않는 순수 업데이터다.

### 2.3 실제로 발견된 구조 — 부트스트랩 / CRT

BootFirst의 의미 있는 단 하나의 "게임 외" 진입 흐름:

**프로그램 본체: `FUN_00401000` (업데이터 런처 루프)** — `cdecl`, 인자 없음
- `GetFileAttributesA`로 `.\Gin7UpdateClient.new` 존재 확인 (0xffffffff = 없음)
- 있으면 `MoveFileA` 3-way 원자 스왑: exe→old, new→exe (실패 시 old→exe 롤백), `DeleteFileA`로 잔여 정리
- `CreateProcessA("\.Gin7UpdateClient.exe", CREATE_NEW_CONSOLE=0x20)` → `WaitForSingleObject(INFINITE)` → `GetExitCodeProcess`
- exit code **==1** = 업데이터가 자기 자신을 교체했으니 재기동 요청 → 루프 반복; **!=1** = 완료(0 반환)
- 재기동 카운터(local_58) **상한 4** 초과 시 에러 MessageBox 후 종료; CreateProcessA 실패 시 별도 에러 MessageBox
- 관련 문자열: `0x004060a4`=`.\Gin7UpdateClient.exe`, `0x004060bc`=`.\Gin7UpdateClient.old`, `0x004060d4`=`.\Gin7UpdateClient.new`

**진입점: `entry` @0x00401150** (mainCRTStartup) — `GetVersion` 분해(_osver/_winmajor/_winminor/_winver) → 힙 init(`FUN_00401cc5`) → GetCommandLineA 캐시 → argv/env 파싱(`FUN_00401626`) → `_cinit`(`FUN_0040128f`) → **본체 `FUN_00401000` 호출** → 반환값을 `FUN_004012bc`(exit)로 전달.

### 2.4 CRT 함수 그룹 요약 (주요 parameters 포함)

**문자열/메모리 (libc):**
| addr | name | 요약 |
|---|---|---|
| 0x00403d60 | _strncpy | strncpy(_Dest, _Source, _Count) — null-pad, 워드 fast-path |
| 0x00402d70 | _strstr | strstr(_Str, _SubStr) |
| 0x00402cb0 | _strchr | strchr(_Str, _Val) — 워드 broadcast-compare |
| 0x00402df0 | _strncmp | strncmp(_Str1, _Str2, _MaxCount) → signed |
| 0x004046a0 | _memset | memset(_Dst, _Val, _Size) — dword broadcast |
| 0x004026c0 | _strlen | strlen(_Str) |
| 0x00402520 / 0x00402510 | strcpy | strcpy(dest, src) — 동일 형태 2개(dword zero-detect) |
| 0x00402740 / 0x00404360 | memmove | memmove(dst, src, n) — overlap-safe, 동일 형태 2개 |
| 0x00404082 | strnlen | strnlen(str, cap) |
| 0x00402a8c | strtol/strtoul worker | (thiscall ecx=scratch) (nptr, endptr, radix, flags) — 부호/진법 자동감지/오버플로 ERANGE 클램프 |

**힙 — MSVC Small-Block-Heap (SBH) 매니저 (libc):**
- 디스패처: `FUN_0040263e`(malloc 코어, 모드 selector `DAT_0040896c`: 3=SBH `FUN_004031fb`, 2=16B granule `FUN_004039a8`, else HeapAlloc), `FUN_004024a2`(free 코어, 대칭)
- malloc 상위: `FUN_00402600`(malloc)→`FUN_00402612`(__nh_malloc, new-handler retry `FUN_004041f6`)
- 할당 코어: `FUN_004031fb`(__sbh_alloc_block), `FUN_004039a8`(region 스캔), `FUN_00403bb0`(intra-page carve)
- 그룹/리전 관리: `FUN_004036b0`(new region 4MiB reserve+64KiB commit), `FUN_00403504`(new group 0x14 header), `FUN_004035b5`(commit 32KB group+free-list 배선)
- free/coalesce: `FUN_00402ed2`(free+coalesce+VirtualFree/HeapFree), `FUN_00403963`(free-counter, 0x20 도달 시 트림), `FUN_0040384a`(_heapmin 페이지 decommit), `FUN_004037f4`(region teardown)
- 주소→리전 resolver: `FUN_00402ea7`(1MB span 검색), `FUN_0040390c`(SBH segment/block index)
- 힙 전략 선택: `FUN_00401b7d`(__heap_select, NT>=5→1, `__MSVCRT_HEAP_SELECT` env 오버라이드), `FUN_00401cc5`(__heap_init, HeapCreate)
- 테이블 init: `FUN_00402e5f`(growable table init)

**로캘/코드페이지/ctype (libc):**
- `FUN_004020c2`(__setmbcp 코드페이지 ctype/leadbyte 셋업), `FUN_00402301`(case-map/ctype 테이블 빌드 → DAT_00408760 case, DAT_00408860 flags), `FUN_004022d8`(상태 zero-init), `FUN_00402486`(run-once ACP init 가드)
- 코드페이지 resolver `FUN_0040225b`(sentinel -2 OEMCP/-3 ACP/-4 cached)
- ctype lookup: `FUN_00402091`(_isctype), `FUN_004042dd`(MBCS _isctype), `FUN_00404211`(locale toupper)
- NLS 래퍼: `FUN_00403e5e`/`FUN_00403f72`(__crtLCMapStringA, MBToWC→LCMapStringW→WCToMB), `FUN_004040ad`(__crtGetStringTypeA)

**CRT startup/exit/SEH (libc):**
- startup: `entry`(0x00401150), `FUN_004019a5`(__ioinit), `FUN_00401626`(__setargv), `FUN_0040156d`(__setenvp), `FUN_004016bf`(parse_cmdline), `FUN_00401515`(getcmdfirstarg), `FUN_00401873`(env strings A copy), `FUN_00401ef4`(_cinit), `FUN_00401b50`(PE Subsystem 읽기)
- exit: `FUN_004012cd`(exit), `FUN_004012de`(doexit), `FUN_0040128f`(_cexit tail), `FUN_00401246`/`FUN_0040126b`(fatal 종료, __exit ptr vs ExitProcess)
- SEH: `FUN_00401d24`(__global_unwind2), `FUN_00401d66`(__local_unwind2), `FUN_004046f8`(RtlUnwind thunk), `FUN_00401391`(_XcptFilter), `FUN_004014d2`(signal table lookup), `FUN_00401dfa`(context capture stub), `FUN_00404026`/`FUN_004041aa`(cleanup funclet), `FUN_00402e30`(__chkstk)
- 메시지: `FUN_00401f2d`(runtime-error reporter), `FUN_00403cd4`(__crtMessageBoxA)
- 콜백 디스패치: `FUN_004041f6`(_callnewh)

---

## 3. verify 적발 정정 (hallucination / paramError / offsetError)

이번 웨이브 배치 출력 자체에는 **자기-정정 메타데이터가 포함되어 있지 않다** (각 함수의 `open_questions`는 전부 빈 배열, 별도 verify 필드 없음). 따라서 배치가 명시적으로 기록한 적발 항목은 0건이다.

합성 단계에서 식별한 정정/주의 사항(정직 기록):
1. **작업 지시의 전제 오류 (가장 큰 정정)**: 지시는 "옵코드 디스패처 `FUN_004ba2b0` opcode→handler 표"와 "전략/입력/HUD/grid 게이트 함수"를 기대했으나, **BootFirst 바이너리에 그 함수들이 전혀 없다**(주소가 BootFirst .text 범위 밖, 게임 로직 부재). 표를 억지로 작성하면 할루시네이션이 되므로 N/A로 명시했다. 해당 함수들은 `G7MTClient.exe` 소속이다.
2. **`FUN_00403f72` calling_convention 불확실**: 배치 5가 `cdecl?`로 표기하고 "프롤로그 비표준, unaff_EBP로 읽음"이라 명시 — 인자를 모두 스택 슬롯(EBP+0x08…)으로 기술. 이는 `FUN_00403e5e`의 내부 워커로 보이며, 호출규약은 미확정으로 남긴다.
3. **`FUN_004022d8` purpose 모호성**: 배치 7이 "environment/argv 파싱 또는 heap-bookkeeping descriptor일 가능성"이라 양다리 추정했으나, 정리하는 글로벌(DAT_00408860 ctype 테이블 + DAT_0040874c/875c/8964/8750/54/58)이 `FUN_004020c2`(__setmbcp)가 쓰는 것과 동일 → **실체는 mbcs/로캘 상태 zero-init**으로 확정(GetCPInfo fallback 경로). 배치의 "env/argv" 추정은 부정확.
4. **중복 함수 2쌍 (오류 아님, 사실 기록)**: memmove(`0x00402740`≈`0x00404360`), strcpy(`0x00402520`≈`0x00402510`)는 디컴파일 형태가 동일. MSVC가 동일 루틴을 2개 심볼로 emit/inline 한 결과로 보이며 별개 주소이므로 둘 다 documented에 유지.
5. **저신뢰 함수 3개 (P3-inferred)**: `FUN_00401dfa`, `FUN_00404026`, `FUN_004041aa` — Ghidra가 스택 프레임을 복원 못 한 SEH funclet/스텁. confidence=P3로 보존, 확정 단언 금지.

paramError / offsetError로 단정할 만한 명확한 오류는 발견하지 못함(대부분 P0-decompile, MSVC CRT 표준 패턴과 일치).

---

## 4. fail / partial 배치 (정직 명시)

- **fail 배치: 없음.** 배치 0~9 모두 정상 JSON, 모두 Read 성공.
- **partial(불완전) 항목:**
  - 배치 5 `FUN_00403f72` — 호출규약 `cdecl?` 미확정 (프롤로그 비표준), 인자는 스택 슬롯으로만 기술.
  - 배치 9 `FUN_00401dfa`, `FUN_00404026`, `FUN_004041aa`, `FUN_00402e30` — `cdecl?` + P3-inferred(funclet/chkstk, 프레임 미복원).
  - 배치 7 `FUN_004022d8` — purpose가 두 갈래 추정으로 적혀 있어 본 문서에서 mbcs-init으로 좁혔음(§3-3).
- 배치 2·3은 함수 1개씩만 담고 있으나 이는 fail이 아니라 배치 분할 결과(정상).

---

## 5. 다음 웨이브

- **다음 웨이브 시작 배치 = 10**
- BootFirst는 100% 완료(69/69). 배치 10 이후에 새 BootFirst 함수가 없다면 이 바이너리는 종결.
- 작업 지시가 기대한 옵코드 디스패처/전략·입력·HUD·grid 게이트 RE는 **별도 바이너리 `G7MTClient.exe` 웨이브**에서 수행해야 한다(BootFirst에 부재). 기존 인덱스: `.omo/ghidra/export/G7MTClient/`, 조회 도구 `tools/logh7_redex.py` (skill: logh7-re).
