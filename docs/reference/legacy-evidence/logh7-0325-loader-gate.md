# 0x0325 로더 게이트 — 디스패치/적재 조건 확정 (정본 EXE RE)

정본 EXE: `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 9c97de2a…).
근거: `.omo/ghidra/export/decompiled/g7mtclient.exe_decompiled.c` (전수 디컴파일).
선행 노트: `logh7-0325-unit-loader-wire.md` (count 엔디안 = LE, 이미 서버 반영됨).

## 결론 (TL;DR) — 적재 게이트에서 막힌다. 원인 = **0x0b0a NotifyEnterGridEnd 미송신**

디스패치는 문제 아님(0x0325 프레임 길이 0xce44 = 서버 출력 일치). 문제는 **적재 트리거**다.
클라의 렌더 레지스트리를 벌크로 채우는 **유일한 실행 경로는 FUN_004c2a80**이고, 이 함수는
오직 **메시지 0x0b0a(NotifyEnterGridEnd) 수신 시**(dispatcher case 0xb0a)에만 호출된다.

**라이브 서버는 0x0b09/0x0b0a 를 절대 보내지 않는다.** 실 그리드-init 경로
(`logh7-world-session.mjs:430`)가 쓰는 `buildGridInitializeSpawnInners` 는
`[0x0204, 0x0325, 0x0323, 0x0313, 0x0315, 0x0f03]` 만 방출한다 — 0x0b0a 없음.
0x0b0a 를 올바르게 넣는 `buildWorldReadyPushInners` 는 **테스트에서만 호출**되고
실 파이프라인에 배선돼 있지 않다.

결과: 0x0325 는 스테이징 테이블(DAT_0041a364)을 채우고, 0x0323 은 캐릭터 테이블(0x36a8b4)을
채우지만, 그것들을 렌더 레지스트리로 옮기는 FUN_004c2a80 이 절대 안 돌아 activeCount=0 →
마커클릭 null-deref. "0x325 dispatch not recorded" 도 같은 원인 — 유닛으로 **처리**(FUN_004c2a80
순회)되는 지점이 아예 실행되지 않는다.

### 서버가 고쳐야 할 정확한 지점

`logh7-world-session.mjs` 0x0f02 핸들러(라인 428~452)의 `buildGridInitializeSpawnInners` 출력에
grid-enter 괄호를 추가한다. 필드 값·엔디안·레코드 길이는 전부 이미 정확하다 — **누락된 건 프레임 2개**:

```
0x0204 → 0x0b09(value=0) → 0x0325(fleets) → 0x0323 → 0x0b0a(value=0) → 0x0313 → 0x0315 → 0x0f03
```

즉 이미 존재하는 `buildWorldReadyPushInners`(0x0b09→0x0325+0x0323→0x0b0a→0x0f03) 형태로
스폰 버스트를 재구성하거나, `buildGridInitializeSpawnInners` 에 begin/end 를 삽입한다.
불변식: **0x0325 와 0x0323 은 반드시 0x0b09 와 0x0b0a 사이**에 있어야 하고, 0x0b09 가 0x0323
앞이어야 한다(0x0b09 가 char count 를 리셋 → 0x0323 이 1 로 재충전 → 0x0b0a 가 적재).

## 디스패치 게이트 — 통과 (문제 아님)

| 항목 | 함수/주소 | 조건 | 서버 출력 | 통과 |
|---|---|---|---|---|
| 코드→크기 룩업 | FUN_004b8b00 case 0x325 (L37188) | body = 0xce44 (52804B) | `Buffer.alloc(0xce44)` | ✓ |
| 수신 큐 적재 | FUN_004b8850 | malloc(0xce44) 후 통짜 복사 | — | ✓ |
| 디스패치 | FUN_004ba2b0 case 0x325 (L38678) | 0x3391 dword(52804B) 스테이징 복사 | — | ✓ |
| 스테이징 상한 | L38688 `600 < count` (u16 **LE**) | count=25 LE → 25 | count LE 기록(L353/359) | ✓ 경고 없음 |

0x0323(0x2d4)이 디스패치되면 동일 룩업/큐/디스패치 메커니즘을 쓰는 0x0325(0xce44)도 디스패치된다.
크기만 다를 뿐 경로 동일. 서버 body 가 정확히 0xce44 이므로 프레임 경계 문제 없음.

## 적재 게이트 — FUN_004c2a80 (실제 로더, case 0xb0a 트리거)

FUN_004c2a80(char param_1) @0x4c2a80 (L45036). **0x0325 핸들러가 아니라 0x0b0a 핸들러가 호출.**
캐릭터 테이블(0x36a8b4, 0x0323 이 채움)을 순회하며 각 캐릭터를 렌더 엔티티로 스폰한다.
0x0325 스테이징 테이블은 **자기(self) 캐릭터의 flagship 링크**용으로만 참조된다.

| # | 검사 (디컴파일 라인) | 통과 조건 | 서버 출력 실제값 | 통과 |
|---|---|---|---|---|
| G1 | case 0xb0a 진입 (L39331) | 서버가 **0x0b0a 송신** | **미송신** | ✗ ★블로커 |
| G2 | `0x126711 ∈ {0,2}` (L39336/39347) | 전략맵 상태=0 (world-init reset 이 0 설정) | 0 예상 | ✓ (G1 후 확인) |
| G3 | `0 < *(0x36a5dc)` char count (L45085) | 0x0323 이 0x0b09 리셋 뒤 도착 → count>0 | begin/end 배선 시 1 | 조건부 |
| G4 | `char[0].id(+0x00) == self-id(0x3584a0)` (L45091) | 0x0323 id(+0x00,BE) == 0x0204 id(BE) | 둘 다 characterId BE | ✓ |
| G5 | `count(0x0325) != 0` (L45094, u16 LE) | 스테이징 count≠0 | 25 (LE) | ✓ |
| G6 | `char[+0x24] == unit[i].id(+0x00)` (L45097) | flagship == 0x0325 unit[0].id | 둘 다 unitId BE (fleets[0].id=unitId) | ✓ |

**G1 만 실패한다.** 나머지 필드 게이트(id 엔디안, flagship↔unit 링크, count LE)는 현재 서버
출력으로 전부 성립. 레코드 길이도 정확. 유일한 결함은 트리거 프레임 부재.

### 스테이징 순회 세부 (근거)
- char 레코드 stride = 0xb5 dword = 0x2d4(724B) = 0x0323 크기 (L45118 `piVar5 += 0xb5`).
- 0x0325 record stride = 0x16 dword = 0x58(88B) (L45103 `piVar4 += 0x16`), UNIT_ELEM 과 일치.
- self flagship = char+0x24 (`piVar5[9]`), unit id = record+0x00 (`*piVar4`) — 서버 UNIT_ELEM.ID=0x00 과 일치.
- non-self 캐릭터: `FUN_004c2c80(2, piVar5)` 무조건 스폰 (L45109). 서버는 self 1명만 보내므로
  non-self 로 activeCount 를 채우지 못함 → self 링크(G4~G6)가 유일한 채움 경로.

## FUN_004c2c80 — 렌더 엔티티 빌더 (레지스트리 슬롯 기록)

FUN_004c2c80(param_1 mode, param_2 charRecord, param_3 unitRecord) @0x4c2c80 (L45152).
- param_1: 0=self 슬롯(this+0xc) / 1=this+0x80e8c / 2=일반 슬롯 검색(this+0x37c, stride 0x370, 600슬롯).
- param_2(0x0323 char 레코드)에서 렌더 필드 대량 복사. param_2==0 이면 이 블록 스킵.
- param_3(0x0325 unit 레코드) 존재 시 (L45341): 레코드를 slot+0x318 로 0x16 dword(0x58B) 복사 +
  `FUN_004b5bd0(unit+6)`, `FUN_004b5be0(unit[0x10]=unit+0x40)`. **unit+0x40 = SPOT_RESOLVER_BASE** 소비.
- **case 0x325 count==1 경로**: `FUN_004c2c80(1, 0, records)` — param_2=0 이라 char 블록 스킵,
  unit 레코드만 slot 0x80e8c 에 기록. 서버 count=25≠1 이라 이 경로는 어차피 미발동(정상 — 실적재는 0x0b0a).

주의: 선행 노트의 "@0x7db3c8, stride 0xb4c, 600슬롯" 은 이 함수 기준 **this+0x37c, stride 0x370(880B),
600슬롯**이 실측치(L45213/45221). 0x7db3c8/0xb4c 는 다른(구/오} 수치일 수 있음 — 이 함수 슬롯이 정본.

## +0x14 크래시와의 연결

crash memAddr=0x14. FUN_004c2c80/FUN_004c2a80 은 unit+0x14 를 읽지 않는다(unit+0x40, +6 만 소비).
+0x14 deref 는 별도 소비자(마커/셀 클릭 → 렌더오브젝트 조회 미스)에서 발생하며, 근본은 동일 —
레지스트리가 비어(activeCount=0) 조회가 미로드 슬롯의 +0x14 를 null-deref. 0x0b0a 로 레지스트리를
채우면 해소된다(정적 확정 조건 충족 시).

## 정적 미확정 → 라이브 확인 항목

1. **G2 (0x126711 상태값)**: 전략맵 진입 시 0=strategic 로 가정(world-init reset). 만약 0x0b0a 시점에
   0x126711==1 이면 FUN_004c2a80 미발동 → begin/end 를 넣어도 안 채워진다. 0x0b0a 송신 후에도
   activeCount=0 이면 **0x126711 값을 라이브 계측**(Frida read this+0x126711 at 0xb0a entry)해 0/2 확인.
   1 이면 이 상태를 0 으로 만드는 선행 메시지(world-mode 설정) RE 필요.
2. **G3 순서**: 0x0b09 가 반드시 0x0323 앞. 0x0323 뒤에 0x0b09 가 오면 char count 리셋으로 self 소멸.

## 라이브 차분 브루트포스 (0x0b0a 추가 후에도 activeCount=0 일 때)

이분탐색 대신 게이트별 단일 계측 — 각 게이트가 이미 함수 내 명확한 분기라 변주 불필요:
1. Frida: FUN_004c2a80 진입 hook → 호출되는가? (G1 검증: 0x0b0a 배선 성공 여부)
2. 진입한다면 this+0x126711 값 읽기 (G2).
3. this+0x36a5dc(char count) 읽기 (G3: 0 이면 0x0323 이 begin 뒤로 밀렸거나 미도착).
4. DAT_0041a364(=this+? 스테이징 count, u16 LE) 읽기 (G5).
5. char[0]+0x00 vs this+0x3584a0, char[0]+0x24 vs 스테이징 record[0]+0x00 비교 (G4/G6).
   불일치 시 해당 필드 엔디안/값을 서버에서 조정. (현 정적분석 예측: 전부 일치.)
