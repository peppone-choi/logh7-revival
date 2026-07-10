# 전략맵 오브젝트 배치 와이어 계약 (정통 EXE 재확정)

> 작성일: 2026-07-11 · 작성: re-analyst
> **대상 바이너리(단일 정본):** `artifacts/logh7-install/…/exe/g7mtclient.exe`
> **sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`**
> ImageBase 0x400000, .text VA→파일오프셋 = `VA − 0x400000`.
> **검증 방법:** Ghidra 12.1.2 헤드리스로 이 정본 EXE를 새로 디컴파일
> (`scratchpad/ghidra-canon/g7mtclient.exe_decompiled.c`, 전 함수). 아래 모든 함수·오프셋·
> 상수를 이 정본 디컴파일 실바이트로 **직접 재확인**했다. 옛 RE(`5bd249c:docs/reference/
> legacy-evidence/logh7-strategic-map-wire.md`, -sjis 변종 기반)와 **.text 코드가 바이트 단위로
> 동일**함을 확인 — 함수 주소·상수 전부 일치. 옛 문서의 계약이 정본에서 그대로 성립한다.

---

## 0. 핵심 결론 (구현자 우선 요약)

전략맵에 성계·함대·마커가 하나도 안 찍히는 것은 프로토콜 문제가 아니라 **서버가 오브젝트를
하나도 안 실어 보내기 때문**이다. 클라의 렌더 파이프라인은 딱 두 메시지만 소비한다:

- **0x0313 (팔레트/오브젝트 테이블)** — 각 오브젝트의 `[byte0=라벨id, byte1=클래스, byte2=아이콘변종]`.
  **byte1==3 인 오브젝트만** 클릭 가능한 섹터 마커로 렌더된다.
- **0x0315 (셀 그리드, RLE)** — 100×50 그리드. 셀값 v = 팔레트 인덱스. 셀 `(col,row)`에 v를 두면
  그 셀에 objectTable[v] 마커가 그려진다.

**현재 서버 상태(빈 맵의 원인):** `server/src/server/logh7-world-records.mjs`
- 0x0313에 `DEFAULT_SECTOR_GRID_TYPES`(값 0/1/2, 전부 **klass=0** terrain)만 → 마커 0개.
- 0x0314→0x0315는 플레이어 함대 셀 1칸을 value=1(空間, klass=0 비마커)로만 채움
  (`logh7-world-session.mjs:369-374`) → 마커 0개.
- 0x0f02 스폰버스트도 SPACE 팔레트 1개 + 셀 1칸만(`buildGridInitializeSpawnInners:1005-1012`).

**고치는 법:** 0x0313 팔레트에 85개 성계(+요새+함대)를 각각 **klass=3** 오브젝트로 추가하고,
0x0315 셀 그리드에 각 성계의 `canonRow*100 + canonCol` 셀에 그 오브젝트 값을 배치한다.
데이터는 `server/content/galaxy.json`에 전부 있다(§4). 클릭/hover 상세 패널은 별도 메시지
(0x031d/0x031f/0x0323, §5)로 온디맨드 응답.

---

## 1. 렌더 파이프라인 — 정본 함수 실증

### 1.1 디스패처 `FUN_004ba2b0` (0x4ba2b0) — 0x0313/0x0315 저장

정본 디컴파일 실측 (case 0x313 / 0x315):
```c
case 0x313:  // "ResponseStaticInformationGridType"
  puVar16 = clientBase + 0x3f57d4;
  for (iVar15 = 0x4b; ...) *puVar16++ = *param_2++;   // 75 dword = 300B
  *(u8*)puVar16 = *(u8*)param_2;                        // +1B = 301B
case 0x315:  // "ResponseStaticInformationGrid_OK"
  puVar16 = clientBase + 0x3f4448;
  for (iVar15 = 0x4e3; ...) *puVar16++ = *param_2++;   // 1251 dword = 5004B raw
  FUN_004abbb0(clientBase + 0x3f444c, param_2);        // RLE 디코드 (param_2 = 레코드 시작)
