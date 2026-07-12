# 0x0325 ResponseInformationUnit — 클라 로더 RE / 와이어 레이아웃

정본 EXE: `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 9c97de2a…).
근거: `.omo/ghidra/export/decompiled/g7mtclient.exe_decompiled.c` (11495 함수 전수 디컴파일).

## 결론 (TL;DR)

**activeCount=0 근본원인 = count 필드 엔디안 오독.** 서버는 count 를 **u16 BIG-ENDIAN** 으로
쓰는데(`writeU16(count,0)`, wireEndian='be'), 클라는 offset 0 을 **u16 LITTLE-ENDIAN**(네이티브 x86
`*(ushort *)`)으로 읽는다. count=1 → 서버가 바이트 `00 01` 기록 → 클라가 `0x0100 = 256` 으로 읽음.
그 결과 클라의 단일유닛 스폰 게이트 `if (count == 1)` 가 **절대 성립하지 않아** 유닛이
레지스트리 @0x7db3c8 에 들어가지 않고, activeCount 가 0 으로 남는다.

**서버 코드 주석이 엔디안을 정반대로 적어놨다** — `logh7-world-records.mjs:346` "count BE (1이 클라에서
1로 읽히게 — LE 는 256 팬텀)". 실제는 반대: **클라는 LE 로 읽으므로 count 는 LE 여야 1 로 읽힌다.**

**수정 지점:** `server/src/server/logh7-world-records.mjs` `buildInformationUnitInner` 의 `writeU16(count,0)` —
count 만 **little-endian** 으로. (id·faction 등 나머지 필드는 건드리지 말 것, 아래 참조.)

## 클라 소비 경로 (함수 주소)

| 함수 | 주소 | 역할 |
|---|---|---|
| 아우터 디스패처 | `FUN_004ba2b0` | 0x0325 case (파일 라인 38678) |
| 스테이징 버퍼 | `DAT_0041a364` (+clientBase) | 페이로드 원본 복사 대상. count@+0, records@+4 |
| 로더 스텁 | `FUN_005266e0` | **빈 스텁(ret only, ~0x10바이트)** — 벌크 로드 안 함 |
| 단일유닛 스폰 | `FUN_004c2c80(1,0,records)` | count==1 일 때만 호출. record[0] → 렌더 레지스트리 |
| char↔unit 링크(멀티) | `FUN_004c2a80` | 캐릭터-레지스트리(0x36a8b4) 순회하며 0x0325 테이블과 id 매칭, 매칭분만 `FUN_004c2c80(0,…)` 스폰 |
| 렌더 레지스트리 alloc | `FUN_004c96c0(id)` | @0x7db3c8 슬롯 get-or-alloc (offset 0=active, +4=id, stride 0xb4c, 600슬롯) |

### 0x0325 case 원문 (FUN_004ba2b0, 라인 38678)
```c
case 0x325:
  FUN_005923a0(s_ResponseInformationUnit_OK_...);
  puVar17 = param_2;                              // src = 페이로드
  puVar20 = (ushort *)(&DAT_0041a364 + local_18); // dst 스테이징 버퍼
  for (iVar15 = 0x3391; iVar15 != 0; iVar15--) {  // 0x3391 dword = 52804바이트 통짜 복사
    *(undefined4 *)puVar20 = *puVar17;
    puVar17 += 1; puVar20 += 2;
  }
  if (600 < *(ushort *)(&DAT_0041a364 + local_18)) // ★count 를 u16 LE 로 읽어 상한검사
    FUN_005923a0(&DAT_0077066c,0);                  //   "information_size > 600" 경고
  psVar2 = (short *)(&DAT_0041a364 + local_18);
  FUN_005266e0(psVar2);                            // 빈 스텁
  if (*psVar2 == 1)                                // ★count==1 이면 단일유닛 스폰
    FUN_004c2c80(1,0,&DAT_0041a368 + local_18);    //   records(base+4) 전달
  break;
