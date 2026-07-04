# LOGH VII 갤럭시 마스터 테이블 RE 종합 보고서 (2026-06-23)

## 1. 핵심 판정: 클라에 내장된 80성계 정적 마스터 테이블은 존재하지 않음

### 1.1 정적 사냥 결과 (TableHunt)

- EXE 데이터 섹션에 80개 요소의 평면 배열(성계명, 그리드 좌표, 분광형, 행성 수 등)은 **존재하지 않음**.
- `constmsg` group 0x18은 성계명을 **지역화 문자열**로 보유할 뿐, 구조 데이터(좌표/분광형/행성 수)는 없음.
- 클라이언트 런타임 시 80성계 테이블은 **0x031d(ResponseStaticInformationBase) 와이어 수신 → 스테이징 버퍼(clientBase+0x3f5ae8) → 런원 스냅샷(FUN_004c5350) → 라이브 테이블(0x2c03cc/0x2c1755)** 순서로 동적으로 구성됨.
- 정적 테이블이 없으므로 클라이언트는 **와이어 없이 전략맵을 그리지 못함**. 0x0313/0x0315 없이는 `objectTable[0]={0,0,0}` 센티널만 존재해 배경 그리드만 렌더되고 마커(별/함대/요새)는 전혀 배치되지 않음.

### 1.2 Trace 결과 (Render Runtime)

- **배열 오프셋**: `0x17991c` (param_1, 루트 게임 상태 객체)
- **레코드 수**: 10개 (전술/전략 필드 씬의 오브젝트 슬롯)
- **레코드 스트라이드**: 2272바이트
- **초기화 경로**:
  - `FUN_004c32a0(TacticsFieldImport)` @ 0x004c32a0: case 3 로컬 루프에서 `*(undefined2 *)(iVar9 + 0x8de) = *(undefined2 *)((int)piVar23 + 6)` 기록
  - `FUN_004c46a0(allocator)` @ 0x004c46a0: 0x22f 더워드 제로 필 후 새 버퍼로 복사; type 0/1/2에 `*(undefined2 *)(iVar5 + 0x8bc) = uVar1` 설정
- **핵심 오프셋**:
  - `0x8de`: ushort, 배열 인덱스/슬롯 번호 (FUN_004c32a0이 piVar23+6 또는 iVar14+4에서 기록)
  - `0x8bc`: ushort, 타입/카테고리 식별자 (FUN_004c46a0이 FUN_004c5100/FUN_004c5130 경로로 설정)
  - `0x8c0`: uint, 참조/소유자 ID
  - `0x14/0x18/0x1c`: float, X/Y/Z 위치
  - `0x454/0x560`: uint, 행성/항성용 모델/렌더 노드
  - `0x6bc`: 0x233 더워드(2276바이트) 이름/복사 버퍼

### 1.3 WireCheck 결과

서버는 다음 레코드를 **별도 opcode로 독립 전송**함:

| opcode | 레코드 | 설명 | 사이즈 | 디스패처 |
|--------|--------|------|--------|----------|
| 0x0313 | ResponseStaticInformationGridType | 오브젝트 테이블 [u8 count] + count×3바이트 | 5004B 고정 | FUN_004ba2b0 case 0x313 → clientBase+0x3f57d4 |
| 0x0315 | ResponseStaticInformationGrid | 셀 그리드 RLE [u8 w][u8 h][u16 BE rleByteCount]{[u8 run][u8 value]}… | 5004B 고정 | FUN_004ba2b0 case 0x315 → clientBase+0x3f4448 → FUN_004abbb0 RLE 디코더 |
| 0x031d | ResponseStaticInformationBase | 정적 기지 천문정보 (stride 0x3c), 성계별 이름/그리드/class_/공전 데이터 | 0x520c | 별도 case |
| 0x031f | ResponseInformationBase | 동적 기지 경제정보 (stride 0x180), 성계별 소유권/인구/식량 등 | 0x300 | 별도 case |
| 0x0323 | ResponseInformationCharacter | 캐릭터 레코드 (724B stride 0x2d4) | 0x2d4 | 별도 case |
| 0x0325 | ResponseInformationUnit | 유닛 테이블 (stride 0x58, 52804B 고정) | 0xce44 | 별도 case |
| 0x0204 | SelectedCharacter | 선택 캐릭터 ID (4B) | 4B | — |

**조합 로직**:
- `FUN_004bee20(grid-active gate)`: 와이어 데이터를 직접 사용하지 않고 별도 `grid-active` 플래그(DAT_007cd04c+0x11178) 검사. 이 플래그는 0x0b07(NotifyMovedGrid) 서버 푸시에 의해 설정됨.
- `FUN_004c5350`: 스테이징 → 라이브 복사 (런원 가드 있음)
- `FUN_004d3bd0`: `byte1==3` placement gate
- `FUN_004d6310`: 지형 항행성 gate

