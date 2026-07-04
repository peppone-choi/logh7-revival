# 진영(faction) 함대색 서버 투영 — 2026-06-26

완성도 매트릭스 "faction 50%: 소비처 바이트확정, 서버 listFleets 투영 미배선" 갭을 닫는다.
RE-확정 필드만 투영(0x0323 power @0x04). 0x34f CardCharacter 빌더 금지(메모리). 추측 데이터 P0 승격 없음.

## 1. 색결정 바이트 (RE 재확인, redex 2026-06-26)

섹터맵 유닛 렌더러 **FUN_004ef0d0** (`.omo/ghidra/export/G7MTClient`)가 함대 마커의 아/적 색을 결정한다.
색은 **0x0325 함대의 faction/owner 필드가 아니라** 함대 사령관 캐릭터의 표시테이블(char-table) 엔트리
**바이트 +0xa·+0xb** 비교로 정해진다:

```c
iVar8  = FUN_004b5b80();                              // 로컬 플레이어 char id
iVar9  = FUN_004c7fc0(table, iVar8, 1);              // 로컬 플레이어 char-table 엔트리
iVar10 = FUN_004c7cd0(table, *(param_2 + 4), 1, ...);// 이 유닛 사령관(param_2+4=commander id)의 엔트리
if (iVar10 == 0) return;                              // ★사령관 엔트리 없으면 마커 자체를 안 그린다
if (iVar9[+0xa] != iVar10[+0xa] || iVar9[+0xb] != iVar10[+0xb])
     flag |= 0x1000;   // ENEMY 색  (line 212–215)
else flag |= 0x800;    // FRIENDLY 색 (line 221)
```

- char-table = `clientBase + 4 + i*0x9ec` (FUN_004c7cd0 param_3==1 분기; id @element+4, 600 cap).
- 엔트리 +0xa/+0xb는 dispatcher case 0x323이 **0x0323 캐릭터 레코드**를 테이블에 적재할 때 채운다.
  권위 출처 = 0x0323 레코드 **power 바이트 @0x04**(陣営/faction). 메모리 확정과 일치
  (0x0325 commander id → char_table 0x0323 power → +0xa/+0xb 동등성 = 색).
- 함의: ① 0x0325 함대를 push할 때 그 **사령관 0x0323 레코드도 같이 push**해야 마커가 그려진다(없으면
  iVar10==0). ② 각 함대 사령관 power가 진영별 distinct(제국=1·동맹=2)해야 아/적 색이 갈린다.

## 2. 투영 배선 위치

- **신규 순수 모듈** `server/src/server/logh7-faction-projection.mjs`
  - `factionPowerByte(faction)` — 진영 키/바이트 → 클라 power 바이트(제국=1·동맹=2·그 외=3).
  - `fleetCommanderPowerByte(fleet, worldState)` — 사령관 캐릭터(getCharacter) 진영 우선, 함대 faction 폴백.
  - `projectFleetCommanderRecords(fleets, worldState, displayNameOf?)` — push되는 함대 목록의 distinct
    사령관마다 0x0323 레코드 입력 합성(characterId=commander, gridUnitId=fleet.id, power=색결정 출처).
- **배선** `server/src/server/logh7-auth-server.mjs` `syncMultiplayerFleets`:
  - (a') joiner 함대 broadcast 직후 그 사령관 0x0323 레코드를 기존 전원에 broadcast.
  - (b') 기존 함대를 joiner에 push할 때 사령관 0x0323 레코드를 **0x0325보다 먼저** 동반 push(마커 그릴 때
    char-table에 사령관 엔트리가 이미 있게).
  - 기존 MP 가시성 게이트(LOGH_MP_VISIBILITY) 그대로 — OFF면 호출 안 됨 → 단일클라/기존 경로 무변경.
  - `buildInformationCharacterRecordInner`는 power를 payload @0x04에 기록(검증됨).

## 3. 오라클

`server/tests/server/logh7-faction-projection.test.mjs` (5 tests):
- factionPowerByte 정규화(제국=1·동맹=2·중립/페잔=3).
- fleetCommanderPowerByte: 사령관 진영 권위 + 함대 faction 폴백 + 중립.
- ★**아군(제국) vs 적군(동맹) 함대 사령관이 distinct 색결정 바이트(0x0323 power @0x04)** —
  empirePower(1) ≠ alliancePower(2); 같은 진영 2함대는 동일 바이트.
- 투영 레코드 gridUnitId=fleet.id(0x0323[9] grid-unit 바인딩 보존).
- 중복/미등록 사령관은 distinct id만 1회 투영(중복 push 방지).

## 4. 테스트 결과

- 신규 오라클 5/5 PASS.
- `logh7-mp-fleet-visibility.test.mjs` 6/6 PASS(무회귀).
- 전체: `cd server && node --test tests/server/*.test.mjs` → **1140 pass / 0 fail / 18 skip**
  (이전 1132 pass 그대로 + 신규 5 오라클; auth-server import OK).

## 5. 라이브 대기

라이브 색 렌더는 **함대 가시화(own-fleet 스프라이트 case0 1회성 타이밍 + own_cell +0x11178)** 선결이라
후속([[logh7-fleet-render-rootcause-2026-06-20]]). 사령관 엔트리가 char-table에 적재되는지(iVar10!=0)와
+0xa/+0xb 분기를 ui_explorer trace로 측정해 distinct 색 렌더를 확정해야 한다(2클라 이상 in-world 전제).
