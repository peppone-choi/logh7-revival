# LOGH VII 진짜 캐논 성계 수 합성 (2026-06-29)

3개 독립 출처 카운트 + 적대적 검증 + 1차 아티팩트 직접 재확인. 단일 출처 단정 금지, 비연속 subId/라벨 혼입 주의, 원본 권위 과장 금지 원칙으로 판정한다.

---

## 0. 결론 (요약)

- **galaxy.json 의 80 은 "원본 게임 캐논 성계 수"로서 틀렸다 (is80Correct = false).**
- **진짜 캐논 성계 수 = 85** (constmsg group-0x18 성계/장소 라벨 86개에서, 성계가 아닌 항행 게이트 1개 `탄호이저 게이트` 를 제외).
- galaxy.json/테스트의 80은 **P2 매뉴얼(星系図 dot/label) 추출에서 6개 라벨이 누락된 부분집합**이다. 86개 캐논 라벨 중 80개만 담겨 있다.
- 권위 순위: **원본 게임 데이터(constmsg group-0x18) > 매뉴얼 dot > EXE cap.** 셋 다 직접 재확인했고, 불일치의 책임은 매뉴얼 추출(80) 쪽에 있다. constmsg가 80과 다르므로(=86 bodies), 80은 매뉴얼 추출 오차로 본다.

---

## 1. 출처별 수 + 직접 재확인

### 1.1 constmsg group-0x18 — 원본 게임 데이터 (권위 1순위)

- 디코더: `RE/tools/logh7_msgdat.py` (HFWR, cp932/cp949 자동판별).
- 소스: `.omo/work/logh7-installed/data/MsgDat/constmsg.dat` 및 `.omo/work/logh7-ko-overlay/.../constmsg.dat`. 둘 다 `textPointerCount=3199`, group-0x18 = text-pointer id **1403..1491 = 89 레코드**로 동일.
- 서버 사용 사본 `server/content/extracted/msgdat-full.json` 도 group-0x18 = 89 레코드로 일치.

레코드 89개 분해 (직접 디코드, byte-exact):

| 구분 | subId | 개수 | 내용 |
|---|---|---|---|
| grid-TYPE 라벨 | 0..2 | 3 | 플라스마 폭풍 그리드 / 공간 그리드 / 항행 불능 그리드 (성계 아님) |
| 천체/장소 라벨 | 3..88 | **86** | 성계명 + 특수천체/게이트 |

- **이것이 원본 게임이 들고 있는 캐논 라벨 테이블이다. 성계/장소 라벨 = 86개.**
- 86개 중 비-성계: sub45 `탄호이저 게이트`(항행 회랑/게이트, 성계 아님). sub88 `태양계`(성계 — Sol). sub14 `이제를론`(성계명; '요새'가 아니라 성계 라벨로 정확히 카운트됨).
- **엄밀 성계 수 = 86 − 1(게이트) = 85.**

### 1.2 manual-dots (gin7manual p101 星系図) — 권위 2순위

- 추출기 `RE/tools/logh7_galaxy_star_extract.py` 가 `EXPECTED_STAR_DOTS=80` 을 hard-assert. 결과물 `content/galaxy-raster-star-centers.json`(80 dot/80 유니크 셀/0 중복), `content/galaxy.json`(80 systems/80 유니크 이름/80 유니크 canonCol·canonRow), `content/logh7-content.db star_systems`(80 row) 모두 80으로 삼각검증 일치.
- **수 = 80. 단, 이 80은 매뉴얼 星系図 도면에서 dot로 식별 가능한 성계만 센 것**이다. `_source` 자체가 그렇게 명시: `gin7manualsaved.pdf 星系図 special Text annotations (80 system labels ...)`.
- 결함(수는 안 바뀌지만 1:1 셀 일치 주장 반증): `フェザーン` canonRow 가 galaxy.json/DB=37 vs raster 소스=38 로 1칸 어긋남. 80개 중 정확히 1개 per-name 셀 불일치. (테스트 `logh7-strategic-grid-provenance.test.mjs:92` 는 "페잔 마커 한 칸 위로(2026-06-23 사용자 결정)" 로 row37 을 의도적으로 고정 — 통항 회랑은 row38 유지.)

### 1.3 exe-table (G7MTClient) — 권위 3순위 (용량이지 데이터 아님)