**판정**: `server-authoritative` — 클라이언트는 와이어 수신 없이 전략맵을 그릴 수 없음.

---

## 2. 현재 content/galaxy.json의 구조와 데이터 등급

### 2.1 파일 위치 및 형태

- **경로**: `content/galaxy.json`
- **소스**: `gin7manualsaved.pdf` 101p `星系図` special Text annotations (80개 성계 라벨; cx/cy만)
- **추출일**: 2026-06-12
- **성계 수**: 80개 (원작 VII = 80성계; 우리 리바이벌도 80성계로 확정)

### 2.2 각 성계 항목의 필드

```json
{
  "system": "ルンビーニ",
  "planets": [{"name": "バクタプール", "orbit": 1}, ...],
  "fortresses": [],
  "rect": [249.18018, 52.316888, 269.18019, 74.31689],
  "page": 101,
  "faction": "alliance",
  "cx": 259.2, "cy": 63.3,
  "in_iv_ex": true,
  "is_corridor": 0,
  "canonCol": 5, "canonRow": 20,
  "canonDotX": 257.856, "canonDotY": 759.725,
  "canonLineMarkerX": 259.201, "canonLineMarkerY": 776.414,
  "canonLineMarkerCol": 3, "canonLineMarkerRow": 22,
  "canonGameCol": 6, "canonGameRow": 21,
  "canonPixelX": 82.275, "canonPixelY": 257.856,
  "canonColorRgb": [168, 62, 11], "canonColorHue": 19.5,
  "spectralClass": "K",
  "spectralClassSource": "page101-bg actual star disk color after local background subtraction"
}
```

### 2.3 데이터 등급 분류

| 필드 | 등급 | 근거 |
|------|------|------|
| `system` (일본어 성계명) | **P0** | PDF 주석에서 직접 추출, 80개 전수 매칭 확인 |
| `planets` (행성명+궤도) | **P1** | PDF 주석에서 유일 출처; 3%만 클라이언트에 존재(나머지는 서버 추론) |
| `canonCol`/`canonRow` | **P0** | page-101 래스터 스타닷 중심에서 100×50 그리드 투영, 80개 전수 매칭 |
| `canonGameCol`/`canonGameRow` | **P0** | `canonCol+1`/`canonRow+1` (1-indexed 게임 좌표) |
| `spectralClass` | **P1** | page-101 배경에서 스타디스크 색상 추출 후 배경 감산; 클라이언트 분광형 매핑 확인 |
| `cx`/`cy` | **P0** | PDF 주석 사각형 중심 (주석 자체 좌표) |
| `canonDotX`/`canonDotY` | **P0** | 실제 래스터 스타닷 중심 (주석 중심과 별개) |
| `faction` | **P0** | 원작 설정(동맹/제국/중립) + page-101 지도상 위치로 교차 확인 |
| `is_corridor` | **P0** | 이제르론/페잔/반프리트 등 회랑 성계, 원작 설정 확인 |
| `in_iv_ex` | **P1** | IV EX 출전 여부 (DGGL db.mdb 대조) |

### 2.4 그리드 메타데이터

```json
"_canon_grid": {
  "width": 100, "height": 50,
  "coordinateBase": { "canonColRow": 0, "canonGameColRow": 1 },
  "note": "canonCol/canonRow feed the 0x0315 zero-indexed wire array; canonGameCol/canonGameRow are the 1-indexed in-game grid coordinates"
}
```

---

## 3. PDF 출처 → authoritative 클라/서버 소스 교체 로드맵

현재 `content/galaxy.json`은 `gin7manualsaved.pdf` 101p `星系図`의 **래스터 스타닷 + 주석 라벨**에서 추출됨. 이를 authoritative 클라이언트/서버 소스로 교체하려면 다음 단계를 거쳐야 함.

### 단계 1: 클라이언트 와이어 수신 경로 완전 복원 (P0)

**목표**: 서버가 0x0313/0x0315/0x031d를 정확히 emit하면 클라이언트가 전략맵을 완전히 렌더하도록 만듦.

1. **0x0313 오브젝트 테이블 빌더 완성** (`src/server/codec/base-record.mjs` 또는 `logh7-login-protocol.mjs`)
   - `buildStaticInformationGridTypeInner`: 80성계 각각에 `value`(4~83), `contentId`(constmsg group 0x18 서브인덱스), `klass=3`, `variant`(분광형→0~6) 할당
   - 현재 `buildStrategicGalaxyGrid`가 이미 이 역할을 수행 중 — 이 함수를 authoritative 레코드 빌더로 승격

2. **0x0315 셀 그리드 빌더 완성**
   - `buildStaticInformationGridInner`: 100×50 RLE 인코딩
   - `buildStrategicGalaxyGrid`가 `terrain=true`일 때 이미 구현됨
   - 지형 값: SPACE(1), NON_NAVIGABLE(2), PLASMA(0), SARGASSO(89)

