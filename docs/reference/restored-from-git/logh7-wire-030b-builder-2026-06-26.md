# 0x030b ResponseStaticInformationUnitShip 와이어 빌더 — 검증 (2026-06-26)

## 결론: 빌더는 이미 존재·바이트정확·오라클 테스트 완비

완성도 매트릭스의 "0x030b만 빌더 부재"는 **stale**. `buildStaticInformationUnitShipInner`
(server/src/server/logh7-info-records-static.mjs:276)가 이미 구현돼 있고, content/ship-stats.json
실데이터로 시드(`seedShipClasses`/`buildUnitShip`)되며, tests/server/logh7-info-records-static.test.mjs:151
에 오라클 테스트(바디크기·count·stride·kind·name·floats·named stats)가 있다. 본 작업은 이 구현을
클라 파서로부터 **독립 RE 재디코드**해 교차검증한 것.

## 클라 파서 RE (FUN_004ba2b0 case 0x30b)

- 디스패처 store: `FUN_004ba2b0` case 0x30b → 문자열 `ResponseStaticInformationUnitShip`.
- **count**: 고정 `local_20 = 0xc8` = **200 레코드** (count u8 @body+0x00, +3 pad → 첫 레코드 @byte 4).
- **stride**: `puVar18 += 0x23` (puVar18=`undefined4*` → 0x23*4 = **0x8c = 140바이트**/레코드).
- **바디 크기**: 4 + 200×140 = **28004 = 0x6d64** (RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES와 일치).
- 프레이밍: conn3 message32, `buildLobbyResponseInner(0x030b, 0x6d64)`, body=inner.subarray(6), LE.

### 레코드 레이아웃 (필드:오프셋, 레코드 베이스 R 기준; 독립 재디코드 = 기존 빌더 일치)

| 오프셋 | 폭 | 의미 | 등급 |
|---|---|---|---|
| R+0x00 | u16 | kind (함선클래스 id) | P1 |
| R+0x02 / R+0x03 | u8 / u8 | b02 / b03 | P2 |
| R+0x04 | u16 | w04 | P2 |
| R+0x08 | u8 | name 길이 (>13이면 클라 bail) | P1 |
| R+0x0a | u16[≤13] | name 와이드문자 (loop1=0xd) | P1 |
| R+0x24 | u16 | 스탯 | P2 |
| R+0x28 | u32 | d28 (유일 u32 스탯) | P2 |
| R+0x2c,2e,30,32,34,36 | u16×6 | 스탯 | P2 |
| R+0x38 | f32 | speed(추정) | P2 |
| R+0x3c | f32 | f3c | P2 |
| R+0x40..0x54 | u16[11] | 스탯 (loop2=0xb) | P2 |
| R+0x56,58 | u16×2 | 스탯 | P2 |
| R+0x5c / 0x60 | f32 / f32 | f5c / f60 | P2 |
| R+0x64,66,68,6a,6c | u16×5 | 스탯 | P2 |
| R+0x6e / 0x72 | u8 | 플래그 | P2 |
| R+0x70 | u16 | 스탯 | P2 |
| R+0x78..0x8a | u16 | 스탯 (0x78,7c,80,82,84,86,88,8a) | P2 |

재디코드한 모든 스칼라 read 오프셋·폭이 기존 빌더의 `U16_SLOTS`/float/u32 슬롯과 일치.
이름은 src byte 0x0a부터 13 u16(loop1), 두 번째 memcpy(loop2)는 0x40–0x55의 u16[11] stat 블록.

## 빌더 위치 / 소스데이터

- 빌더: `server/src/server/logh7-info-records-static.mjs:276` `buildStaticInformationUnitShipInner`.
- 시드/프로젝터: 동 파일 `createInfoRecordsStaticState()` (line ~718) → `shipStatToUnitShip` (line 686),
  `buildUnitShip()` (line 747).
- 소스데이터: `server/content/ship-stats.json` (gin7 매뉴얼 艦艇ユニット 실수치; tools/logh7_ship_stats.py
  파생). armor/shield는 매뉴얼 OCR 손상 시 null 유지(추측 금지 = P0 승격 안 함, 등급 정직).

## 테스트 결과

`cd server && node --test tests/server/*.test.mjs` → **1150 tests / 1132 pass / 0 fail / 18 skip**
(보고 baseline 무회귀). 0x030b 오라클(바디 0x6d64·count u8·stride 0x8c·kind/name/floats/named stats·
count 200 캡·코드 0x030b·state.buildUnitShip 프로젝션)이 그린 스위트에 포함.

## 잔여 (미확정 필드)

- R+0x06 (u16): 클라 파서가 byte 6-7을 읽지 않음(u32@0=byte0-3, u16@4=byte4-5만). 기존 빌더가
  `w06@6`을 쓰지만 **파서 무시 = zero-pad 영역**이라 무해. 의미 미확정.
- post-w04 스탯 슬롯의 **의미**는 MEDIUM(P2): 오프셋·타입은 RE 확정, 매핑(armorFront/shield/beam…)은
  static dump 필드명(docs/logh7-proto-tactics-data.md §13) 기반 추정. 추측 데이터를 P0로 승격하지 않음.
- speed=f32@0x38, f3c/f5c/f60 float 의미 추정(P2).