```
`param_2` = message32 헤더(`[u32 0][u16 code]`) 뒤의 inner 레코드. 즉 0x0315 바디는
`param_2[0]`부터 `[w][h][u16 count][pairs]`.

### 1.2 크기 테이블 `FUN_004b8b00` (0x4b8b00) — 고정 프레이밍

정본 실측 (case 0x313/0x315 한 블록):
```c
case 0x313:
case 0x315:  *param_4 = 0x138c;  return 1;   // 둘 다 고정 5004B
```
전체 관련 코드 크기(정본 확인): 0x305→0x520a, 0x307→0xe5b2, 0x309→0x55c, 0x30b→0x6d64,
0x30d→0x184, 0x30f→0x34, 0x311→0x1b0, **0x313/0x315→0x138c**, 0x317→4, 0x31d→0x520c,
**0x31f(=799)→0x604**, 0x321→0x8de4, 0x323→0x2d4, 0x325→0xce44.
⇒ 0x0315는 반드시 **5004B 풀사이즈**로 보내야 enqueue된다(빈/짧은 프레임은 over-read/미큐잉).
RLE는 count 쌍만 읽고 나머지 0패딩은 무시하므로 `[w][h][count][pairs][0…5004]`가 정답.

### 1.3 RLE 디코더 `FUN_004abbb0` (0x4abbb0) — 정본 실측

```c
uVar5 = *(u16*)(param_2+2);                 // rleByteCount
if (uVar5 != 0 && uVar5 < 0x1389) {         // 0 < count < 5001
  bVar1 = param_2[1];                        // h
  bVar2 = *param_2;                          // w
  // uVar10 += 2 스텝으로 param_2[uVar10+4]=run, param_2[uVar10+5]=value 읽어
  //   dest(param_1+uVar8)에 run개 value memset, while(uVar10 < uVar5-1)
  return (Σrun == w*h);                      // 불변식: 런 합 == w*h == 5000
}
```
- **바이트 순서 함정(정본 확인):** 디코더 자체는 `*(u16*)(param_2+2)`를 host-order로 읽지만,
  상류 입력 파서 `FUN_004134e0`가 이 필드를 스트림 헬퍼로 **BE** 읽어 유효범위(0<c<0x1389)를
  게이트한다. 서버는 **rleByteCount를 BE(`writeUInt16BE`)로** 써야 한다(현 서버 정답,
  `logh7-world-records.mjs:559`). LE로 쓰면 범위 초과로 dispatcher 도달 전 정지(옛 G222).
- w=byte0, h=byte1. 표준 보드 w=100(0x64), h=50(0x32), w*h=5000.

### 1.4 스테이징→라이브 복사 `FUN_004c5350` (0x4c5350) — run-once 가드

정본 실측: `clientBase+0x2c03c0` 가드가 0일 때만(=전략맵 씬 첫 진입 시) 스테이징
(`0x3f4448` 셀, `0x3f57d4` 오브젝트)을 라이브(`0x2c03c8`/`0x2c1754`)로 복사하고 가드=1.
⇒ **0x0314에 빈 그리드로 응답하면 그 빈 스냅샷이 가드를 잠가** 이후 진짜 0x0315가 무시된다.
0x0314 응답에 **실 그리드를 실어야** 한다(현재 서버가 빈 값 1칸만 보내는 지점 — §3 수정 대상).

### 1.5 셀 접근자 `FUN_004c8b70` (0x4c8b70) — 셀값→오브젝트 레코드

정본 실측 (바이트 정확):
```c
FUN_004c8b70(col, row):
  if (0<=col<100 && 0<=row<50)
    v = *(u8*)(clientBase + row*100 + 0x2c03cc + col);   // 셀값
    return clientBase + 0x2c1755 + v*3;                  // &objectTable[v] (3바이트 레코드)
  return 0;