3. **0x031d 정적 기지 레코드 빌더 완성**
   - stride 0x3c(60B) per system, 80개 = 4800B
   - 필드: 성계명(가변 길이), 그리드 셀 ID, class_, diameter, 공전 데이터 등
   - 현재 서버 구현 상태 확인 필요 — `src/server/codec/base-record.mjs`의 `buildInformationBaseInner` 또는 별도 빌더

4. **라이브 검증 루프**
   - `ui_explorer`로 서버 emit → 클라이언트 렌더 확인
   - 80개 마커 모두 표시, 클릭 가능, 지형 이동 가능 확인

### 단계 2: content/galaxy.json의 데이터 등급 승격 (P0→P1 정제)

**목표**: PDF 추출 데이터의 불확실성을 제거하고, 클라이언트 파서와 바이트 정확하게 일치하도록 보정.

1. **성계명 검증**
   - 현재: PDF 주석 80개 라벨 → 80개 매칭 확인됨
   - 추가: 클라이언트 `constmsg.dat` group 0x18의 성계명 문자열과 교차 검증
   - 도구: `tools/logh7_data_survey.py` 또는 `redex`로 group 0x18 문자열 추출

2. **그리드 좌표 검증**
   - 현재: `canonCol`/`canonRow`는 래스터 닷 중심에서 100×50 투영
   - 추가: 클라이언트 0x031d 파서가 기대하는 셀 ID와 일치하는지 확인
   - 도구: `ui_explorer` 라이브 클릭 + 메모리 덤프로 `clientBase+0x3f5ae8` 배열 확인

3. **분광형 검증**
   - 현재: 래스터 색상에서 추출(O/B/A/F/G/K/M)
   - 추가: 클라이언트 `STRATEGIC_SPECTRAL_VARIANTS` 매핑과 일치 확인
   - 클라이언트가 실제로 어떤 분광형 값을 기대하는지 RE로 확인 필요

4. **행성 데이터 보강**
   - 현재: PDF 주석에서 유일 출처(3%만 클라이언트에 존재)
   - 추가: IV EX `db.mdb`에서 행성명/궤도 데이터 대조 보강
   - 클라이언트 0x031d/0x031f 파서의 행성 관련 필드 offset 확인

### 단계 3: 서버 권위적 갤럭시 상태 관리 (P0)

**목표**: 서버가 실시간으로 갤럭시 상태(소유권, 함대 위치, 지형)를 관리하고 클라이언트에 푸시.

1. **world-state 갤럭시 확장**
   - `src/server/logh7-world-state.mjs`에 `systems` Map 추가
   - 각 성계: `{ name, owner, fleets: Set, base: BaseEntity, terrain: cellValue }`

2. **0x0b07(NotifyMovedGrid) 권위적 이동**
   - 이미 구현됨: `LOGH_FLEET_MOVE_PROBE=1`로 서버가 직접 0x0b07 푸시
   - `grid-active` 플래그(DAT_007cd04c+0x11178) 설정 확인

3. **0x031f 동적 기지 경제정보 실시간 emit**
   - 소유권 변경, 인구/식량 변동 시 `NotifyBaseParameter(0x0337)` 브로드캐스트
   - 현재 `base-record.mjs`에 `buildNotifyBaseParameterInner` 구현 필요

### 단계 4: 클라이언트 정적 테이블 대체 (P2, 선택적)

**목표**: 클라이언트가 와이어 없이도 기본 갤럭시를 렌더할 수 있도록 정적 데이터 주입.

1. **code-cave 정적 테이블 주입**
   - EXE 데이터 섹션에 80성계 테이블(성계명 포인터, 그리드 좌표, 분광형) 주입
   - `FUN_004c5350` 스냅샷 로직을 우회하거나, 초기화 시 프리로드
   - **위험**: 데이터 섹션 여유 공간 확인 필요, 스냅샷 로직 변경 시 사이드 이펙트

2. **대안: 서버 bootstrap 와이어**
   - 클라이언트 기동 시 서버가 0x0313/0x0315/0x031d를 먼저 푸시
   - 현재 아키텍처와 일치, 가장 안전한 접근법
   - **권장**: 이 방향으로 유지, code-cave는 마지막 수단

### 단계 5: 갤럭시 데이터베이스화 (P1)

**목표**: `content/galaxy.json`을 서버 내부 SQLite/Drizzle 테이블로 마이그레이션.

