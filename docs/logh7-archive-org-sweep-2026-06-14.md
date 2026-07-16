# Archive.org 은하영웅전설 게임/이미지 소스 수색 메모

작성일: 2026-06-14

목적: Archive.org의 `Ginga Eiyuu Densetsu`, `銀河英雄伝説`, `Legend of Galactic Heroes`, `gin7`, `gineiden`, `Bothtec` 계열 검색 결과를 API로 수집하고, 은하영웅전설 VII 포트레잇/로스터 복원에 쓸 수 있는 게임, 매뉴얼, 스캔, 이미지 후보를 분류한다.

## 산출물

| 파일 | 설명 |
|---|---|
| `content/roster/archive-org-logh-sources.json` | Archive.org 고가치 아이템 28개 카탈로그. 아이템 역할, 우선순위, 파일 후보, 직접 URL 포함 |
| `.omo/work/logh7-archive-sweep/archive-search-raw.json` | Archive advancedsearch 원본 결과 |
| `.omo/work/logh7-archive-sweep/archive-search-ranked.json` | 1차 키워드 점수 결과 |
| `.omo/work/logh7-archive-sweep/high-value-metadata.json` | 고가치 아이템 metadata API 원본 |
| `.omo/work/logh7-archive-sweep/high-value-file-summary.json` | 파일 확장자/후보 파일 요약 |

## 검색 범위

사용한 축:

- [Ginga Eiyuu Densetsu](https://archive.org/search?query=Ginga+Eiyuu+Densetsu&tab=all)
- [銀河英雄伝説](https://archive.org/search?query=%E9%8A%80%E6%B2%B3%E8%8B%B1%E9%9B%84%E4%BC%9D%E8%AA%AC&tab=all)
- `Ginga Eiyu Densetsu`, `Legend of Galactic Heroes game`, `LOGH game`, `銀河英雄伝説 ゲーム`, `銀英伝 ゲーム`, `gineiden`, `gin7`, `Bothtec 銀河英雄伝説`

결과:

| 구분 | 건수 |
|---|---:|
| 검색 쿼리 | 15 |
| 중복 제거된 Archive 아이템 | 280 |
| 메타데이터까지 본 고가치 아이템 | 28 |
| VII 직접 자료 | 2 |
| 이전/초기 게임 또는 번역 컬렉션 | 14 |
| 매뉴얼/스캔 중심 자료 | 8 |

## 최우선 자료

| identifier | 역할 | 용도 |
|---|---|---|
| [`logh-7`](https://archive.org/details/logh-7) | VII CD 이미지 | VII 클라이언트/리소스/Face 데이터의 직접 출처. 이름 라벨은 별도 증거 필요 |
| [`gin7manual`](https://archive.org/details/gin7manual) | VII 매뉴얼 PDF/OCR | VII 시스템, 추첨 UI, 화면 OCR, 매뉴얼 삽화의 직접 출처 |
| [`ginga-eiyuu-densetsu-w98-colection`](https://archive.org/details/ginga-eiyuu-densetsu-w98-colection) | Windows 95/98 컬렉션 | III SP, IV EX, V, VI, VI SG 업데이트/패키지. 이전 게임의 공식 이름/능력치/이미지 추출 후보 |
| [`legend-of-galactic-heroes-iv-ex-win-95`](https://archive.org/details/legend-of-galactic-heroes-iv-ex-win-95) | IV EX Win95 ISO | 기존 게임 능력치/인물명/초상 참조. VII 확정값은 아님 |
| [`logh-v-grand`](https://archive.org/details/logh-v-grand) | V Grand ISO | 기존 게임 능력치/인물명/초상 참조 |
| [`gin-6`](https://archive.org/details/gin-6) | V Grand + VI | 기존 게임 능력치/초상 참조 |
| [`ginga-eiyuu-densetsu-vi-sg`](https://archive.org/details/ginga-eiyuu-densetsu-vi-sg) | VI SG | 패키지 이미지와 게임 데이터 참조 |

## 이미지/매뉴얼 참조 후보

| identifier | 성격 | 용도 |
|---|---|---|
| [`gingaeiyuuplusx68k`](https://archive.org/details/gingaeiyuuplusx68k) | X68000 1편 세트 스캔 | 고해상도 공식 패키지/매뉴얼 이미지. 작화 계열은 다르므로 후보 가중치 낮음 |
| [`gingaeiyuu2dx`](https://archive.org/details/gingaeiyuu2dx) | X68000 II DX+ 세트 스캔 | 공식 스캔 이미지 참조 |
| [`gineiden3sp-manual`](https://archive.org/details/gineiden3sp-manual) | III SP 매뉴얼 PDF/OCR | 이전 게임의 이름/직책/능력치 구조 참조 |
| [`ginga-eiyuu-densetsu-shvc-ge-sfc-jp-manual-600-dpi`](https://archive.org/details/ginga-eiyuu-densetsu-shvc-ge-sfc-jp-manual-600-dpi) | SFC 매뉴얼/박스 스캔 | 공식 콘솔 이미지 참조. VII 포트레잇 확정에는 단독 사용 금지 |
| [`ginga-eiyuu-densetsu-ksc-ge-fc-jp-manual-600-dpi`](https://archive.org/details/ginga-eiyuu-densetsu-ksc-ge-fc-jp-manual-600-dpi) | FC 매뉴얼 스캔 | 역사적 참조 |
| [`msx-legend-of-the-galactic-heroes-power-up-and-scenario-collection-docs`](https://archive.org/details/msx-legend-of-the-galactic-heroes-power-up-and-scenario-collection-docs) | MSX 문서 | 초기 게임 이름/시나리오 구조 참조 |

## 낮은 우선순위이지만 보조 가능한 자료

- [`LOGHPC`](https://archive.org/details/LOGHPC), [`logh2008_update`](https://archive.org/details/logh2008_update): 2008 PC 게임/패치. VII와 작화/시스템 거리가 있어 낮은 가중치.
- [`gin-vs-t-02`](https://archive.org/details/gin-vs-t-02), [`ginVSmanual`](https://archive.org/details/ginVSmanual), [`Nova_BBGames25_Japan`](https://archive.org/details/Nova_BBGames25_Japan), [`gineidenVS-opening`](https://archive.org/details/gineidenVS-opening): VS 계열. 현대적 이미지 참조로만 사용.
- [`gineipaedia`](https://archive.org/details/gineipaedia): 텍스트 지식베이스. 이름/별칭/설명 보강에는 좋지만 이미지 자료는 아님.

## 포트레잇 복원 적용 규칙

1. VII 직접 자료(`logh-7`, `gin7manual`)는 최고 등급이다.
2. IV EX, V, VI, VI SG 등 이전 BOTHTEC 게임은 공식 계열이므로 이름/능력치/초상 후보에 쓸 수 있다.
3. 다만 이전 게임 초상은 VII 포트레잇과 동일하다는 보장이 없으므로 `confirmed`가 아니라 `prior_game_reference`로 들어간다.
4. 콘솔/초기 게임/VS/2008 이미지는 작화 계열이 멀어 낮은 가중치만 준다.
5. 어떤 이미지도 단독으로 확정하지 않는다. 다중 참조 이미지, 다중 알고리즘, 결정적 특징, 2등과의 점수 격차를 모두 통과해야 한다.

## 다음 추출 루트

1. `gin7manual`의 PDF/OCR에서 인물명, 후보 선택 화면, 능력치/직책 UI를 재검색한다.
2. `ginga-eiyuu-densetsu-w98-colection`에서 IV EX, V, VI, VI SG 파일을 분리하고 이름/능력치/초상 테이블을 찾는다.
3. `legend-of-galactic-heroes-iv-ex-win-95`, `logh-v-grand`, `gin-6`에서 기존 시리즈 능력치 테이블을 추출해 VII 후보 능력치 산정의 베이스라인으로 삼는다.
4. X68000/콘솔/매뉴얼 스캔은 OCR과 이미지 크롭으로 이름이 붙은 공식 일러스트만 보조 참조로 등록한다.
5. 모든 참조 이미지는 `source_url`, `source_type`, `art_lineage`, `crop_hash`, `license_note`, `confidence_cap`을 갖는 별도 manifest로 편입한다.

## 안전선

Archive.org 공개 아이템의 메타데이터/파일 목록을 사용했다. 비공개 서버, 사라진 운영 DB, 내부자 자료, 인증 우회는 범위 밖이다. 대형 디스크/스캔 파일은 카탈로그화했으며, 실제 추출은 필요한 아이템을 대상으로 별도 작업에서 수행한다.
