# 와이어 프로토콜 교차검증 — 서버 빌더 ↔ 클라 파서 (2026-06-26)

서버가 각 필드를 쓰는 byte offset/타입/엔디안이, 디컴파일된 클라 파서(`G7MTClient.exe`, base 0x400000)가
읽는 offset/타입과 정확히 일치하는지 옵코드별로 교차검증한 결과를 종합한다.

- **서버측 인용** = 파일:라인 (`server/src/server/...`)
- **클라측 인용** = `FUN_` VA + element/record offset (Ghidra 디컴파일 인덱스 `.omo/ghidra/export/G7MTClient/functions.jsonl`)
- **확정 불일치(isRealMismatch=true)** 만 "버그"로 표기. 그 외 모든 필드는 "정합 확인".

검증 방법: 교차검증 + 적대검증 결과를, 이 문서 작성 시 핵심 4건(0x0325 mapSection/tail, 0x030b 0x36,
0x0426 sinkByte)을 서버 소스에서 byte-correct 재확인(`UNIT_ELEM` 맵 line 466-476, `U16_SLOTS` line 308-313,
`buildNotifyAttackedShipInner` line 1219-1239)하여 검증함.

---

## (a) 옵코드별 정합 상태

| 옵코드 | 이름 | 서버 빌더 | 클라 파서 | 검사 필드 | 확정 불일치 | 상태 | 신뢰도 |
|--------|------|-----------|-----------|:---------:|:-----------:|------|:------:|
| **0x0323** | SS ResponseInformationCharacter (724B) | `logh7-login-protocol.mjs:224` buildInformationCharacterRecordInner | FUN_004ba2b0 case 0x323 | 23 | 0 | ✅ 정합 확인 | high |
| **0x0313** | ResponseStaticInformationGridType (object table) | `logh7-login-protocol.mjs:653` buildStaticInformationGridTypeInner | FUN_004ba2b0 case 0x313 → FUN_00413050 | 8 | 0 | ✅ 정합 확인 | high |
| **0x0315** | ResponseStaticInformationGrid (지형 RLE) | `logh7-login-protocol.mjs:576` buildStaticInformationGridInner | FUN_004134e0 / FUN_004abbb0 / FUN_004d6310 | 7 | 0 | ✅ 정합 확인 | high |
| **0x0325** | ResponseInformationUnit (유닛 테이블, stride 0x58) | `logh7-login-protocol.mjs:501` buildInformationUnitRecordInner | FUN_004ba2b0 case 0x325 / FUN_00419ca0 / FUN_004c32a0 | 11 | **2** | ⚠️ 불일치 2건 | medium |
| **0x031f** | ResponseInformationBase (拠点 패널) | `codec/base-record.mjs:284` buildResponseInformationBaseInner (canonical) | FUN_00414c70 / FUN_004c32a0 | 11 | 0* | ✅ 정합 확인 (live) | high |
| **0x031d** | ResponseStaticInformationBase (성계 마스터) | `logh7-info-records.mjs:172` buildStaticInformationBaseInner | FUN_004ba2b0 case 0x31d → FUN_004142e0 | 15 | 0 | ✅ 정합 확인 | high |
| **0x030b** | ResponseStaticInformationUnitShip (함선클래스 스탯) | `logh7-info-records-static.mjs:276` buildStaticInformationUnitShipInner | FUN_004ba2b0 case 0x30b (인라인) | 22 | **1** | ⚠️ 불일치 1건 | high |
| **0x2006** | LobbyResponseInformationSession | `codec/scenario-session.mjs:187` buildInformationSessionInner | FUN_00444900 | 18 | 0 | ✅ 정합 확인 | high |
| **0x0426** | NotifyAttackedShip (전투 피해/격침) | `logh7-login-protocol.mjs:1219` buildNotifyAttackedShipInner | FUN_004ba2b0 case 0x426 → FUN_004c0df0 | 9 | **1** | ⚠️ 불일치 1건 | high |
| **0x0b07** | NotifyMovedGrid (580B) | `logh7-login-protocol.mjs:1353` buildNotifyMovedGridInner | FUN_004ba2b0 case 0xb07 → FUN_0044b460 | 9 | 0 | ✅ 정합 확인 | high |

