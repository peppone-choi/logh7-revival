# 0x0325 ResponseInformationUnit — officer 필드 서버배선 (2026-06-26)

## 결론 요약
- **"756B 레이아웃"은 오기**다. 이중 파서(binary `FUN_00419ca0`, text `FUN_00419fd0`)가 walk하는
  per-unit element stride는 **0x58 = 88바이트**다(텍스트 파서 `puVar12 += 0x2c` ushort = 0x58바이트,
  바이너리 파서 `param_1 += 0x16` ushort = 0x58바이트). 레코드 전체 와이어 크기는 `SS_RESP_INFO_UNIT_BYTES`
  = 0xce44(52804)이고 그건 `[u16 count][element×600]` 고정 버퍼다. 756과는 무관(아마 다른 레코드/총합 혼동).
- **officer 필드 = troop_units 배열**(함대 배속 사관/하위유닛 ids). 별도 "officer" 슬롯은 export에
  심볼화되어 있지 않고, RE-확정된 사관/배속유닛 채널은 boats(troop_units) 뿐이다. 사령관은 commander 슬롯.

## 0x58(88B) element 레이아웃 (element base B = payload+4, 이중 파서 확정 — P0 WIRE)
텍스트 파서 puVar12(ushort*) 오프셋 → 바이트(=ushort*2 + 4, puVar12 = B+4) 환산으로 전수 확정:

| byte off | type   | 필드 | 파서 증거 |
|----------|--------|------|-----------|
| B+0x00 | u32   | id (앵커, char+0x24 그리드-유닛 id) | `*(u32*)(puVar12-2)` |
| B+0x04 | u16   | faction/state | `*puVar12` |
| B+0x06 | u8    | name region | `*(u8*)(puVar12+1)` |
| B+0x08 | u32   | **commander** (사령관) | `*(u32*)(puVar12+2)` |
| B+0x0c | u32   | cell (row*100+col) | `*(u32*)(puVar12+4)` |
| B+0x10 | u32   | owner | `*(u32*)(puVar12+6)` |
| **B+0x14** | **u8** | **officer(troop_units) count, cap 10** | `*(u8*)(puVar12+8)`; 클라 reject "> 10" |
| **B+0x18** | **u32[]** | **officer(troop_units) id 배열, stride 4** | `param_1+(iStack_158+j)*2`, iStack_158=7 |
| B+0x40 | u32   | spotResolverBase (FUN_004c2c80→strategyManager+0x358) | `*(u32*)(puVar12+0x1e)` |
| B+0x44 | u8    | tail field (미확정) | `*(u8*)(puVar12+0x20)` |
| B+0x45 | u8    | tail field (미확정) | `*(u8*)((int)puVar12+0x41)` |
| B+0x46 | u16   | tail field (미확정) | `puVar12[0x21]` |
| B+0x48 | u16   | mapSection candidate | `puVar12[0x22]` |
| B+0x4c | u32   | numeric tail (미확정) | `*(u32*)(puVar12+0x24)` |
| B+0x50 | u32   | numeric tail (미확정) | `*(u32*)(puVar12+0x26)` |
| B+0x54 | float | numeric tail (미확정) | `*(float*)(puVar12+0x28)` |

officer 배열 영역: B+0x18 .. B+0x18+10*4 = B+0x40 직전까지(10슬롯 × u32). boats count가 B+0x14에서 cap 10.

## 배선 위치 (server/ 캐논)
- **빌더는 이미 완비**: `server/src/server/logh7-login-protocol.mjs` `buildInformationUnitRecordInner`
  → `UNIT_ELEM.BOATS_COUNT(0x14)`/`BOATS_ARRAY(0x18)`/`COMMANDER(0x08)` 기존 byte-exact(테스트 통과).
- **추가한 서버배선**: `server/src/server/logh7-login-session.mjs` `localFleetRecord` 위에
  `fleetOfficerProjection(unitId)` 신설 — worldState 함대 엔티티(`worldState.getFleet(unitId)`)가 있으면
  실제 `boats`(배속 사관 ids, >0 필터·cap 10)와 `commander`(>0)를 0x0325 레코드 필드로 투영한다.
  엔티티가 없거나 사관/사령관이 비면 `boats=[]`·`commander=characterId`(기본) — **P3 날조 금지**.
- 우선순위: `LOGH_PLAYER_FOCUS_CELL` 게이트 > worldState 사령관 > 기본 characterId.
- `worldState.upsertFleet`는 이미 `boats`를 받는다(world-state.mjs:570). 단 월드진입 시드(`seedPlayerCharacter`)
  는 캐논 officer 출처가 없어(initial-deployment.json에 함대별 사관 명부 없음) boats를 넘기지 않는다(무날조).

## 오라클 (server/tests/server/logh7-login-session.test.mjs, 신규 2건)
- `0x0325 officer 배선: worldState 함대의 boats+commander를 unit 레코드에 투영` —
  `upsertFleet({id:4660, commander:909, boats:[101,102,103]})` 후 0x0f02 → 와이어 검증:
  B+0x08=909(commander), B+0x14=3(officer count), B+0x18/0x1c/0x20=101/102/103(officer ids), B+0x00=4660(id).
- `0x0325 officer 배선: worldState 함대 엔티티가 없으면 officer 필드를 날조하지 않는다` —
  worldState 미주입 시 B+0x14=0, B+0x18=0(빈 배열, P3 무날조).
- 기존 빌더 오라클(B+0x14 count / B+0x18 array / stride 0x58 / cap 10 / 빈 element=무날조)도 그대로 그린.

## 테스트 결과
- `node --test tests/server/*.test.mjs` → **tests 1172 / pass 1154 / fail 0 / skip 18** (이전 1158/1140/0/18
  대비 신규 테스트 +14 전부 그린, 무회귀). off-default 게이트 불변(LOGH_FULL_UNIT_LOCATION 미설정 시 미투영).

## 잔여 미확정 필드 (P3, 추가 RE 필요)
- B+0x44(u8)/B+0x45(u8)/B+0x46(u16)/B+0x4c(u32)/B+0x50(u32)/B+0x54(float): 파서가 읽지만 export에
  값-의미 심볼 없음(서버측 dump 직렬화기 미컴파일). spotResolverBase(0x40)·mapSection(0x48)만 소비처 핀.
- 캐논 officer 명부: initial-deployment.json은 함대 system/planet만 — 함대별 배속 사관 ids 출처 부재.
  현 배선은 런타임 worldState 엔티티(gameplay/upsertFleet)가 boats를 채울 때만 투영(데이터 게이팅).