```

## 페이로드 레이아웃 (클라 기대)

전체 고정 크기 **52804바이트 (0xCE44 = 0x3391 dword)**. 이보다 크면 버퍼 오버런.

### 헤더 (4바이트)
| off | 크기 | 엔디안 | 의미 | 근거 |
|---|---|---|---|---|
| 0x00 | u16 | **LITTLE** | count (유닛 수, 0..600) | `*(ushort *)(&DAT_0041a364)` 네이티브 x86 read. `600 < count` 상한, `count == 1` 게이트, `iVar3 < (uint)count` 순회한도 전부 이 값 사용 |
| 0x02 | u16 | — | pad/unknown | 클라 미참조. records 시작 offset 4 (`DAT_0041a368 = base+4`) |

### 레코드 배열 (records @ offset 4, stride **0x58 = 88바이트**)
용량: (52804-4)/88 = 600개. 클라의 stride 0x58 근거: 순회 코드 `iVar3 * 0x58`, `piVar4 += 0x16(=0x58바이트)` (라인 45099/45103).

| off (레코드 상대) | 크기 | 엔디안 | 필드 | 근거/확신도 |
|---|---|---|---|---|
| 0x00 | u32 | (서버 BE, 아래 주의) | **unit id (앵커)** | 링크 비교 `piVar5[9] == *piVar4` (라인 45097), 레지스트리 키 `FUN_004c96c0(id)` |
| 0x04 | u16 | ? | faction (서버 추정) | 클라 실코드 미확인 — 서버 UNIT_ELEM 가정. **unknown** |
| 0x08 | u32 | ? | commander | 클라 미확인. **unknown** |
| 0x0c | u32 | ? | cell (row*100+col) | 클라 미확인. **unknown** |
| 0x10 | u32 | ? | owner | 클라 미확인. **unknown** |
| 0x14 | u8 | — | boats_count (troop_units, ≤10) | 서버 UNIT_ELEM. 클라 cap 근거 FUN_00419ca0/FUN_00419fd0 "> 10". 미대조 |
| 0x18.. | u32[] | ? | boats_array | 미확인 |
| 0x40 | u32 | ? | spot_resolver_base | 미확인 |
| 0x48 | u16 | ? | map_section | 미확인 |

주의: **레코드 필드별(id 외) 오프셋/크기/엔디안은 이번 정적분석으로 클라측 실참조를 확인하지 못했다.**
서버 `UNIT_ELEM`(옛 5bd249c 포팅)의 가정값이며, 확정하려면 `FUN_004c2c80` 의 `param_3`(records)
필드 접근(예: `param_3[0x10]` = +0x40) 과 `FUN_00419ca0/FUN_00419fd0` 를 추가 RE 해야 한다. **날조 금지 표기.**

## count 엔디안: 서버 출력 vs 클라 기대 (핵심 diff)

| | 서버 현재 출력 | 클라 기대 | 결과 |
|---|---|---|---|
| count=1 | BE `00 01` | LE read | 클라 **256** → `==1` 게이트 실패 → 스폰 안 함 → activeCount=0 |
| count=24 | BE `00 18` | LE read | 클라 **6144** → `600 <` 경고 + 6144회 순회(600용량 초과, 가비지) |
| count=1 (수정후) | LE `01 00` | LE read | 클라 **1** → `==1` 성립 → record[0] 스폰 |

**minimal 경로(fleets 미지정, 단일유닛)** 는 오직 `count==1` 게이트로만 @0x7db3c8 에 유닛을 넣는다.
따라서 count 를 LE 로 고치는 것이 activeCount=0 → 마커클릭 null-deref 해소의 직접 조건이다.

## id 필드는 그대로 BE 유지 (변경 금지)

`FUN_004c2a80` 링크 비교(라인 45097)는 0x0323 flagship(+0x24) 의 4바이트와 0x0325 record[0].id(+0x00)
4바이트를 **원바이트 그대로** 비교한다. 서버가 두 필드를 동일 엔디안(BE)으로 쓰면 서로 매칭된다.
즉 **id 의 BE 는 0x0323 과의 self-match 를 위한 의도된 불변식**이다 (server 주석 라인 199 확인).
count 만 틀렸고 id 는 건드리면 안 된다.

## @0x7db3c8 렌더 레지스트리 (참고)

- stride **0xb4c 바이트**, **600 슬롯** (초기화 `FUN_004c94c0`: 0x69e88 dword zero-fill).
- 슬롯 offset 0 = active flag(char), offset 4 = id(u32).
- 조회: `FUN_004c96c0(id)` — id 로 슬롯 검색, 없으면 alloc. 마커/렌더오브젝트 클릭이 이 함수로 유닛을
  찾고, 미스 시 `FUN_004c9a80` null-deref 크래시(팀 관측과 일치).
- **주의: 0x0325 핸들러는 @0x7db3c8 를 직접 채우지 않는다.** 스테이징 테이블(DAT_0041a364)만 채우고,
  실제 레지스트리 적재는 `FUN_004c2c80`(count==1 경로) 또는 `FUN_004c2a80`(캐릭터 링크 경로)를 통해
  일어난다. 두 경로 모두 LE count 에 의존하므로 count 수정이 선행 조건이다.

## 스코프 한계 / 후속 RE 필요

1. **멀티유닛(fleet) 렌더**: count 수정만으로 단일 player unit 은 스폰되지만, NPC 함대 전체가
   @0x7db3c8 에 들어가려면 `FUN_004c2a80` 상관 순회가 각 유닛에 대응하는 캐릭터-레지스트리(0x36a8b4)
   엔트리(0x0323 유래)를 요구할 수 있다. 벌크 스폰 경로 확정은 별도 RE 과제.
2. **레코드 필드(id 외) 실참조**: `FUN_004c2c80` param_3 필드 접근 전수 분석 미완 — 현재 unknown.

## 이동클릭 크래시 (부차 관측)
빈 셀 클릭 exit 0xCFFFFFFF/crashfn=0 는 이번 0x0325 정적분석 범위에서 직접 단서를 확보하지 못했다.
다만 마커/셀 클릭 핸들러가 @0x7db3c8 조회(`FUN_004c96c0`)에 의존하므로, 레지스트리가 비면 이동클릭
경로도 동일 null-deref 로 죽을 개연성이 있다(미확정, 별도 조사 필요).
