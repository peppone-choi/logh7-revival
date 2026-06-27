# LOGH VII 함수 RE — G7MTClient 웨이브 0003 합성

생성: 2026-06-23 · 바이너리 `G7MTClient` · 배치 0128–0143 (16배치)

## 1. 커버리지

| 지표 | 값 |
|---|---|
| 이번 웨이브 함수 수 | **17** (배치 16개 중 0139는 함수 2개) |
| 누적 documented | **294** (이전 277 → +17) |
| 전체 re_target 대비 | **294 / 6089 = 4.83%** |
| (참고) total_functions | 13,800 |
| batches_done | 0–143 (총 144) · 다음 시작 = **144** |

원장: `.omo/re-audit/functions/G7MTClient/ledger.json` (UTF-8, JSON 유효성 검증 통과 — documented_count 필드 294 = 실제 엔트리 294 일치).

## 2. 웨이브 함수 목록 (배치순)

이번 웨이브는 **거의 전부 `*::input_from_stream` 디시리얼라이저** 클러스터다(SimpleInformation / Information 패밀리). 두 변종이 쌍으로 반복된다:
- **바이너리 스트림 파서**: param_2 = mtStreamInputBuffer류 리더 객체, vtable 슬롯 `+0x1c=4B` / `+0x20=2B` / `+0x24=1B` 디스패치.
- **ASCII 텍스트 파서**: param_2(+0xc 또는 +4/+5/+7)에서 시작하는 콤마/중괄호 구분 텍스트를 `FUN_005ff09b`(atoi 래퍼)로 정수 변환.

| 배치 | addr | 추정 식별 | 변종 | verdict |
|---|---|---|---|---|
| 0128 | `0x00471260` | Input_SimpleInformationCharacter::input_from_stream | binary | partial |
| 0129 | `0x00471ba0` | (위와 동일 레코드) | ASCII text | partial |
| 0130 | `0x00482620` | (top count cap100 list, 0x124 stride) | binary | partial |
| 0131 | `0x00482fb0` | Input_ResponseInformationMailAddress::input_from_stream | ASCII text | partial |
| 0132 | `0x00484280` | Input_ResponseInformationMessengerStatus::input_from_stream | binary | partial |
| 0133 | `0x0055ba80` | Input_NotifySimpleInformationCharacter::input_from_stream | binary | (미검증) |
| 0134 | `0x0055c440` | (위와 동일 레코드) | ASCII text | (미검증) |
| 0135 | `0x0055ff30` | Input_NotifySimpleInformationRankingCharacter::input_from_stream | binary | partial |
| 0136 | `0x00560900` | (위와 동일 레코드) | ASCII text | partial |
| 0137 | `0x00565d60` | Input_NotifySimpleInformationCharacterEntry::input_from_stream | binary | partial |
| 0138 | `0x00566740` | (위와 동일 레코드) | ASCII text | (미검증) |
| 0139 | `0x0041ca30` | ResponseGridInformationOutfit 텍스트 덤퍼 (builder) | dumper | partial |
| 0139 | `0x005dc9e0` | **D3D8 per-frame present/render-tick** | render | **solid** |
| 0140 | `0x00407920` | Input_InformationAccount::input_from_stream | binary | partial |
| 0141 | `0x00408300` | (위와 동일 레코드) | ASCII text | partial |
| 0142 | `0x00417390` | Input_InformationCharacter::input_from_stream (**opcode 0x0323**) | binary | partial |
| 0143 | `0x00417f20` | (위와 동일 레코드) | ASCII text | partial |

## 3. 핵심 발견

### 3.1 옵코드 디스패처 FUN_004ba2b0 (참고: 이미 batch 0 documented)

이번 웨이브에는 **디스패처 자체는 없다**. 마스터 클라 와이어 디스패처 `FUN_004ba2b0`(opcode = param_2 하위 워드 → handler)는 원장 batch 0 항목으로 이미 등재되어 있고, 그 핸들러들도 batch 44–50에 다수 등재됨(예: `0x004c02f0` 위치/그리드 상태, `0x004beaa0` 함선/함대 이동 통지, `0x004c15a0` 유닛 전략상태 리셋 — 전부 "called from FUN_004ba2b0" 명시). 이번 웨이브 함수들은 **디스패치 이후 단계**의 페이로드 디시리얼라이저라서, 함수 본문에 수치 옵코드가 거의 출현하지 않는다(아래 옵코드 표 참조). 따라서 이번 웨이브로 갱신할 opcode→handler 행은 사실상 없고, 옵코드 바인딩은 1건(0x0323)만 P0로 확정된다.

