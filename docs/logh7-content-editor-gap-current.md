# 성계·행성 콘텐츠 에디터 갭 (현행)

- Status: **OPEN / 문서만** — 구현 미착수 (2026-07-21 사용자: “일단 문서로만 남기고 라이브 검증 계속”).
- Related live: 검은 행성 구, 성계 소속 표시, 0x031f 경제 필드, fleet marker.

## 문제

원작 서버 DB가 유실되어 **와이어 레이아웃(RE)은 있으나 채울 수치가 없는 칸**이 남는다.

| 계층 | 예 | 원천 |
|------|----|------|
| 캐논/추출 | 성계명, spectral, cell, planet name+orbit, faction | `galaxy.json` 등 |
| RE 레이아웃 | 0x031d stream, 0x031f fixed 0x604/0x180 | wire docs |
| 원작 수치 | diameter, revolution_*, present-mask, 경제 전부 | **없음** |
| 임시 P3 | diameter/경제 placeholder | 코드 + `planet-economy.json` (`_provenance` 필수) |

복원 추출만으로는 채울 수 없는 칸은 **사람이 쓰는 권위 데이터(에디터/워크벤치)** 가 필요하다.  
그 값은 **창작·레벨 디자인**이지 원작 복원이 아니다 → `_canon:false` / `p3-temporary` 유지, 캐논 승격은 별도 승인.

## 에디터 최소 범위 (미구현 스펙)

1. 성계 선택 (galaxy catalog id / name / cell)
2. **0x031d** — diameter, revolution_*, (가능 시) 행성 슬롯/마스크
3. **0x031f** — 소속(이미 faction 연동), 인구·식량·공업·예산 등
4. 행성 목록 — 이름·orbit + 경제 행
5. 메타 — provenance, 승인 메모

저장 후보 (원본 추출본과 분리 권장):

- `server/content/galaxy.json` (구조·이름·faction)
- `server/content/planet-economy.json` (P3 경제)
- 전용 override JSON + 서버 “override 우선” 로드 (미구현)

서버: override → galaxy → P3 기본값. 저장 후 catalog 캐시 리셋/재기동.

## 현재 코드 상태 (에디터 없이)

- 0x031f **고정 0x180 슬롯** + `field04` 소속(0x02/0x03) — compact 스트림 버그 수정 (`709c37cd` 계열).
- P3 임시: 0x031d diameter/revolution, 0x031f 경제 from `planet-economy.json`.
- 함대 마커: commander=cell 정렬; 선택 가능 마커는 라이브 미완.

## 검은 행성 구 — 진단 우선순위 (2026-07-21 사용자 정정)

**사용자 관찰 (정본 신호):** 성계 뷰에서 행성이 검을 뿐 아니라 **우하단 UI「행성/요새 궤도상」에 궤도·행성 식별 데이터도 비어 있다.**  
렌더/머티리얼만의 문제였다면 이름·궤도 목록은 나와야 한다 → **1순위는 데이터 전달·조인(와이어/스폿 키), 2순위가 메시·텍스처.**

