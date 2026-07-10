# LOGH VII — DB 시드 정본 카탈로그

**생성:** 2026-07-11 · **조립기:** `server/tools/build-db-seed.mjs` · **산출:** `server/data/seed/*.json`

죽은 MMO 은하영웅전설 VII 자체 서버 복원. 기존 정본 추출물(`server/content/**`)을 감사·통합해
서버 영속층이 시드할 형태로 정규화한 결과와, DB를 채우려면 아직 없는 것(갭)을 정리한다.

## 요약

목표는 "NPC 캐릭터 정의만 남기면 게임 전부가 돌아가는 상태". 실측 결과:

- **정적 세계 데이터(성계·함선·요새·시나리오 배치)는 거의 완비.** galaxy 85성계 전부 grid cell 부여 완료, 함선 63종, 요새 6종, 초기 함대 배치 해석 완료.
- **캐논 인물 99명**은 스탯·진영·계급까지 와이어-ready로 조립됨. 이들이 곧 게임 내 제독/정치가 NPC의 근간.
- **최대 갭은 캐릭터 쪽**: (a) 얼굴 초상 id가 12/99만 확정, (b) 성별 필드 부재, (c) 이름 분할이 heuristic, (d) 가문(noble house) 엔티티 미분리. **범용 NPC(무명 제독) 셋은 별도 정의 필요** — 자세히 아래 갭 리포트.
- **서버 현 스키마는 accounts/characters/world_fleet/domain_events 4테이블뿐** — 갤럭시·함선·요새를 아직 시드/소비하지 않는다. 이 시드셋은 정본으로 준비돼 있으나 server-dev의 시드 로더 배선 대기.

## 커버리지 표

| 카탈로그 | 파일 | 레코드 | 출처 | 신뢰도 |
|---|---|---:|---|---|
| 성계/갤럭시 | `galaxy-systems.json` | 85 (전부 cell 부여) | `content/galaxy.json` (null_galaxy.mdx 좌표 정본 + 매뉴얼 성도 교차검증) | 높음 |
| 세력 | `factions.json` | 3 (제국/동맹/페잔) | authored 캐논 + power id(codec 2/3) | 중(페잔 id 갭) |
| 인물(캐논) | `characters.json` | 99 (스탯 97·계급코드 71·얼굴 99 유효 placeholder) | `content/character-roster.json` | 스탯 높음 / 얼굴=익명 유효값(정체성 미확정) |
| 함선/유닛 | `ships.json` | 63 | `content/ship-stats.json` (매뉴얼 OCR) | 중(OCR 파생) |
| 요새/기지 | `fortresses.json` | 6 | `content/fortresses.json` (authored) | 높음 |
| 초기 배치 | `initial-deployment.json` | 제국12+동맹 함대 | `content/initial-deployment.json` (EXE) | 높음 |
| 계급 테이블 | `rank-table.json` | 21 | constmsg group 5 (少尉=0x0d 앵커) | 앵커 확정 / 중간 보간 |
| 능력 스키마 | `ability-schema.json` | 8 | roster `_stat_keys` | 순서 미확정(GAP) |

전략 그리드: **100×50 = 5000셀** (0x0315 static grid). `cell = canonRow*100 + canonCol` (0-indexed).
검증: 이젤론 = 12*100+53 = **1253** ✓. 제국수도 ヴァルハラ(오딘) = **2588** = 서버 하드코딩 기본 스폰셀 ✓.

## 캐릭터 와이어 스키마 (근거: `logh7-character-codec.mjs`)

`{ power(진영id 2=제국/3=동맹), blood, sex, lastname, firstname, face(u32), ability8[8], bonusPoint, specialAbilityNum, title, rank(u8 constmsg g5 subid) }`

- **ability8 순서**: 統率/政治/運用/情報/指揮/機動/攻撃/防御 (roster 문서 순서). 와이어 배열 인덱스 대응은 [CW]§2.1 캡처 대조로 최종 확정 필요.
- **rank**: constmsg group 5. 확정 앵커 = 0皇帝·1政治家·2元帥~7准将·13少尉·18~20兵. 중간(8大佐~17伍長)은 캐논 사다리 보간.

## 갭 리포트 — DB를 채우려면 아직 없는 것

