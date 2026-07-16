# LOGH VII (은하영웅전설 VII) 콘텐츠 JSON 마스터 검증 보고서

> 사용자 선언: **"json은 ai가 만든 것, 믿으면 안돼"** — 모든 값을 GROUND TRUTH(공식 매뉴얼 PDF + 실제 클라이언트 바이너리)에 대해 검증함.
> 결론 요약: JSON은 **부분적으로 신뢰 가능**하다. **이름(지명/인명/함선명)·구조·텍스트는 대부분 실측 기반**이지만, **수치 스탯(능력치·함선 수치)·일부 planet 이름·일부 진영 라벨은 AI가 지어냈거나 다른 게임에서 이식**된 것이다. 검증된 실측 데이터는 `content/verified/*.json`에 새로 추출해 두었다.

---

## 1. 검증 방법론 (The method) — 3-Tier 검증 하네스

신뢰의 출처를 3단계로 계층화했다. **상위 Tier일수록 강한 증거**이며, 어떤 값도 상위 Tier에서 확증되지 않으면 하위로 강등한다.

### Tier-1 — 바이너리 정확 일치 (binary-exact)
실제 배포 클라이언트의 바이너리를 디코드해 JSON과 **바이트 단위로 diff**. 가장 강한 증거.

- **대상**: `ROOT/data/MsgDat/*.dat`(게임 문자열), `exe/G7MTClient.exe`, `data/model/**/*.mdx`(3D/은하 인덱스).
- **클라이언트 루트 확정**:
  ```bash
  ROOT=$(dirname $(dirname $(find .omo/work/installed -ipath '*/exe/G7MTClient.exe' | head -1)))
  ```
- **핵심 사실(이미 증명됨)**: `content/extracted/msgdat-full.json`의 문자열 데이터는 실제 `data/MsgDat/*.dat`와 **9582/9582 레코드 정확 일치(100%, mismatch 0)**.
  → **MsgDat에서 파생된 문자열 JSON은 신뢰 가능**하며, 이름/코드/설명 검증의 1차 기준선으로 사용했다.
- **모델 코드/진영**: `ROOT/data/model/Ship/*.mdx`(261개) 파일명·`.lwo` 에셋 경로로 함선 모델 코드·prefix 진영을 확인.
- **은하 인덱스**: `ROOT/data/model/strategy/Null_galaxy.mdx`(`star_NN_<class>` 노드 79 + bh3 + ns3, 일본어 이름 없음 — 이름 확증 불가, 좌표 보조용).
- **재현 도구**: `sqlite3`(suspect DB 대조), Python stdlib(mdx 노드/문자열 파서), `shasum`.

### Tier-2 — 매뉴얼 권위 (manual-authoritative)
공식 게임 매뉴얼 PDF(101p, 일본어)를 1차 권위로 삼아 큐레이션된 스탯/이름/표를 교차 확인.

- **PDF**: `/Users/apple/Downloads/gin7manual/gin7manual.pdf`.
- **텍스트 추출**: `.omo/work/manual.layout.txt`(form-feed `\f`로 페이지 구분, N번째 청크 = N페이지). 이름/구조 추출에 사용.
- **밀집 스탯 표는 vision Read**: 일본어 표는 -layout 텍스트가 OCR salad가 되므로 **Read 도구로 PDF 페이지를 직접 vision 판독**(`pages:"56-58"` 등). 실제로 함선 스탯표(p79–100)·조직표(p56–64)·은하 성도(p101)는 전부 vision으로 읽었다.
- **교차 확인 패턴**: 매뉴얼 값 ↔ JSON 값 ↔ (가능하면) Tier-1 바이너리 값 3자 비교. **매뉴얼≠바이너리** 충돌이 실제로 발견되면 런타임 권위(바이너리)를 채택하고 충돌을 명시.

### Tier-3 — 검증 불가 (unverifiable)
**어떤 ground truth도 존재하지 않는** 값. 지어내지 않고 "근거 없음"을 그대로 명시.

- 예: 캐릭터 **수치 능력치**(매뉴얼에 숫자 스탯 0개), planet **궤도 순서(orbit)**(매뉴얼은 행성을 나열만 하고 순번 미부여), 정치가 계급 사다리 이름(매뉴얼·바이너리 어디에도 열거 안 됨), 다수 진영 라벨(lore 추론).
- 이 범주는 "MISMATCH"가 아니라 "검증 불가"로 분류 — 외부/전작 디코드 등 별도 출처가 필요.

