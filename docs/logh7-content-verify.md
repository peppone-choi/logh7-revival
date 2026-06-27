# LOGH VII 콘텐츠 데이터 검증 결과

> **검증 대상**: 추출-불확실(extraction-uncertain) 캐논 데이터 4종 재검증
> **검증 방법**: `gin7manual.pdf` 좌표 기반 재추출(PyMuPDF, 회전표/괘선 해독) + 기존 `content/` 파일 대조
> **등급 체계**: P0(런타임 RE 확정) / P1(공식매뉴얼 좌표추출) / P2(전작·정황 추정) / P3(하우스룰 안전시드)
> **요약 판정**: verified ×3 (`alliance-ship-stats`, `auto-production`, `initial-deployment`) · unrecoverable ×1 (`crew-efficiency`)

---

## 0. 한눈에 보기 — 인코딩 가능 vs 보류

| 항목 | 상태 | 인코딩 | 반영 파일 | 등급 |
|------|------|--------|-----------|------|
| alliance-ship-stats | **verified** | ✅ 가능 | `content/ship-stats.json` (동맹 11엔트리 교정 + 偵察巡航艦 신규복구) | P1 |
| auto-production | **verified** | ✅ 완료 | `content/auto-production.json` (이미 기록됨) | P1 |
| initial-deployment | **verified** | ✅ 가능(신규파일) | `content/initial-deployment.json` (신규) | P1 |
| crew-efficiency | **unrecoverable** | ❌ 보류 | 메타데이터만 정정(`ship-stats.json`/`logh7-manual-canon.md`) | (값 없음) → 서버 구현 시 P3 |

**핵심 원칙**: 좌표추출로 살아난 P1 수치만 인코딩한다. crew-efficiency처럼 매뉴얼 원본이 표준행을 대시(`-`)/공란으로 출력해 **캐논 출처 자체가 비어있는** 항목은 어떤 파일에도 새 수치를 만들지 않는다(추측 금지). 서버 로직에서 그 값이 필요하면 P3 하우스룰로 명시 태깅한다.

---

## 1. alliance-ship-stats — 동맹군 함선 성능표 (pp.90–99 재추출/대조)

**상태: `verified`** (confidence: high, 등급 P1)

### Findings

- 기존 `manual-text.md`의 pp.90–99 표는 OCR linear-flatten으로 컬럼이 완전히 뒤섞여 신뢰 불가였다(현 `ship-stats.json` 동맹 11엔트리가 전부 confidence=low/none인 근본 원인).
- 원본 PDF(`.omo/work/gin7manual/gin7manual.pdf`, 90도 회전 세로조판 842×595)에서 **좌표 기반 재추출 성공**.
  - 함선 variant는 x좌표(열)로 분리, stat 컬럼은 y밴드로 분리.
  - 헤더 토큰(装甲前/側/後, 防護値容量, ビーム/ガン/ミサイル/対空, 索敵, 速度, 必要乗組員, ユニット数出力, 建造工期, 修理消費, 物資搭載量, 戦闘艇搭載数)의 y0를 **페이지별 캘리브레이션**(~10px 오프셋 보정).
  - 핵심 구조 단서: **防護値(guard)=容量(capacity) 라벨보다 ~27px 위**. variant `Ⅰ`=클래스 표준기본형, 旗艦행은 sparse(shield/unit/무장만)이므로 기본 무장/장갑은 `Ⅰ`행에서 합성.

### 검증된 동맹 표준형 수치 (좌표추출)

