# LOGH VII 행성/성계 경제데이터 복원 계획 (Content Recovery: Economy)

- 날짜: 2026-06-29
- 범위: 행성(281)/성계(80) 단위 **경제·스탯 수치** (인구/식료/공업/세수/GNP/자원/면적/방어/지지율 등)
- 산출 위치: `docs/logh7-content-recovery-economy-2026-06-29.md`
- 정직 원칙: **우연 바이트를 데이터로 과장 금지. 부재를 추측·기본값으로 메우지 말 것. 절차생성(P3)을 캐논(P0)으로 승격 금지.**

> **핵심 결론 (한 줄):** 원본 캐논 행성/성계 **경제 수치는 어디에도 존재하지 않는다.** 게임 자체가 경제 미구현(`経済関連は現在未実装`)이었고, 클라이언트는 모든 경제 스탯을 **서버가 런타임에 채우는 와이어 레코드**로만 취급한다. 현재 `planet-economy.json`의 수치는 전부 **절차생성(procedural, P3)** 이며 캐논이 아니다. 복원 가능한 것은 (a) 경제가 들어갈 **레코드 스키마/필드 레이아웃**과 (b) **비경제** 캐논 부가데이터(자동생산 수량, 부대초기배치)뿐이다.

---

## 1. 소스별 발견 요약 + 판정

신뢰도 등급: **P0** 직접확정 / **P1** 강한정황 / **P2** 약한정황 / **P3** 절차생성·파생.
판정: **confirmed**(채택) / **partial**(부분채택) / **refuted**(신뢰 제외).

### 소스 A — MsgDat / constmsg (게임 문자열 카탈로그) — **확정: 경제 수치 부재**
- 등급: **P0** · 판정: **confirmed**
- 발견: `.dat` 22개(constmsg.dat 외 21개), 총 9,582 레코드는 **게임 문자열 카탈로그**(명령 툴팁, 내정/전투 명령명, 대화/로그 템플릿)일 뿐. 행성별·성계별 경제/스탯 **수치 레코드는 0건**.
  - 경제 "개념"은 두 형태로만 등장: (a) EXE 바이너리 문자열의 **와이어 프로토콜 식별자/직렬화 키**, (b) **직책 라벨 문자열**(惑星総督/首都惑星 등). 실제 수치는 서버 런타임이 채움.
- 커버리지: 22개 `.dat` 전체 9,582 레코드 키워드 전수 스캔 — `人口/工業/農業/食料/税/防御/防衛/所属/資源/生産/惑星/星系 = 0 hit`. 수치우세 레코드 12건 탐지 = **전부 전술맵 상수**. `$token$` 와이어 필드 125개 전수. `dat-tables.json`의 `db`는 `Thumbs.db` 캐시(`isGameData:false`).
- 위치: `RE/content/extracted/msgdat-full.json`; 인접 증거 `RE/content/extracted/binary-strings-G7MTClient.json`(entries 12017-12018, 12224-12225, 12381-12383, 12409, 12584, 12587, 14865-14866), `RE/content/extracted/all-names.json`, `RE/content/extracted/dat-tables.json`.

### 소스 B — EXE 정적 테이블 (in-EXE static stride array) — **신뢰 제외 (refuted)**
- 등급: **P1** · 판정: **refuted** (원 의뢰의 "refuted는 신뢰 제외" 원칙에 따라 **결론 근거로 사용하지 않음**. 단, "정적 테이블이 없다"는 **부정 결론은 소스 A·C·D와 일관**되어 보강 정황으로만 기록.)
- 요지: 어떤 EXE에도 행성(281)/성계(80) 스탯의 **정적 stride 배열이 컴파일되어 있지 않다.** 클라는 전부 **서버 공급 와이어 레코드**로 런타임 파싱. 필드 라벨만 `.rdata 0x00760700-0x00762600` 블록에 존재(`population=`, `food`, `armor=`, `fixedstar=`, `commodity[%d]=` 등). 레코드 카운트는 전부 런타임 변수이며 281/80 즉시값은 배열 경계로 쓰이지 않음(검색 히트는 IME 메시지 상수/구조체 필드/부분문자열 노이즈). NumPy 자기상관+엔트로피 stride 스캔의 상위 후보는 전부 false positive(zero-fill BSS, vtable, IAT 썽크).
- 주의(과장 금지): 이 소스는 **refuted** 등급이므로 "EXE에 경제 테이블이 있다/없다"의 **단독 권위 근거로 인용하지 말 것.** 와이어 직렬화 레이아웃 정보(아래 §2 recoverable)는 소스 D(별도 RE 확정)와 교차확인된 것만 채택.