\* 0x031f는 canonical codec(`base-record.mjs`)와 클라 파서가 정합. 단 **@deprecated 빌더**
`buildInformationBaseInner`(`logh7-info-records.mjs:216`)는 와이어 모델 자체가 클라와 불일치 — 아래 (b) 참조.
라이브 핸들러는 canonical을 쓰므로 실제 와이어에는 미반영(테스트 전용 잔존, 신규 사용 금지).

**확정 불일치 총 4건** (0x0325 ×2, 0x030b ×1, 0x0426 ×1).
정합 확인 옵코드 = 0x0323, 0x0313, 0x0315, 0x031f(live), 0x031d, 0x2006, 0x0b07.

---

## (b) 확정 불일치 목록 (버그)

### 버그 #1 — 0x0325 mapSection 타입 폭 불일치 (u16 vs u32)

- **서버 offset/타입**: element base `+0x48` **u16** (`logh7-login-protocol.mjs:553`,
  `writeUnitU16(f.mapSection ?? 0, base + UNIT_ELEM.MAP_SECTION)`; `UNIT_ELEM.MAP_SECTION = 0x48` @ line 475).
  2바이트만 기록(`+0x48~+0x49`), `+0x4a~+0x4b`=0.
- **클라 기대 offset/타입**: `FUN_00419ca0` (VA 0x419ca0) 바이너리 스트림 파서가 element `+0x48`을
  `param_1+0x12` dword 위치에서 **u32**(스트림 vtable `*param_2+0x1c` = u32 핸들러)로 읽음.
- **불일치**: 서버 offset 0x48 type **u16**(login-protocol.mjs:553) vs 클라 기대 offset 0x48 type **u32**(FUN_00419ca0 VA, `*param_2+0x1c`).
- **영향**: OFFSET은 일치, TYPE(폭)만 불일치. 버퍼가 0-init이고 `+0x4a~+0x4b`가 padding이라
  mapSection<65536면 수치상 손상 없이 읽힘(LE). 그러나 명시 타입 폭이 어긋남. 아/적 색분기(`+0x08`/`+0x04`)에는 무영향. **영향 LOW.**
- **수정안**: 서버 `UNIT_ELEM.MAP_SECTION` 슬롯을 `writeUnitU32`로 변경(라벨도 u32). 그러면 폭/의미가 클라 파서와 정확 정합.

### 버그 #2 — 0x0325 element tail 슬롯 미투영 (+0x42/+0x44/+0x4c/+0x50)

- **서버 offset/타입**: 빌더가 이 4슬롯을 **전혀 쓰지 않음**. `UNIT_ELEM` 맵(login-protocol.mjs:466-476)에
  `0x42`/`0x44`/`0x4c`/`0x50` 키 없음 → per-element 항상 0.
- **클라 기대 offset/타입**: `FUN_00419ca0` (VA 0x419ca0)가 per-element 무조건 읽음 —
  `+0x42` u16(`*+0x20`), `+0x44` u16(`*+0x20`), `+0x4c` u32(`*+0x1c`), `+0x50` float(`*+0xc`).
- **불일치**: 서버 미기록(login-protocol.mjs:536-554, UNIT_ELEM에 키 없음) vs 클라 기대 +0x42 u16 / +0x44 u16 / +0x4c u32 / +0x50 float(FUN_00419ca0 VA).
- **보충**: 서버 주석(line 455)이 tail을 `0x4c/0x50/0x54`로 라벨 → 실제 클라 read(`0x4c/0x50`, float은 0x50)와 4바이트 off-by-4. 주석 정정 필요.
- **영향**: 클라가 이 슬롯을 의미있게 소비하면 항상 0(좌표/수치 tail 결측). 현재 렌더 소비처
  `FUN_004c32a0`이 이 슬롯을 안 읽으면 무해하나, value-source가 P3라 필요시 서버 투영 누락. **영향 LOW~MED(라이브 미확인).**