---

## 2. 도메인별 검증 결과

| 도메인 | JSON records | VERIFIED | MISMATCH | AI-invented | manual-only-missing | 판정 |
|---|---:|---:|---:|---:|---:|---|
| **MsgDat 문자열 (Tier-1 기준선)** | **9582** | **9582** | **0** | 0 | 0 | **정확 일치 100% — 신뢰** |
| characters (인명 + 8능력치) | 97 | 70 | 2 | 97 | 0 | 부분 날조 (이름 OK / 스탯 날조) |
| ships (함선/함급/스탯) | 320 | 21 | 2 | 21 | 22 | 대체로 신뢰 (이름 OK / 수치 OCR 쓰레기) |
| commands (전략·전술 커맨드 + 비용) | 232 | 228 | 3 | 0 | 0 | 대체로 신뢰 |
| galaxy (성계/행성/요새 + 좌표) | 367 | 312 | 0 | 135 | 0 | 대체로 신뢰 |
| org-ranks (조직/직위/계급/능력/성장) | 196 | 185 | 6 | 1 | 1 | 대체로 신뢰 |

**판정 해설**

- **characters**: 능력치 수치 값은 VII 기준 **AI_INVENTED**. VII 매뉴얼에는 숫자 스탯이 전무하고(이름만 p14, 역할표만 pp.56–66), JSON 스탯은 **LOGH IV EX(전작, 한국어 .GIN 세이브)에서 best-effort 바이트 매핑으로 이식**된 것. 이름/계급/진영은 우수(70/97 매뉴얼 일치, 해당 60 장교 계급·진영 전부 정확). 잘못된 부분: `source="manual"`로 스탯을 매뉴얼 출처라 거짓 표기, `運用`(올바름 `運営`).
- **ships**: 함급명·로마숫자 변형명(Ⅰ–Ⅷ)·타입코드·진영제한·설명은 검증된 MsgDat 문자열과 **그대로 일치**(실게임 문자열 복사). 그러나 `stats` 문자열은 전부 **OCR word-salad로 매뉴얼 표와 불일치 → 사용 불가**. 실제 표(타입 21개 + 인원 유닛)를 `content/verified/ships.json`에 페이지 인용과 함께 재추출. `model-ship.json`의 `phezzan`/`phezzan_misc` 진영(21레코드)은 매뉴얼·문자열 근거 없음(Z/P 모델은 동맹 지오메트리 재사용).
- **commands**: `strategy-commands.json`(전략 81개)은 인쇄 매뉴얼의 **충실한 전사**(80/81 비용·대기·소요 정확, 1건은 유니코드 물결표 변형뿐). `schema.json` commands[](151개)는 **충실한 바이너리 덤프**(151 id 전부 constmsg.dat 존재, 비용 0 mismatch). 3건 MISMATCH(抜擢·降等·ワープ航行)는 **매뉴얼≠바이너리** 진짜 괴리로, JSON이 매뉴얼 값을 상속한 것 — 런타임 권위 바이너리 값을 verified에 추출. UNVERIFIABLE 1(兵棋演習: 매뉴얼·JSON엔 있으나 문자열엔 兵棋講習).
- **galaxy**: 블랭킷 경고보다 **신뢰도 높음**. 80개 성계명 전부 MsgDat 확증; 좌표는 AI 날조 아님(JSON cx가 p101 성도 /Text 주석 중심과 **정확 일치 m=1.0000**, cy는 일정 오프셋의 완전 단조 선형). 34개 성계 진영은 매뉴얼 p75 배치표와 일치 + Fezzan 중립(p41). 다만 나머지 46개 진영 라벨은 **lore 추론(근거 없음)**, planet 281개 중 89개는 **어디에도 없음(AI_INVENTED 후보)**, orbit 순번 전부 **검증 불가**.
- **org-ranks**: 8능력치(統率/政治/運営/情報/指揮/機動/攻撃/防御 = 바이너리 recs 759–766) 확증, 19계급 사다리 확증. MISMATCH 6건은 매뉴얼의 政治家(무계급) 셀을 JSON이 군 계급으로 잘못 채운 것. AI_INVENTED 1: content.db가 존재하지 않는 계급 `兵長`을 넣어 20계급으로 부풀림(실제 19). MANUAL_ONLY 1: 爵位(公爵~帝国騎士) 표가 DB에 누락.