### 소스 C — 설치본/시나리오 (install + scenario tree) — **확정: 경제는 절차생성(P3)뿐**
- 등급: **P3** · 판정: **confirmed**
- 발견: 경제 수치를 담은 **유일한 파일**은 `server/content/planet-economy.json`(= `.omo/.../logh7-runtime/content/planet-economy.json` 동일본, 53,299 bytes). 281 행성 / 80 성계, 필드 `population_M / food / industry / habitable` + 성계별 `faction`.
  - **이 파일은 자기문서화로 절차생성임을 선언:** `_purpose: "procedural planet economy ... galaxy.json has only name+orbit"`, `_method: "deterministic per-planet seed; capitals scaled up; habitable orbit (2-4) higher"`.
  - `galaxy.json`, `scenarios/canon-801-07.json`, 콘텐츠 DB `planets`/`star_systems` 테이블 = **name+orbit(+faction/position)만**, 경제 없음.
  - 원본 클라 `.dat` = 문자열/UI 카탈로그(HFWR/GFWR magic), 경제 없음.
  - **원본 CD 이미지(`artifacts/logh7-cd/`)는 이 체크아웃에 부재** (디렉터리 없음; `git lfs ls-files` 비어있음; archive.org 원격 URL로만 참조). **이 PC에서는 검사 불가.**
- 생성기/소비자: `RE/src/server/logh7-base-economy.mjs` (헤더가 JSON을 'procedural'로 명시, '원본 서버 데이터는 사라졌다'고 기록; 281 절차행성을 `NotifyBaseParameter` 와이어 레코드로 변환).
- 위치: `server/content/planet-economy.json`(경제, P3), `server/content/galaxy.json`(name+orbit only), `server/content/scenarios/canon-801-07.json`, `server/content/logh7-content.db`, `server/content/client/msgdat.json`(문자열).

### 소스 D — gin7manual PDF (공식 매뉴얼 + 星系図 p101) — **부분 (partial)**
- 등급: **P1** · 판정: **partial**
- 발견: 매뉴얼/星系図 어디에도 **성계·행성별 경제지표 표(인구/세수/GNP/면적/자원/경제력)는 없음.** 매뉴얼 명시: `経済関連は現在未実装`(p9, §8/§14 재확인). 星系図(p101)은 벡터그래픽으로 **성계명 Text 주석 + 위치 dot만** → 성계명/위치/진영/성계별 행성명 리스트만 산출, 수치 0.
  - PDF에서 진짜 추출 가능한 **{name,orbit} 초과 정량 행성데이터는 비경제뿐**:
    1. 자동생산 **수량** 3열(艦艇/乗組員/陸戦兵) — 自動生産品目一覧表 pp.76-78 → `server/content/auto-production.json`
    2. 함대/초계/지상 **부대초기배치** — 部隊初期配置 p75 → `server/content/initial-deployment.json`
  - **주의:** `planet-economy.json`(population_M/food/industry)은 **PDF 출처 아님 — 절차생성.** 캐논 매뉴얼 데이터로 오인 금지.
- 커버리지: 3개 참조 PDF + galaxy/economy/production 콘텐츠 전부 검토. galaxy.json 80성계 키셋 검증(planet = {name,orbit}만). pdftotext는 CJK CID 인코딩이라 읽지 못함 → 프로젝트의 djvu OCR 레이어(`.omo/work/gin7manual/gin7manual_djvu.txt`)와 PyMuPDF 벡터/공간 클러스터링만 유효, 권위본은 `docs/logh7-manual-canon.md`. 숨은 경제표 레이어 없음.

---

## 2. recoverable[] — 실제 복원 가능한 데이터 + 정확한 소스/추출법

> 모두 **비경제 캐논** 또는 **스키마**임. 경제 "수치"의 캐논 복원은 불가(§3 absent 참조).

