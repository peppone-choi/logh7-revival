# MDX 성계/행성 위치·타입 전수 재검증 (적대적) — 2026-06-26

사용자 의심점: "성계 위치·성계 타입·행성 위치 자체가 MDX에 하드코딩돼 있을 것(이름만 없을 수도)."
기존 RE 결론(반증 대상): "MDX엔 위치 부재, 위치권위=galaxy.json(p101 PDF), MDX 노드명=분광형 타입만."

본 문서는 그 결론을 **적대적으로** 재검증한 결과다. 모든 수치는 바이트에서 직접 읽었다. 추측 데이터 없음.

---

## 1. MDX 파일 목록 (전수, strategy/ 디렉터리)

캐논 경로 `client/dist/logh7-client/data/model/strategy/` (vendor/logh7-installed/ 동일 사본):

| 파일 | 크기 | 헤더 count[1..6] | star_ 노드 | 비고 |
|---|---|---|---|---|
| **Null_galaxy.mdx** | 117.7K (120558B) | 85,85,765,1,1,85 | 79 unique (`star_NN_<분광형>`) | ★성계 본체 후보 |
| **galaxy.mdx** | 16.1K (16508B) | 2,2,18,1,1,2 | 0 (`galaxy:Layer1/2`) | 갤럭시 배경 돔 메시 |
| grid.mdx | 43.1K | 1,1,9,1,1,1 | 0 | 그리드 오버레이 메시 |
| 06.mdx | 23.6K | 8,8,80,1,1,8 | 0 | (스프라이트/마커 메시) |
| bh_core.mdx / bh_wave.mdx | 43.9K / 57.3K | — | 0 | 블랙홀 이펙트 |
| test_warp.mdx | 7.1K | 1,1,0,1,0,0 | 0 | 워프 테스트 메시 |

(루트 `data/model/`엔 dummy.mdx + Ship/Planets/Effect/demo MDX 다수 — 성계위치 무관, 제외.)

---

## 2. MDX 바이너리 포맷 실파싱 (메모리덤프 씬그래프)

MDX는 **메모리 이미지 덤프**다(클린 파일포맷 아님). 헤더 0x00..0x4F = 10개 `(ptr,count)` 디스크립터.
포인터는 메모리주소(0x01e3xxxx)지만 **base 보정으로 전부 in-file 해석 성공**:
`mem_base = 0x01e30048` (= header[0].ptr 0x01e300a0 − 노드배열 파일오프 0x58).

### Null_galaxy.mdx 구조 (검증됨)
- **h0 @file 0x58, count=85**: 노드배열, stride **0xE8**. 노드0 = `star_01_G`.
- **h1 @0x4d60, count=85**: 순차 인덱스 배열 `0,1,2…84` (노드 ID 맵).
- **h2 @0x5076, count=765**: 0x1c-byte 레코드 배열 `[ptr][1][idx 0..764][1][1][0][0]` — 순차 인덱스 레코드(면/키프레임 리스트). **좌표 아님.**
- **h5 @0xa422, count=85**: 또 다른 노드명 배열(`star_01_G` 재등장).
- 노드레코드 내부 비제로 dword = 이름(ASCII) + `+0x88`/`+0x94` 포인터 → **자식 인덱스 배열**(`0,1,2,3…`), 좌표 아님.

### ★결정적 음성결과: 좌표 float 전무
Null_galaxy.mdx 전체 120558바이트를 4바이트 정렬로 스캔, **연속 3개 이상의 비제로 plausible float(|f|∈[1e-3,1e5]) 런 = 0개.**
노드레코드(0x10..0x80) 내 비제로 float = 0. 즉 **3D translation/pivot/vertex 좌표가 어디에도 인코딩돼 있지 않다.**
Null_galaxy는 위치 없는 **순수 노드명 테이블 + 인덱스 레코드**(레이아웃은 런타임/외부가 결정).

분광형(spectral): 노드명 `star_NN_<X>` 의 `<X>` = O/B/A/F/G/K/M 1글자(+`bh_NN` 블랙홀·`ns_NN` 중성자성). **타입은 노드명에만 존재**, 위치는 없음.