### 1. NPC 캐릭터 (최우선 — 사용자 목표의 핵심)
- **캐논 인물 99명은 준비됨** (이름·진영·스탯·계급). 이들 각각이 게임 내 제독/정치가 NPC.
- **부족분 A — 무명 NPC 셋**: 원작에 이름 없는 다수 제독·관료·병력 지휘관이 게임 진행(함대 지휘관 배정, 정치 이벤트)에 필요할 수 있다. 초상 슬롯은 **291개**(`generated/canon-roster-numbered.json`, oem/… tcf 아틀라스)가 있으나 그중 스탯·정체성 있는 건 99명뿐. 나머지 **~192 슬롯은 무명 초상만 존재** → 스탯·이름·소속을 부여해야 NPC로 성립. 이건 **원작·매뉴얼·EXE에 근거가 없어 authored(창작) 또는 절차생성**이 필요 — 사용자가 채울 마지막 조각.
- **부족분 B — 얼굴 정체성(갭 아님, 방침상 미확정)**: 99명 전원 **유효 placeholder face** 배정 완료(크래시 없이 렌더). 단 **정체성은 미확정**이며 그게 의도다 — "이 얼굴 = 이 인물" 매핑은 폐기(사용자 지시). 특정 인물에 특정 초상을 붙이려면 라이브 렌더 캘리브레이션(live-qa) 후 index 확정. 아래 「얼굴 id 인코딩·익명 유효 풀」 참조. `canon-face-registry.json`·`character-portraits-complete.json`(정체성 주장)은 **사용 금지**.
- **부족분 C — 성별**: 로스터에 성별 필드 없음 → 전원 男 가정. 여성 인물(예: 원작 여성 캐릭터) 별도 확인 필요.
- **부족분 D — 이름 분할**: name_ja 99개 중 1개만 '・' 포함 → 나머지는 단일 토큰을 성으로 취급. 성/이름 분할 정확도는 검토 필요(HUD 표시명엔 무해).

### 2. 세력/가문
- 제국·동맹·페잔 3세력은 있으나 **페잔 power id 미확정**(캐릭터 로스터에 페잔 소속 인물 0명).
- **귀족 가문 엔티티 미분리**: 로스터 `branch` 필드가 99명 전부 null. 브라운슈바이크·리텐하임·리히텐라데 등 골덴바움 가문을 개별 엔티티로 원하면 authored 필요.

### 3. 함선/유닛
- 63종 pools 스탯은 OCR 파생(중신뢰). **0x0325 유닛 레코드 포맷과의 정합 미확정** — wire-engineer/re-ui-entities 확정 대기. 정합 시 pools 필드 재매핑 가능.

### 4. 능력8 배열 순서
- roster 문서 순서로 매핑했으나 **와이어 ability8[i] ↔ 개별 스탯 대응은 캡처 대조 미완**. 서버가 스탯을 그대로 재방출만 하면 무해하나, 개별 능력 게임로직엔 확정 필요.

### 5. 서버 배선 (데이터 아님 — 인접 갭)
- 현 DB 스키마(4테이블)는 galaxy/ships/fortresses 테이블이 없다. 이 시드셋을 실제 소비하려면 server-dev가 (a) 스키마 확장 (b) 시드 로더 배선이 필요.

### 6. 문자열/로컬라이즈 (조립 범위 밖 — 준비됨)
- `content/generated/msgdat-messages.json`·`msgdat-constmsg.json`·`content/client/msgdat.json` 존재. 한글화 매핑 대비 정본은 이미 추출돼 있음(별도 카탈로그화는 이번 조립 범위 밖).

## 다음 액션 제안
1. **무명 NPC 셋 정의**(부족분 A) — 사용자/게임디자인 결정 사항. 291 초상 슬롯 중 무명분에 절차생성 스탯·이름 부여 규칙을 정할지.
2. server-dev: 스키마 확장 + 이 시드셋 로더 배선(갭 5).
3. re-ui-entities/wire-engineer: 0x0325 유닛 포맷 확정 후 ships pools 재매핑(갭 3), ability8 순서 확정(갭 4).
4. 얼굴: **전원 유효 placeholder 배정 완료**(익명 풀, 정체성 미확정). 정체성 매핑은 폐기 — 특정 초상 고정이 필요하면 live-qa 캘리브레이션 후 index 확정. 정본: `content/generated/logh7-face-valid-pool.json`, 아래 전용 섹션.
5. **live-qa 확인 권장**: placeholder face(oem 저인덱스 등)가 실제 초상으로 렌더되는지 실클라 캡처 1회 — 아틀라스 index→슬롯 remap 캘리브레이션 앵커 확보.

## 얼굴 id 인코딩 · 익명 유효 풀 (정체성 아님)

> **방침(2026-07-11 사용자 지시):** 얼굴은 **익명 인덱스 풀**로만 취급한다. "이 얼굴 = 라인하르트/양" 식
> 정체성 매핑(AI 분류·초상 복원 파생)은 **근거 없는 추정이므로 폐기**. 목적은 전원이 **크래시 없이 초상을
> 렌더**하는 것. 정체성은 미확정이며 외부에서 재배정 가능.
> 근거: `docs/reference/legacy-evidence/logh7-face-id-encoding.md`, `logh7-face-code-conversion.md` ·
> 데이터: `content/generated/logh7-face-valid-pool.json`(유효 풀 정본), `logh7-face-tcf-catalog.json`(아틀라스 7종).