- **수정안**: 클라 소비처(`FUN_004c32a0` 등)에서 이 tail 슬롯의 실제 의미를 RE로 먼저 확정 →
  의미가 있으면 `UNIT_ELEM`에 키 추가 + 서버 value-source 연결. 의미 없으면 0 유지(현상 OK) + 주석 off-by-4 정정.

### 버그 #3 — 0x030b 함선 스탯 슬롯 0x36 미기록

- **서버 offset/타입**: `U16_SLOTS`(`logh7-info-records-static.mjs:308-313`)가 `...0x32, 0x34, 0x40...`로
  **0x34에서 0x40으로 점프** → record base `+0x36` 미기록(인접 0x37도 없음). 다른 write도 미커버
  (u32@0x28 line304; float@0x38/0x3c/0x5c/0x60 line300-303).
- **클라 기대 offset/타입**: `FUN_004ba2b0` case 0x30b 인라인 파서(VA 0x4ba2b0)가
  `local_2c[0x18] = *(undefined2 *)((int)puVar18 + 0x36)` — record `+0x36`을 **u16**으로 읽음.
  정렬 검증: 동일 패턴의 인접 read(`+0x2e`→local_2c[0x14], `+0x32`→[0x16], `+0x56`→[0x28], `+0x66`→[0x30])는 전부 정합. 0x36만 갭.
- **불일치**: 서버 offset 0x36 **미기록**(info-records-static.mjs:308-313, U16_SLOTS 0x34→0x40) vs 클라 기대 offset 0x36 u16(FUN_004ba2b0 VA 0x4ba2b0, `local_2c[0x18]=*(u16*)((int)puVar18+0x36)`).
- **영향**: 레코드 버퍼 0-init이라 클라가 0x36을 **항상 0**으로 읽음. 다른 필드 정렬은 정확히 유지 → 오필드 침범 아님.
  의미있는 스탯이면 항상 0 표시되는 누락. **영향 LOW(benign, 정렬 무손상). 단 스탯 의미 누락 가능.**
- **수정안**: `U16_SLOTS`에 `0x36` 추가(0x37 단일바이트 read 및 0x6e/0x72/0x73/0x76/0x77/0x7a/0x7e 단일바이트 read도 함께 RE 확인 후 채울지 결정). 스탯 의미는 MEDIUM 신뢰(소스 주석 line306)이나 offset/type 갭은 정확.

### 버그 #4 — 0x0426 sinkByte (offset 0x18) 미작성

- **서버 offset/타입**: `buildNotifyAttackedShipInner`(`logh7-login-protocol.mjs:1219-1239`)가
  offset `0,4,8,12,16,18,20,22`만 기록(line1230-1237) → offset **0x18(24) 미작성**. 버퍼는 zero-fill.
  `NOTIFY_ATTACKED_SHIP_BYTES=0x1c=28`(line1202)이라 byte 24는 존재하지만 0.
- **클라 기대 offset/타입**: `FUN_004c0df0` line87 (VA 0x4c0df0)가 데미지 분기 안에서 무조건 실행 —
  `*(u8*)(iVar4+0x954) = *(u8*)(param_2+0x18)`. 와이어 byte 24를 타겟 함선 엔티티 `+0x954`에 항상 복사.
  디스패처 `FUN_004ba2b0` case 0x426이 정확히 7 dword(28B)를 `&DAT_004332b4`로 복사 후 호출하므로
  byte 24는 **진짜 전달된 와이어 데이터**(버퍼 garbage 아님).