---

## 3. 이름 검증 (지명 / 인명 / 함선명) — 사용자 최우선

세 이름 도메인을 단일 파일 `content/verified/names-attestation.json`(총 **469개 이름**)로 통합. `attested=true`는 **공식 매뉴얼 PDF 또는 바이트검증된 MsgDat 문자열**에 등장함을 의미.

| 이름 종류 | 총수 | GROUND-TRUTH 확증 | 미확증(AI_INVENTED 후보) |
|---|---:|---:|---:|
| **인명 (person)** | 70 | **70** | 0 |
| **함급명 (ship_class)** | 32 | **32** | 0 |
| **성계명 (place_system)** | 80 | **80** | 0 |
| **행성명 (place_planet)** | 281 | **192** | **89** |
| **요새명 (place_fortress)** | 6 | **6** | 0 |
| **합계** | **469** | **380** | **89** |

### 인명 (character names)
- **확증(매뉴얼)**: 매뉴얼 pp.59–66 「初期職務権限カード保持情報」에 등장하는 **70명**. 이들의 계급·진영도 전부 정확.
- **외부 출처 필요(매뉴얼 미등재)**: JSON 97명 중 **27명**(Yang/ヤン, Oberstein, Bittenfeld, Mecklinger, Wahlen, Müller, Fahrenheit, Steinmetz, Kessler, Attenborough, Schönkopp, Poplan 등) — 실제 정사 인물이지만 **VII 매뉴얼 미수록**. IV-EX/정사 출처이므로 "VII 매뉴얼 확증"으로 DB에 넣으면 안 됨.
- **주의(중복)**: `ミューゼル == ローエングラム`(Reinhard), `ミュッケンベルガー == G.ミュッケンベルガー` 내부 중복.
- **AI_INVENTED**: 모든 캐릭터 **수치 능력치**(이름이 아니라 값 — VII 근거 0).

### 지명 (place names)
- **성계 80개 전부 확증** (MsgDat 문자열). 좌표도 매뉴얼 성도(p101)와 정확 일치 → 좌표는 source-confirmed.
- **행성 192/281 확증**(매뉴얼/MsgDat). **89개는 어디에도 없음** — `バラトループ1`/`バラトループ2` 같은 합성형, 출처 없는 힌두신화 행성군 등 **AI_INVENTED 후보**. (전체 목록은 attestation JSON에서 `type=place_planet, attested=false`로 필터.)
- **요새 6개·진영 라벨 34개** 매뉴얼 배치표 일치; 나머지 46 진영 라벨은 lore 추론(미확증).
- **orbit 순번**: 매뉴얼이 순번을 부여하지 않으므로 **검증 불가**.

### 함선명 (ship names)
- **함급명·타입코드·로마숫자 변형명·설명 전부 확증** (MsgDat 문자열 verbatim + 매뉴얼 p79–100 별표). E→제국 / F→동맹 모델 태깅 정확.
- **외부/근거 없음**: `model-ship.json`의 `phezzan`(18 P-prefix)·`phezzan_misc`(3 Z-prefix) 진영 — 매뉴얼은 帝国軍/同盟軍만 열거. 모델 코드(EH001 등)는 문자열에 등장하지 않는 **내부 에셋 파일명**이라 진영은 prefix+텍스처 추론.
- **AI_INVENTED**: 모든 함선 **수치 stats**(OCR 쓰레기 — 사용 불가, verified에서 재추출 완료).

---

## 4. 신뢰할 수 있는 데이터셋 (새 신뢰 기준선)

아래가 **새로운 신뢰 베이스**다. 각 레코드에 매뉴얼 페이지/바이너리 오프셋 출처를 박아 두었다.