- `.omo/ghidra/export/G7MTClient/functions.jsonl` 에서 6개 함수 모두 정확한 주소에 존재 직접 확인:
  - `FUN_00413050 @0x00413050`: `if (bVar1 < 0x65)` → OBJECT-table CAP **100**.
  - `FUN_004134e0 @0x004134e0` / `FUN_004abbb0 @0x004abbb0`: cell grid / RLE `< 0x1389` → **5000** (100×50).
  - `FUN_004d3bd0 @0x004d3bd0`: 세로 `< 0x65`(101선→100열), 가로 `< 0x33`(51선→50행) → 100×50.
  - `FUN_004c8bc0 @0x004c8bc0`: `0x59`(=89) 사용 + 100열 스캔. value 3..88 = **86 placeable slot**.
- **수 = 100 (오브젝트 테이블 캡), 5000 (셀 그리드), 86 (배치가능 값 슬롯).** 어느 것도 "성계 수"가 아니다. 클라는 성계 수를 하드코딩하지 않는다 — 용량만 있고 80/85/86 성계는 그 안에 들어가는 **데이터**다.
- 86 = 80 systems + 6 fortresses (배치가능 마커 총합, 파생값). EXE의 86 ≠ constmsg의 86 (우연히 같지만 의미 다름): EXE 86 = value 3..88 슬롯 개수, constmsg 86 = sub 3..88 라벨 개수. 둘 다 "86개 슬롯이 있다"는 용량/라벨 사실일 뿐, 그 자체가 성계 수가 아니다.

---

## 2. 권위 순위와 불일치 판정

**권위: 원본 게임 데이터 constmsg(86 bodies / 85 systems) > 매뉴얼 dot(80) > EXE cap(100/5000/86 slots).**

- constmsg 와 매뉴얼이 86 vs 80 으로 불일치한다. constmsg 가 원본 게임이 실제로 출하한 라벨 테이블이므로 권위가 높다. 매뉴얼 dot 80 은 도면에서 dot가 보이는 성계만 추출한 부분집합이고, `_source` 와 추출기 assert가 그 80을 진실의 전부로 확정해 버린 것이 오차의 원인이다.
- EXE cap 은 불일치 심판이 아니라 양쪽을 다 수용하는 용량(86 slot ≥ 85 system) 일 뿐이라, 권위 최하위.

**galaxy.json↔constmsg 매핑 직접 대조 (server/src/server/logh7-content-adapter.mjs:288,441):**
`contentId = markerIdsByName.get(s.name_ja)`, `markerIdsByName = mergedConstmsgGroupSubIdsByText(0x18)` — 즉 galaxy.json 성계의 contentId 는 그 이름을 constmsg group-0x18 라벨에서 찾은 subId 다. 테스트 `logh7-strategic-grid-provenance.test.mjs` 가 이를 확정: `iserlohn.contentId === 14`(이제를론 = sub14), `lumbini.contentId === 86`(룸비니 = sub86). 디코드한 바이너리와 정확히 일치.

→ galaxy.json 80 성계는 constmsg 86 라벨 위에 **희소(sparse) 매핑**된다. 86개 sub(3..88) 중 galaxy.json 에 대응 성계가 **없는 6개 subId**:

| sub | constmsg 라벨(ko) | 캐논(추정) | galaxy.json 존재 | 분류 |
|---|---|---|---|---|
| 13 | 안우레갈라 | An-Uru-Galla 류 | 없음 | **누락 성계** |
| 32 | 케이프혼 | Cape Horn | 없음 | **누락 성계** |
| 34 | 코브라베르데 | Cobra Verde | 없음 | **누락 성계** |
| 45 | 탄호이저 게이트 | Tannhäuser Gate | 없음 | 게이트(성계 아님) |
| 52 | 니벨룽 | Nibelung | 없음 | **누락 성계** |
| 75 | 몬살바르 | Monsalvat | 없음 | **누락 성계** |

(6개 모두 galaxy.json raw 에 JP 표기로도 부재함을 직접 확인 — 음역 누락이 아니라 실제 부재.)

→ **86 라벨 − 6 미수록 = 80 = galaxy.json.** 즉 80은 86의 정확한 부분집합이며, **누락 6개 중 5개가 진짜 성계**(안우레갈라/케이프혼/코브라베르데/니벨룽/몬살바르), 1개가 게이트(탄호이저).

---

## 3. 진짜 캐논 수 / galaxy.json 80 정오

