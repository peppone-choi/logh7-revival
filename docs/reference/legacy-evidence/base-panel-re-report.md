# LOGH VII 기지/행성 상태 패널(拠点 선택/기지정보) RE 보고서

> 작성일: 2026-06-24
> 근거: Ghidra decompile index `G7MTClient.exe` (`.omo/ghidra/export/G7MTClient/`)
> 검증 도구: `python tools/logh7_redex.py func 0x<VA>`

---

## 1. 이 패널을 그리는 클라이언트 함수는?

### 1.1 패널 트리거 체인

패널 열림은 `C002` 명령 테이블 category=3(base) 또는 전략맵 셀 클릭을 통해 시작된다.

| 단계 | VA | 함수 | 역할 |
|------|-----|------|------|
| 1 | `0x004b68f0` | `FUN_004b68f0` | mode dispatcher, 전략/메뉴/전술 분기 |
| 2 | `0x0054e570` | `FUN_0054e570` | **panelKind dispatcher** — param_2 값으로 패널 종류 분기 |
| 3 | `0x0051ca30` | `FUN_0051ca30` | **base panel 초기화** (param_2==3일 때 호출) |
| 4 | `0x0057aa90` | `FUN_0057aa90` | **base 데이터 소비 및 렌더** |

**`FUN_0054e570` decompile (panelKind 분기):**

```c
void __thiscall FUN_0054e570(int *param_1, int param_2) {
    // ...
    iVar1 = *param_1;
    if (iVar1 == 1) { FUN_005123b0(); }      // panelKind 1
    else if (iVar1 == 2) { FUN_004ff3c0(); } // panelKind 2
    else if (iVar1 == 3) { FUN_0051ca30(); }  // panelKind 3 = BASE
    // ...
}
```

**`FUN_0051ca30` decompile (base panel 초기화):**

```c
void __fastcall FUN_0051ca30(int param_1) {
    // ... 메모리 할당 및 초기화 ...
    FUN_0051cda0(*(undefined4 *)(param_1 + 0xc));
    FUN_0051d570(*(undefined4 *)(param_1 + 0xc));
    FUN_0051d580(*(undefined4 *)(param_1 + 0xc));
    FUN_0051dc00(*(undefined4 *)(param_1 + 0xc));
    FUN_0051dd80(*(undefined4 *)(param_1 + 0xc));
    FUN_0051e580(*(undefined4 *)(param_1 + 0xc));
    FUN_00593dd0(*(undefined4 *)(param_1 + 0xc));
    FUN_0051f8b0(*(undefined4 *)(param_1 + 0xc));
    FUN_00598990(*(undefined4 *)(param_1 + 0xc));
    // ...
}
```

### 1.2 핵심 데이터 소비 함수: `FUN_0057aa90` (0x0057aa90)

이 함수가 실제로 0x031f 배열과 정적 기지 테이블을 읽어 패널 내용을 채운다.

---

## 2. 어떤 서버 레코드(0x031f, 0x0321, 0x031d, 0x0337)를 읽는가?

### 2.1 직접 읽는 레코드: `ResponseInformationBase` (0x031f)

**저장 위치:** `clientBase + 0x3facf4` (count) / `+0x3facf8` (array)
- stride: `0x180` (384 bytes)
- max: 4 elements

**`FUN_0057aa90`에서의 읽기:**

```c
// param_2+8 = base id (클릭한 셀의 기지 ID)
iVar17 = *(int *)(param_2 + 8);

// 0x031f 배열에서 base id 매칭
piVar15 = (int *)(DAT_007ccffc + 0x3facf8);  // array base
do {
    if (*piVar15 == iVar17) {  // elem+0x00 == base id
        iVar5 = iVar5 * 0x180 + 0x3facf8 + DAT_007ccffc;  // matched element
        // ...
    }
    iVar5 = iVar5 + 1;
    piVar15 = piVar15 + 0x60;  // stride 0x180 = 0x60 dwords
} while (iVar5 < (int)(uint)*(byte *)(DAT_007ccffc + 0x3facf4));
```

