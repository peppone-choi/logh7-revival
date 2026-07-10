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
| 인물(캐논) | `characters.json` | 99 (스탯 97·계급코드 71·얼굴 12) | `content/character-roster.json` | 스탯 높음 / 얼굴·성별 낮음 |
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
- **부족분 B — 얼굴 매핑**: 99명 중 87명이 초상 id 미확정(`faceConfidence:'gap'`). `content/canon-face-registry.json`(45레코드)·`character-portraits-complete.json`으로 보강 가능하나 신뢰도 낮음(속성기반 배정).
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
4. 얼굴 매핑 보강(부족분 B) — canon-face-registry 통합 검토.