### 3.2 옵코드 바인딩 (P0 확정 vs 추론)

| opcode | 함수 | 근거 | 등급 |
|---|---|---|---|
| **0x0323** | `0x00417390` Input_InformationCharacter | 캐릭터 인포레코드 디시리얼라이저, docs/logh7-info-records-wire.md와 정합 | **P0 확정** |
| ~~0x0f07~~ | `0x00484280` ResponseInformationMessengerStatus | **추론** — 디컴파일 c에 0x0f07 없음. 클래스명만 string(0x00768678)로 근거; 옵코드는 message-catalog.json(status:spec, parser:null)에서 매칭한 P2 추론을 P0로 잘못 단정 | **P2 추론(정정 대상)** |

나머지 디시리얼라이저는 본문에 옵코드 상수가 없어 미바인딩(디스패처/등록 사이트가 옵코드를 부여; 이번 배치 외).

### 3.3 디시리얼라이저 공통 구조 (P0 확정 사실)

전 함수 공유:
- **공유 예외/문자열 인프라**: `DAT_0066bfe4`(string capacity/allocator sentinel), `PTR_FUN_00744f38`(throw 객체 vtable), `DAT_00747a28`(ThrowInfo/타입 디스크립터, `__CxxThrowException_8` 2nd arg), `DAT_007c1bb8`(메시지 string seed). 네 주소 모두 16배치 전부에서 디컴파일 c에 실재(환각 아님).
- **공유 콜리**: `FUN_005fe8f3`(sprintf/vsnprintf류 진단 포맷터), `FUN_00610420`(mtStreamInputBuffer::read, 바이너리 변종), `FUN_005ff09b`(atoi 래퍼, ASCII 변종), `FUN_004033d0`/`004033b0`/`00403360`/`00403160`/`004042f0`/`005fe804`(std::string 헬퍼 군).
- **검증 가드**: 각 가변배열은 size 바이트 → 한도 비교(< 상수) → 초과 시 `[Class::input_from_stream] field_size[%d] is over than N.` 포맷 후 throw.
- **★ throw 헬퍼의 진짜 주소 = `0x005fe945`** (`__CxxThrowException@8`, symbols.tsv:4689). 디컴파일에는 심볼명 `__CxxThrowException_8`로만 나오고 주소가 없다 — 여러 maker가 이 주소를 날조하거나(0x00640000, 0x00403260/310, 0x00403310 등 = 전부 FUN_00403160/FUN_0063ffef 내부 주소) 함수 자기 자신 주소(0x00407920)로 오기입함(§4 참조).

### 3.4 SimpleInformationCharacter 정정된 필드 캡 (검증자 확정 그라운드 트루스)

다수 maker가 +0x10/+0x30(또는 +0xb/+0x2b) 위치에서 card vs display_name을 **서로 바꿔** 라벨링했다. 에러-문자열 주소로 확정한 정답:

| 필드 | 캡 | 에러 문자열 주소 |
|---|---|---|
| display_name_size | ≤13 (`<0xd`) | `0x0076837c` |
| card_size | ≤16 (`<0x10`) | `0x00768324` |
| outfit_size | ≤1 (`<2`) | `0x007682cc` |
| outfit base_size | ≤1 | `0x007645e0` |
| (Simple)Base name_size | ≤13 | `0x0076458c` |
| charged_base_size | ≤4 (`<5`) | `0x0076826c` |
| 최상위 information_size | ≤100 (`<0x65`) | `0x0078b1a0`(ranking) / `0x00768614`(mailaddress) |

### 3.5 비-디시리얼라이저 2건