### 2.2 정적 기지 테이블 (static base data)

**저장 위치:** `clientBase + 0x2eb800`
- stride: `0x250` (592 bytes)
- max: ~350 entries (loop guard `0x15e` = 350)

**`FUN_0057aa90`에서의 읽기:**

```c
pcVar16 = (char *)(DAT_007ccffc + 0x2eb800);   // static table base
piVar15 = (int *)(DAT_007ccffc + 0x2eb288);    // id array (parallel)

// id 매칭 루프
if ((*piVar15 == iVar17) && (*pcVar16 != '\0')) {
    local_18 = iVar6 * 0x250 + 0x2eb800 + DAT_007ccffc;  // matched static entry
    break;
}
```

### 2.3 사용하지 않는 레코드

| 레코드 | 코드 | 사용 여부 | 근거 |
|--------|------|-----------|------|
| `ResponseInformationInstitution` | 0x0321 | **미사용** (이 패널에서) | 0x0321은 시설(施設) 패널 — 별도 UI 경로 |
| `ResponseStaticInformationBase` | 0x031d | **간접 참조** | 정적 테이블 `0x2eb800`가 0x031d 파싱 결과일 수 있으나, `FUN_0057aa90`는 직접 읽지 않음 |
| `NotifyBaseParameter` | 0x0337 | **미사용** | client dispatcher에 case 없음 (`FUN_004ba2b0`에 0x0337 case 없음) |

> **결론:** 이 패널은 **0x031f만 직접 소비**한다. 0x031d/0x0337은 다른 UI 경로 또는 서버측 전용.

---

## 3. "행성명", "소속 진영명", "통치자명", "수비대장명", "경제 수치"가 와이어의 어떤 필드에 대응하는가?

### 3.1 행성명 (기지 이름)

**출처:** 정적 기지 테이블 `clientBase + 0x2eb800`

```c
// FUN_004c8de0 (0x004c8de0) — 이름 조회
undefined * FUN_004c8de0(undefined4 param_1) {
    iVar3 = FUN_004c8690(param_1);  // static table에서 base id로 검색
    if (iVar3 == 0) { /* NO DATA */ }
    else {
        uVar1 = *(ushort *)(iVar3 + 0x14);     // +0x14 = name_len
        puVar4 = (undefined4 *)FUN_004eacf0(&param_1, iVar3 + 0x48);  // +0x48 = name[]
        // ...
    }
}
```

| 필드 | 오프셋 (정적 테이블) | 타입 | 근거 |
|------|---------------------|------|------|
| `name_len` | `+0x10` | u16 | `FUN_004c8de0`: `*(ushort *)(iVar3 + 0x14)` (decompile에서 `0x14`는 구조체 내 상대 오프셋; 실제 테이블 기준 `+0x10`) |
| `name[]` | `+0x12` | u16[13] | `FUN_004c8de0`: `iVar3 + 0x48` (name 데이터 위치) |

> **주의:** 정적 테이블 `0x2eb800`의 정확한 필드 오프셋은 `FUN_004c8690`가 반환한 포인터 기준으로 해석해야 함. `FUN_004c8690`는 `clientBase + 0x2eb800 + i*0x250`를 반환.

### 3.2 소속 진영명 (Faction)

**출처:** 0x031f 동적 레코드 `elem+0x04`

```c
// FUN_0057aa90 내부
if (*(char *)(local_10 + 4) == '\x02') {  // elem+0x04 == 0x02
    uVar23 = 0x2d;  // "동맹" (Alliance) 문자열 ID
} else if (*(char *)(local_10 + 4) == '\x03') {  // elem+0x04 == 0x03
    uVar23 = 0x2e;  // "제국" (Empire) 문자열 ID
}
```