1. **테이블 스키마** (`src/app/persistence/` 또는 `src/server/persistence/`)
   ```sql
   CREATE TABLE star_systems (
     id INTEGER PRIMARY KEY,
     name_ja TEXT NOT NULL UNIQUE,
     name_ko TEXT,
     canon_col INTEGER NOT NULL,
     canon_row INTEGER NOT NULL,
     faction TEXT NOT NULL, -- 'empire'|'alliance'|'neutral'|'pirate'
     spectral_class TEXT, -- 'O'|'B'|'A'|'F'|'G'|'K'|'M'
     is_corridor BOOLEAN DEFAULT 0,
     in_iv_ex BOOLEAN DEFAULT 0,
     cx REAL, cy REAL, -- PDF 주석 좌표
     canon_dot_x REAL, canon_dot_y REAL -- 래스터 닷 중심
   );
   CREATE TABLE planets (
     id INTEGER PRIMARY KEY,
     system_id INTEGER REFERENCES star_systems(id),
     name_ja TEXT NOT NULL,
     orbit INTEGER NOT NULL
   );
   CREATE TABLE fortresses (
     id INTEGER PRIMARY KEY,
     system_id INTEGER REFERENCES star_systems(id),
     name_ja TEXT NOT NULL
   );
   ```

2. **마이그레이션 스크립트**
   - `content/galaxy.json` → Drizzle seed migration
   - `galaxy-passable-cells.json` → 별도 테이블 또는 런타임 로드

3. **쿼리 레이어**
   - `getSystemByName`, `getSystemByCell`, `getSystemsByFaction`, `getNeighbors`
   - `logh7-galaxy-adjacency.mjs`의 `buildAdjacency`를 DB 기반으로 전환

---

## 4. 현재 구현 상태 요약

| 컴포넌트 | 상태 | 파일 |
|----------|------|------|
| galaxy.json (80성계 데이터) | **완료** | `content/galaxy.json` |
| galaxy-passable-cells.json (항행 마스크) | **완료** | `content/galaxy-passable-cells.json` |
| galaxy-adjacency.json (인접 그래프) | **완료** | `src/server/logh7-galaxy-adjacency.mjs` |
| 0x0313 오브젝트 테이블 빌더 | **완료** | `buildStrategicGalaxyGrid` @ `logh7-login-protocol.mjs:975` |
| 0x0315 셀 그리드 빌더 | **완료** | `buildStrategicGalaxyGrid` @ `logh7-login-protocol.mjs:975` |
| 0x031d 정적 기지 레코드 빌더 | **부분** | `buildInformationBaseInner` 확인 필요 |
| 0x031f 동적 기지 경제 빌더 | **부분** | `buildNotifyBaseParameterInner` 확인 필요 |
| 0x0b07 권위적 이동 | **완료** | `logh7-login-session.mjs` + `LOGH_FLEET_MOVE_PROBE` |
| 지형(플라즈마/사르가소) 생성 | **완료** | `generatePlasmaCells` @ `logh7-login-protocol.mjs:861` |
| 전략 시뮬레이션(AI 함대전) | **완료** | `logh7-strategic-sim.mjs` |
| 클라이언트 라이브 검증 | **진행 중** | `ui_explorer` + `LOGH_STRAT_GALAXY=1` |
| Drizzle DB 마이그레이션 | **진행 중** | `src/app/persistence/` (Phase 1 accounts 완료) |

---

## 5. 다음 행동 항목

1. **0x031d 빌더 완성**: `buildInformationBaseInner` 또는 별도 함수로 80성계 × stride 0x3c = 4800B 레코드 구현. `logh7-wire` 스킬로 클라이언트 파서 offset 확인.

2. **0x031f/0x0337 동적 경제**: `buildNotifyBaseParameterInner` 구현. 소유권 변경 시 실시간 브로드캐스트.

3. **라이브 검증**: `ui_explorer`로 80성계 마커 전수 렌더 + 클릭 + 지형 이동 확인. `tools/logh7_dump_strategic_grid.mjs`로 오라클 비교.

4. **Drizzle 마이그레이션**: `star_systems`/`planets`/`fortresses` 테이블 추가. `content/galaxy.json` → seed migration.

5. **constmsg group 0x18 교차검증**: 클라이언트 내장 성계명 문자열과 `galaxy.json`의 `system` 필드가 80개 모두 일치하는지 확인.

---

## 6. 참조 문서

- `docs/logh7-galaxy-page101-dot-extraction.md` — page-101 닷 추출 방법 및 QA 체크포인트
- `content/galaxy.json` — 80성계 캐논 데이터 (PDF 출처)
- `content/galaxy-passable-cells.json` — 항행 가능 셀 마스크
- `src/server/logh7-login-protocol.mjs` — 와이어 레코드 빌더 (0x0313/0x0315/0x031d/0x031f)
- `src/server/logh7-galaxy-adjacency.mjs` — 인접 그래프 생성
- `src/server/logh7-strategic-sim.mjs` — 무유저 전략 시뮬레이션
- `docs/SESSION-HANDOFF-2026-06-23.md` — 최신 세션 핸드오프