| 함종 | 장갑(前/側/後) | 실드(防護/容量) | 무장 | 索敵 | 速度 | 修理 | 物資 | 비고 |
|------|----------------|-----------------|------|------|------|------|------|------|
| 標準戦艦(787) | 30/18/10 | 70/20 | ビーム64 ガン80 ミサイル90 対空100 | 5600 | 22000 | 190 | 760 | fighter3, 戦闘艇 |
| 標準巡航艦(795) | 18/10/6 | 60/22 | ビーム24 ミサイル50 対空60 | 5600 | 24000 | 80 | 360 | |
| 打撃巡航艦(794) | 16/10/6 | 50/22 | ミサイル150/8 対空50 | 4000 | 24000 | 60 | 480 | |
| **偵察巡航艦(레다級795)** | 24/14/8 | 70/25 | ミサイル60 対空60 | 5600 | 28000 | 100 | — | **신규복구(현재 전필드 null)** |
| 標準駆逐艦(796) | 10/6/4 | 40/19 | ビーム24 ミサイル50 対空90 | 3200 | 30000 | 40 | 120 | |
| 戦闘艇母艦(796) | 46/14/20 | (없음) | ビーム64 ミサイル70/3 対空180 | 6400 | 16000 | 180 | 2240 | 乗組員7, fighter10, 建造180 |
| 標準工作艦(793) | 22/12/8 | (없음) | 対空40만 | 2400 | 20000 | 100 | 1200 | 乗組員1, 建造120 |
| 標準輸送艦(792) | 60/36/22 | (없음) | 対空40 | — | 14000 | 240 | 20000 | 乗組員1, 建造90 |
| 標準兵員輸送艦(788) | 5/3/2 | (없음) | ミサイル40/1(Ⅱ) 対空40 | 2400 | 18000 | 100 | 30 | 乗組員1, 建造100 |
| 標準揚陸艦(795/786) | 17/12/7 | (없음) | ガン/ミサイル40/1 対空40 | 2400 | 18000 | 40 | 30 | 乗組員1, 建造50 |
| 民間船(旗艦)/商船 | 20/16/8 · 12/8/4 | 40/16 · (없음) | ミサイル20 対空30 | 2400 | 10000 | 40 | (商船4000) | |

### 발견된 오류 (현 `ship-stats.json` 대비 — 좌표추출로 교정)

1. **전함 실드容量 30 → 20** (`70/30`은 armor_f값 30을 잘못 페어링; 좌표상 防護値70/容量20 명확)
2. **전함 장갑 32/16/8 → 30/18/10** (32/16/8은 戦艦Ⅱ값, Ⅰ=표준형이 정답)
3. **전함 ビーム 90 → 64** (旗艦/Ⅰ행엔 ビーム 없음, 64는 戦艦Ⅳ), **修理 90 → 190**
4. **순항함 장갑 16/8/22(back비정상) → 18/10/6**, **ビーム 50 → 24**, **修理 360 → 80**
5. **타격순항함 対空 150 → 50** (150은 ミサイル값)
6. **구축함**: ビーム 50→24, ガン 50→없음, ミサイル 24→50, 対空 120→90, 修理 90→40, **物資 4000→120**(4000은 OCR오염)
7. **戦闘艇母艦 장갑 20/14/18 → 46/14/20**, **戦闘艇 100 → 10**(100은 스파르타니안 서술이지 표 값 아님)
8. **공작함 장갑 24/14/8 → 22/12/8**, 速度 18000 → 20000
9. **수송함 物資 2400 → 20000**, 修理 +240
10. **병원(兵員)수송함 ミサイル 4 → 40/1**, 修理 +100
11. **양륙함 速度 15000 → 18000**, 物資 +30
12. **偵察순항함 전필드 null → 전체 신규복구**

### 검증데이터(provenance)

```
gin7manual.pdf pp.90-99 좌표 재추출 (PyMuPDF words, rotated-table nearest-anchor;
variant 'Ⅰ'=표준 base, 旗艦행=sparse, 防護値가 容量보다 ~27px 위)
```

**제국군 매그니튜드 정합**: 제국 SS75 장갑합56 ↔ 동맹 30/18/10(합58) ≈ 정합. 실드 guard 70/60/40 동일대역. 단 `ユニット数出力`(동맹 전함400/순항250/구축220)은 제국 `unit_count`(전함100/순항260/구축40)와 **의미가 달라 직접 대조 불가** → 현행대로 동맹 unit_count는 제국 same-class 백필 유지가 타당.