```
⇒ **셀값 v는 팔레트 인덱스**, 오브젝트 레코드 = objectTable + v*3.

### 1.6 배치 루프 `FUN_004d3bd0` (0x4d3bd0) — byte1==3 게이트 + byte2 변종 (정본 실측)

```c
puStack_214 = FUN_004c8b70(col,row);
if (puStack_214 != 0 && puStack_214[1] == '\x03') {   // ★byte1(klass)==3 게이트
    bVar1 = puStack_214[2];                            // byte2 = 아이콘 변종
    if (bVar1 < 7)      uVar4 = bVar1;                 // 0..6 그대로
    else { if (bVar1 != 8) goto SKIP; uVar4 = 7; }     // 8→7(블랙홀), 그 외 skip
    piVar13[2]  = uVar4;                               // 마커 클래스(아이콘 슬롯)
    *(u8*)(piVar13-5) = 1;                             // valid 플래그
    piVar13[-1] = col;  *piVar13 = row;                // 셀 좌표
    FUN_004d3540(&worldPos, col);                      // col→월드좌표
    if (objRec[1] == '\x03') iVar12 = FUN_004c8c90(byte0);  // byte0→라벨
    piVar13[1] = iVar12;                               // 해석된 라벨/링크
    piVar13 += 10;                                     // 마커레코드 stride 0x28(=10dw)
}
```
- **byte1==3 만 마커.** 다른 klass(0/1/2)는 전부 skip → 렌더 안 됨.
- **byte2 유효값 {0,1,2,3,4,5,6,8}**(8은 블랙홀=클래스7). 그 외는 skip.
- 마커레코드 배열 `DAT_009d1510`(stride 0x28, 최대 0x500/0x28=**~128개**)에 채워짐.
  렌더러 `FUN_004d6b70`가 `piVar13[2]`(클래스)를 아이콘텍스처 배열 `(&DAT_009d2934)[class]`로
  인덱싱(슬롯 0..6 = 성계 글로우, 7 = 블랙홀).

### 1.7 byte0 → 라벨 `FUN_004c8c90` → `FUN_00522010(0x18, byte0)` (정본 실측)

```c
FUN_004c8c90(byte0): FUN_00522010(0x18, byte0);   // 콘텐츠 테이블 그룹 0x18
```
byte0은 **constmsg 그룹 0x18의 레코드 인덱스**(성계/요새 이름 문자열). 와이어에는 인덱스(1B)만
싣고 이름 텍스트는 클라 `data/MsgDat/constmsg.dat`에서 온다(한글화 오버레이 대상). subId 0..2는
그리드-TYPE 라벨(プラズマ嵐/空間/航行不能), 실 성계 이름은 subId 3부터.

### 1.8 역인덱스 `FUN_004c8bc0` (0x4c8bc0) — 오브젝트값 범위 3..88 (정본 실측)

```c
for i in 0..0x59: field[8 + i*4] = 0xffffffff;   // 89 슬롯
for 각 셀 v: if (2 < v && v < 0x59) field[8 + v*4] = 셀위치;   // v ∈ 3..88, last-wins
```
⇒ **오브젝트값→단일셀 역참조는 v 3..88(86개)만** 유효. 단, 이건 "오브젝트 X가 어느 셀?"
역참조용이고, **렌더 자체는 이 캡에 안 걸린다**(§6 값 예산 참고).

---

## 2. 0x0313 팔레트(오브젝트 테이블) — 정확 포맷

| 요소 | 내용 |
|---|---|
| 전체 크기 | 고정 5004B(`FUN_004b8b00` 0x138c). 실내용 301B는 프리픽스, 나머지 0패딩 무해 |
| `payload[0]` | `count` = **max(오브젝트값)+1** (상류 파서 `FUN_00413050` 관례: byte0=count<0x65, 이후 count개 3바이트 레코드 순차). filler 0 레코드로 낮은 값 자리 채움 |
| `payload[1 + v*3 + 0]` | **byte0 = 라벨 id** (constmsg 0x18 인덱스). 성계명/요새명 |
| `payload[1 + v*3 + 1]` | **byte1 = 클래스 게이트.** `==3` 이라야 마커 렌더/클릭. 0/1/2 = 비마커 terrain |
| `payload[1 + v*3 + 2]` | **byte2 = 아이콘 변종.** {0..6}=성계 글로우 슬롯, 8=블랙홀(클래스7). 그 외 skip |

**성계 마커를 만들려면:** `byte0`=성계의 0x18 라벨 인덱스, `byte1=3`, `byte2`=스펙트럼 슬롯
(galaxy.json `spectralClass` O/B/A/F/G/K/M → 0/1/2/3/4/5/6, 미상 → 8).
klass 필드는 **디스플레이 라벨(byte0)이나 terrain 타입이 아니라 항법·클릭 게이트**임에 주의.

현재 서버 빌더 `buildStaticInformationGridTypeInner`(`logh7-world-records.mjs:656`)는 이미
`[contentId, klass, variant]`를 `1+value*3`에 쓰고 count=max(value)+1을 넣는다 — **포맷은 정답,
입력 데이터만 terrain 3종뿐**. `objects` 배열에 klass=3 성계들을 넣으면 됨.

**값 예산(중요 제약):** 팔레트 값 v는 여러 캡이 있다 —
- **팔레트 테이블 최대 100개**(에러 `information_size over than 100`, byte0 count는 u8).
- **마커 레코드 배열 ≤128개**(`DAT_009d1510` 0x500/0x28).
- **역인덱스(오브젝트값→단일셀)는 v 3..88만**(`FUN_004c8bc0`, 86슬롯).

**같은 값 v를 쓴 두 셀은 동일 마커**(같은 라벨/아이콘)로 각각 렌더된다 — 서로 다른 성계명이
필요하면 성계마다 **고유 v**가 필요. 85개 성계는 v=3..87(85슬롯)로 배치하면 모두 ≤88이라
역인덱스도 유효하고 100/128 캡 아래다. 여기에 요새·함대를 **별도 v**로 더하면 89..99로 넘어가
렌더는 되지만 그 오브젝트의 역인덱스(오브젝트→셀)는 사라진다(클릭-라벨엔 무관, 렌더/클릭게이트는
byte1==3만 봄). 요새는 대개 성계와 같은 셀이므로 성계 마커에 흡수하거나(상세패널서 구분) 별도
v를 줄 수 있다. 100개 초과 마커가 필요하면 보드 페이징이 필요.

---

## 3. 0x0315 셀 그리드 — galaxy 좌표 → 셀 인덱스 매핑

- 포맷: `[u8 w=100][u8 h=50][u16 BE rleByteCount][RLE (u8 run, u8 value)…][0패딩 → 5004B]`.
- **셀 인덱스 = `row*100 + col`**, 셀값 = 0x0313 팔레트 인덱스. Σrun == 5000 필수(불변식).
- **galaxy→셀:** `server/content/galaxy.json`의 각 성계는 이미 `canonCol`/`canonRow`
  (**0-indexed, 0x0315 배열 좌표**)를 갖는다. `_canon_grid`가 명시:
  `"canonCol/canonRow feed the 0x0315 zero-indexed wire array; canonGameCol/canonGameRow are the
  1-indexed in-game grid coordinates"`. width=100, height=50.
  ⇒ 성계 s를 값 V로 배치 = `grid[s.canonRow*100 + s.canonCol] = V`.