- **`0x005dc9e0` (D3D8 present/render-tick) — 검증자 "solid"**: fastcall ecx=device-manager. `TestCooperativeLevel`(device vtbl+0xc); `D3DERR_DEVICELOST`(-0x7789f798)→0 반환(프레임 스킵), `D3DERR_DEVICENOTRESET`(-0x7789f797)→`FUN_005dbd10` 디바이스-리셋. resize=vtbl+0x14, present=vtbl+0x18. FPS 카운터(DAT_022293f4 누적 vs _DAT_022293f0 last-sample), 오버레이 `'%.02f fps (%dx%dx%d)'`(this+0x2a55e), depth-format 접미사(D32/D15S1/D24S8/D24X8/D24X4S4/D16 = case 0x47/0x49/0x4b/0x4d/0x4f/0x50). 최종 `FUN_005dd450`(Present/EndScene flush). **환각·날조 옵코드 0건.** 리마스터/해상도 작업의 핵심 진입점.
- **`0x0041ca30` (ResponseGridInformationOutfit 텍스트 덤퍼)**: 디버그 덤퍼(빌더), 와이어 파서 아님. 헤더 `'_INF:ResponseGridInformationOutfit#'`, per-element 12B/6-u16 stride(kind/power/camp/index/supplies). subsystem=strategic.

## 4. 검증 적발 정정 (verifier corrections)

원천: `.omo/re-audit/functions/G7MTClient/out/_wave-0003-verifier-corrections.json` (영속 저장 완료). **16배치 전부 verdict=`partial`**. 단, 적발은 maker 문서의 라벨/날조 주소/산술 오류이며 **하드-페일(전면 폐기) 0건** — 각 partial은 "핵심 하중 RE는 검증됨 + 자기-한정 정정"이다. 미검증(검커 항목 없음) 3배치는 §4.4.

### 4.1 환각 (hallucination) — 존재하지 않는/오귀속 주소

| 배치 | 함수 | 환각 내용 | 정정 |
|---|---|---|---|
| 0130 | 0x00482620 | 외곽 컨테이너를 `ResponseInformationCharacterList`로 명명 | 그 문자열 0히트. 실제 진단 = `ResponseInformationMailAddress`(str 0x00768614, gate `<0x65`) |
| 0131 | 0x00482fb0 | key_callee 0x005fe945 / FUN_005ff010 / cap 0x7fffffff / PTR_FUN_00680c94 를 P0로 단정 | 전부 **이 함수 c에 미출현**(콜리 내부 사실) → 본 디컴파일로는 미증명 |
| 0135 | 0x0055ff30 | key_callee `0x00403260` = `__CxxThrowException_8` | 0x00403260은 함수 엔트리 아님(FUN_00403160 내부). 진짜 throw=`0x005fe945`(누락) |
| 0136 | 0x00560900 | key_callee `0x00403310` = `__CxxThrowException_8` | 0x00403310 c에 없음(FUN_00403160 내부). 진짜=`0x005fe945` |
| 0140 | 0x00407920 | key_callee `0x00407920` = `__CxxThrowException_8` | **함수 자기 자신 주소** — 자기 콜리 불가. `__CxxThrowException_8`는 intrinsic(주소 없음) |
| 0141 | 0x00408300 | key_callee `0x00640000` = `__CxxThrowException_8` | 0x00640000 c에 0히트(FUN_0063ffef 내부). 진짜=`0x005fe945`. 또 FUN_004033d0 중복 등재 |
| 0142 | 0x00417390 | key_callee `0x00402290`("error reporter") | c에 0히트. FUN_00610420은 FUN_006104b0 호출(0x402290 아님) = 날조 |
| 0128 | 0x00471260 | (환각 0건) | DAT 4개·callee 7개 전부 c 실재 확인 |
| 0129·0137·0143 | — | (환각 0건) | — |
| 0139 | 0x005dc9e0 | (환각 0건, "solid") | — |

### 4.2 매개변수 오류 (paramError)

| 배치 | 함수 | 오류 | 정정 |
|---|---|---|---|
| 0129 | 0x00471ba0 | +0x08 카운트를 `name_size`로 | 실제 `display_name_size`(str 0x0076837c). name_size(≤13)는 별도 Base 필드 |
| 0136 | 0x00560900 | `card(≤16) display_name(≤13)` 매핑 반전 | +0x10=display_name≤13, +0x30=card≤16 |
| 0137 | 0x00565d60 | +0xb=card(≤13)/+0x2b=display_name(≤16) | +0xb=display_name≤13, +0x2b=card≤16 (오프셋표 내부 모순) |
| 0139 | 0x0041ca30 | param_2를 "콜백의 첫 인자"로 | **param_2가 코드 포인터 자체**(`FUN_00439da0`의 param_1로 호출됨). param_3=콜백 컨텍스트 |
| 0140 | 0x00407920 | 이름 6필드 read 순서 firstname,lastname,... | 실제 순서 lastname,firstname,display_name,titlename,flagship_name,ending. 또 ending 캡=1(0xd 아님) |
| 0141 | 0x00408300 | [8]/[0x1a8] 역할 명명 부정확(추론) | [8]=extension count, [0x1a8]=entry count (가드 <3/<6은 정확) |
| 0143 | 0x00417f20 | +0x60/+0x64를 dword로; "3 dwords"; +0x57 count 과소 | +0x60/+0x64는 BYTE(dword는 +0x68); "4 dwords"가 맞음; per-name 길이바이트 4개 |

