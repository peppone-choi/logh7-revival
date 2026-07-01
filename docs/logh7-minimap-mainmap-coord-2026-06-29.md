# LOGH VII — 미니맵 vs 메인맵 성계 위치 정합 분석 (2026-06-29)

대상: 전략 갤럭시 맵의 "미니맵"(정보창 탭 chrome)과 "메인맵"(100×50 셀 그리드 렌더), 그리고
서버가 내려보내는 셀 좌표 소스. 세 좌표 파이프라인을 나란히 놓고 불일치 지점을 확정한다.

데이터 등급 표기: P0 = 원본 서버 권위 / 클라 RE 확정, P1 = 공식 매뉴얼(星系図) 추출, P2 = 매뉴얼 PDF
재추출/근사. 본 문서의 성계 좌표 데이터는 **P2(gin7manual PDF 라스터/주석 추출)** 이며, 원본 서버
상태 권위가 아니다 — 아래에서 절대 P0로 과장하지 않는다.

검증 상태: **라이브(SHA-검증 클라) 미검증.** 아래 클라측(미니맵/메인맵) 판정은 모두 정적 RE
(redex/Ghidra decompile) 근거이며, 실제 렌더 좌표와 바인딩하는 Frida 함수경계 캡처는 아직 수행하지
않았다. "확정"은 정적 근거에 한함.

---

## 0. 핵심 결론 (TL;DR)

- "미니맵 vs 메인맵 성계 위치 불일치"라는 전제 자체가 **부분적으로 잘못된 전제**다.
  조사 대상으로 지목됐던 `FUN_005123b0`("미니맵")은 **성계 위치를 전혀 그리지 않는다.**
  그것은 3탭 정보창의 1번 탭 레이아웃 빌더이고, `rader_bar.tga`는 장식용 상태-바 스프라이트일 뿐
  미니맵 점 소스가 아니다. → 미니맵에는 비교 가능한 "성계 좌표 소스"가 **존재하지 않는다.**
- 따라서 진짜 비교는 **(A) 메인맵 셀→화면 투영(클라, P0 RE)** ↔ **(B) 서버가 채워 보내는 셀
  좌표(P2 매뉴얼 데이터)** 두 축이다. 둘은 같은 셀 좌표 공간(100×50, `row*100+col`)을 공유하므로
  **정합되어 있다.** 불일치 위험은 좌표 *소스의 권위/정확도*에 있지, 투영 수식에 있지 않다.

---

## 1. 세 파이프라인 Side-by-Side

| 항목 | (가칭)미니맵 `FUN_005123b0` | 메인맵 렌더 (클라) | 서버 셀 소스 (server/) |
|---|---|---|---|
| 정체 | 3탭 정보창 1번 탭(相関/status) 정적 레이아웃 빌더 | 전략 셀 그리드→화면 렌더 클러스터 | `buildStrategicGalaxyGrid` 셀 배정 |
| 좌표 소스 | **없음** (모든 위젯 rect = 하드코딩 immediate) | 셀 ID = `*(int*)(rec+0x10)`, 음수=미설정 | `canonCol`/`canonRow` (P2) → 셀 직배치 |
| 선형값 인코딩 | n/a | `col + row*100` (N=100), %100 / /100 디코드 | flat index `row*100+col` (동일 스킴) |
| 셀→월드 | n/a | `worldX=col-50.0, worldZ=25.0-row, Y=0`<br>(선/중점은 -49.5/24.5, 0.5 셀센터 오프셋)<br>`FUN_004d3500/FUN_004d3540` | (서버는 셀만 송신, 월드변환 안 함) |
| 월드→화면 | n/a | D3D World·View·Proj·Viewport 행렬변환<br>`FUN_004d2fe0→thunk_FUN_005a556c`<br>(글로벌 DAT_009d1428/13a8/1368/13e8) | n/a |
| `tga`/asset | `data/image/rader/bar.tga` (상태바 chrome) | `Rader/Rader_parts.tga`는 **전투 레이더**(`FUN_004ede60`), 메인맵 아님 | n/a |
| 데이터 등급 | n/a | **P0** (클라 RE 확정) | **P2** (매뉴얼 PDF 추출) |
| 검증 | 정적 RE | 정적 RE (라이브 미검증) | 서버 테스트 통과(3/3), 라이브 미검증 |

---

## 2. (가칭)미니맵 = `FUN_005123b0` — 성계 좌표가 없다 [confirmed, 정적]

- 유일 호출자 `FUN_0054e570`는 탭 디스패처: `if(*p==1) FUN_005123b0(); else if(==2) FUN_004ff3c0();
  else if(==3) FUN_0051ca30();`. 즉 3탭 창의 1번 탭 레이아웃을 만든다.
- 위젯은 `FUN_00503a10`(alloc)로 만들고 `FUN_00502940`(set-rect: 5-int 구조 [x,y,?,w,h]를
  widget+0x20에 복사)로 배치한다. 전달되는 x/y/w/h는 **전부 하드코딩 immediate.**