- 나머지 셀은 0(빈 공간). 옛 문서의 terrain 오버레이(항행가능=1/불능=2/플라스마=0)는 선택적(P2/P3);
  마커 배치와 독립.

현재 서버 빌더 `buildStaticInformationGridInner`(`logh7-world-records.mjs:524`)는 이미
`cells:[{col,row,value}]`를 받아 `grid[row*w+col]=value` 후 RLE·BE·5004B 패딩까지 정확히 한다 —
**빌더는 정답, `cells`에 성계 85개를 안 넣을 뿐**.

---

## 4. galaxy.json — 배치에 필요한 필드 (정본 데이터 소스)

`server/content/galaxy.json` `systems[]` (85개), 각 원소 주요 필드:

| 필드 | 용도 |
|---|---|
| `canonCol`, `canonRow` | **0-indexed 셀 좌표** → `cell = canonRow*100 + canonCol` (0x0315) |
| `system` | 성계명(일본어). constmsg 0x18 인덱스 매핑에 사용(§5 라벨) |
| `spectralClass` | O/B/A/F/G/K/M → byte2 아이콘 슬롯 0..6 (0x0313) |
| `faction` | alliance/empire — 색/소속(상세 패널·팩션 틴트) |
| `planets` | 성계 선택 시 행성 궤도 모델(0x031d 컴패니언, §5.4) |
| `fortresses` | 요새(예: ロフォーテン→ルドミラ). 성계와 같은 셀 |
| `is_corridor` | 회랑 여부(항법·terrain 판단) |

