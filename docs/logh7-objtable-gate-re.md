# objTable 게이트 정적 RE — FUN_004c2a80 / FUN_004c2c80

**대상:** `g7mtclient.exe` (ImageBase 0x400000, ASLR off, md5 34be49cb…)
**분석 소스:** Ghidra 12.1.2 headless 디컴파일 (`scratchpad/ghidra-out/g7mtclient-sjis.exe_decompiled.c`)
**목적:** 월드 진입 후 NOW LOADING→전략맵 전환 불가. objTable(clientBase+0xc)이 안 채워지는 내부 게이트를 정적으로 특정.

---

## 결론 (첫 줄)

**objTable 게이트 근본원인 = 서버가 0x0204(self-id)를 little-endian 으로, 0x0323 record[0](char id)를 big-endian 으로 보내 두 값이 어긋난다 → FUN_004c2a80 의 self-match(`record[0] == clientBase+0x3584a0`)가 실패 → 자기 캐릭터를 objTable slot 0 에 쓰는 mode-0 경로가 호출되지 않는다.** (라이브 mode=2 관측과 정확히 일치.)

부차적으로, 같은 커밋(task #53 "0x0323 packed BIG-ENDIAN")이 정렬 pad 를 제거해 flagship 앵커를 0x24→0x20 으로 밀었다 — 이것도 클라 실제 읽기(0x24)와 어긋난다. 두 결함 모두 **0x0323/0x0325 를 struct-aligned LITTLE-ENDIAN 으로 되돌리면** 동시에 해소된다.

---

## 1. objTable 빌드 경로 (증거)

### FUN_004c2a80 @ 0x004c2a80 (self-char objTable 빌더 게이트)
`in_ECX` = clientBase = `DAT_007ccffc`. `param_1` = refresh 플래그(0=full clear, 1=incremental; 라이브 arg0=1).

```c
// 45081: char 레코드 배열 순회. 카운트 = clientBase+0x36a5dc, 배열 = clientBase+0x36a8b4, stride 0x2d4
if (0 < *(int *)(in_ECX + 0x36a5dc)) {
  piVar5 = (int *)(in_ECX + 0x36a8b4);
  do {
    // 45087: ★self-match 게이트 — 레코드[0](char id) == clientBase+0x3584a0(self-id)?
    if (*piVar5 == *(int *)(in_ECX + 0x3584a0)) {
      // 45090: flagship 링크 서브게이트
      if (*(ushort *)(&DAT_0041a364 + in_ECX) != 0) {          // unit count>0
        piVar4 = (int *)(&DAT_0041a368 + in_ECX);              // unit 배열, stride 0x58
        do {
          if (piVar5[9] == *piVar4) {                          // 45093: char[0x24]==unit[+0x00]?
            FUN_004c2c80(0, piVar5);                           // 45094: ★mode-0 → objTable slot0 기록
            ...
          }
          piVar4 = piVar4 + 0x16;                              // +0x58
        } while (...);
      }
      FUN_005923a0(&DAT_00770f9c);                             // 링크 실패 로그
    }
    else {
      FUN_004c2c80(2, piVar5);                                 // 45105: ★mode-2 → 타 캐릭 slot(1..599)
      ...
    }
    piVar5 = piVar5 + 0xb5;                                    // +0x2d4
  } while (...);
}
```

- **piVar5[9] = 레코드 int 인덱스 9 = byte offset 0x24** → char 레코드의 flagship 앵커.
- self-match 성공 시에만 mode-0(objTable slot 0)로 진입. 실패 시 mode-2(slot 1..599).

### FUN_004c2c80 @ 0x004c2c80 (슬롯 writer, param_1 = mode)
```c
if (param_1 == 0)  local_378 = in_ECX + 0xc;        // 45189: mode0 = objTable SLOT 0 (self 전용)
else if (param_1 == 1) local_378 = in_ECX + 0x80e8c;// 45223: mode1 = 별도 self-player 영역(≠objTable)
else if (param_1 == 2) {                             // 45191~: mode2 = objTable slot 검색
  iVar9 = 1; pcVar12 = in_ECX + 0x37c;              // ★슬롯 인덱스 1부터 (0xc + 1*0x370). slot0 절대 안 씀
  // pass0: 기존 id 일치 슬롯 갱신 / pass1: 첫 빈 슬롯 할당
}
```
→ **objTable slot 0(clientBase+0xc)은 오직 mode-0 만 기록.** mode-1 은 다른 영역(0x80e8c), mode-2 는 slot 1 이상만.

### FUN_004c7290 @ 0x004c7290 (focusId 해석 = 렌더 게이트 다운스트림)
```c
iVar4=0;
do {
  pcVar1 = DAT_007ccffc + 0xc + iVar4;   // objTable slot 순회 (stride 0x370, 최대 0x80e80≈600)
  if (*pcVar1 != '\0') {                 // 슬롯 채워짐?
    if (FUN_004b5b80() == param_1) return pcVar1 + 0xa4;  // slot+0x24==charId 매칭
  }
  iVar4 += 0x370;
} while (iVar4 < 0x80e80);
return 0;                                // ★objTable 비어있으면 null → 렌더의 [0x80] null-page read
```
→ objTable 이 비면 FUN_004c7290 이 null 반환 → 브리프의 "[0x80] null-page read" 경로. mode-0 미호출의 직접 귀결.

### 라이브 modes[1,1,1,1,2] 해석 (재확인)
- mode-1 ×2 = 메시지 핸들러가 직접 발화: 0x0323(count==1, 38671) + 0x0325(count==1, 38690).
- mode-2 ×1 = FUN_004c2a80 의 **else 분기** — 유일한 char 레코드가 self-match 실패.
- **mode-0 = 0회** = self-match 가 단 한 번도 성공 못 함 = objTable slot 0 영원히 빈 상태. ✔ 관측과 정합.

---

## 2. self-id(0x3584a0) 를 쓰는 유일한 메시지 = 0x0204

grep 결과 `clientBase+0x3584a0` writer 는 **단 하나**:
```c
// 38156, case 0x204 "SSCharacterIDResponce":
case 0x204:
  *(undefined4 *)(in_ECX + 0x3584a0) = *param_2;   // self-id = 0x0204 payload[0] (native LE load)
```
(reader: 33366, 41064, 41073, 193301 / init-zero: 34968). → **0x0204 가 안 오거나 값이 틀리면 self-id 는 0 인 채로 남고 self-match 는 무조건 실패.**

char 레코드[0] 을 쓰는 곳 = 0x0323 핸들러:
```c
// 38432 → 38592: record[0] = param_2[0] (native LE load)
local_310 = *param_2;  ...  *puVar17 = local_310;   // puVar17 = clientBase+0x36a8b4 + count*0x2d4
```

**두 값 모두 클라는 native little-endian 으로 로드**(디스패처 41064 인근 전부 native load, 수신 경로 byteswap 없음 — 확인함). 따라서 self-match 가 성립하려면 서버가 **0x0204 의 characterId 와 0x0323 record[0] 을 같은 바이트오더로** 보내야 한다.

### 서버 실측 (불일치 확정)
| 메시지 | 필드 | 서버 인코딩 | 파일:라인 |
|---|---|---|---|
| 0x0204 | characterId | `writeUInt32**LE**` | `logh7-world-records.mjs:179` |
| 0x0323 | record[0] id | `writeUInt32**BE**` | `logh7-world-records.mjs:242` |

characterId=N 일 때 → self-id(0x3584a0)=N, record[0]=byteswap(N). N≠byteswap(N)(N≠0,대칭값 제외) → **self-match 영구 실패.** ★근본원인 확정.

---

## 3. 클라 정본 0x0323 레이아웃 = struct-aligned LITTLE-ENDIAN (flagship @ 0x24)

0x0323 핸들러(38432~38477)의 모든 필드 읽기를 wire offset 으로 매핑한 결과, 클라는 **정렬 pad 가 있는** 레이아웃을 읽는다 (packed 아님):

| wire off | 폭 | 클라 읽기 | 서버 의미(추정) |
|---|---|---|---|
| 0x00 | u32 LE | `*param_2` | **id (char id) ★self-match 앵커** |
| 0x04 | u16 LE | `*(u16*)(param_2+1)` | power/state 계열 |
| 0x06 / 0x07 | u8 / u8 | +6 / +7 | |
| 0x08 | u32 LE | `param_2[2]` | begin_session_age |
| 0x0c / 0x0d | u8 / u8 | +0xc / +0xd | bday |
| **0x0e–0x0f** | **PAD 2B** | (안 읽음) | ★정렬 패딩 |
| 0x10 | u32 LE | `param_2[4]` | fame |
| 0x14 | u16 LE | `*(u16*)(param_2+5)` | max_of_special |
| **0x16–0x17** | **PAD 2B** | (안 읽음) | ★정렬 패딩 |
| 0x18 | u32 LE | `param_2[6]` | return_base |
| 0x1c | u32 LE | `param_2[7]` | spot |
| 0x20 | u32 LE | `param_2[8]` | spot_owner |
| **0x24** | **u32 LE** | `param_2[9]` (=record[9]) | **flagship ★char↔unit 링크 앵커** |
| 0x28 | u8 | `*(u8*)(param_2+10)` | **flagship_name_len** |
| 0x29 | u8 | (pad) | |
| 0x2a | u16[13] LE | 복사 루프 38448 | flagship_name (UTF-16 LE) |

- 이 표는 브리프의 라이브 관측("flagship @ struct+0x24 = 1", "name_len 자리 struct+0x28 = 0")과 **정확히 일치** → 라이브 캡처는 aligned-LE 상태(=정본)였다.
- task #53 이 pad(0x0e·0x16) 를 제거(packed) → flagship 이 0x24→0x20 으로 밀림 → 클라 앵커(0x24)와 어긋남. 동시에 BE 전환으로 record[0] 바이트오더도 뒤집힘.

### 링크 unit offset 확정 (deliverable #3)
0x0325 핸들러(38677): payload 를 `clientBase+0x41a364` 부터 dword 복사. count(u16) @ 0x41a364, unit 배열 @ 0x41a368.
- payload dword[0] → 0x41a364 (count u16 + 2B). payload dword[1] → 0x41a368 = **unit[0]+0x00**.
- FUN_004c2a80 링크는 `piVar5[9]==*piVar4` = char[0x24] vs **unit[0]+0x00**.
- **∴ 클라가 링크로 읽는 값 = unit 레코드 내부 +0x00 = wire 0x0325 payload byte +0x04** (count+pad 4B 헤더 뒤). 라이브 프로브가 +0x04 에서 1 을 읽은 것이 정답, +0x00 아티팩트 아님.

---

## 4. 서버 수정 지시 (구체 필드/값)

### ★필수 (primary, 확신도 高) — self-match 통과
`server/src/server/logh7-world-records.mjs`:
1. **0x0323 `buildInformationCharacterInner`: 전 멀티바이트를 `writeUInt32BE`→`writeUInt32LE`, `writeUInt16BE`→`writeUInt16LE` 로 되돌린다.** 특히 offset 0x00 id 는 반드시 LE (0x0204 와 동일 바이트오더 → self-match 성립).
2. **정렬 pad 복원(packed 되돌리기): flagship 을 0x20→0x24 로, flagship_name_len 을 0x24→0x28, flagship_name 을 0x26→0x2a 로.** 위 §3 표대로 fame=0x10, max_of_special=0x14(u16), return_base=0x18, spot=0x1c, spot_owner=0x20 배치. (begin_session_age=0x08 은 동일.)
3. **flagship_name 을 UTF-16 LE 로**(`writeUInt16LE`), name_len 은 0x28 에.

### ★동반 (0x0325 도 LE) — flagship 링크 값 정합
`buildInformationUnitInner`: `writeUInt16BE(count,0)`→`writeUInt16LE`, `writeUInt32BE(unitId, base+0)`→`writeUInt32LE`. unit[0].id(wire +0x04, header 뒤)가 0x0323 flagship(0x24, LE)과 **동일 바이트값**이어야 링크 성립. 둘 다 LE 로 통일.

### 값 정합 체크리스트
- 0x0204.characterId == 0x0323.id(0x00) == 세션 실제 char id (황제 트랩 회피값 그대로, 서로 같기만 하면 됨).
- 0x0323.flagship(0x24) == 0x0325.unit[0].id(wire +0x04) == gridUnitId.
- flagship_name 은 채워도/비워도 self-match·링크와 무관(name_len 게이트 아님 — §3 확인). NOW LOADING 해제엔 불필요.

### 검증 방법
서버 수정 후 라이브 재캡처로 확인할 값:
- `clientBase+0x3584a0`(self-id) == char record[0] (둘 다 같은 정수).
- FUN_004c2a80 실행 후 `clientBase+0xc`(objTable slot0) ≠ 0, slot0+0x24 == char id.
- FUN_004c7290(charId) ≠ null → [0x80] null-page read 스킵 → 전략맵 렌더.

---

## 확정/미확정

**확정:**
- objTable slot 0 은 mode-0(FUN_004c2c80(0)) 전용, self-match(record[0]==0x3584a0) 게이트 뒤에만 호출.
- self-id 는 0x0204 가 유일 writer(38158), record[0] 은 0x0323(38592). 클라 양쪽 native LE 로드, 수신 byteswap 없음.
- 서버 0x0204=LE, 0x0323 record[0]=BE → 불일치가 self-match 를 막는 근본원인.
- 클라 정본 0x0323 = aligned-LE, flagship@0x24 / name_len@0x28 / name@0x2a (라이브와 일치).
- 링크: char[0x24] ↔ unit[0]+0x00(=wire 0x0325 +0x04).

**미확정(정적 한계 — 라이브 재캡처 필요):**
- 0x0323 offset 0x40 이후(strategy/ability/cards) 정본 필드 오프셋 — 게이트와 무관하므로 0 유지 무방.
- 현재 배포 서버가 실제로 packed-BE 인지(코드 근거는 그러함) vs 라이브 캡처가 그 이전인지 — 위 수정 후 재캡처로 최종 확정.