### 인코딩 권고 (✅ 가능, P1)

`content/ship-stats.json`의 동맹 11엔트리 + 偵察巡航艦(line 1521, `key:"偵察巡航艦"`, 현재 전필드 null)을 좌표추출 값으로 갱신:

- **(a)** 각 동맹 엔트리 `_raw` confidence를 `low → med` 격상, raw note에 `coordinate-extracted from gin7manual.pdf p90-99 (rotated table, nearest-anchor binning)` 추가.
- **(b)** 위 [발견된 오류] 12건을 `_raw.value` 및 파생 pools에 반영:
  - `maxArmor` = armor 3면합, `maxShield` = shield_capacity, `beamPower` = max(beam,gun,missile), `defense` = shield_guard.
  - 특히 전함 실드容量 30→20, 전함/순항 장갑 정정, 구축함 物資 4000→120, 戦闘艇母艦 장갑·戦闘艇10, 수송함 物資 20000.
- **(c)** 偵察巡航艦: armor24/14/8 · shield70/25 · missile60 · antiair60 · sensor5600 · speed28000 · repair100 · unit300으로 채움.
- **(d)** `_note` 블록에 이번 좌표재추출 패스를 method로 기록.

> ⚠️ **보류 컬럼**: `ユニット数出力`(동맹 400/250/220 등)은 제국 `unit_count`와 의미가 달라 `pools.maxZanki`에 직접 대입 금지. 현행 제국 same-class 백필을 유지하거나 별도 `_raw.unit_output` 필드로만 보존.

---

## 2. auto-production — 自動生産品目一覧表 (gin7manual pp.76–78)

**상태: `verified`** (confidence: high, 등급 P1) — **이미 인코딩 완료**

### Findings

- 2단 flatten으로 깨진 표를 **PDF 좌표 + 괘선(ruled-line) 기반**으로 완전 재추출(`get_text('dict')` + `get_drawings()`).
- 구조: 좌(x0 58~245)=帝国軍, 우(x0 318~484)=同盟軍, 각 반쪽 5컬럼(星系名/惑星名/艦艇/乗組員/陸戦兵). 전폭 괘선=시스템 경계, 부분 괘선=행성행 구분. 페이지경계 가로지르는 시스템(ヴィッテルスバッハ 등)은 진영별 1개 연속 y-스트림으로 병합 처리.

### 검증데이터 (완전 일치)

- 시스템 **58개**(제국36/동맹22) — galaxy.json 진영과 **100% 일치**(58/58).
- 행성 레코드 **210개**: galaxy 정확일치 187 + 철자변형 17 + galaxy미수록 6.
- 원시 생산 span 카운트 = JSON 캡처 카운트 **100% 일치**(누락 0).

### 핵심 발견

1. 각 행성은 **3개 독립 리스트** 생산: ships(艦艇)/crew(艦隊乗組員)/infantry(陸戦兵). 행단위 튜플 아님.
2. **galaxy.json 행성명 탁점/전사 오류 17건** 존재(매뉴얼이 더 정확): 예 ギンヌンガガプ↔ギンヌンガガガブ, タフテ・ジャムシード↔タフテ・ジャムジード, バクタプール↔バグタプール.
3. **galaxy미수록 6개 = 전부 유명 요새/거점**: ガイエスブルク, イゼルローン, ガルミッシュ, レンテンベルク, ダヤン・ハーン, ルドミラ.
4. 80성계 중 58개만 자동생산 보유(미보유 22=동맹18/제국3/중립1).
5. 함종 12계열 중 11계는 ship-stats.json과 일치, **揚陸艇(3회 사용)만 ship-stats 미수록 갭**.

