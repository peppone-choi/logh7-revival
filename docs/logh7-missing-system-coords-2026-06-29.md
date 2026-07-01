# LOGH VII 누락 5성계 좌표 복원 판정 (2026-06-29)

3개 출처(게임 위치표 / MDX 성계 노드 / 매뉴얼 재검토)를 적대적 검증으로 합성한다. refuted 출처는
권위에서 제외하고, 좌표 날조는 금지한다. 대상은 constmsg group-0x18 에 캐논 라벨로 존재하지만
manual 星系図(p101) dot 부분집합(80개)에서 빠진 **누락 5성계**다.

대상 5성계 (constmsg group-0x18 subId / galaxy.json idx / contentId):

| sub | 라벨(ja) | 라벨(ko) | galaxy.json idx | contentId |
|---|---|---|---|---|
| 13 | アンウレガルラ | 안우레갈라 | 80 | 13 |
| 32 | ケープホーン | 케이프혼 | 81 | 32 |
| 34 | コブラヴェルデ | 코브라베르데 | 82 | 34 |
| 52 | ニーベルング | 니벨룽 | 83 | 52 |
| 75 | モンサルヴァール | 몬살바르 | 84 | 75 |

(sub45 タンホイザーゲート 은 항행 게이트로 성계 아님 — 대상 제외. 자세한 수 판정은
[[logh7-true-system-count-2026-06-29]] 참조.)

---

## 0. 결론 (요약)

- **5성계 좌표는 어떤 자산에서도 복원 불가 (recoverable = false).** 게임 데이터 위치표는 존재하지
  않고, MDX엔 좌표가 아예 없으며, 매뉴얼 星系図 p101 에는 이 5개의 dot/label 이 없다.
- **권위 좌표원 = 매뉴얼 星系図 dot 래스터(P2)** = `content/galaxy-raster-star-centers.json`. 단 이
  권위원은 80개 dot 만 담고 있고 누락 5성계는 포함하지 않는다. 그래서 5성계는 좌표 권위가 부재한 P3 다.
- **"게임 데이터 위치표가 있으면 85 전체를 그걸로 교체" 가정은 무효** (isManualP2SupersededByGameData =
  false). 그런 테이블은 **존재하지 않는다.** EXE의 모든 "position" 문자열은 WIRE 메시지 타입이고,
  galaxy 격자는 런타임 서버 응답 페이로드(0x313/0x315)일 뿐 정적 데이터가 아니다.
- 따라서 **수의 권위 = constmsg(P0, 85성계), 좌표의 권위 = 매뉴얼 dot(P2, 80개만)**. 두 권위는
  분리 유지한다. 누락 5성계는 **이름 P0 / 좌표 P3** 로 정직 표기하고 strategic-grid 마커에서 제외한다.
- galaxy.json 은 이미 이 정직 상태로 5엔트리(idx 80~84)를 담고 있다 — 추가 변경 불필요. 좌표가
  나중에 라이브(서버 emitter + 클라 렌더 화면)로 입증되면 그때만 채운다.

---

## 1. 출처별 발견 (적대적 검증 결과)

### 1.1 game-position-table (게임 데이터 위치표) — **REFUTED**, 권위 제외

주장된 등급 P2. 적대적 검증 결과 **존재 자체가 반증됨.**

- `hasTable=false, covers=none, found5=[]` — 전부 입증됨. 리포 전역 `game-position-table` 참조 0건.
- 캐논 EXE(SHA256 `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`, 설치된
  playable 와 일치)의 모든 "position" 문자열은 **WIRE 메시지 타입**이다:
  `ResponsePositionBase` / `RequestPositionUnit` / `Input_ResponsePositionUnit::input_from_stream` /
  `Output_CommandMoveShip to_position`. 정적 좌표표가 아니다.
- 격자 핸들러 직접 검증 (`RE/misc/.tmp_ba2b0.c` 376–399, `FUN_004ba2b0`):
  - opcode 스위치 `param_2 & 0xffff`.
  - case `0x313`: 수신 wire 버퍼(`param_3`)를 클라 RAM `base+0x3f57d4` 로 벌크 복사(0x4b dword + tail).
  - case `0x315`: `param_3` → `base+0x3f4448`(0x4e3 dword) 복사 후 `FUN_004abbb0(base+0x3f444c, param_3)` 호출.
  - **둘 다 EXE 정적 데이터를 전혀 읽지 않는다. 소스 = 네트워크.** 심볼
    `ResponseStaticInformationGridType` / `ResponseStaticInformationGrid_OK` 가 서버-응답 핸들러임을 확정.
