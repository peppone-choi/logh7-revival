# 캐논 NPC 위계 시드 정제 (2026-06-26)

로드맵 즉시-다음: 캐논 NPC 위계 시드의 ①rank 클램프 ②캐논명 unmask(매뉴얼 문서화 인물 한정)를 구현했다.
시드 경로는 `LOGH_SEED_CANON_NPCS=1` 월드 진입(0x0f02) 시 플레이어 외 캐논 인물을 권위적 0x0323 레코드로 채우는
`server/src/server/logh7-login-session.mjs`의 시드 블록(약 1540행)이다.

## 변경 요약

### 1. rank 클램프 (유효 사다리 1..14)
- `logh7-login-session.mjs`: `clampRankId`를 `logh7-rank-table.mjs`에서 import.
- 새 헬퍼 `clampedNpcRank(npc)`: `npc.wireRank`(콘텐츠팩이 `rank_ja`→id 해석) 우선, 미해석이면 `characterRankId(npc)`
  폴백, 그다음 `clampRankId`로 1..14(RANK_MAX)로 클램프. 0/음수/미설정은 0(계급 없음) 유지.
- 시드 emission의 `rank:` 필드를 unclamped `npc.wireRank`에서 `clampedNpcRank(npc)`로 교체.
- 효과: 사다리 밖 계급값이 와이어 rank 필드(@0xd6)에 새어 HUD가 빈/엉뚱 계급을 그리는 것을 방지.

### 2. 캐논명 unmask (매뉴얼 문서화 인물 한정, P0 승격 게이트)
- `logh7-content-adapter.mjs`: `loadCanonPostsByName`가 `manualDocumented`(sources에 `manual-roster.json` 포함
  = 매뉴얼 직접 문서화 인물)를 post 레코드에 부여. `namedCharacters`에 `manualDocumented` 전파.
- `logh7-content-pack.mjs`: `normCharacters`가 `manualDocumented` 플래그를 보존.
- `logh7-login-session.mjs`: 새 헬퍼 `npcSeedDisplayName(npc)` — `manualDocumented===true`인 인물만
  `characterDisplayName(npc)`(캐논명)을 노출하고, 그 외(DB 추측명 포함)는 익명 마스크 `Character N`로 폴백.
- 시드 emission의 `lastname`/`displayName`을 `characterDisplayName(npc)??Character N`에서 `npcSeedDisplayName(npc)`로 교체.
- 효과: 매뉴얼 문서화 인물(canon-character-posts.json 中 manual-roster 출처 70명)만 캐논명을 권위적으로 노출.
  추측 데이터는 와이어 이름 필드에 새지 않음 (추측명 P0 승격 금지 원칙 준수).

소스 권위: `server/content/manual/canon-initial-cards.json`(_grade P1, _uncertain 플래그)·
`server/content/roster/canon-character-posts.json`(sources 배열). 추측명 P0 승격 없음.

## 변경 파일
- `server/src/server/logh7-login-session.mjs` — import + 헬퍼 2개 + emission 2필드
- `server/src/server/logh7-content-adapter.mjs` — manualDocumented 부여/전파
- `server/src/server/logh7-content-pack.mjs` — manualDocumented 보존
- `server/tests/server/logh7-login-session.test.mjs` — 회귀 가드 테스트 1개

## 검증
`cd server && node --test tests/server/*.test.mjs`
- 변경 전: 1147 tests / 1129 pass / 0 fail / 18 skip
- 변경 후: 1148 tests / 1130 pass / 0 fail / 18 skip (회귀 0, 신규 가드 +1)

신규 테스트 "캐논 NPC 시드 정제": wireRank=99→14 클램프, wireRank=0→0 유지, 매뉴얼 문서화 인물 캐논명 노출,
비문서화 인물 익명 마스크('Character N', 13유닛 캡), 추측명 비노출, 0x0323 레코드 바이트 길이 불변.

## 회귀 위험
- 낮음. 와이어 레이아웃 무변경(레코드 고정 길이 0x02d4 유지). 시드 경로는 `LOGH_SEED_CANON_NPCS=1` opt-in.
- `manualDocumented`는 신규 필드(기존 콘텐츠팩 데이터 무영향, 미지정 시 false). 기본 OFF 시드라 일반 세션 무영향.
- 기존 NPC 시드 테스트는 이름을 검증하지 않아 마스킹 변경에도 그린 유지.