### 인코딩 권고 (✅ 완료)

이미 `content/auto-production.json`(58,526 bytes, JSON valid)으로 기록됨. 구조:
`factions.{empire,alliance}.<system>.planets[] = {planet, ships[], crew[], infantry[], (galaxy_name|note)}`, `_stats`에 집계.

**후속 권장**:
1. `galaxy.json` 행성명 17건 탁점 오류를 매뉴얼 철자로 역수정(`galaxy_name` 필드가 매핑 보존).
2. galaxy미수록 6개 요새 행성을 `galaxy.json`/`fortresses.json`에 추가 검토.
3. 揚陸艇 함종을 `ship-stats.json`에 추가(자동생산표가 揚陸艦과 구분).
4. 서버 경제 도메인의 자동생산 룰 시드로 직접 소비 가능.
재현: `.omo/work/extract_autoprod4.py` + `build_autoprod_json.py`.

---

## 3. initial-deployment — 部隊初期配置一覧表 (gin7manual p75)

**상태: `verified`** (confidence: high, 등급 P1)

### Findings

- PDF idx74 = p75 = 部隊初期配置情報. flatten된 manual-text.md는 2-컬럼 표 2개를 뒤섞고 행 순서를 깨뜨림(사용불가).
- 좌표 재추출(291 spans, Y그룹 → X분할 E:x<300 / A:x>=300, cols num/sys/planet)로 6개 서브테이블 완전 복원.
- 구조: 3 서브테이블 × 2진영 = 帝国/同盟 각 {艦隊×12, 巡察隊 ranges, 地上部隊 ranges}.
- 유닛 카운트(검증): 제국 fleet12/patrol59/ground60, 동맹 fleet12/patrol60/ground60.

### 핵심 발견 / 트랩

1. **FLEET 병합셀**: 제국 함대는 12함대에 시스템셀 7개뿐 — 각 셀이 함대 **PAIR** 위에 Y-중앙배치. 검증된 페어: 1&2=ヴァルハラ/オーディン, 3=アルテナ, 4&5=アムリッツァ, 6&7=フレイア/レンテンベルグ, 8&9=キフォイザー, 10&11=アイゼンヘルツ/ガイエスブルク, 12=イゼルローン. (동맹은 대부분 1:1, バーラト만 1&2 병합)
2. **SOURCE GAP**: 제국 第48巡察隊는 PDF에 **진짜 부재**(第47→第49). 텍스트검색으로 확정.
3. **SOURCE BLANK**: 제국 第53～第60巡察隊는 시스템/행성 공란.
4. **요새**: ガイエスブルク/イゼルローン은 행성 아닌 要塞(헤더 惑星/要塞), galaxy.json과 일치.
5. **매뉴얼 내부 오타 정규화**(galaxy.json 기준): シュバーラ→シュパーラ, ニブルヘイム→ニヴルヘイム, バルドレ→バルドル, ルイトボルディング→ルイトポルディング, ロフォーデン→ロフォーテン, ヴィテルスバッハ→ヴィッテルスバッハ, ヴィレンンシュタイン→ヴィレンシュタイン 등.
6. **DISCREPANCY(에러 아님, 플래그)**: 배치표는 제국 フレイア/レンテンベルク를 명시하나 galaxy.json의 フレイア 행성목록(p101 주석)엔 レンテンベルク 부재(=フォールクヴァング/フェンサリル/ブリシンガメン). 값은 인쇄된 그대로 기록하되 galaxy.json フレイア가 불완전할 수 있음.

### 인코딩 권고 (✅ 가능 — 신규 파일)

`content/`에 동등물 없음 → **신규 파일 `content/initial-deployment.json`** 생성:

- 구조: `{imperial,alliance}.{fleet[],patrol[],ground[]}`. 일본어 캐논명, galaxy.json으로 정규화하되 매뉴얼이 다른 곳은 `system_raw`/`planet_raw` 보존.
- fleet은 `unit`키, patrol/ground는 `{from,to}` 범위.
- 요새는 `planet_type:"fortress"`(ガイエスブルク/イゼルローン).
- **제국 patrol은 第48 gap 유지**(47-47 다음 49-49) + null 53-60 엔트리 유지(`note:"blank in manual"`).
- フレイア/レンテンベルク 불일치는 `docs/logh7-manual-canon.md`에 known cross-source mismatch로 추가(フレイア 행성 재검증 시 revisit).

전체 검증된 레코드 데이터(제국 fleet12/patrol23-range/ground6 + 동맹 fleet12/patrol12/ground13)는 입력 JSON `data`에 byte-correct로 확보됨.

---

## 4. crew-efficiency — 乗員効率 / 必要乗組員 per 함선클래스

**상태: `unrecoverable`** (검증 자체의 confidence는 high — "복구불가임이 확정") → 서버 구현 시 **P3 하우스룰**

### Findings

- 매뉴얼 좌표 재추출(rotation=90, tategaki, pp.79–99 = idx78–98, 21 stat 페이지) 결과:

1. **`乗員効率`라는 별도 수치 컬럼은 stat표에 없음.** 乗員効率은 p44–45 補充 산문에서만 등장하는 **메커니즘 용어**("각 艦艇ユニット의 乗員効率 값에 따라 乗組員ユニット 보충량 변화→자동처리", `manual-text.md` L1869). 즉 표의 `必要乗組員` 컬럼이 소비되는 **규칙의 이름**이지 별도 데이터가 아니다.
2. `必要乗組員` 컬럼은 실재하며 좌표로 위치 확정. **같은 좌표기법으로 装甲/シールド/ビーム/速度는 정상 복원** → 추출 기법은 유효함을 교차검증.
3. 그러나 **`必要乗組員` 데이터가 원천적으로 희소**. 표준(旗艦/標準) 행은 전부 대시 `-` 또는 공란:
   - 제국 標準戦艦/高速戦艦/巡航艦/駆逐艦/民間船 = `-`
   - 동맹 標準戦艦/巡航艦/駆逐艦/民間船 = `-`
   - 모母艦/工作/輸送/兵員/揚陸/打撃 표준행 = 공란(None)
   - 생존 정수는 variant 행 소수뿐: 戦艦Ⅳ=5/Ⅷ=4, 巡航艦Ⅳ=3/Ⅷ=2, 駆逐艦Ⅳ·Ⅴ=1, 戦闘艇母艦(帝)=12, 雷撃艇母艦(帝)=8, 工作/輸送/兵員/揚陸=1, 戦闘艇母艦(同)=7.
   - → 표준 클래스를 덮는 **일관된 per-class 세트 성립 불가**.
4. 정정: SS75 등의 `-`는 OCR 손상이 아니라 **매뉴얼 원본의 리터럴 대시**임을 좌표검증으로 확인. (SK80 crew=3, Z82 crew=30 같은 값은 표 컬럼과 무관한 저신뢰 OCR 혼입값.)

**결론**: per-함선클래스 乗員効率/필요승무원 수치 표는 **매뉴얼이 표준 클래스 셀을 비워둬 사용 가능한 수치 세트로 복구 불가**.

### 인코딩 권고 (❌ 보류 — 새 수치 추가 금지)

per-class 乗員効率 값은 **캐논 출처가 비어있으므로 어떤 파일에도 새 수치를 추가하지 않는다.** 대신 **메타데이터만 정정**:

- **`content/ship-stats.json`**: `_raw.crew`의 note를 향후 오추출 방지용으로 수정 —
  `"OCR corrupt"` → `"manual prints literal '-' for standard hull (canonical: no separate crew-efficiency value); few variant-only integers survive (1,2,3,4,5,7,8,12) but no per-standard-class set"`.
  pools에 crew 파생 필드 신설 금지.
