# 은영전 VII 갤럭시 맵 좌표 · 특수지형 전수 조사 (2026-06-25)

"별 수를 다 써본다" — MDX에 좌표 없음 + 매뉴얼 PDF 추출 불확실 상황에서 **모든 가용 수단**으로
(A) 항성 위치(맵 레이아웃) 권위 소스와 (B) 특수지형 종류를 재검증한 read-only 조사 결과.

결론 한 줄: **정적 미니맵/galaxy_all.bmp은 위치 소스가 아니다(성계 dot 없음, 단순 성운 배경 텍스처).
전작 db.mdb에도 좌표/지형 컬럼이 없다(이름 룩업뿐). 위치 권위 소스는 여전히
`content/galaxy.json`(gin7manual p101 星系図 dot 추출)이고, 특수지형 권위 소스는 매뉴얼 §6.1이다.**

---

## PART A — 정적 인게임 미니맵 / galaxy_all.bmp

### A.1 디코드한 정적 에셋 (경로 + 헤더)
`client/vendor/logh7-installed/data/model/images/`

| 파일 | 치수 | bpp | 정체 |
|---|---|---|---|
| `Hi/galaxy_all.bmp` | 2048×1024 | 8 (256색 팔레트) | **성운 배경 텍스처** (전략맵 천구 배경) |
| `Hi/galaxy00.bmp` | 2048×1024 | 8 | galaxy_all과 동일 치수, 더 어두운 변종 |
| `Hi/galaxy_alpha.bmp` | 512×256 | 24 | 알파/마스크용 (밝은 부분 2덩어리만) |
| `Mid/galaxy00.bmp` | 1024×512 | 24 | Mid LOD 배경 |
| `Lo/galaxy00.bmp` | 512×256 | 24 | Lo LOD 배경 |

`data/image/strategy/`: `bh_flare/bh_light/bh_moya`(블랙홀 글로우), `fs000_f..fs006_f`(요새 7종 768K),
`grid_glow.bmp`, `sstar.bmp`(작은 별 스프라이트 65K), `units.bmp`, `underpanel.png`. → **전부 스프라이트/글로우 텍스처**, 위치 베이크 아님.
`data/image/map_obj/`: `mo_cloud01.tga`, `mo_cloud02.tga` (구름/성운 오브젝트 텍스처 2개뿐).

### A.2 galaxy_all.bmp 에 성계 dot 이 박혀 있는가? — **아니오**
파이썬으로 팔레트 디코드 후 분석:
- **휘도(R+G+B) 최대값 = 384** (이론 최대 765). 즉 **밝은 점광원/마커가 하나도 없다** — 전부 어두운 성운 그라데이션.
- `lum>500` 밝은 픽셀 = **0개**, `lum>650` = **0개**. 명확한 dot 클러스터 0.
- 적응형 임계(mean+3σ=305)로도 검출되는 296개 "dot-like"는 성운 텍스처의 산발적 노이즈 스페클이지
  80개 정연한 마커 집합이 아니다(galaxy00은 423개로 더 산만 = 노이즈 확정).
- 512×256 다운스케일 프리뷰 육안 확인: **세로 어두운 띠 3개를 가진 청흑색 성운**(이젤론/페잔 회랑 "목" 렌더로 보임), 점 마커 전무.

**판정: galaxy_all.bmp/미니맵은 위치 소스로 사용 불가.** 사용자가 말한 "정적 미니맵"은
정적인 게 맞지만 그 정적함은 **배경 텍스처가 정적**이라는 의미이지 레이아웃을 베이크한 게 아니다.
성계 마커는 런타임에 서버 와이어(0x0313/0x0315 그리드)로 이 배경 *위에* 그려진다.
dot 픽셀좌표→그리드 추출 경로는 존재하지 않음(추출할 dot이 없음).

> radar TGA(`rader.tga` 128×128, `rader_parts.tga` 512×512, 둘 다 type-1 8bpp)도 디코드 성공했으나
> 미니맵 UI 프레임/레이더 스윕 그래픽이지 성계 위치 데이터가 아님.

---

## PART B — 전작(E:\DGGL) db.mdb 판독