- RLE 전개 검증 (`FUN_004abbb0`): `[u8 w][u8 h][u16 count]` 후 `{run,value}` 반복 → textbook RLE.
  `count<0x1389`(=5000) 게이트는 `.debug-journal.md` 와 일치. 격자 내용 100% wire(`param_2`)에서 옴.
- 문자열 검증 (redex): `RequestStaticInformationGrid` / `RequestStaticInformationGridType`(클라가
  서버에 요청), `[Input_StaticInformationGrid::input_from_stream] buf_size[%d] is over than 5000`(스트림
  파싱 wire), `../data/model/strategy/galaxy.mdx`(유일한 baked galaxy 자료 = 3D 메시 경로).
  모든 "coord" 히트는 MDX 메시 속성(texcoord/MeshTextureCoords/Coords2d/xcoordinates), `starsystem` 0건.
- 독립 보강: 격자 dest 오프셋 0x3f4448/0x3f57d4 를 참조하는 함수는 writer `FUN_004ba2b0` 와
  reader `FUN_004c5350`(one-shot 스냅샷 소비자, guard byte +0x2c03c0) 둘뿐. reader 도 wire 로
  채워진 RAM 만 읽고 정적 데이터는 안 읽는다. 끊김 없는 계보: **wire → 0x313/0x315 핸들러 →
  클라 RAM(RLE 전개) → UI 스냅샷.** 매핑할 source 테이블 자체가 EXE에 없으므로 node↔system
  매핑이 "임의/오독" 일 가능성조차 성립하지 않는다.

→ **판정: game-position-table 은 존재하지 않는다. 권위 좌표원으로 채택 불가. 5성계 좌표를 여기서
복원할 수 없다.**

### 1.2 mdx-star-nodes (MDX 성계 노드) — confirmed (좌표 없음), 권위 P1이나 좌표 부재

주장된 등급 P1. **좌표 부재가 confirmed.**

- 인용 구조(count=85, stride 0xE8, node[0]=star_01_G, mem_base 0x01e30048)는 라벨이 부정확하다 —
  실제로는 `Null_galaxy.mdx`(SHA256 `073f96ee…3652283`, 120558 B) 의 것이지
  `data/model/strategy/galaxy.mdx`(SHA256 `cfde6e8d…`, 16508 B, 스카이돔) 가 아니다. galaxy.mdx 는
  611 float dword(±49000 구면 정점)를 갖는 스카이돔. 오프셋 자체는 Null_galaxy.mdx 기준으로 정확,
  **파일 라벨만 느슨.**
- 음수 float 결과 재확인+강화: `[1e-3,1e5]` 뿐 아니라 `[1e-6,1e9]`/`[1e-30,1e30]`/`[0.5,1e6]`
  에서도 **plausible float ≥3 연속 = 0**. 2D 픽셀 범위 int16 run `[1,4000]` = 0. 노드별 0xE8 레코드
  바디(rec 0/1/2/40/78/84) 의 plausible float = 0. int32 "run" 은 h1 순차 인덱스 배열(0..84) 과
  h2 face/keyframe 인덱스 레코드(floats=0.0)일 뿐 — 좌표 아님.
- `[[logh7-mdx-coords-recheck-2026-06-25]]` 의 포인터-체이스 최종 확정과 일치: base-relocation 으로
  힙 포인터 끝까지 추적해도 전 파일 비-LOD float 삼중쌍 = 0개, 위치 테이블 부재. 노드는 **이름**
  (`star_NN_<분광형>`, `bh_NN`/`ns_NN`)으로만 정체 확정. 분광형(타입)은 MDX 노드명에 있으나
  **좌표(x,y,z)는 MDX에 없다.**
- (부수) 주장의 `galaxy.json systems=80` 은 `server/content/galaxy.json` 기준 stale — 현 캐논은 85.
  '79 vs 80' 논쟁도 stale. 무좌표 결론에는 영향 없음.

