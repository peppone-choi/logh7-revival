# 전술 배틀필드 완전 시드 데이터 (2026-06-26)

라이브 확정: `LOGH_BATTLE_ENTRY_PROBE` arm은 되나 전술맵이 시각 전환 안 됨(전술 데이터 불완전).
이 작업은 서버가 전술 진입 시 **완전 시드**(양진영 함선 좌표·6방향 실드/빔건·함장 로스터·engage 플래그)를
푸시하도록 보강한다. RE-확정 레이아웃만 사용, 추측 P0 없음, off-default 게이트 유지.

## 1. 전술 진입 시퀀스 (RE) + 현황

- 클라 소비처: `openBattleField()`(server/src/server/logh7-battle-engine.mjs)가 emit하는 11-레코드
  순서 = 0x0349 위치 → 0x033b UnitShip → 0x0341 FillShield → 0x0343 FillBeamGun → 0x0337 Character
  로스터 → (corps/base/obstacle 선택) → 0x042f NotifyChangeMode(spawn pose + 전술 풀 활성) →
  0x0f1f NotifyTactics("begin space-war", 마지막).
- ★0x0f1f 소비처 `FUN_004c1b20(param_1, param_2)` (redex 확인): `*param_2 == '\x01'`일 때만
  전술 engage 분기(`+0x357e8c = 2`). arg0 byte0 != 1이면 strategic-return(else) 분기(`= 0`)라
  전술 풀이 켜지지 않는다. **= 시각 전환 stall의 RE-확정 직접 원인.**
- 기존 probe 결함(login-session): participants에 좌표·사기·함장만 넣고 6방향 실드 배열
  (shieldMax/shieldFill)·빔건 뱅크(beamgunA/fillA/beamgunB/fillB)를 **드롭** → 0x0341/0x0343이
  전부 0. 0x0337 로스터·`tacticsArg0`도 미전달(0x0f1f arg0=0 = engage 안 됨).
- 서버 전술 진입 현황: `battle-engine`(빌더·orchestration·종결)·`battle-ops` 완비. 진입 게이트는
  `login-session.mjs` `battleEntryProbeEnabled()`(deferredBattleInners, 전략맵 렌더 후 지연 푸시).

## 2. 시드 데이터 보강 (★server/ 캐논)

- 신규 순수 함수 `buildBattleEntryParticipants(worldState, { unitId, character, cap, center, scale })`
  (logh7-battle-engine.mjs): authoritative world-state ship(upsertShip가 채운 RE-확정 와이어 필드
  shieldMax/shieldFill/beamgunA/fillA/beamgunB/fillB)을 **완전** participant로 확장.
  자기 유닛이 항상 첫(anchor). world x/z를 ×scale + center 오프셋으로 전술 float 공간에 흩뿌림.
  반환 `{ participants, characters }` — characters=참가 함선 함장 id 로스터(0 제외, 중복 제거, 0x0337용).
- login-session 배선: 기존 인라인 placeholder 시드 제거 → 이 helper 사용 + `openBattleField`에
  `characters`(0x0337 비-제로)·`tacticsArg0: 1`(0x0f1f engage byte) 전달.
- 추측 P0 없음: 모든 필드는 upsertShip가 클래스 스탯에서 산출한 0x033b/0x0341/0x0343 와이어 필드뿐.

## 3. 오라클 (테스트)

- battle-engine 신규 7 테스트(GAP B): anchor-first / own-unit-absent / 실드·빔건 비-제로 /
  cap 경계 / destroyed 제외 / null world-state / full-seq(0x0337 로스터 present + 0x0f1f arg0 byte0=1, 마지막).
- login-session 테스트 갱신: deferred 코드 = `[0x0349,0x033b,0x0341,0x0343,0x0337,0x042f,0x0f1f]`,
  0x0337 로스터 ≥1 commander, 0x0f1f arg0 byte0 == 1 단언 추가.

## 4. 테스트 (직렬 권위)

`cd server && node --test tests/server/*.test.mjs` → **tests 1187 / pass 1169 / fail 0 / skipped 18**
(이전 baseline 대비 +7 신규, 무회귀).

## 5. 라이브 검증 대기

off-default 게이트 유지(`LOGH_BATTLE_ENTRY_PROBE=1` opt-in). 라이브: 완전 시드(실드/빔건 비-제로 +
0x0337 로스터 + 0x0f1f arg0=1)가 전술 풀을 실제 시각 전환시키는지 ui_explorer로 측정 필요
(배경 전략맵 유지 → 전술 렌더 전환 관찰). deferredBattleDelayMs 튜닝(전략 렌더 후 푸시)도 라이브 후속.