### B.1 발견 + 판독 성공
- `E:\DGGL\Games\G4EXWIN_Win_220604\db.mdb` (은영전 IV EX, 299KB, Jet3 "Standard Jet DB").
- `E:\DGGL\Games\3KD2120g_Win\3kd2data.mdb` = **삼국지(Three Kingdoms), LOGH 아님** (게다가 구버전 Jet라 ACE가 열기 거부).
- **판독 도구**: `mdb-tools` 없음, `pyodbc` 없음. **PowerShell + Microsoft.ACE.OLEDB.16.0 으로 판독 성공**(이 호스트에 ACE 설치됨).

### B.2 IV EX db.mdb 가 가진 것 = **좌표/지형 없음, 이름 룩업뿐**
```
테이블: 성계, 인물, 행성
성계  COLUMNS: 성계ID | 성계이름            (58행)  예: 0|발하라 1|바라트 4|아스타테
행성  COLUMNS: 행성ID | 성계일련번호 | 행성이름 (97행)  예: 0|0|오딘  1|0|아스가르즈
인물  : (이름 룩업, 좌표 무관)
```
- **좌표/POSITION 컬럼 없음. 특수지형/zone/회랑/항행불가 컬럼 없음. 인접(adjacency) 컬럼 없음.**
- 성계 58개(VII는 80) = 다른 게임의 더 작은 갤럭시. db.mdb는 DGGL 런처의 **이름 표시용 룩업 DB**일 뿐
  실제 게임 좌표는 `SNR00..09.DAT`(시나리오, 각 79,956B) / `CONST.DAT` / `UNIT00.DAT` 바이너리에 있다.
- SNR00.DAT 프로브: 헤더가 고엔트로피(`f1 57 85 b2 …`)에 깔끔한 레코드 stride 없음 = **패킹/암호화된 IV EX 시나리오 포맷**.
  복호 가능하더라도 IV EX 58성계는 VII 80성계와 다른 레이아웃이라 **교차검증 가치 낮음**(이름 정도만).

**판정: 전작 mdb는 위치·지형 권위 소스가 아니다.** 메모리의 "성계58/행성97"은 정확하나 그건 *이름*만이다.
좌표를 원하면 IV EX SNR DAT 복호가 필요한데, 비용 대비 효용 없음(다른 갤럭시).

---

## PART C — 특수지형 종류 전수 + 항행성(navigability) 매핑

### C.1 게임이 필요로 하는 특수지형 종류 (권위 = 매뉴얼 §6.1, pp.31–33)
`docs/logh7-manual-canon.md` §6.1 그리드 시스템:

| 그리드 타입 (캐논 일본어) | 의미 | 항행 |
|---|---|---|
| 空間グリッド (space) | 빈 공간 | 통과 가능 |
| 星系グリッド (star-system) | 성계(항성+행성/요새) | 통과 가능 (진입 제한 규칙 적용) |
| 航行不能グリッド (non-navigable) | 항행 불능 | **진입 불가** (유닛 진입 자체 차단) |

특수지형 = **航行不能グリッド의 구체 유형** (§6.1 진입제한 표 + 웹캐논):
1. **プラズマ嵐 (plasma storm)** — impassable, 전 함선.
2. **サルガッソ・スペース (Sargasso space)** — impassable (가변성/적색거성/이상중력장 영역). 전 함선.
3. **회랑(corridor)** — 별도 "지형 타입"이 아니라 **통과 가능한 성계 그리드들이 좁게 이어진 통로**.
   이젤론 회랑 + 페잔 회랑이 두 진영 영역을 잇는 유일 통로. (galaxy.json `is_corridor=1` 6성계:
   ヴァンフリート/フェザーン/イゼルローン/アイゼンヘルツ/アムリッツァ/フォルゲン)

즉 게임 규칙상 특수지형 enum은 사실상 **{통과가능, 항행불능(=플라즈마폭풍 | 사르가소)}** 의 2진 항행성이고,
회랑은 통과가능 셀의 *배치(토폴로지)* 속성이지 별도 차단 지형이 아니다.