→ **판정: MDX는 분광형 권위(P1)일 뿐 좌표 권위가 아니다. 5성계 좌표를 여기서 복원할 수 없다.**

### 1.3 manual-recheck (매뉴얼 星系図 p101 재검토) — confirmed, 권위 P0 (방법), 5성계 dot 부재

주장된 등급 P0(재검토 방법론). **5성계 모두 p101 에 없음이 confirmed.**

- `アンウレガルラ`(sub13): p101 라벨/dot 없음. anywhere_in_labels=[], as_lead_system=False, alt PDF 0건.
- `ケープホーン`(sub32): p101 라벨/dot 없음. anywhere_in_labels=[], alt 0건.
- `コブラヴェルデ`(sub34): p101 라벨/dot 없음. 이전 substring "found" 은 リオ・ヴェルデ(Rio Verde, 별개
  plotted 성계) 안의 'ヴェルデ' 에 걸린 **false positive.**
- `ニーベルング`(sub52): p101 라벨/dot 없음. anywhere_in_labels=[], alt 0건.
- `モンサルヴァール`(sub75): p101 라벨/dot 없음. 이전 substring "found" 은 エル・ファシル 행성
  サルバドル(Salvador) 안의 'サルバ' 에 걸린 **false positive.**
- 수치 드리프트(무관): 최소 pairwise 마커 거리 18.564pt(maker) vs 18.555pt(독립 rect-center 측정,
  ~0.05% 차) — no-overlap 결론 불변.
- 인덱스 체계 주의: 5성계는 constmsg group-0x18 번호로 sub13/32/34/52/75 이지만 galaxy.json 배열에선
  idx 80~84 다. 두 인덱스 공간은 다르다(galaxy.json idx 13 = マローヴィア, 완전 plotted 성계).

→ **판정: 좌표 권위원(매뉴얼 dot 래스터)에 5성계 dot 가 부재한다. 권위원 자체가 이들을 안 담으므로
좌표를 여기서도 복원할 수 없다.**

---

## 2. 권위 순위 (좌표 한정)

질문의 가정 순위는 "게임 데이터표 P0 > MDX P1 > 매뉴얼 P2" 였다. 적대적 검증으로 재정렬:

| 순위 | 출처 | 좌표 권위 | 5성계 좌표 제공 | 비고 |
|---|---|---|---|---|
| (제외) | game-position-table | — | 불가 | **존재하지 않음(refuted).** EXE position 문자열=wire 타입, 격자=런타임 페이로드 |
| (제외) | MDX 성계 노드 | — | 불가 | 좌표 float 0개. 분광형(타입) 권위일 뿐 |
| **1 (실권위)** | 매뉴얼 星系図 dot 래스터 | **P2** | 불가(80개만 담음) | `content/galaxy-raster-star-centers.json` → galaxy.json canonCol/canonRow |
| 2 (장래) | 라이브 입증 | 미정 | 잠재적 | 서버 emitter + 클라 G7MTClient 렌더 화면 동시 입증 시에만 |

**핵심 보정: 가정된 P0 좌표 테이블(game-position-table)은 실존하지 않으므로 매뉴얼 dot(P2) 이
사실상 유일하고 최상위인 정적 좌표 권위다.** 그러나 그 권위원이 5성계를 안 담는다.

**좌표 날조 금지 원칙:** 좌표를 만들어 P0/P2 로 승격하는 것은 금지. 블랙홀/중성자별
`_specialBodies` 와 동일 원칙(galaxy.json `_cellPlacement: UNVERIFIED (P3)`).

---

## 3. 5성계 좌표 (복원분 / 미복원분)

복원분: **없음.** 세 출처(refuted 1 + confirmed-무좌표 2) 어디에도 좌표 데이터가 없다.

미복원분 (정직 표기, galaxy.json 현행 상태와 일치):

