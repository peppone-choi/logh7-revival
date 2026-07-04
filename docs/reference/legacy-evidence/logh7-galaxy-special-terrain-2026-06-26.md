# 특수천체(블랙홀/중성자별) + 지형(plasma/sargasso) galaxy 보강 — 2026-06-26

캐논 server/ 기준. 추측 데이터 P0 승격 금지(셀 배치 미확정은 P3로 명시).

## 1. bh3/ns3 식별 (P1: 존재·개수 / P3: 셀 배치)

근거 = `Null_galaxy.mdx` 씬그래프 명명 노드. 추출본
`content/extracted/model-galaxy-stars.json`(`.omc/backup/...`) `special_bodies`:

```
["bh_01","bh_02","bh_03","ns_01","ns_02","ns_03"]
```

→ 블랙홀(bh) 3개 + 중성자별(ns) 3개. 노드 오프셋도 라이브 MDX
(`.omo/work/logh7-installed/data/model/strategy/Null_galaxy.mdx`)에서 재확인(0x47f0~0x4c78 씬 + 0x11aa2~ 변환).

⚠️ 추출본 `_note` 명시: **"index is map node order, NOT galaxy.json system order"**.
어떤 성계/그리드 셀에 속하는지 **캐논 매핑이 없다** → 셀 좌표는 P3(미확정).
또한 클라 `constmsg group-0x18`에 ブラックホール/中性子星 전용 라벨이 **없다**(객체 값으로만 구분).

## 2. plasma/sargasso 셀 (기존 P1, 재확인)

매뉴얼 p30-32(地形障害) PDF-verified: 進入不可 지형은 **プラズマ嵐 + サルガッソ・スペース 2종뿐**
(`server/content/manual/terrain-navigability.json`). 가변성/적색거성/이상중력대는 이 페이지에 없음 → P0 인코딩 금지.
- プラズマ嵐 = 절차적(seed) 배치, 회랑·80성계·수도 회피 + 연결성 보존(기존 `generatePlasmaCells`).
- サルガッソ = 호출자 고정 셀(기존 `sargassoCells`).

## 3. galaxy.json 보강

`server/content/galaxy.json`에 `_specialBodies` 프로비넌스 블록 추가(개수만 P1, **좌표 없음**):
- `blackHoleCount: 3`, `neutronStarCount: 3`
- `_grade: P1 (existence/count)`, `_cellPlacement: UNVERIFIED (P3)`
- 어떤 system에도 추측 `specialBody` 타입 미주입(테스트가 부재 검증).

## 4. 0x0315 인코딩

`server/src/server/logh7-login-protocol.mjs`:
- `TERRAIN_VALUE` 확장: `BLACK_HOLE=90`, `NEUTRON_STAR=91`(성계 마커 4..88·사르가소 89 위, u8 비충돌).
- `buildStrategicGalaxyGrid({ blackHoleCells, neutronStarCells })` 신규 파라미터 —
  **호출자가 셀을 줄 때만** 進入不可 장애물로 스탬프(기본 null=미인코딩, 추측 배치 안 함).
- 항행성 게이트 정합: BH/NS 객체 `class=BLOCKED(byte1=2 ∉ {1,3})` → 클라가 進入不可로 판정(0x0b01 미발신).
- 라벨 subId: 캐논 전용 라벨 부재로 `航行不能(2)` 재사용(사르가소와 동일 관례).
- 코드 주석 한글.

## 5. 테스트 결과

`tests/server/logh7-plasma-sargasso.test.mjs`에 오라클 3건 추가:
1. BH=90/NS=91 distinct 값 + 進入不可(byte1=2) + 사르가소와 별개.
2. 셀 미지정 시 BH/NS 미방출(추측 배치 금지) 회귀 가드.
3. galaxy.json `_specialBodies` = 3+3, 셀배치 P3, system에 추측 타입 부재.

기존 통합 오라클(plasma/sargasso impassable, 항행성 게이트=마스크−차단셀)은 무회귀.

`cd server && node --test tests/server/*.test.mjs` → **1135 pass / 0 fail / 18 skip**(직전 1132 → +3, 회귀 0).