| # | 복원 대상 | 등급 | 소스 | 추출법 | 반영 위치 |
|---|---|---|---|---|---|
| R1 | 성계 80개 name/위치/진영 + 성계별 행성명 리스트 | P1 | gin7manual 星系図 p101 (벡터 Text 주석 + dot) | PyMuPDF 벡터 클러스터링(이미 완료) → `galaxy.json` | `server/content/galaxy.json` (이미 반영) |
| R2 | 행성 281개 name + orbit | P1 | 星系図 + 매뉴얼 행성명 리스트 | 동상 (이미 완료) | `galaxy.json`, `logh7-content.db.planets` (이미 반영) |
| R3 | 행성별 **자동생산 수량** 艦艇/乗組員/陸戦兵 (비경제) | P1 | gin7manual pp.76-78 自動生産品目一覧表 | 좌표+괘선 추출, 3페이지 y-스트림 연결, 진영별 5열 분리 (이미 완료) | `server/content/auto-production.json` (이미 반영) |
| R4 | 행성별 **부대초기배치** (함대/초계/지상, 비경제) | P1 | gin7manual p75 部隊初期配置一覧表 | PyMuPDF words 셀 빈닝(x<300 帝国 / x>=300 同盟), 적대적검증 5/5 (이미 완료) | `server/content/initial-deployment.json` (이미 반영) |
| R5 | **경제 레코드 와이어 스키마/필드 레이아웃** (수치 아님, 구조만) | P1 (RE확정, 소스 D RE) | 클라 파서/직렬화기 RE: `NotifyBaseParameter`(FUN_00438a20), `ResponseStaticInformationBase`(FUN_004145b0/004142e0), `ResponseInformationBase`, `ResponseStaticInformationGridType`(FUN_004133f0) + `.rdata` 라벨 블록 | redex/Ghidra 인덱스 쿼리(`logh7-re` 스킬), 오프셋 byte-exact 확인 후 `logh7-wire`로 인코딩 | `docs/logh7-info-records-wire.md` (이미 §3 NotifyBaseParameter 기록), 소비자 `RE/src/server/logh7-base-economy.mjs` |

R5 보강(확정 필드, 수치 슬롯은 비어있음 = 서버가 채울 자리):
- `NotifyBaseParameter` 74바이트 고정 레코드, budget[6]. population@param_1[10], adult_population@[0xb], approval@[0xc], peace@+0x1a, religion@[0xe], energy@[0xf], food@[0x10], living@+0x22, supplies@+0x46, armor@+0x24. (RE confidence 0.82, triple-cross-validated; `docs/logh7-info-records-wire.md §3`)

---

## 3. absent[] — 원본에 없는 것 (날조·기본값 승격 절대 금지)

- **행성별 경제 수치 (인구/식료/공업/생활/치안/사상/종교/지지율/에너지/보급/장갑의 캐논 값):** 어떤 소스에도 캐논 값 없음. 게임이 경제 미구현(`経済関連は現在未実装`). 현재 `planet-economy.json` 값은 **절차생성(P3)** 이며 캐논 아님.
- **성계별 경제지표 표 (인구/세수/GNP/면적/자원/경제력):** 매뉴얼·星系図·MsgDat·EXE 어디에도 없음.
- **행성별 세수/徴税額·GNP·자원종류·면적(面積) 수치:** 없음.
- **EXE 내 정적 행성/성계 스탯 배열:** 없음 (refuted 소스 B; 부정 결론은 A/C/D와 일관). 모든 스탯은 서버 공급 와이어 레코드로 런타임 파싱.
- **원본 서버 데이터(경제를 채우던 권위 소스):** 소실됨(`logh7-base-economy.mjs` 헤더 "original server data is gone"). 이 PC에서 복구 불가.
- **원본 CD 이미지(`artifacts/logh7-cd/`):** 이 체크아웃에 부재. archive.org 원격 아카이브를 별도로 받아와야 검사 가능 — **받기 전까지 '없음'으로 단정 금지(미검사 상태)**, 단 '있다'고 가정해 데이터 인용도 금지.

---

## 4. extractionSteps[] — 사용할 도구/단계