- **진짜 캐논 성계 수 = 85** (constmsg 천체 라벨 86 − 게이트 1).
- galaxy.json/테스트의 **80은 틀렸다**. 원본 게임 라벨 테이블 대비 **성계 5개 누락**(+게이트 1은 정당 제외). 80 = 85(진짜 성계) − 5(누락 성계).
- 정직 캐비엇: 만약 "수록할 만한 성계 마커"를 80으로 정의한 제품적 결정이 있었다면 80은 *의도된* 부분집합일 수 있다. 그러나 질문이 "진짜 캐논 성계 수"이고, 권위 출처(constmsg)가 86 bodies/85 systems 를 들고 있으므로, **캐논 기준으로는 80은 부정확**하다. 80을 캐논 수로 단언한 `_source`("80 system labels") 와 `logh7-content-caps.mjs:123`("> 85 placeable markers" — 85를 상한 힌트로 이미 인지) 사이에도 내부 긴장이 있다.

---

## 4. 틀렸을 때의 교정 (actionIfWrong)

목표: galaxy.json 을 86-라벨 권위에 맞춰 누락 5개 성계를 복원하고 contentId/subId 매핑을 재정렬한다. 좌표 미상은 P3로 표시, 수는 캐논 85로 올린다.

1. **누락 5개 성계 추가** (`server/content/galaxy.json` + `RE/content/galaxy.json` + 런타임 사본 + `logh7-content.db star_systems`):
   - sub13 안우레갈라, sub32 케이프혼, sub34 코브라베르데, sub52 니벨룽, sub75 몬살바르.
   - 각 system 의 `contentId/constmsgGroup18SubId` = 해당 sub. 이름 `name_ja` 는 캐논 음역(예: アン・ウレギャラ/ケープホーン/コブラ・ヴェルデ/ニーベルング/モンサルヴァート — 캐논 확정 필요, 미확정 시 P3).
   - 좌표 `canonCol/canonRow` 는 매뉴얼 dot 에 dot가 없어 미상 → `provenance: { authority: 'constmsg_group18_label', positionAuthority: 'UNVERIFIED_P3' }`. 추측 좌표를 P0로 승격 금지(블랙홀/중성자별 _specialBodies 와 동일 원칙).
2. **탄호이저 게이트(sub45)** 는 성계로 추가하지 않는다. 회랑/게이트로 별도 표기하거나 코멘트로 명시 — 성계 수에서 제외.
3. **테스트 재정렬** (`server/tests/server/logh7-strategic-grid-provenance.test.mjs`):
   - `assert.equal(pack.systems.length, 80)` → `85` (또는 좌표 미상 성계를 마커 미배치로 둘 경우, "성계 레코드 85 / 좌표확정 마커 80" 으로 분리 단언).
   - `assert.match(galaxy._source, /80 system labels/)` 문구를 "86 constmsg group-0x18 labels (3 grid-type + 83 systems + 1 gate + Sol) / 85 systems; 80 with manual star-chart coordinates" 로 갱신.
   - canon cell 유니크 단언은 좌표확정 성계 부분집합에만 적용.
4. **부수 정합**: 페잔 canonRow 37↔38 off-by-one 도 같은 PR에서 결정(현재 마커 row37은 사용자 결정으로 유지; raster 소스 row38과의 차이를 provenance에 명문화). faction 분할(현 alliance40/empire39/neutral1=80)은 5개 추가 시 재계산 필요.
5. **provenance 원칙**: 수의 권위는 constmsg(P0), 좌표의 권위는 매뉴얼 raster(P2)로 분리 유지. 좌표 미복구 성계는 P3로 명시하고 수(85)만 캐논으로 인정.

---

## 5. 출처 교차표

| 출처 | 보고 수 | 실제 의미 | 권위 | 검증 |
|---|---|---|---|---|
| constmsg group-0x18 | 89 / 86 / **85** | 89 레코드 = 3 grid-type + 86 천체라벨; 게이트 1 빼면 85 성계 | **1** | byte-exact 디코드 (2개 빌드 일치) |
| manual-dots (星系図) | 80 | 매뉴얼 도면 dot로 식별된 성계 부분집합 | 2 | raster/json/DB 삼각검증, 페잔 1셀 결함 |
| exe-table (G7MTClient) | 100 / 5000 / 86 | 오브젝트 캡 / 셀 그리드 / 배치슬롯 — 성계 수 아님 | 3 | 6함수 주소+0x65/0x59 bound 직접 확인 |

**한 줄 판정: galaxy.json 80 ≠ 캐논. 진짜 캐논 성계 = 85 (constmsg 권위). 80은 매뉴얼 추출에서 성계 5개를 빠뜨린 P2 오차 부분집합이다.**