### 와이어 필드 · 리졸버
초상은 `0x0323` 레코드 `@0xf4`(및 `0x1008` 커스텀 생성)의 u32 `face` 값 하나로 결정된다(코덱:
`logh7-character-codec.mjs`). 클라 리졸버 둘:

1. **Path 1 (`FUN_00517e70`) — flat → `data/image/Face/<NNN>.tga`.** 설치본에 번호 tga가 없어(오직
   `unknownface.tga`) 이 경로 단독은 **항상 unknownface 폴백**. → flat 번호는 실초상을 못 그린다.
2. **Path 2 (`FUN_00592c30`→`FUN_005924c0`) — composite → 아틀라스 tcf.** `face`를 10진 자릿수 필드로 분해해
   아틀라스 `{O|G}{E|A}{M|F}` 선택 + local index로 그린다. **실제로 그림이 나오는 경로.**

**크래시 안전성**: local_index가 아틀라스 상한(cap) 이내면 loader가 영역 로드(렌더), 초과면 unknownface 폴백,
빈 슬롯이면 blank — **어느 경우도 크래시 없음**. 라이브 앵커: 황제 placeholder 카드가 렌더됨
(`restored-from-git/logh7-loop-state.md:350`) → 저인덱스 유효 확인. 역산하면 그 값은 **oem index 0 = `face` 0**.

### composite 인코딩
`face` 값 `n`:
```
M  = n / 1000000            # 0 = O(Original, 캐논/NPC),  1 = G(Generate, 플레이어 생성)
d5 = (n % 1000000)/100000   # 0 = Empire,  1 = Alliance
d4 = (n % 100000)/10000     # 0 = Male,    1 = Female
local_index = n % 1000      # 아틀라스 내 슬롯
```
| 아틀라스 | (M,d5,d4) | 진영·성별·군 | base | index 상한 | face 값 범위 | 용도 |
|---|---|---|---:|---:|---|---|
| oem | (0,0,0) | 제국·남·士官(O) | 0 | ≤199 | 0–199 | 캐논/NPC |
| oam | (0,1,0) | 동맹·남·士官(O) | 100000 | ≤95 | 100000–100095 | 캐논/NPC |
| o | (0,0,1) | 여/기타(O) | 10000 | ≤99 | 10000–10099 | 캐논/NPC |
| gem | (1,0,0) | 제국·남·將官(G) | 1000000 | ≤99 | 1000000–1000099 | 플레이어 생성 |
| gef | (1,0,1) | 제국·여·將官(G) | 1010000 | ≤31 | 1010000–1010031 | 플레이어 생성 |
| gam | (1,1,0) | 동맹·남·將官(G) | 1100000 | ≤99 | 1100000–1100099 | 플레이어 생성 |
| gaf | (1,1,1) | 동맹·여·將官(G) | 1110000 | ≤31 | 1110000–1110031 | 플레이어 생성 |
`face_value = base + local_index`. **아틀라스 SELECTION(진영·성별·군)은 완전 해석됨.** 미해결은 local_index →
tcf.hed 슬롯의 아틀라스별 정확한 remap(런타임 테이블 `this+0x2a60`/`+0x2d80`) — 즉 "index N이 정확히 어느
초상"인지는 라이브 캘리브레이션(live-qa) 대상. 정체성이 목적이 아닌 placeholder 용도엔 무관.

### 캐논 99 얼굴 배정 (전원 유효 placeholder)
| 구분 | 수 | 방식 |
|---|---:|---|
| **유효 placeholder** | **99/99** | 진영·성별 카테고리의 O-group 아틀라스 + 순차 index(cap 이내). `faceIdentityConfirmed:false` |
| 정체성 확정 | **0/99** | 정체성 매핑 폐기 — 어떤 face도 특정 인물을 뜻하지 않음 |

`build-db-seed.mjs`가 결정적으로 배정: 제국(46명)→`oem` index 0–45(face 0–45), 동맹(53명)→`oam`
index 0–52(face 100000–100052). 전원 cap 이내(크래시 없음), 멱등(로스터 순서 기반). 각 레코드에
`faceSource:"placeholder"`, `faceIdentityConfirmed:false`, `faceCategory`, `faceLocalIndex` 병기.
`friedrich-iv`가 `oem[0]`(=황제 라이브 앵커)에 놓임은 우연 정렬이며 정체성 주장 아님.

> 역사적 참고(정체성 미확정): `content/roster/face-name-map.json`은 gineiden 공식 페이지에서 수집한
> flat NNN 12건을 담고 있으나 (a) flat 경로는 unknownface 폴백이라 실초상을 못 그리고 (b) 본 방침상
> 정체성으로 **주장·사용하지 않는다**. 시드 `face`에 통합하지 말 것.

