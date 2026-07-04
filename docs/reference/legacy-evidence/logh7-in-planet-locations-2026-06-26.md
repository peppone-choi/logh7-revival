# 행성 내 장소(施設内場所) — 데이터·0x031f/0x0321 투영 현황 (2026-06-26)

목표(사용자): 행성 내 장소(시설·집무실·拠点)를 server 캐논에서 0x031f(base economy)·0x0321(institution)에
올바르게 투영·배선. RE-확정/캐논 근거만, 추측 P0 금지.

## 결론 요약
행성 내 장소 파이프라인은 **이미 완전 구현·배선·테스트되어 있다.** 이 세션의 작업은 현황 확인 + 무회귀 검증.
신규 P0 추측 없음(스칼라 이름 오프셋 PROVISIONAL이라 의도적으로 미투영).

## 1. 장소 데이터 (캐논 소스)
- **시설(institution) 30종** — `content/extracted/all-names.json` `institutions[]`
  (출처: `content/manual/org-posts.json` + `content/roster/manual-roster.json` postDefinitions).
  예: 皇宮·内閣·駐フェザーン弁務官事務所·軍務省·統帥本部.
- **장소/집무실(room/spot) 80종** — `content/client/schema.json` `facilities[]` 중 room 정규식 매칭
  (執務室/会議室/居室/広場/公園/宇宙港/酒場/教室/拘禁室 등).
  예: 皇帝執務室·幕僚総監執務室·帝国宰相執務室·国務尚書執務室·会議室·士官クラブ.
- 정규화: `logh7-inferred-content.mjs buildInferredCatalogs()` → `contentPack.institutions` / `contentPack.rooms`
  (각 항목 `{id, name, nameCatalogId}`; nameCatalogId = constmsg.dat 카탈로그 ID로 해석).

## 2. 0x031f / 0x0321 투영 (RE-확정 오프셋, P0 레이아웃 / P3 값)
- **0x031f ResponseInformationBase** (dispatcher case 799, 고정 0x604B, parser FUN_00414c70 / world-import
  FUN_004c32a0): `codec/base-record.mjs buildResponseInformationBaseInner`. 투영=`baseRecordForBuilder` →
  `informationBaseSeed`. elem+0x00 id, **elem+0x04 owner 바이트=支配陣営**(2=동맹/3=제국, RE-확정),
  elem+0x175 class_(0성계/1요새/2행성/3기지). 경제 배열(transport/outfit/budget/budgeting/commodity, 5개
  HIGH P0 슬롯)은 `economyBaseRecord`가 planet-economy.json에서 채움. 스칼라 이름 오프셋 PROVISIONAL→0 유지.
- **0x0321 ResponseInformationInstitution** (dispatcher case 0x321, 고정 0x8DE4B, parsers FUN_004167f0/
  FUN_00416bd0 + world-import FUN_004c4170): `codec/institution-record.mjs
  buildResponseInformationInstitutionInner`. 투영=`buildInstitutionSeedElements` (logh7-inferred-content.mjs):
  outer=base, institution[≤36].field00/field04=시설 카탈로그ID, spot[≤20].field00=장소 카탈로그ID,
  spot.field04=현재 spot 키(PLAYER_INFO +0x40 매칭), institution[0].field00=0x10(home-base 분기).
- **배선**: `worldImportBaseSourceInners()`가 0x0f02 월드 임포트 시 0x031f+0x0321(+0x0337 경제)을 함께 emit;
  PULL 경로(0x031c→0x031d, 0x0320→0x0321)도 동일 빌더 사용. P84 라이브: 0x031f/0x0321이 클라
  FUN_004c4170가 clientBase로 복사하는 실제 소스 확정.

## 3. 拠点(stay) 패널 統治者名/守備隊長名 — 미투영(의도적, P0 금지 준수)
支配陣営名=owner 바이트로 투영됨. 그러나 統治者名/守備隊長名은 0x031f/0x0321의 **PROVISIONAL 스칼라 오프셋**에
넣을 근거가 없다(라벨드 serializer가 서버측이라 절대 오프셋 미해결). 이 이름들은 클라가 0x0323 캐릭터 레코드를
교차참조해 그리는 것으로 추정 → 임의 오프셋 투영은 P0 추측이므로 미수행. 라이브 A/B로 오프셋 핀 후 ctx 명시 전달.

## 4. 오라클 (무회귀 가드)
- `tests/server/logh7-institution-record.test.mjs` (38건과 공유): 고정 0x8DE4 바디, count·stride·cap(4/36/20)
  guard, field 오프셋, P3 무조작.
- `tests/server/logh7-base-record.test.mjs`: 0x031f 0x604 레이아웃·5배열 cap·owner/class 바이트.
- `tests/server/logh7-login-session.test.mjs`: 월드 임포트 extraInners 코드열 `[0x031f,0x0321,0x0325,0x0323,
  0x0f03]`, institution 바디 count=2·elem id·institution_count, 0x0321 base id열(70=발할라/오딘).

## 5. 테스트 (직렬 권위)
`cd server && node --test tests/server/*.test.mjs` → **tests 1187 / pass 1169 / fail 0 / skip 18** (베이스라인 일치, 무회귀).

## 6. 라이브 대기
패널 오픈은 **mode 게이트**에 막혀 있음(2026-06-26 ground-truth: 월드 base 0xf305020, mode2 활성·mode0 grid
빈). 拠点/基地管理 패널 클릭 enqueue→consume 경로(C002 근본)와 동일 게이트라 와이어 자체 라이브 검증은 패널
오픈 선결 대기. 와이어 레코드는 P84 trace로 클라 소비 확정됨.