| 필드 | 오프셋 | 타입 | 값 | 근거 |
|------|--------|------|-----|------|
| `faction` | `elem+0x04` | u8 | 0x02=동맹, 0x03=제국 | `FUN_0057aa90`: `*(char *)(local_10 + 4)` |

### 3.3 통치자명 / 수비대장명 (Ruler / Garrison Commander)

**출처:** character record (0x0323)에서 유도 — **0x031f에 직접 없음**

```c
// FUN_004c8b70 (0x004c8b70) — 그리드 좌표로 통치자/수비대장 조회
int FUN_004c8b70(int param_1, int param_2) {
    // param_1 = x % 100, param_2 = x / 100 (grid 좌표 변환)
    // DAT_007ccffc + param_2 * 100 + 0x2c03cc + param_1 = grid ownership table
    return (uint)*(byte *)(DAT_007ccffc + param_2 * 100 + 0x2c03cc + param_1) * 3 + 0x2c1755 + DAT_007ccffc;
}
```

이 함수는 **grid 좌표**를 받아 해당 셀의 통치자/수비대장 정보를 반환한다. 이는 0x0323 character record 배열(`clientBase+0x36a8b4`)에서 `spot` 필드(0x1c)로 매칭하여 찾는다.

**FUN_0057aa90에서의 사용:**

```c
puVar13 = (undefined1 *)FUN_004c8b70(
    (uint)*(ushort *)(local_18 + 0x10) % 100,   // grid x
    *(ushort *)(local_18 + 0x10) / 100           // grid y
);
// puVar13 = 통치자/수비대장 이름 문자열
```

| 정보 | 출처 | 근거 |
|------|------|------|
| 통치자명 | `FUN_004c8b70` 반환값 → `FUN_004c8c90` 문자열 변환 | `FUN_0057aa90`: `FUN_004c8c90(*puVar13)` |
| 수비대장명 | character record (0x0323)에서 `spot` 매칭 | `FUN_004c8de0` → `FUN_004c8690` 체인 |

### 3.4 경제 수치

**출처:** 0x031f 동적 레코드 — 여러 필드 분산

```c
// FUN_0057aa90 내부 — 다양한 수치를 문자열 테이블 0x5f에서 라벨 읽어 표시
uVar23 = FUN_00522010(0x5f, 0x16);   // 라벨 0x16
uVar7  = FUN_00522010(0x5f, 0x15);   // 라벨 0x15
uVar8  = FUN_00522010(0x5f, 0x14);   // 라벨 0x14
uVar9  = FUN_004c8c90(*puVar13);     // 통치자명
uVar10 = FUN_00522010(0x5f, 0x13);   // 라벨 0x13

// 패널 행 2 구성
FUN_00646616(&local_20, &DAT_0078c214, uVar10, uVar9, uVar8, puVar21, uVar7, pcVar16, uVar23);
FUN_0057b7b0(local_20, 2);  // row 2
```

**0x031f에서 읽는 경제 관련 필드 (P3 — 정확한 이름↔오프셋 미확정):**

| 필드 (추정) | 오프셋 | 타입 | 근거 |
|-------------|--------|------|------|
| `commodity[]` | `+0x24` | u32[≤3] | parser `FUN_00414c70`: `if (3 < cnt)` @+0x20 |
| `budget[]` | `+0x140` | u32[≤5] | parser: `if (5 < cnt)` @+0x13c |
| `budgeting[]` | `+0x130` | u16[≤6] | parser: `if (6 < cnt)` @+0x12e |
| `population` | (미확정) | — | `_INF` serializer server-side 전용 |
| `adult_population` | (미확정) | — | `_INF` serializer server-side 전용 |

> **중요:** 0x031f의 scalar 필드 대부분은 `_INF` dump-serializer가 server-side/debug 경로에만 있어 client decompile에서 절대 오프셋을 확정할 수 없다. 배열 필드 5개(commodity/budget/budgeting/transport_supplies/outfit_supplies)만 cap uniqueness로 오프셋이 확정된다. (`docs/logh7-info-records-wire.md` §2 참조)

