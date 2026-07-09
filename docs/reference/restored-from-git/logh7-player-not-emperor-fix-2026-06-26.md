# 플레이어가 "황제"로 뜨는 버그 — 진단 + 픽스 플랜 (2026-06-26)

## 증상 (사용자 라이브)
게임시작→기존(dummy) 캐릭→월드 진입 시 **플레이어 이름/직위가 "황제"**. 캐논 요구([[logh7-real-game-behavior]]) "자동황제 금지, 플레이어=하급사관" 위반. 사용자: "억지로 만든 캐릭터인데 왜 여기로 연결되지?"

## 근본 원인 (서버 코드 확정)
- `activeCharacterId()` (login-session.mjs:778) = `chargedCharacterId || generatedCharacterId || accountIdentity()?.char || **worldCharId()**`.
- `worldCharId()` (:117) = `LOGH_WORLD_CHAR_ID ?? **1**` (기본 1).
- 게임시작/dummy 경로엔 **진짜 생성 캐릭(generatedCharacterId=nextCharId)이 없어** worldCharId()=**1**로 폴백.
- **char id 1 = 캐논 로스터 최상위 제국 인물** = `seedableCanonNpcs`의 sovereign 스탬프 대상("황제", :1006-1010).
- 플레이어 0x0323 레코드(:1515 `charId=activeCharacterId()` → `activeCharacterRecord(1)` = `contentPack.characterById(1)`) = **그 sovereign 데이터(고계급/황제급)**를 그대로 입음.
- `seedableCanonNpcs(excludeCharId=1)`이 플레이어 id를 NPC에서 제외 → 황제 NPC가 시드에서 빠지고 플레이어가 그 자리를 차지.

→ 즉 "황제"는 **real-login 신규 캐릭 생성(하급사관, nextCharId=max+1, rank 클램프 :970-982)이 다이얼로그 버그(깊은 프런티어)로 막혀** forced/폴백 char(worldCharId=1=sovereign)를 쓴 하류 증상.

## 픽스 플랜 (no-live, 테스트 필요)
**목표**: no-real-char 폴백 시 플레이어를 **캐논 NPC id와 충돌 안 하는 합성 하급사관**으로. worldCharId(그리드/유닛 기본)와 **플레이어 char-identity 폴백을 분리**.

1. **합성 폴백 player char**: 캐논 로스터 최대 id 초과의 비-캐논 id(예: maxCanonId+1 또는 고정 0x7000)에 하급사관 레코드 합성: {id, name(예 '신임 사관'/placeholder), faction(부트스트랩 power→empire 기본), rank=하급(소위급), title=0(작위없음), face=G-군 기본(플레이어용, O-군 캐논 아님)}.
2. `activeCharacterId()` 폴백을 worldCharId() → fallbackPlayerCharId()(합성 id)로 교체. **단 grid/unit 기본(worldCharId 다수 사용처 :1640/2044/2076…)은 불변**(분리).
3. `activeCharacterRecord(fallbackId)` = 합성 레코드 반환(contentPack에 없으므로 합성 객체 주입).
4. seedableCanonNpcs(excludeCharId=fallbackId): 합성 id는 캐논 로스터에 없으므로 sovereign(황제) NPC가 **시드에 정상 포함** → 황제는 NPC로, 플레이어는 별개 하급사관.
5. **회귀 가드**: LOGH_WORLD_CHAR_ID 명시 시는 기존 동작 유지(기존 테스트 보호). 신규 오라클: "no-real-char 폴백 플레이어는 캐논 sovereign이 아닌 합성 하급사관(rank>=하급, id 비-캐논)".
6. `cd server && node --test tests/server/*.test.mjs` 그린 유지(현재 ~1180).

**주의**: worldCharId=1은 grid/unit/base 기본으로 다수 배선됨 — 플레이어 char-identity만 분리하고 그리드 기본은 건드리지 말 것(640트랩급 광역 회귀 위험).

## 궁극 해법
real-login→신규 캐릭 생성→월드(다이얼로그 버그 선결=깊은 프런티어)가 작동하면 generatedCharacterId가 채워져 폴백 자체가 안 쓰임 = 캐논대로 하급사관. 이 폴백 픽스는 그때까지의 **테스트 경로 정합 + 안전망**.

## 상태 — ★구현+테스트 완료 (2026-06-26)
**최종 채택 = 안전 최소 픽스**(id 불변, 표시 레코드만 교체. 광역 worldCharId 변경 회피):
- 신규 헬퍼(login-session.mjs ~986): `hasRealPlayerChar()`(charged/generated/account/명시 LOGH_WORLD_CHAR_ID 중 하나라도 있으면 true), `synthFallbackPlayer(id)`(합성 하급사관: empire·rank initialCharacterRankId(1)·title 0·abilities seeded·STAMINA_FULL·name '신임 사관'), `playerRecord(id)`.
- **playerRecord = real-char면 실레코드 / 폴백이면 activeCharacterRecord가 캐논레코드 반환할 때만(=contentPack 로드→sovereign 위험) 합성 하급사관, null(contentPack 미로드)이면 placeholder 보존.** 후자 단서가 "Character N" 중립 placeholder 테스트(황제 아님)를 깨지 않게 함.
- 적용 지점: seedPlayerCharacter(1180), 0x0f02 플레이어 0x0323(1563), begin↔end 재전송(1756). (worldPlayerInfo 2530=power/faction MP용, 표시 무관·empire 동일 → 불변.)
- **검증: `node --test tests/server/*.test.mjs` = 1202 tests / 1184 pass / 0 fail / 18 skip**(회귀 0). 1차 시도는 합성이 contentPack-미로드 placeholder까지 바꿔 1건 실패 → null-보존 로직으로 정정 후 그린.
- 라이브 확인: 다음 월드진입(real-login/깊은프런티어 작업) 시 플레이어가 황제 아닌 하급사관으로 표시되는지 육안 확정.
- **궁극**: real-login→신규생성→월드(다이얼로그 깊은프런티어)가 뚫리면 generatedCharacterId가 채워져 폴백 자체가 안 쓰임.