| 파일 | 내용 | 신뢰 근거 |
|---|---|---|
| `content/extracted/msgdat-full.json` | 실 클라이언트 문자열 9582개 | **바이트 정확 100%** (Tier-1) |
| `content/verified/characters.json` | 70 인명 + 계급/진영/역할 (매뉴얼 page 인용); 스탯=null로 명시 | 매뉴얼 pp.59–66 vision |
| `content/verified/ships.json` | 함급 실수치 표 21타입 + 인원 유닛 (page 인용) | 매뉴얼 p79–100 vision |
| `content/verified/commands.json` | 81 전략 커맨드 + 151 바이너리 커맨드, 충돌 3건은 바이너리값 채택 | 매뉴얼 p68–74 + constmsg.dat |
| `content/verified/galaxy.json` | 80 성계(좌표 source-confirmed) + 행성/요새 + per-name attestation | MsgDat + 매뉴얼 p101/p75/p41 |
| `content/verified/org-ranks.json` | 19계급 사다리 + 8능력 + 조직 직위(필드별 매뉴얼 셀) | constmsg.dat recs 479–497/759–766 + 매뉴얼 p56–64 |
| `content/verified/names-attestation.json` | **469 이름 통합 attestation** {name,type,attested,source} | 위 전부 종합 |

**아직 채굴(mining)이 더 필요한 것**
- 캐릭터 **VII 수치 능력치** — 게임 내 어디에 저장되는지 미확인. 매뉴얼엔 없음. EXE/세이브 포맷 RE 또는 IV-EX 이식임을 명시적 라벨로만 사용.
- **함선 수치 stats** — 매뉴얼 표는 verified에 있으나, JSON `stats` 문자열은 폐기 대상.
- **89개 미확증 행성** — 외부 정사/전작 디코드로 출처 확보하거나 제거.
- **정치가 계급 사다리 이름**, **46개 진영 라벨**, **orbit 순번** — ground truth 부재, 외부 결정 필요.
- **爵位 표**(公爵~帝国騎士, 매뉴얼 p14) — content.db에 추가 필요.

---

## 5. 다음 단계

1. **content.db를 verified 데이터로 재빌드** (현재 DB는 의심 JSON에서 생성됨, suspect):
   - 이름/계급/진영은 `content/verified/*.json`에서 적재.
   - 캐릭터 **스탯 컬럼은 `unverified_non_canonical_VII`로 플래그**하거나 별도 테이블로 분리 — "real manual stats"로 로드 금지.
   - content.db의 존재하지 않는 계급 `兵長` 제거(19계급 복원), `運用`→`運営` 교정, 누락된 爵位 표 추가.
   - 함선 `stats`는 OCR 문자열 폐기 후 `content/verified/ships.json` 표로 교체.
   - 89개 미확증 행성·46개 추론 진영 라벨에 `attested=false` 플래그 유지(삭제는 사용자 결정).
2. **3건 매뉴얼≠바이너리 커맨드**(抜擢 320, 降等 160, ワープ航行 80~320)는 런타임 권위 바이너리 값을 채택.
3. **이름 회로(circular) 출처 차단**: `all-names.json`·`msgdat-full.json`을 스탯 검증의 독립 기준으로 쓰지 말 것 — 동일 JSON 파생이라 순환.

### ⚠️ EXE 버전 주의 (localization RE offset 불일치)
한글화 요청서의 **RE 오프셋은 2004-05-14 업데이트 후(post-update) 클라이언트** 기준이며, **이 CD의 베이스 `G7MTClient.exe`와 다른 바이너리**다.

- 이 CD 클라이언트 sha256 head: **`bd19263c`**
- 한글화 요청서가 기대하는 버전 sha256 head: **`2848be76`**

→ 두 바이너리가 다르므로 요청서의 절대 오프셋을 이 CD EXE에 그대로 적용하면 **어긋난다**. 한글화 작업 전에 **(a) post-update EXE를 별도 확보**하거나 **(b) 패턴/시그니처 기반으로 이 CD EXE에서 오프셋을 재탐색**해야 한다. 본 검증의 문자열/스탯 ground truth(MsgDat·매뉴얼)는 EXE 버전과 무관하므로 영향 없음.

---

### 부록 — 분류 기준 (per task spec)
- **VERIFIED**: 매뉴얼/바이너리와 일치.
- **MISMATCH**: JSON 값 ≠ ground truth (양쪽 값 제시).
- **AI_INVENTED**: ground-truth 출처가 어디에도 없음.
- **MANUAL_ONLY**: 매뉴얼엔 있으나 JSON 누락.
- **UNVERIFIABLE**: ground truth 자체가 존재하지 않음(사유 명시).