### galaxy.mdx (적대적 양성 후보 — 그러나 위치 아님)
galaxy.mdx엔 비제로 float 런이 **다수** 존재(±49340, ±37130, ±25940, ±7833 …). 그러나:
- 노드명 = `galaxy:Layer1`/`galaxy:Layer2`, 소스 = `galaxy.lwo` (배경 메시).
- 5-float stride(x,y,z,u,v)로 **101개 정점** 추출 → **반지름 49221~51166 (평균 50207, ±2%) = 등반경 구(球)/돔 메시.**
- 즉 갤럭시 **배경 스카이돔(skybox) 지오메트리** + UV. 성계 80개의 산포 좌표가 아님(정점이 구면에 균일분포).

---

## 3. galaxy.json 대조

`server/content/galaxy.json`: **systems=80**, 총 planets=281(별도 합산), 좌표필드 per-system:
`rect, cx, cy, canonCol/Row, canonDotX/Y, canonPixelX/Y, canonGameCol/Row, canonColorRgb, spectralClass, spectralClassSource`.

예) system[0]: `cx=259.2, cy=63.3, canonDotX=257.856, canonDotY=759.725, canonCol=5, canonRow=20, rect=[249,52,269,74]`.

- **좌표계 불일치**: galaxy.json은 **2D 픽셀/그리드**(PDF 星系図 스캔 좌표, 수백~수천 px). galaxy.mdx는 **3D 구면**(±50000 단위). 매핑 불가·무관.
- **개수 불일치**: MDX 노드 79 (star_NN) vs galaxy.json 80 성계. (메모리 기록의 "86 vs 80"은 본 파일 기준 79로 정정.)
- **분광형 출처 이원화**: galaxy.json은 자체 `spectralClass`+`spectralClassSource` 보유. Null_galaxy의 `star_NN_<X>`도 분광형을 들고 있으나 **인덱스가 성계 순서와 동일하다는 보장 없음**(노드순≠galaxy.json 순). 위치 부재로 인덱스 정합 불가.

---

## 4. ★판정 (P0/P1/P2/P3)

- **[P0] MDX에 성계/행성 위치(3D float 좌표) 하드코딩 = 없음.** Null_galaxy.mdx 전수 스캔 결과 비제로 좌표 float 0개(연속 3+런 0). 노드레코드·자식포인터·h2 레코드 전부 인덱스/이름이며 translation/pivot/vertex 좌표 부재. **기존 RE 결론 유지(반증 실패 = 사용자 의심 기각).**
- **[P0] 성계 타입(분광형)은 MDX 노드명에 존재.** `star_NN_<O|B|A|F|G|K|M>` (+bh/ns 특수천체). 단 위치는 없음. galaxy.json도 동일 분광형을 독립 보유.
- **[P0] galaxy.mdx의 float 좌표 = 배경 스카이돔 정점(반경~50000 구면), 성계 위치 아님.** 노드 2개(Layer1/2), galaxy.lwo 배경메시.
- **[P0] 위치 권위 = galaxy.json(PDF p101 星系図 추출)**, 2D 픽셀/그리드 좌표. MDX와 좌표계·스케일 무관.
- **[P1] 개수 정정**: Null_galaxy star 노드 = 79 (이전 메모 "86" 정정), galaxy.json = 80 성계. 1개 차(노드순≠성계순이라 1:1 매핑 미확립).
- **[P2] 행성 위치**: MDX 어디에도 행성단위 좌표 노드 없음(strategy/ 내 planet_NN 노드 0). 행성 위치/배속은 galaxy.json `_planet_order` + 성계 내부 권위.

### 남은 불확실 (정직)
- Null_galaxy의 노드 레이아웃(시각배치)을 **외부 데이터/코드가 어떻게 좌표로 변환하는지**는 미확인(EXE 측 strategic-grid 빌더 책임으로 추정, 본 조사는 MDX 한정).
- `star_NN` 인덱스 ↔ galaxy.json 성계 순서 **매핑은 미확립**(위치 부재로 대조축 없음). 분광형 일치 여부로 역추정은 가능하나 본 조사 범위 밖.

**결론: 사용자의 "MDX에 위치 하드코딩" 가설은 적대적 전수검증으로 기각. MDX는 위치 없는 노드명/인덱스 컨테이너이고 분광형 타입만 노드명에 보유. 위치 권위는 galaxy.json(PDF 星系図)이 맞다.**