1. **(완료, 검증) 비경제 캐논 추출 재확인:** R1-R4 산출물(`galaxy.json`, `auto-production.json`, `initial-deployment.json`)의 `_source` 헤더가 PDF 페이지·추출법을 명시하는지 확인 — 모두 확인됨. 추가 작업 불요.
2. **경제 스키마 확정(R5):** `logh7-re` 스킬로 redex/Ghidra 인덱스에서 `NotifyBaseParameter`/`ResponseInformationBase`/`ResponseStaticInformationBase`/`GridType` 파서·직렬화기 오프셋과 필드 stride를 byte-exact 재확인. 결과를 `docs/logh7-info-records-wire.md`와 대조(이미 §3 존재).
3. **경제 레코드 빌드/디코드(R5):** `logh7-wire` 스킬로 RE확정 오프셋에서 `NotifyBaseParameter` 레코드를 인코딩. 소비자 `RE/src/server/logh7-base-economy.mjs`가 행성 1개를 온와이어 레코드로 변환하는 경로 유지.
4. **라이브 검증:** `logh7-live` 스킬 + `RE/tools/logh7_ui_explorer.py`(`--server-root ..\server`, 윈도우드)로 base-detail 패널(人口/食料/生活/治安/思想/宗教/支持率)이 채워지는지 실EXE에서 확인. `shaVerified:true` 전까지 "라이브 검증 완료" 주장 금지. 게임 PID만 종료, `node.exe` 일괄종료 금지.
5. **(선택, 캐논 탐색) CD 이미지 확보:** archive.org 원격 아카이브를 `artifacts/logh7-cd/`로 받아 원본 시나리오/서버 데이터에 경제 수치가 있는지 검사. **이때도 추측 금지 — 발견된 바이트가 실제 경제 레코드임을 구조로 증명한 것만 채택.**

---

## 5. contentTarget — 반영 위치 + provenance 태깅 규칙

- **경제 수치 파일:** `server/content/planet-economy.json`
  - 현 상태 = **P3 절차생성**. 헤더 `_purpose`/`_method`가 이미 절차성을 선언 → **유지**.
  - **provenance 태깅 의무:** 이 파일을 소비하는 코드(`logh7-base-economy.mjs`)와 산출물 어디서도 이 값을 **캐논(P0/P1)으로 표기 금지.** 와이어로 내보낼 때도 데이터 출처 등급을 P3로 추적.
  - 캐논 경제 수치가 미래에 확보되면(예: CD 이미지), **이 파일을 덮어쓰되 `_source`/`_grade`를 P0/P1로 갱신하고 절차생성 헤더 제거.** 그 전까지 절차값을 캐논으로 승격 금지.
- **경제 스키마/와이어 문서:** `docs/logh7-info-records-wire.md` (§3 NotifyBaseParameter, RE확정).
- **비경제 캐논(이미 반영, P1):** `server/content/galaxy.json`, `server/content/auto-production.json`, `server/content/initial-deployment.json`, `server/content/logh7-content.db`.
- **소비자/생성기:** `RE/src/server/logh7-base-economy.mjs` (P3 절차값 → 와이어 변환).

---

## 6. note (정직성 경고)

- `server/content/planet-economy.json`은 **캐논처럼 보이지만 절차생성**이다. 자기선언 헤더(`_method: deterministic per-planet seed`)를 반드시 존중하고, 어떤 산출물·보고에서도 PDF/원본 추출 데이터로 인용하지 말 것.
- 게임 원본 자체가 경제 **미구현**(`経済関連は現在未実装`)이었으므로, "캐논 경제 수치"라는 대상은 **애초에 존재하지 않았을 가능성이 높다.** 복원의 목표는 "원본 수치 복구"가 아니라 "스키마 정확 + 절차값을 정직하게 P3로 표기해 패널을 채움"이어야 한다.
- 소스 B(EXE 정적 테이블)는 **refuted** 등급 — 단독 권위 근거로 인용 금지. EXE 출처 와이어 레이아웃은 소스 D 별도 RE와 교차확인된 것(R5)만 채택.
- `artifacts/logh7-cd/`는 **미검사**(부재). "CD에 경제 데이터가 없다"고 단정하지도, "있다"고 가정해 인용하지도 말 것.