이미 프로젝트 저널에도 동일 결함이 잡힌 바 있다 (`docs/logh7-loop-state.md` journal #66–#68 **DEFECT 2**):

- 우하단 패널: **「스폿 불명」** / 궤도 목록 공백.
- 원인 후보 체인: (a) 0x031d가 **on-demand 0x031c PULL** 전까지 정적 이름 테이블 미적재, (b) 플레이어 spot 키 불일치(DEFECT 1 연쇄), (c) **0x031d 와이어에 행성 목록 자체가 없음**.

### 서버가 실제로 보내는 것 vs content에만 있는 것

| 계층 | 내용 | 와이어? |
|------|------|---------|
| `galaxy.json` | 성계명 + `planets[{name,orbit}]` | 이름·orbit는 **카탈로그 메모리만** |
| `0x031d` | 성계 **1슬롯**: id/grid/name/class_/diameter/revolution_* | **예** — 항성/성계 단위. `writeStaticBaseRecord`에 **planetNames 미기록** |
| `0x031f` | 기지 경제·소속(field04) max 4 slot | **예** — 패널 `FUN_0057aa90`이 **base id 매칭** 후 소비 |
| `planetNames` / `planetCount` in `getStaticBaseCatalog()` | content 투영 | **와이어 미탑재** (필드 계산만 하고 encode 안 함) |
| 궤도 메시 `FUN_004d3bd0` | `p%03d_low.mdx` 순번 + present-mask placeholder `01010101` | 서버 오버라이드 **정적 RE 미발견** |

→ content에 행성 이름이 있어도, **우하단 궤도 UI·「이 행성이 누구인가」는 0x031d 단일 성계 레코드 + 0x031f 조인 + (가능 시) 별도 행성 슬롯 경로**에 달려 있다.  
텍스처 A/B는 2순위 가설로 강등.

### 항성 vs 행성 시각

서버 `0x031d` `class_` 는 **항성 스펙트럼 색** 쪽(라이브에서 항성 색 동작 관측).  
궤도 위 검은 구 = 메시 로드 결과는 보일 수 있어도, **식별 UI 공백과 동시에면 “빈 스폿/미조인” 증상이 본진**이다.

### 설치본 파일 목록 관찰 (2026-07-21)

`artifacts/logh7-install/.../data/model/planets/` 에 있는 `p*_low.mdx` 이름 패턴:

- **있음:** `p000`, `p001`, `p010`, `p011`, `p020`, `p021`, … `p100` 등 (대략 십의 자리 타입 + 일의 자리 변종)
- **없음:** `p002`, `p003`, `p004`… (순차 2,3,4)

기본 로더가 present 슬롯마다 **`p000, p001, p002, p003` 순번**으로 열면,  
`p002`/`p003`은 파일 부재 → 로드 실패/검은 구.  
`p000`/`p001`도 텍스처 경로·머티리얼에 따라 검게 보일 수 있음.

**가설 (미확정, 라이브 A/B 필요):**  
(A) 순차 인덱스 대신 `pXY` 코드표(타입×변종)를 서버/에디터가 내려줘야 함.  
(B) 로컬 QA 임시: `p010`→`p002` 등 복사로 순차 로드만 살림 (설치본 패치, 캐논 아님).  
서버 `0x031d` diameter P3만으로는 **파일 인덱스 문제를 해결하지 못함** — 라이브에서 diameter 채워도 검은 행성이 유지된 관찰과 일치.

### 2026-07-21 순번 A/B 적용 (설치본만) → **FAIL (여전히 검은 구)**

- Receipt: `_workspace/liveqa-20260721-planet-mdx-ab/` (`copy-ops.json`, before/after names).
- CD unshield 세트와 설치본 **동일 24종** → **전면 재추출로 p002가 생기지는 않음** (원 패키지 네이밍).
- 임시 복사: `p002←p010` … `p007←p031` (메시 only). 사용자 라이브: **여전히 검은 구**.
- 순번 파일 부재만의 가설은 **약화** (복사 후에도 검음).

### 후속 조사 (A/B FAIL 이후)

`p000_low.mdx` 내장 경로(개발기 절대경로, CP932):

- `W:\Gin7\CG\ウメモト\Stage\Planet\p\objects\p000_low.lwo`
- `W:\Gin7\CG\ウメモト\Stage\Planet\p\images\p000.bmp` (슬롯 플래그 pre=`02 00 00 00 01`)
- `W:\Gin7\CG\ウメモト\Stage\Planet\d_tex\dtl007.bmp` (pre=`ff ff ff ff 01` — 디테일/2nd stage 추정)

설치본 실제 위치:

- 알베도: `data/model/images/{lo,mid,hi}/p000.bmp` 등 **pXY 25종 존재** (512×512×8bpp paletted, 내용 비-검정 확인).
- **`dtl*.bmp`: 설치본·CD unshield·iso-root 전부 0건** — 원 패키지에 미포함이 유력.
- MDX 전수: **dtl 참조는 `p000_low.mdx`/`p000_mid.mdx`의 `dtl007.bmp` 단 1종**. 다른 행성 MDX는 `pXY.bmp` 단일 알베도만 참조.

### 텍스처 경로 RE (2026-07-21)

| 증거 | 내용 |
|------|------|
| EXE 문자열 | `\..\data\model\images\`, `/../data/model/images/`, `/../data/model/images/Hi/` |
| 글로우 명시 경로 | `../data/model/images/lo/fs_glow_%03d.bmp` (+ 000..006 나열) |
| 메시 로드 | `../data/model/planets/p%03d_low.mdx` **및** 개별 `p000/p001/p010…`·`y001…` 문자열 테이블 |
| GraphicConfig | `ModelTextureLevel=2` (hi 추정; 폴더는 `lo`/`mid`/`hi`) |
| 선박 MDX 동일 패턴 | `W:\Gin7\CG\艦船…\images\FH047.bmp` → 런타임 basename → `images/{lod}/fh047.bmp` 존재 |
| CreateFileA/W import | 있음. `D3DXCreateTextureFromFile*` 문자열 0 (커스텀/`mkCreate` 경로 가능) |

**가설 (갱신):**

1. **런타임 remap**: MDX 절대경로 → **basename only** → `data/model/images/{lo\|mid\|hi\|Hi}/`.  
   알베도 `p000.bmp` 등은 **이미 그 자리에 있음** → “파일 부재만”으로 전 행성 검정을 설명하기 어렵다.
2. **dtl007**: 패키지 부재 확정. p000에만 2nd texture stage. **전 행성 검정의 단일 원인 아님** (p001 등은 dtl 미참조).
3. **여전히 열린 원인**: 머티리얼/라이팅(성계 뷰 ambient 0), UV/버텍스 컬러, 텍스처 stage 바인드 실패 후 검정 폴백, 또는 present-mask/슬롯이 다른 메시를 가리킴. **라이브 파일 I/O 트레이스 필요**.

### dtl007 placeholder A/B (설치본, 2026-07-21 적용)

- Receipt: `_workspace/liveqa-20260721-planet-dtl-ab/`
- `lo|mid|hi\dtl007.bmp` ← 복사 `lo\p000.bmp` (P3 placeholder, 캐논 아님).
- 목적: basename remap이 동작할 때 p000 2nd stage만 살리는지 확인.
- **기대:** 전 행성이 살아나면 가설 오류; p000만 변하면 dtl이 p000 한정 기여; 전부 그대로면 dtl 비원인.
- Rollback: 세 `dtl007.bmp` 삭제.

### 조인 프로브 결과 (2026-07-21) — **baseId null 확정**

증거: `_workspace/liveqa-20260721-orbit-data-join/FINDINGS.md`

| 관측 | 값 |
|------|-----|
| 라이브 reverify-b grid-init-spawn | `0x031f`/`0x0321` **미송신** |
| DB 플레이어 cell (before) | **2015** |
| catalog `findStaticBase(2015)` | **null** |
| 인접 성계 | **2014 = バーラト** (동맹, 행성 4) |
| 코드 | `baseId` null → spawn에서 0x031f push 생략 (`logh7-world-records.mjs`) |

**적용:** character/world_fleet cell **2015→2014**; Desktop bat→sole; join 성공 라이브 확인 (`emitted031f:true`, id=7 バーラト).

### 사용자 관측 (join 성공 후, 2026-07-21)

| 증상 | 해석 |
|------|------|
| 숫자 안 나옴 | 0x031f에 P3 경제는 넣음(field08/14/18·budget·commodity)이나 **패널이 읽는 scalar 오프셋은 다수 provisional** → 클라 칸이 다른 오프셋을 보면 공백 |
| 행성 이름 깨짐 | 와이어에는 **성계명 1줄**(バーラト, UTF-16BE)만. 개별 행성명(ハイネセン 등) **미송신**. 깨진 글자는 성계명 인코딩/폰트 또는 정적 테이블 확장 이슈 후보 |
| 옆 데이터 NO DATA | 통치자/수비대장 등은 **0x0323 spot·그리드 소유 테이블** 조회. 매칭 실패 시 `FUN_004c8de0` → **NO DATA** 문자열 (레코드 없음과 동일 UI) |

서버 dump (Barat): `0x031f` owner=0x02(동맹), pop/food/industry 비영 있음. join 게이트는 통과.

**다음 후보 작업 (우선순위):**

1. **이름 깨짐**: 0x031d name UTF-16 **BE vs LE** A/B (캐릭터 이름은 다수 LE); 또는 정적 테이블 dest 레이아웃 대조.
2. **NO DATA 옆칸**: 0x0323 `spot=baseId` + grid ownership / 통치자 캐릭 레코드 유무 라이브 확인.
3. **숫자 칸**: 패널이 읽는 0x031f 오프셋 라이브·Frida 또는 라벨 매핑 RE 후 필드 재배치 (현재 P3 값이 “다른 칸”에 있을 수 있음).
4. **행성 목록 행**: galaxy `planets[]`를 실을 **별 opcode/슬롯** RE (0x031d 단일 성계 레코드로는 부족).
5. (후순위) 검은 구 텍스처.

## 비범위

- 에디터 UI/웹 구현 (이 문서만)
- P3 값의 캐논 승격
- 정적 마스터 테이블 208–211 숫자 날조

## 다음

1. 라이브 검증 계속 (소속·검은 구·마커·0x032f 연쇄)
2. 에디터 착수는 별도 task 승인 후