### 4.3 오프셋 오류 (offsetError)

| 배치 | 함수 | 오류 | 정정 |
|---|---|---|---|
| 0128 | 0x00471260 | throw "6 distinct" / Outfit base_size≤1 캡 누락 | throw 사이트 **8개**; +0x52 base_size **≤1** 캡 누락 |
| 0129 | 0x00471ba0 | record stride "0x14 bytes" | puVar10(undefined4*)+=10 → **0x28 bytes**. 0x14는 WORD stride |
| 0132 | 0x00484280 | +0x42=charged_base, +0x70=outfit (SWAP) | +0x42=**outfit_size≤1**(str 0x007682cc), +0x70=**charged_base_size≤4**(str 0x0076826c); +0x44는 outfit 블록 |
| 0135 | 0x0055ff30 | 0x00403260 콜리 무효 | (위 환각 동일) |
| 0136 | 0x00560900 | 0x00403310 콜리 무효 | 진짜=0x005fe945 |
| 0137 | 0x00565d60 | +0xb=card / +0x2b=display_name | +0xb=display_name(0xd), +0x2b=card(0x10) |
| 0140 | 0x00407920 | 0x00407920 콜리 무효 + 문자열-게이트 페어링 역방향 | gate `<3`→str 0x0075f850("over than 2"), gate `<6`→str 0x0075f7f8("over than 5") = maker 진술의 반대 |
| 0142 | 0x00417390 | +0x28 리스트를 card로 | +0x28=**flagship_name≤13**(str 0x00763798); 진짜 card는 +0x24c≤16(str 0x00763564) |
| 0143 | 0x00417f20 | +0x254=count(cap16)·list@+0x95 | param_1+0x93=BYTE 0x24c(count), param_1+0x95=BYTE 0x254(list 시작) = 카운트/리스트 오프셋 뒤바뀜 |

### 4.4 과장 (overstatement, 사실오류 아님)

- **0128**: `DAT_0066bfe4`를 'global allocator/locale context'로 단정 — 디컴파일은 FUN_00403160 3번째 인자라는 사실만 증명. allocator/locale 역할은 본 함수만으로 미증명 추론.
- **0128**: subsystem 소스 jsonl `strategic` → maker `network`로 무단 변경(parser라 합당하나 근거 미명시).
- **0132**: opcode 0x0f07을 P0-decompile로 바인딩(§3.2) — 실제 P2 추론.
- **0141**: subsystem jsonl `battle` → maker가 `core/parser`로 정정(이건 올바른 정정 — 문자열이 account roster 파서임을 증명).

## 5. fail/partial 배치 명시 (정직)

- **hard-fail(전면 폐기): 0건.**
- **partial: 13배치** — 0128, 0129, 0130, 0131, 0132, 0135, 0136, 0137, 0139, 0140, 0141, 0142, 0143. (검증자 verdict, 자기-한정 confidence; §4의 정정 반영 후 핵심 RE 사용 가능.)
- **검증자 항목 없음(미검증, 보류): 3배치** — **0133(0x0055ba80), 0134(0x0055c440), 0138(0x00566740)**. corrections JSON에 검커 엔트리가 없어 적대적 검증 미수행. 원장에 confidence=`P0-decompile`로 등재하되 **"unverified pending audit"** 명시. 차기 검증 패스에서 우선 감사 대상.
- **solid(검증 통과, 정정 없음): 1함수** — 0139 `0x005dc9e0`(D3D8 render-tick).

## 6. 다음 웨이브

- **시작 배치 = 144** (batches_done 0–143 완료).
- 후속 검증 패스에서 미검증 배치 0133/0134/0138 우선 감사.
- 공통 권고: throw 헬퍼 주소는 항상 `0x005fe945`로 통일(maker가 FUN_00403xxx 내부주소·자기주소로 날조하는 패턴 반복); card/display_name 캡은 §3.4 그라운드 트루스 고정.