### NPC 얼굴 풀 가이드 (외부 작성자용)
정본: `content/generated/logh7-face-valid-pool.json`. 규칙:
1. **카테고리 선택**: 인물의 진영·성별로 O-group 아틀라스(oem/oam/o)를 고르고 `base + index`(index는 cap 이내)로
   composite `face`를 만든다. 클라가 그 카테고리 풀 아트를 그린다(특정 정체성 주장 아님).
2. **플레이어 생성**은 G-group(gem/gef/gam/gaf) 사용 가능.
3. **폴백**: 값 미정이면 `face` 생략 → unknownface(크래시 없음).
4. 캐논 99와 index가 겹쳐도 무방(정체성 아님). 특정 초상 지정이 필요하면 라이브 캘리브레이션 후 index 확정.

## NPC 데이터 드롭인 스키마

무명 NPC(~192 슬롯, 위 부족분 A)의 이름·스탯은 **외부 작성자**가 채운다. 서버는 그 결과물을
**무손실 수용만** 한다(NPC 데이터를 생성/보정하지 않음).

### 어디에 두나
- 드롭인 파일: **`server/data/seed/npc-characters.json`** (미존재 시 캐논 99만 로드 — 에러 아님).
- 부팅 시 `loadWorldSeed()` 가 자동 탐색해 `canon_characters` 테이블에 멱등 병합(`source='external'` 라벨).
- 대체 경로: `loadWorldSeed({ npcPath })`. 파일 추가/변경 시 멱등 마커가 달라져 자동 재적재.

### 파일 포맷
wrapper 또는 bare 배열 둘 다 허용:
```json
{ "provenance": "작성 근거", "characters": [ { …레코드… } ] }
```
`characters: []`(빈 배열) 또는 파일 미존재 → 안전(캐논만).

### 캐릭터 레코드 필드 (캐논 `characters.json` 과 동일 스키마)
| 필드 | 타입 | 필수 | 허용값 / 비고 |
|---|---|---|---|
| `id` | string | **필수** | 고유. 외부 NPC는 **`npc-` 접두사**(캐논 slug와 범위 분리). 같은 id면 upsert |
| `faction` | string | 권장 | `empire` \| `alliance` \| `neutral` |
| `powerId` | int(u8) | 권장 | 2=제국, 3=동맹 (character-codec). `faction`과 일치 |
| `kind` | string | 선택 | 예: `military` \| `politician` \| `emperor` |
| `sex` | int(u8) | 선택 | 0=男, 1=女 (캐논 전원 0) |
| `name_ja` / `name_romaji` / `name_kr` | string | 권장 | 일본어/로마자/한글 표기 |
| `lastname` / `firstname` | string | **필수\*** | 성/이름. 표시명 |
| `rankCode` | int(u8) | 권장 | `rank-table.json` 0..20 (0=황제, 13=少尉 앵커) |
| `post` | string\|null | 선택 | 직책 |
| `face` | int | 권장 | 초상 슬롯 id (위 「얼굴 id 인코딩」 절 참조; NPC는 얼굴 풀 사용 권장) |
| `ability8` | int[8] | 권장 | 순서 **고정**: `[통솔,정치,운용,정보,지휘,기동,공격,방어]` (`ability-schema.json`), 각 u8 |
| `unit` | int\|null | 선택 | 소속 함대 unit id |
| `flagship` | string\|null | 선택 | 기함 함선 키 (`ships.json` `key`) |

여기 없는 추가 필드도 레코드 원본 그대로 `data_json` 에 무손실 보존된다.

**\*이름 필수**: `lastname`/`firstname` 중 최소 하나는 비어있지 않아야 한다(둘 다 비면 클라 HUD가
표시명을 "황제"로 폴백 — DEFECT 1). 실제 진입 NPC는 이름을 반드시 채울 것.

### 이름 인코딩 (한글 지원)
캐릭터 이름은 `0x1008`/`0x0323` 경로에서 **UTF-16LE(UCS-2)** 로 와이어에 실린다 → **한글 가능**.
JSON엔 그냥 유니코드 문자열(`"name_kr": "김제독"`)로 적으면 서버가 UTF-16LE로 직렬화한다.

### id 범위 분리
캐논=kebab slug(예: `reinhard-von-lohengramm`), 외부 NPC=`npc-*`(예: `npc-00001`, 제로패딩 권장).
문자열이 겹치지 않는 한 upsert 충돌 없음. DB `canon_characters.source`: 캐논=`canon`, 외부=`external`(로더 자동 라벨).

### 로더/테스트
- 로더: `server/src/infrastructure/persistence/WorldSeedLoader.mjs` (`loadNpcCharacters`, 멱등).
- 테스트: `server/tests/logh7-world-seed.test.mjs` — `npc drop-in:` (미존재/빈/부분 안전 로드 + 무손실 병합).