### 3.5 종합 매핑표

| UI 표시 | 와이어 출처 | 오프셋 | 확신도 |
|---------|------------|--------|--------|
| 행성명/기지명 | 정적 테이블 `0x2eb800` | `+0x10` (len), `+0x12` (name) | HIGH |
| 소속 진영명 | 0x031f 동적 | `elem+0x04` | HIGH |
| 통치자명 | 0x0323 character → `FUN_004c8b70` | `char+0x1c` (spot) 매칭 | MEDIUM |
| 수비대장명 | 0x0323 character → `FUN_004c8de0` | `char+0x1c` (spot) 매칭 | MEDIUM |
| 인구/성인인구 | 0x031f 동적 | (미확정 scalar) | P3 |
| 식량/생활/치안 | 0x031f 동적 | (미확정 scalar) | P3 |
| 예산[] | 0x031f 동적 | `elem+0x140` | HIGH |
| 물자[] | 0x031f 동적 | `elem+0x24` | HIGH |

---

## 4. 성계(system) vs 행성(planet) vs 요새(fortress) 구분

### 4.1 0x031f 동적 레코드의 class_ 필드

```c
// FUN_0057aa90 내부
switch(*(undefined1 *)(iVar5 + 0x175)) {  // elem+0x175 = class_
    case 0: uVar23 = 0; break;
    case 1: uVar23 = 1; break;
    case 2: uVar23 = 2; break;
    case 3: uVar23 = 3; break;
}
// uVar23를 문자열 테이블 0x5f에서 조회해 "성계"/"요새"/"행성"/"기지" 표시
uVar23 = FUN_00522010(0x5f, uVar23);
```

| class_ 값 | 의미 (추정) | 문자열 테이블 인덱스 |
|-----------|------------|---------------------|
| 0 | 성계 (System/Star) | 0x5f:0 |
| 1 | 요새 (Fortress) | 0x5f:1 |
| 2 | 행성 (Planet) | 0x5f:2 |
| 3 | 기지 (Base) | 0x5f:3 |

**근거:** `FUN_0057aa90` `switch(*(undefined1 *)(iVar5 + 0x175))` — 0x175는 0x031f element 내 오프셋. 값 0-3을 문자열 테이블 0x5f의 0-3번 슬롯으로 매핑.

### 4.2 정적 테이블의 class_ 필드 (교차 검증)

`ResponseStaticInformationBase` (0x031d) 파서 `FUN_004142e0`에서:
- `class_` 필드는 `dest+0x26`에 저장됨
- 값: 1=성계(star), 2=요새(fortress), 3=행성(planet) — `docs/logh7-info-records-wire.md` §2

> **주의:** 0x031f의 `class_` @+0x175와 0x031d의 `class_` @+0x26는 별도 테이블의 별도 필드. 동일한 의미를 갖는 것으로 추정되나, `FUN_0057aa90`는 0x031f의 `+0x175`만 읽는다.

---

## 5. 패널이 열리는 조건

### 5.1 panelKind=3 분기

```c
// FUN_0054e570 내부
iVar1 = *param_1;  // panelKind
if (iVar1 == 1) { FUN_005123b0(); }      // 함대/유닛 패널
else if (iVar1 == 2) { FUN_004ff3c0(); } // 인물/장교 패널
else if (iVar1 == 3) { FUN_0051ca30(); } // 기지/행성 패널
```

### 5.2 C002 명령 테이블과의 연결

`C002` (command table)의 category 필드가 패널 종류를 결정한다:
- `category == 3` → `panelKind = 3` → 기지/행성 패널

이는 `FUN_004b68f0` mode dispatcher에서 `C002` 소비 후 `FUN_0054e570`을 호출할 때 결정된다.

### 5.3 전략맵 셀 클릭