특수 천체: `galaxy.json._specialBodies` — 블랙홀 3(bh_01..03)+중성자별 3(ns_01..03).
**셀 소속은 미확정(P3)** — 현 파이프라인은 이를 진입불가 장애물(값 90/91)로만 인코딩(옵션).
블랙홀을 스프라이트로 렌더하려면 byte1=3, byte2=8(→클래스7)이 필요하나 셀 캐논이 없어 P3.

---

## 5. 성계 상세/이름/소속 — 클릭·hover 상세 테이블 (온디맨드)

마커 **렌더**에는 0x0313+0x0315만 필요. **클릭/hover 시 뜨는 상세 패널**은 별도 요청/응답으로
온디맨드 처리된다(req = resp−1). 정본 크기표(`FUN_004b8b00`)로 코드·크기 확정:

| 상세 | req→resp | 저장 위치 | 크기 | 내용 |
|---|---|---|---|---|
| 정적 성계(천문+이름) | 0x031c→**0x031d** | `+0x3f5ae8` (stride 0x3c) | 0x520c(21004) | id/grid/name[≤13]/class_/공전반경·주기·방향·초기각 |
| 동적 기지(경제/소속) | 0x031e→**0x031f** | `+0x3facf4` count/`+0x3facf8` (stride 0x180, max 4) | 0x604(1540) | owner/state, commodity[3]/budget[5]/budgeting[6]/supplies[30] 등 |
| 시설(施設 패널) | 0x0320→**0x0321** | `+0x3fb2f8` | 0x8de4(36324) | institution[≤36] 防衛/造兵/対空/衛星 3단 중첩 |
| 캐릭터(통치자/수비대장) | 0x0322→**0x0323** | `+0x36a8b4` (stride 0x2d4) | 0x2d4(724) | power(진영)/spot(현 성계)/spot_owner/flagship(=unitId) 등 47필드 |

- **0x031d(ResponseStaticInformationBase)** — 성계 이름·그리드셀·천문. **80레코드 라이브 증명**
  (옛 postcreate-031d-parser-stream-ring: 80개 → normalReturn → HUD 표시). 바디는 파서-헬퍼
  스트림: `u16be count` 후 레코드 순차, `FUN_004142e0`가 stride 0x3c 목적지로 확장.
  dest +0x00 id(u32be), +0x04 grid(u16be), +0x0a name.len, +0x0c name(u16be×len), +0x26 class_.
- **0x031f** — 동적 경제/소속. 배열 필드 5개(cap 30/30/6/5/3)만 오프셋 HIGH, scalar는 P3.
  소속 바이트 elem+0x04(0x02=동맹, 0x03=제국). 고정 바디 0x604(count dword + 4×0x180).
- **통치자/수비대장은 Base 레코드에 없다** — 캐릭터(0x0323)의 `spot==systemId` + power(진영)로
  유도. 성계당 함선수는 0x0325 유닛테이블에서.
- **§5.4 선택 성계 행성:** 성계 선택 시 배치루프가 `p%03d_low.mdx` 행성 모델을 순서대로 로드
  (≤8슬롯, 기본 마스크 `01010101`=앞 4개). 정확한 행성명 표시엔 0x031d 컴패니언 필요.
  **[라이브 프로브: 실 성계 선택 시 present-mask·p%03d 인덱스가 와이어로 오버라이드되나
  placeholder로 남나 — 정적 디컴파일은 placeholder만 보임.]**

---

## 6. 함대/유닛 마커 경로