### C.2 항행성 바이트 매핑 (0x0315 strategic-grid)
프로젝트 메모리 [[logh7-terrain-navigability-model]] (2026-06-19 RE 확정)과 정합:
- 클라 항행성 게이트 = **`objectTable[V].byte1 ∈ {1,3}` = 항행 가능** (raw 셀값이 아니라 byte1).
- 항행 불가(플라즈마/사르가소/non-navigable) = byte1 ∉ {1,3} → 클라가 해당 셀 0x0b01(이동요청) 미발신.
- 함의: 서버 0x0315 빌더가 특수지형 셀에 byte1을 1/3 이외로 내려보내면 자동으로 항행불능 처리됨.
  현재 빈 셀=값0=전배경 차단(movement 버그 후보, P0-02)도 같은 모델.

### C.3 content/galaxy.json · galaxy-adjacency.json 이 지형/회랑을 인코딩하는가?
- `galaxy.json`: 성계당 `is_corridor`(0/1)만 있음(회랑 6개 표시). **플라즈마/사르가소/항행불능 셀은 인코딩 안 됨.**
  좌표는 `canonDotX/Y`, `canonGameCol/Row`(1-indexed 와이어 셀), `spectralClass` 등 — p101 星系図 dot 추출 산물.
- `galaxy-adjacency.json`: `meta.generated=true`, radius=45/corridorRadius=60 으로 **cx/cy에서 절차생성**한 인접그래프.
  → **권위 추출이 아니라 파생물**. 회랑 플래그를 반영해 corridor 엣지를 넓게 잡는 정도.
- **결론: 특수지형(플라즈마/사르가소) 셀 자체는 어떤 콘텐츠 파일에도 아직 없다.** 회랑만 부분 인코딩.

---

## 최종 권고 — 단일 권위 소스

**(A) 항성 위치 권위 소스 = `content/galaxy.json` (gin7manual p101 星系図 dot 추출) — 변경 불필요.**
- galaxy_all.bmp/미니맵/radar TGA/전작 mdb 전부 위치를 담고 있지 않음을 본 조사로 확정.
- p101 dot 추출이 유일 캐논 좌표원이며 80/80 성계명 매칭됨. 별도 백업 소스 없음 = 이 추출을 신뢰·정제하는 게 맞다.
- 추가 검증 여지: galaxy.json 내 `canonDotX/Y` vs `canonGameCol/Row` 투영을 라이브 전략맵 렌더와 대조
  (배경 텍스처 위에 서버 그리드로 찍히므로, BMP는 시각 대조용 배경으로만 사용).

**(B) 특수지형 권위 소스 = 매뉴얼 §6.1 (`docs/logh7-manual-canon.md`).**
- enum = {통과가능 / 항행불능(플라즈마폭풍 · 사르가소)} + 회랑(토폴로지 속성).
- 매핑 = 0x0315 `objectTable[V].byte1 ∈ {1,3}` 항행성 비트.
- **갭(향후 작업): 어느 셀이 플라즈마/사르가소인지를 지정하는 데이터가 아직 없음.** 캐논 원작은 회랑 외 영역에
  소수 항행불능 띠를 둘 뿐이라, p101 星系図에서 회랑 사이 빈 영역 + 매뉴얼 서술로 수동 큐레이션해
  galaxy.json에 `terrain` 필드(예: `"plasma"|"sargasso"|null`)를 신설하는 것이 권장 경로.
  자동 추출 가능 소스는 없음(BMP·mdb·MDX 전부 부재 확인).

---

## 증거 부록 (재현 명령)
- BMP 디코드/dot 검출: 팔레트 8bpp 직접 파싱(헤더 dataoff=1078, 14+bisz 팔레트, bottom-up flip). lum max=384, dot 0.
- mdb 판독: `Provider=Microsoft.ACE.OLEDB.16.0` (Jet3 IV EX OK / Jet2 3KD 거부). 성계 58, 행성 97, 좌표컬럼 0.
- 프리뷰 이미지: 스크래치패드 `galaxy_all.png`(육안=성운, 마커 0).
- 매뉴얼: `docs/logh7-manual-canon.md` §6.1 line 310–326.