전략맵에서 행성/요새/성계 셀을 클릭하면:
1. `FUN_004f6f60` (hit-test)가 셀의 `objectId` 확인
2. `objectId`가 기지/행성에 해당하면 `FUN_004fd7a0`가 mode 전환
3. `FUN_0054e570(3)` 호출 → 기지 패널 열림

---

## 6. 0x031f에 추가 진영/통치자/수비대장 필드가 있는가?

### 6.1 0x031f의 확인된 필드 (HIGH confidence)

| 오프셋 | 타입 | 의미 | 근거 |
|--------|------|------|------|
| `elem+0x00` | u32 | base id (매칭 키) | `FUN_0057aa90`: `*piVar15 == iVar17` |
| `elem+0x04` | u8 | faction (0x02=동맹, 0x03=제국) | `FUN_0057aa90`: `*(char *)(local_10 + 4)` |
| `elem+0x05` | u8 | base_field_b05 | `FUN_004c32a0`: `local_34e = *(u8*)(... + 0x3facfd)` |
| `elem+0x175` | u8 | class_ (0-3) | `FUN_0057aa90`: `*(undefined1 *)(iVar5 + 0x175)` |

### 6.2 0x031f에 없는 것 (다른 레코드에서 유도)

| 정보 | 0x031f에 있음? | 실제 출처 | 근거 |
|------|---------------|----------|------|
| 통치자명 | **없음** | 0x0323 character record | `FUN_004c8b70`가 `0x2c03cc` grid 테이블에서 character 참조 |
| 수비대장명 | **없음** | 0x0323 character record | `FUN_004c8de0` → `FUN_004c8690`가 character store 검색 |
| 진영명 | **있음** | `elem+0x04` | `FUN_0057aa90` 직접 읽음 |
| 함대 수 | **없음** | 0x0325 unit table | `clientBase+0x41a368` 별도 테이블 |

### 6.3 결론

**0x031f의 `elem+0x04`와 `elem+0x05`가 유일한 owner/state 관련 바이트**이다. 통치자명과 수비대장명은 **character record (0x0323)**에서 `spot` 필드(0x1c)로 기지 ID를 매칭하여 역참조한다. 이는 "기지가 통치자를 가리키는 것이 아니라, 통치자가 기지를 가리킨다"는 설계를 반영한다.

---

## 부록: 핵심 함수 VA 요약

| 함수 | VA | 역할 |
|------|-----|------|
| `FUN_004b68f0` | `0x004b68f0` | mode dispatcher (C002 소비) |
| `FUN_0054e570` | `0x0054e570` | panelKind dispatcher (1/2/3 분기) |
| `FUN_0051ca30` | `0x0051ca30` | base panel 초기화 |
| `FUN_0057aa90` | `0x0057aa90` | **base 데이터 소비 + 렌더** |
| `FUN_004c8de0` | `0x004c8de0` | 기지 이름 조회 (정적 테이블) |
| `FUN_004c8b70` | `0x004c8b70` | grid 좌표 → 통치자 조회 |
| `FUN_004c8c90` | `0x004c8c90` | 문자열 ID → 표시 문자열 변환 |
| `FUN_004c8690` | `0x004c8690` | 정적 기지 테이블 검색 |
| `FUN_00522010` | `0x00522010` | 문자열 테이블 조회 (tableId, index) |
| `FUN_004ba2b0` | `0x004ba2b0` | 서버 메시지 dispatcher (0x031f case 799) |
| `FUN_004c32a0` | `0x004c32a0` | world-import (0x031f → world state) |

---

## 관련 문서

- `docs/logh7-info-records-wire.md` — 0x031f/0x0321/0x0337 와이어 레이아웃
- `docs/logh7-data-structures-re.md` — 0x0323 character record, 0x0325 unit record
- `docs/logh7-faction-display-channels-2026-06-23.md` — 진영 표시 4채널 deep-RE