**핵심(정본·옛 §5 확정):** 전략 오브젝트 테이블은 유닛 테이블과 **클라측에서 링크되지 않는다**.
섹터 마커는 **오직 0x0313/0x0315**로만 만들어진다. 0x0325 유닛테이블(`+0x41a368`, stride 0x58,
count u16 @`+0x41a364`, 고정 0xce44)은 **HUD 포커스/PLAYER_INFO/유닛게이트**를 담당하지 맵 마커를
직접 그리지 않는다. 정본 확인: 렌더 경로(FUN_004d3bd0/FUN_004c8b70)는 `+0x2c1755` 오브젝트
테이블만 읽고 `+0x41a368` 유닛테이블을 참조하지 않는다.

⇒ **함대를 맵에 띄우려면** 함대도 klass=3 팔레트 오브젝트로 셀에 박아야 한다
(byte0=식별 라벨, byte2=팩션 틴트 슬롯). 그리고 별도로 0x0325에 유닛 엔트리를 실어 HUD/선택을
살린다(char record[9]@0x24 = unitId 링크, `FUN_004c2a80`).

- 플레이어 함대: byte0=charId&0xff, byte1=3, byte2=팩션 틴트. + 0x0325 unit[0].id=unitId +
  0x0323 char(record[9]@0x24=unitId) + 0x0204 selected-char id.
- NPC 함대: 추가 klass=3 오브젝트 + 0x0325 유닛 엔트리.

**함대 셀을 klass=3로 박으면 "가짜 성계 dot" 우려(현 서버 주석)**: 사실은 byte2 변종만 다르면
함대 아이콘 슬롯으로 구분된다. 다만 어느 byte2가 함대 vs 성계 vs 요새 스프라이트인지는
**콘텐츠 규약(하드코드 분기 없음, 코드는 0..6 균일 처리, 7만 블랙홀 특수)** — [라이브 프로브
필요: byte2 0..6을 시각 테스트해 요새/함대/성계 스프라이트 매핑 확정].

---

## 7. 클릭 → 명령 계약 (M4 연결)

- 셀/성계 클릭 → 이동모드 진입 시 클라가 **CommandMoveGrid 0x0b01**(대상 셀) 방출.
  핸들러 `FUN_00581c80`(SelectGrid, `_DAT_00c9e3a8`에 설치), 명령 오브젝트에
  `[0xb07 NotifyMovedGrid, 0xb01 CommandMoveGrid]`.
- **전제:** 대상 셀이 항법 가능해야 함 — `FUN_004d6310`이 `FUN_004d35b0`(=objectTable[v].byte1)로
  게이트, byte1 ∈ {1,3} 만 항법가능(1=空間, 3=마커). byte1=0/2(빈 배경/불능)는 **조용히 진입불가**
  → 0x0b01 미방출. ⇒ 함대가 이동하려면 목적지 셀들이 byte1∈{1,3}이어야 한다(성계는 3, 이동
  가능한 빈 공간은 klass=1 terrain로 채워야 함 — 배경 0셀은 항법불가).
- **미해결(옛 §7-1, 라이브 프로브):** SelectGrid 이동모드 진입 UI 경로는 아직 미증명
  (G225: 마커 렌더·info클릭은 되나 0x0b01/0x0b07 미포착). 0x0313/0x0315 파싱·마커렌더 문제는
  아님 — 이동모드 진입 트리거가 남은 미해결.

---

## 8. 확신도 표