- **`docs/logh7-manual-canon.md` §8.5**(L414): 현재 "computed from each class's 乗員効率 (crew efficiency) value"는 정확하나, **"(extraction-unrecoverable: standard rows are '-'/blank)"** 주석 1줄 추가. (관련 L934의 "numbers not in these pages" 항목과 일관.)

### 복구불가 항목의 P3 안전시드 대안 (서버 보충 로직 구현 시)

캐논 값이 없으므로 서버 補充(replenishment) 로직은 **하우스룰을 명시적으로 P3 태깅**하여 처리:

- **기본 룰**: `1 crew-unit / ship-unit` 균일 보충(乗員効율 가중치 1.0 일괄).
- **면제 룰**: **商船 = 0**(매뉴얼 p9/p45 商船 乗組員 면제 — 유일하게 확보된 정성적 캐논 사실).
- 향후 런타임 RE로 클라이언트가 실제 소비하는 乗員効率 값이 발견되면 P3 → P0/P1로 격상.

```jsonc
// 검증된 사실만 (per-class 수치 세트 복구불가 → 인코딩용 데이터 없음)
{
  "concept": "乗員効率 = mechanic name (p44-45 補充 prose); consumes 必要乗組員 column",
  "column_exists": true, "column_header": "必要乗組員",
  "standard_hull_crew_values": "empire/alliance 표준행 전부 '-' 또는 공란",
  "surviving_variant_integers_only": { "戦艦Ⅳ":5,"戦艦Ⅷ":4,"巡航艦Ⅳ":3,"巡航艦Ⅷ":2,
    "駆逐艦Ⅳ":1,"戦闘艇母艦(帝)":12,"雷撃艇母艦(帝)":8,"工作/輸送/兵員/揚陸":1,"戦闘艇母艦(同)":7 },
  "verdict": "no usable per-class crew-efficiency table; standard rows are '-'/blank",
  "house_rule_P3": "uniform 1 crew/ship-unit; 商船 exempt(0)"
}
```

---

## 5. 종합 액션 아이템

| # | 작업 | 대상 파일 | 등급 | 상태 |
|---|------|-----------|------|------|
| 1 | 동맹 11엔트리 수치 교정 + 偵察巡航艦 신규복구 | `content/ship-stats.json` | P1 | TODO |
| 2 | 자동생산표 인코딩 | `content/auto-production.json` | P1 | ✅ 완료 |
| 3 | galaxy 행성명 17건 탁점 역수정 | `content/galaxy.json` | P1 | ✅ 적용(2026-06-19, 17 라인 minimal diff) — ⚠️ 하류 전파(`planets-ko.json` jp키 + 2 테스트) 미완, manual-canon §22.3 참조 |
| 4 | galaxy미수록 6 요새 추가 검토 | `content/galaxy.json`/`fortresses.json` | P1 | 검토 |
| 5 | 揚陸艇 함종 추가 | `content/ship-stats.json` | P1 | TODO |
| 6 | 초기배치표 신규 인코딩 | `content/initial-deployment.json`(신규) | P1 | ✅ 완료(2026-06-19) — 제국 12/59/60, 동맹 12/60/60, 第48 gap·53-60 blank 보존. manual-canon §22.1 |
| 7 | フレイア/レンテンベルク 불일치 기록 | `docs/logh7-manual-canon.md` | (플래그) | TODO |
| 8 | crew note 정정 + §8.5 주석 | `ship-stats.json` / `logh7-manual-canon.md` | (메타) | TODO |
| 9 | 補充 로직 乗員効率 = P3 하우스룰(商船 면제) | 서버 경제 도메인 | P3 | 구현 시 |

**검증 재현 스크립트**: `.omo/work/extract_autoprod4.py`, `.omo/work/build_autoprod_json.py`, 및 ship-stats/initial-deployment 좌표추출 패스(`gin7manual.pdf` rotated-table nearest-anchor).