- **불일치**: 서버 offset 0x18 **미작성**(login-protocol.mjs:1230-1237, off 22까지만) vs 클라 기대 offset 0x18 u8(FUN_004c0df0 VA 0x4c0df0 line87, `*(u8*)(iVar4+0x954)=*(u8*)(param_2+0x18)`).
- **+0x954 실재성**: 형제 notify 핸들러 `FUN_004c0bc0`(param_2+8), `FUN_004c0c80`(param_2+0x16), `FUN_004c32a0`이 동일 필드에 기록하고,
  `FUN_004f0260`이 `(float)*(byte*)(iVar5+0x954)/(float)*(byte*)(+0x955)` 비율(게이지/피탄상태)로 읽음 → 실제 소비 필드.
- **영향**: 서버가 broadcast하는 **모든 0x0426 피탄마다** 클라가 타겟 `+0x954` 게이지를 0으로 강제.
  핵심 격침 판정은 armorDamage==-1(off 0x10) 경로로 정상 처리되므로 격침 자체는 OK. +0x954는 보조 상태 마커(추정).
  서버 주석(line1213-1215)도 0x18을 누락 → 구현 시 빠진 필드. **영향 LOW~MED(시각 보조 마커/게이지 한정).**
- **수정안**: `buildNotifyAttackedShipInner`에 의도된 u8(sinkByte/hit-state) 인자 추가 + `p.writeUInt8(sinkByte & 0xff, 0x18)` 기록.
  주석(line1213-1215)에 0x18 필드 추가.

---

## (c) 추가 라이브 검증 필요 항목

확정 불일치는 정적 RE로 byte-correct하나, 다음은 실클라 라이브 측정으로 영향/의미를 확정해야 한다.

1. **버그 #2 (0x0325 tail +0x42/+0x44/+0x4c/+0x50) 소비 여부**
   렌더 소비처 `FUN_004c32a0`이 이 tail 슬롯을 실제로 읽어 화면에 반영하는지 라이브 trace로 확인.
   안 읽으면 현상 무해(주석만 정정), 읽으면 서버 투영 추가 필요.

2. **버그 #1 (0x0325 mapSection u16→u32)**
   mapSection 값이 65536 이상이 될 수 있는 시나리오가 있는지(맵 섹션 ID 범위) 확인. 현재 범위 내면 무손상, 초과 가능하면 우선 수정.

3. **버그 #3 (0x030b 0x36 슬롯) 스탯 의미**
   0x36 u16이 어떤 함선 스탯인지(클라 `local_2c[0x18]` 소비처 RE) + 항상 0이 화면에 보이는지 라이브 확인.
   동반: 0x37/0x6e/0x72/0x73/0x76/0x77/0x7a/0x7e 단일바이트 read의 서버 미기록 여부도 함께 점검.

4. **버그 #4 (0x0426 +0x954 게이지)**
   피탄 시 타겟 함선의 피탄상태 마커/게이지가 0으로 리셋되어 시각 표현이 무력화되는지 라이브 전투에서 확인.
   `FUN_004f0260`의 +0x954/+0x955 비율이 무엇을 그리는지(데미지 게이지 추정) 확정.

5. **0x0325 commander/faction 값 의미 (색분기, value=P3)**
   layout(offset/폭)은 정합이나 value는 P3 재구성. 멀티에서 같은 unitId/charId 중복 시 아/적 오분 가능.
   `unitId=worldUnitId()+connectionId` distinct가 라이브에서 색분기를 정확히 구동하는지 4클라 E2E로 검증.

6. **0x031f @deprecated 빌더 잔존**
   `buildInformationBaseInner`(`logh7-info-records.mjs:216`)는 고정 오프셋 LE 와이어라 클라 packed-stream 파서와
   모델 자체 불일치 → emit 시 record 붕괴. 라이브 경로는 canonical을 쓰므로 와이어에 안 나가나, 테스트/실수 호출 방지 위해 제거 또는 throw 가드 검토.