| 항목 | 확신도 | 근거 |
|---|---|---|
| 0x0313 포맷 [byte0,byte1,byte2], 1+v*3, count=max+1 | **HIGH(정본 확인)** | `FUN_004ba2b0` case0x313, `FUN_00413050`, `FUN_004d3bd0` |
| byte1==3 = 마커 게이트 | **HIGH(정본 확인)** | `FUN_004d3bd0:59806` `puStack_214[1]=='\x03'` |
| byte2 변종 {0..6,8→7} else skip | **HIGH(정본 확인)** | `FUN_004d3bd0:59807-59814` |
| byte0 → constmsg 0x18 라벨 | **HIGH(정본 확인)** | `FUN_004c8c90`→`FUN_00522010(0x18,·)` |
| 0x0315 [w][h][u16BE count][run,value], Σrun==5000 | **HIGH(정본 확인)** | `FUN_004abbb0`, `FUN_004134e0` BE |
| 셀값 v → objectTable[v*3] | **HIGH(정본 확인)** | `FUN_004c8b70:50519` |
| 0x0313/0x0315 고정 5004B | **HIGH(정본 확인)** | `FUN_004b8b00:37165` 0x138c |
| canonCol/canonRow → cell=row*100+col | **HIGH** | galaxy.json `_canon_grid`, `FUN_004c8b70` row*100+col |
| spectralClass → byte2 슬롯 0..6 | **MEDIUM** | 옛 매핑 관례; 시각 프로브 미완 |
| 상세코드 031d/031f/0321/0323 페어·크기 | **HIGH(정본 확인)** | `FUN_004b8b00` case별 크기 |
| 함대≠유닛테이블 링크(마커는 0x0313만) | **HIGH(정본 확인)** | 렌더경로가 +0x41a368 미참조 |
| 어느 byte2가 요새/함대/성계 스프라이트 | **P3** | 하드코드 분기 없음 — 라이브 시각 프로브 |
| 블랙홀/중성자별 셀 소속 | **P3** | 캐논 매핑 부재 |
| SelectGrid 이동모드 진입 UI 트리거 | **미해결** | G225 라이브 미포착 |

---

## 9. 남은 라이브 프로브 (한 줄씩)

1. byte2 0..6을 각각 심어 요새/함대/성계/블랙홀 스프라이트 시각 매핑 확정.
2. 실 성계 선택 시 행성 present-mask·p%03d 인덱스가 0x031d 와이어로 오버라이드되나 placeholder냐.
3. SelectGrid 이동모드 진입 UI 경로(0x0b01 방출 트리거) — 마커 클릭이 info요청(0x0f08)로 새는 원인.
4. 배경 0셀 대량이 항법불가(byte1=0)이므로, 이동 가능 공간을 klass=1 terrain로 채운 보드가
   필요한지(전면 terrain 오버레이) 라이브 확인.

---

## 부록 A. 핵심 함수·전역 (정본 EXE 주소, 재확인 완료)

| 주소 | 역할 |
|---|---|
| `FUN_004ba2b0` | 디스패처. case 0x313→+0x3f57d4(301B), 0x315→+0x3f4448(5004B)+RLE |
| `FUN_004b8b00` | 크기표. 0x313/0x315→0x138c |
| `FUN_004abbb0` | RLE 디코더 [w][h][u16 count]{run,value}, Σrun==w*h |
| `FUN_004134e0` | 상류 입력 파서 (rleByteCount BE 게이트) |
| `FUN_00413050` | 0x0313 상류 파서 (count<0x65, 3바이트 레코드) |
| `FUN_004c5350` | 스테이징→라이브 run-once 복사 (가드 +0x2c03c0) |
| `FUN_004c8b70` | 셀 접근자 → &objectTable[v*3] (+0x2c1755) |
| `FUN_004c8bc0` | 오브젝트값→셀 역인덱스 (v 3..88) |
| `FUN_004c8c90` / `FUN_00522010` | byte0 → constmsg 0x18 라벨 |
| `FUN_004d3bd0` | 배치 루프 (byte1==3, byte2 변종, byte0 라벨, 마커 stride 0x28) |
| `FUN_004d35b0` | objectTable[v].byte1 접근자 (항법 게이트) |
| `FUN_004d6310` | 항법 게이트 (byte1∈{1,3}) |
| `FUN_004d6b70` | 마커 렌더 (아이콘 `DAT_009d2934[class]`, 7=블랙홀) |
| `FUN_00581c80` | SelectGrid → CommandMoveGrid 0x0b01 |
| 전역 `+0x2c03cc` | 라이브 셀그리드 100×50 (row*100+0x2c03cc+col) |
| 전역 `+0x2c1755` | 라이브 오브젝트 테이블 (v*3) |
| 전역 `DAT_009d1510` | 마커 레코드 배열 (stride 0x28, ≤128) |

정본 디컴파일 원본: `scratchpad/ghidra-canon/g7mtclient.exe_decompiled.c` (세션 스크래치패드).