- 유일한 동적값은 위젯 **폭/높이**인데, 이는 윈도 client RECT 차이다:
  `w = *(DAT_007c1b4c+0x2a604) - *(+0x2a5fc)` (right-left), `h = *(+0x2a608) - *(+0x2a600)`
  (bottom-top). 이 RECT 오프셋(left=+0x2a5fc, top=+0x2a600, right=+0x2a604, bottom=+0x2a608)은
  `FUN_004ea460`가 `local_10.right`를 +0x2a604에 저장하는 것으로 증명됨. **윈도 크기지 성계 좌표가
  아님.**
- `rader_bar.tga`(= `data/image/rader/bar.tga`, 문자열 @0x00785b14)는 4프레임 소스-rect 스프라이트
  스트립을 고정 widget rect(x=0,y=1,w=0xeb,h=0x1a)에 배치하는 **장식 상태바**(`FUN_00502fe0`)다.
- 데이터 구동 do/while 루프들은 텍스처 경로 포인터 테이블(soukan_*, BEAM_*, icon_normal_kojin_* 등)
  위를 도는 것이지 **성계 위치 테이블이 아니다.**
- 진짜 전술 레이더(`Rader/Rader_parts.tga` @0x007744b8)는 `FUN_004ede60`이 소비한다(전투 필드 컨텍스트
  param_1+0xa4xx..0xa7xx). **이것도 메인맵 성계 투영이 아니다.**

→ **미니맵에는 world→minimap-pixel 투영도, 성계 좌표 읽기도 없다.** 따라서 "미니맵 vs 메인맵 성계
위치 불일치"는 미니맵 쪽에 비교항이 없어 **성립 불가(non-comparable)**.

(under-cite 주의: 위 RECT 4-오프셋 매핑 중 right만 직접 인용됐던 원 클레임을 `FUN_004ea460` 전체
매핑으로 보강했다 — 오류 아님.)

---

## 3. 메인맵 셀→화면 투영 (클라) [confirmed, 정적]

2단계 투영:

1. **셀(col,row) → 월드 중심원점 좌표** (`FUN_004d3500/FUN_004d3540`):
   `worldX = col - 50.0`, `worldZ = 25.0 - row`, `Y = 0`.
   (라인/중점 변형은 -49.5 / 24.5 로 0.5 셀-센터 오프셋. RE-확정 오프셋 글로벌:
   `worldX = col - _DAT_0066e624`, `worldZ = _DAT_0066e620 - row`.)
2. **월드 → 화면** (`FUN_004d2fe0 → thunk_FUN_005a556c`): D3D World·View·Projection·Viewport 행렬
   변환. 행렬 글로벌은 `FUN_004d2f80`이 렌더러 vtable에서 적재:
   - SetTransform 3 (PROJECTION) → `&DAT_009d13a8`
   - SetTransform 2 (VIEW) → `&DAT_009d1368`
   - SetTransform 0x100 (WORLD/texture) → `&DAT_009d13e8`
   - `&DAT_009d1428` → vtable+0xa4 (SetViewport)
   - `FUN_004d3580`은 결과 float를 `ftol`로 정수화하는 **헬퍼**일 뿐 투영 본체가 아님.

셀 ID 소스: 선택/상태 레코드 `+0x10`은 **32-bit signed int** (음수 -1 = 미설정)이며,
`+0x24(col) + +0x28(row)*100`으로 재인코딩(`FUN_004d6b70` 569-570). 즉 클라 메인맵의 선형값 스킴은
확정적으로 `col + row*100`, N=100.

(레이블 주의: 원 클레임의 "16-bit cell ID"는 부정확 — 필드는 32-bit int. 범위 0..4999가 16비트에
들어갈 뿐 movzx 읽기는 없음. 또한 `+0x10`은 두 구조에서 의미가 다르다: rich-cell 배열 레코드의
`+0x10`은 투영된 화면좌표의 **목적지**(`FUN_004d35e0`), 선택/상태 레코드의 `+0x10`만 셀 ID다.)

클라 소비 체인(redex EXACT 확인): `FUN_004abbb0`(RLE 디코더, u16 count<0x1389, (run,value) 쌍,
width*height row-major fill) → `FUN_004c8b70`(셀 접근자: `DAT_007ccffc + row*100 + 0x2c03cc + col`,
bounds col<100/row<0x32 — **row-major `row*100+col` 확인**) → `FUN_004d3540`(셀→월드) →
`FUN_00522010`(group-0x18 라벨) → `FUN_004d6310`(항행 게이트).

---

## 4. 서버 셀 소스 (server/) — P2 매뉴얼 데이터 [정합되어 있으나 권위는 P2]

`server/src/server/logh7-login-protocol.mjs`:

- `strategicGalaxyCanonCell(system)` (743-749행): `canonCol`/`canonRow`를 **그대로** 셀로 사용
  (0..99 / 0..49 bounds 검사). 정수 캐논셀이 있을 때 **권위적**.
- `strategicGalaxyProjectionPoint(system)` (685-693행): 매뉴얼 프레임을 `{x: cy, y: cx}`로
  **transpose**(page-101 주석 프레임은 이미 y-flip/아이콘 앵커라 다시 미러하면 이중 미러).