| sub | 라벨(ja) | canonCol/Row | canonGameCol/Row | cx/cy | positionAuthority | nameAuthority |
|---|---|---|---|---|---|---|
| 13 | アンウレガルラ | null | null | null | UNVERIFIED_P3 | constmsg-group-0x18-P0 |
| 32 | ケープホーン | null | null | null | UNVERIFIED_P3 | constmsg-group-0x18-P0 |
| 34 | コブラヴェルデ | null | null | null | UNVERIFIED_P3 | constmsg-group-0x18-P0 |
| 52 | ニーベルング | null | null | null | UNVERIFIED_P3 | constmsg-group-0x18-P0 |
| 75 | モンサルヴァール | null | null | null | UNVERIFIED_P3 | constmsg-group-0x18-P0 |

이름(이/저 표기)은 P0(constmsg 디코드) 권위로 확정. 좌표는 전부 미복원 → P3.

---

## 4. "게임 데이터표가 있으면 85 전체를 교체?" — 무효

- 전제(game-position-table 존재)가 거짓이므로 결론도 적용 불가
  (isManualP2SupersededByGameData = false).
- 설령 미래에 그런 테이블이 입증되더라도, 격자는 **런타임 서버 응답 페이로드**이지 좌표 테이블이
  아니다. 좌표 권위는 (a) 매뉴얼 dot(P2, 정적 캐논) 또는 (b) 라이브 입증(서버 emitter + 클라 렌더)
  으로만 성립한다. 80개 manual-confirmed 좌표를 비실존 테이블로 일괄 교체할 근거는 없다.

---

## 5. actionPlan

좌표 미복원이 확정이므로 **galaxy.json 5엔트리는 현행 P3 상태 유지(추가 변경 불필요)**:

1. **5엔트리 좌표 = null 유지, positionAuthority=UNVERIFIED_P3, coordinatePending=true 유지.**
   좌표 날조 금지. (현재 `server/content/galaxy.json` idx 80~84 이미 이 상태.)
2. **strategic-grid 마커에서 5성계 제외 유지** — canonCol/canonRow 가 null 이므로 0x0315 빌더가
   마커를 배치하지 않는다(좌표확정 80개만 마커). 블랙홀/중성자별 `_specialBodies` 와 동일 정책.
3. **이름 권위(P0) 보존**: nameAuthority=constmsg-group-0x18-P0, contentId=해당 sub 유지.
4. **수 권위(P0)와 좌표 권위(P2) 분리 명문화**: 성계 레코드 85 / 좌표확정 마커 80. (테스트 재정렬은
   [[logh7-true-system-count-2026-06-29]] §4 의 actionIfWrong 으로 추적 — 이 문서는 좌표 한정.)
5. **좌표 복원의 유일한 장래 경로 = 라이브 입증**: 서버가 5성계를 0x0315 격자에 emit 하고 클라
   G7MTClient 화면에서 dot 위치가 렌더되는 것을 동시에 관찰(shaVerified:true). 그 전까지 P3 고정.
   추측 좌표를 P0/P2 로 승격하는 어떤 변경도 금지.

---

## 6. 리스크 / 정직 캐비엇

- **좌표 영구 미복원 가능성**: 매뉴얼 도면에 dot 가 없고 게임/MDX 어디에도 좌표가 없으므로, 원전
  자료만으로는 이 5성계 좌표가 영구히 복원 불가일 수 있다. 라이브 emitter↔렌더 입증이 유일 경로.
- **이름 음역 미확정 위험**: galaxy.json 의 ja 표기(アンウレガルラ 등)는 constmsg 디코드 그대로다.
  영문 캐논(An-Uru-Galla/Cape Horn/Cobra Verde/Nibelung/Monsalvat 류)은 추정이며 P0 아님.
- **인덱스 혼동 위험**: sub(constmsg 13/32/34/52/75) ≠ galaxy.json idx(80~84). 좌표/마커 작업 시
  두 인덱스 공간 혼용 금지.
- **MDX 파일 라벨 느슨함**: 인용 노드 구조는 galaxy.mdx 가 아니라 Null_galaxy.mdx 의 것. 향후
  galaxy.mdx(스카이돔, 611 float)를 좌표원으로 오인하지 말 것 — 둘 다 성계 좌표 없음.
- **manual 추출기 false-positive 재발 위험**: コブラヴェルデ/モンサルヴァール 의 과거 "발견"은 다른
  성계/행성 이름 안의 substring 오탐이었다. 향후 재검색 시 정확 일치(whole-label)만 채택.