- `buildStrategicGalaxyGrid(...)` (987행~):
  - 캐논셀 보유 시 → `startCol=canon.col, startRow=canon.row` **직배치**(선형 워프 없음, 1039-1042행).
  - 캐논셀 없는 입력(프로브/레거시/테스트)만 선형 폴백:
    `startCol = 2 + round((x-minX)/spanX*95)`, `startRow = 2 + round((y-minY)/spanY*45)` (1044-1045행).
    이는 `.claude/workflows/logh7-galaxy-positions.js:21`의 수식과 일치.
  - 셀값 = flat index 의미상 `row*100+col`과 동일 스킴 → 클라 디코더(`%100`, `/100`)와 정합.

데이터 권위(과장 금지):
- `content/galaxy.json._source` = "gin7manualsaved.pdf 星系図 special Text annotations (80 system
  labels; cx/cy only); canonCol/canonRow are zero-indexed wire cells from page-101 raster star-dot
  centers" → 즉 **P2 매뉴얼 PDF 추출**이지 원본 서버 상태가 아니다.
- 프로비넌스 테스트(`server/tests/server/logh7-strategic-grid-provenance.test.mjs:128`)는
  `map.source == 'content/galaxy.json manual star-chart annotations'`를, line 177은
  `provenance.spectralClass.originalServerData == false`를 단언한다. (테스트 3/3 통과.)
- 캐논셀 성계만 권위적 배치를 받고, 선형-폴백 성계는 코드 주석·프로비넌스에서 **근사로 명시**된다.
  서버 코드는 매뉴얼 좌표를 원본 서버 상태와 동일하다고 승격하지 **않는다.**

---

## 5. "같은 소스인가?" — 불일치의 정확한 지점

- **미니맵 ↔ 메인맵**: **non-comparable.** 미니맵(`FUN_005123b0`)은 성계 좌표 소스 자체가 없다
  (immediate + 윈도 RECT만). 따라서 "성계 위치 불일치"라고 부를 두 값이 미니맵 쪽에 부재.
  → 전제 교정: 미니맵은 성계 점을 그리지 않는다.
- **메인맵(클라 투영) ↔ 서버 셀 소스**: **정합(consistent).** 둘 다 `row*100+col` (N=100) 셀
  공간을 공유하고, 서버는 캐논셀을 그 공간에 직배치하며 클라는 그 셀을 동일 스킴으로 디코드해
  `worldX=col-50, worldZ=25-row`로 투영한다. **투영 수식 차원의 불일치는 없다.**
- **남은 진짜 위험(불일치가 생긴다면 여기서):**
  1. 좌표 *권위/정확도* — 서버 셀은 P2(매뉴얼 PDF 라스터 dot 중심)다. dot↔성계명 매칭/프레임 정합이
     틀리면 성계가 엉뚱한(또는 항행불가) 셀에 배치된다. 이는 *데이터* 문제지 투영 문제가 아니다.
  2. 선형 폴백 경로 — `canonCol/canonRow`가 빠진 입력은 min-max 선형정규화로 떨어져 두 진영영역
     갭/통과셀을 무시 → 항성이 흑색(항행불능) 셀에 떨어질 수 있다. 캐논셀이 모든 80성계에 채워져
     있는 한(현재 테스트상 80/80 유효) 이 경로는 타지 않는다.
  3. transpose 방향 — `strategicGalaxyProjectionPoint`의 `{x:cy, y:cx}`가 캐논셀 추출 시의
     프레임과 어긋나면 전체 맵이 회전/미러된다. 캐논셀이 직배치되므로 *캐논 경로*에는 영향 없고,
     선형 폴백에만 영향.

---

## 6. 권장 정합 작업 (fix)

- 코드 차원의 투영 불일치는 없다 → **투영 수식 변경 불필요.**
- 정합해야 할 것은 (a) 모든 송신 성계가 `canonCol/canonRow`를 갖도록 보장(선형 폴백 회피), (b) 캐논
  추출 프레임과 서버 transpose 방향의 일관성 회귀 테스트, (c) **라이브 바인딩 검증**으로 P2 데이터가
  실제 렌더 dot 위치와 맞는지 확인.
- 구체 fix는 반환 JSON의 `fix`/`fileTargets`/`risks` 참조.

---

## 7. 미해결 / 다음 증거 (정직 표기)

- **라이브 미검증.** `FUN_004d2fe0`/`FUN_004d3580` 함수경계 Frida 프로브로 실제 (col,row)→screen(x,y)
  한 쌍을 SHA-검증 클라에서 캡처해 렌더된 성계 dot와 대조해야 소스→화면 바인딩이 P0로 닫힌다
  (logh7-live). 본 문서 정적 판정에는 불필요하나 데이터 정확도(P2→실측) 검증에는 필수.
- 포워드 포인터(`FUN_004ede60` 전투레이더, 그리드 파서 `FUN_0041c5f0`/`FUN_00413050`/`FUN_004ba2b0`)는
  존재·시그니처만 확인, "성계 투영 본체임"은 미증명 — 다음 증거 포인터로만 사용.
