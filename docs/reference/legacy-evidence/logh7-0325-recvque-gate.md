# 0x0325 RecvQue 적재/드레인 게이트 — 정적 RE (정본 EXE 실바이트)

정본 EXE: `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 9c97de2a…). ImageBase 0x400000.
검증 방식: Ghidra 디컴파일(`.omo/ghidra/export/decompiled/…`) + **정본 EXE 실바이트 capstone 디스어셈블**(-sjis 디컴파일이 아닌 라이브 구동 EXE 그 바이트). 아래 모든 오프셋·상수는 실바이트 확인.
목적(방어적): 2008 종료 MMO "은하영웅전설 VII" 합법 보존 복원 — 자체 서버 0x0325 유닛 레코드(52804B)를 원본 클라 수신 큐가 적재·드레인하게 한다.
관련: `logh7-0325-dispatch-skip.md`(wire-engineer, 상류 코덱/프레이밍 무혐의 증명). 본 문서는 **큐 함수 자체**(FUN_004b8850/8950)를 실바이트로 독립 재확인.

## TL;DR — 큐 경로에 대용량 거부 조건은 존재하지 않는다

- **FUN_004b8850(적재)·FUN_004b8950(드레인) 어디에도 사이즈 임계 비교(cmp size,상수)가 없다.** 실바이트 디스어셈블 전수 확인. 두 함수의 모든 분기는 슬롯 점유·스케줄시각·500슬롯 카운트뿐, 메시지 길이를 상수와 비교하는 게이트가 0개.
- **크기 룩업 FUN_004b8b00은 0x0325를 명시적으로 화이트리스트**한다: case 0x325 → size=**0xce44(52804)**, schedule=0, 반환=1(성공). 실바이트 @0x4b8d3a. 0xce44 상수는 .text 전체에서 **유일 1회 출현**(@0x4b8d3c) — 이 EXE는 opcode 0x0325에 대해 정확히 52804B 수신을 **설계상 예약**해 뒀다.
- **슬롯당 고정 버퍼 없음**: 적재는 `malloc(size)` 로 메시지마다 동적 할당(52804B면 malloc(52804)). 고정 크기 슬롯 버퍼에 안 들어가서 거부되는 메커니즘이 원천적으로 없다.
- **0x0323(성공) vs 0x0325(스킵) 차이 = 오직 size 상수(0x2d4 vs 0xce44).** 두 case의 코드 구조·반환값·schedule은 바이트 동일(`mov [esi],size; mov [edi],0; mov al,1; ret 0x10`). 크기 하나로 갈리는 임계는 **없다**.
- **거부되는 유일 실조건**: (a) FUN_004b8b00이 0 반환(=미등록 opcode) — 0x0325는 해당 없음(1 반환). (b) 500슬롯 전부 점유 — 월드진입 시 ~12메시지라 해당 없음. (c) malloc 실패 — 52KB, 32비트 힙에서 사실상 불가.
- **결론: 큐 적재/드레인은 0x0325를 거부하지 않는다. 0x0325가 디스패처에 안 뜨는 원인은 적재가 애초에 호출되지 않는 것(상류 코덱/디프레임에서 소실)이거나 라이브 타이밍/상태 의존이다. 큐 함수는 무혐의.** exe-patch로 완화할 하드리밋이 큐 경로에는 없다.

## §1. FUN_004b8850 (RecvQue 적재) — 실바이트 전 분기

thiscall, ecx=RecvQue 객체 base. 인자: param_1=code(u16), param_2=복호 메시지 버퍼 포인터.
슬롯 struct = **0x14(20B) = 5 dword**, 500슬롯. 슬롯 필드(base+슬롯*0x14 기준):

| 슬롯 필드 오프셋 | 내용 | 적재 시 기록 |
|---|---|---|
| +0x3552b8 | schedule(=드레인 대기시각, 0이면 즉시) | `[esp+0x10]` = FUN_004b8b00의 param_3 반환(0x0325는 0) |
| +0x3552bc | code (u16) | `[esp+0x14]` = param_1 |
| +0x3552c4 | size | `[esp+0x1c]` = FUN_004b8b00의 param_4 반환(0x0325는 0xce44) |
| +0x3552c8 | buffer ptr | `malloc(size)` 결과 |

실바이트 흐름(@0x4b8850):
```
lea  edi,[ebp+0x3552c8]      ; 슬롯[0].bufptr
loop:
  cmp  dword [edi],0          ; ← ① 슬롯 비었나?  (유일한 슬롯 게이트)
  jne  next
  call 0x4b8b00               ; 크기 룩업 → [esp+0x1c]=size, [esp+0x10]=schedule
  test al,al                  ; ← ② 룩업 성공?  (미등록 opcode면 0 → 이 슬롯 스킵)
  je   log_unknown
  push [esp+0x1c]             ; size
  call 0x5ffab7               ; = malloc
  test eax,eax               ; ← ③ malloc 성공?
  mov  [edi],eax
  je   log_oom
  ; --- 복사: rep movsd/movsb 로 정확히 size 바이트 복사 ---
  mov  ecx,[esp+0x1c]; shr ecx,2; rep movsd
  mov  ecx,[esp+0x1c]; and ecx,3; rep movsb
  mov  [eax+0x3552c4],size ; [eax+0x3552b8],schedule ; [eax+0x3552bc],code
  mov  al,1 ; ret 8          ; ← 성공
next:
  inc  ebx; add edi,0x14
  cmp  ebx,0x1f4             ; ← ④ 500슬롯?
  jl   loop
  <log "queue full"> ; xor al,al ; ret 8   ; ← 큐 만원 = 거부(0 반환)
```

**게이트 전수: ①슬롯 빔 ②룩업성공 ③malloc성공 ④500슬롯. size를 상수와 비교하는 분기 0개.** 복사는 `rep movsd/movsb`로 룩업 테이블 size(0x0325=52804)를 **고정 복사** — 즉 실제 메시지가 짧아도 항상 52804B를 읽어간다(복호 출력버퍼 61454B라 오버리드 안전, dispatch-skip.md §4). 0x0325 적재 성공 요건: (룩업 1 반환 ✓) + (malloc(52804) 성공, 사실상 항상) + (빈 슬롯 존재, ~12메시지라 항상). **거부 불가.**

## §2. FUN_004b8950 (큐 드레인) — 실바이트 전 분기

thiscall, ecx=base. 인자 없음. 500슬롯을 스캔해 **드레인 가능한 최소-schedule 슬롯 1개**를 골라 디스패처로 넘기고 큐를 압축(compact). 호출당 1메시지.

실바이트 스캔 루프(@0x4b8975):
```
edi = base+0x3552b8  ; 슬롯[0].schedule
scan:
  mov  eax,[edi+0x10]         ; 슬롯.bufptr (+0x3552c8)
  test eax,eax ; je skip      ; ← ① 슬롯 점유?  (빈 슬롯 건너뜀)
  cmp  dword [edi],0          ; ← ② schedule==0 ? → 즉시 준비
  je   ready
  call 0x4c53b0               ; = 현재 tick
  cmp  [edi],eax ; ja notyet  ; ← ③ schedule<=tick ? → 준비 (미래면 대기)
ready:
  inc  [base+0x3552b4]        ; QueExecCount++
  cmp  eax,ebp ; jae notyet   ; ← ④ 최소-schedule 선택(ebp=현 최소)
  ...  esi=slotidx; ebp=schedule
notyet/skip:
  inc idx; add edi,0x14; cmp idx,0x1f4; jl scan   ; ← ⑤ 500슬롯
  ...
  test esi,esi ; jl done      ; 고른 슬롯 없으면 종료
  ; (타이밍 로그: cmp ecx,-0x30; 지연 24.0 나눗셈 — 게이트 아님, 순수 로그)
  mov  ax,[ebp_slot+0x3552bc] ; code
  mov  edx,[base+slot.bufptr] ; buffer
  call 0x4ba2b0               ; ← 디스패처 호출 (case 0x325 여기 도달해야 함)
  ; 슬롯 clear + 뒤 슬롯 5-dword 씩 앞으로 rep movsd (압축)
```

**게이트 전수: ①슬롯 점유 ②③schedule 준비(0 또는 tick 경과) ④최소선택 ⑤500슬롯. size 비교 분기 0개.** 0x0325는 적재 시 schedule=0으로 저장 → ②에서 즉시 ready → 디스패처(FUN_004ba2b0) 호출됨. 드레인은 대용량을 스킵/거부하지 않는다.

`cmp ecx,-0x30`(@0x4b8a2e)은 `(schedule - tick) < -48` 일 때 "얼마나 늦었나"를 24.0으로 나눠 로그(@0x66e324 float 상수)하는 **진단 출력**이지 드레인 차단이 아니다(로그 후 그대로 디스패치 진행).

## §3. FUN_004b8b00 크기 룩업 — 0x0323 vs 0x0325 (실바이트, byte-identical)

@0x4b8d10 인접 case 실바이트:
```
0x4b8d3a  mov dword [esi],0xce44   ; case 0x325 size=52804
0x4b8d40  mov dword [edi],0        ; schedule=0
0x4b8d48  mov al,1 ; ret 0x10      ; 성공
```
case 0x323은 동일 구조로 `mov [esi],0x2d4`(=724), schedule=0, al=1, ret 0x10 (디컴 L37184). **두 case의 유일 차이는 immediate size(0x2d4 vs 0xce44).** 반환코드·schedule·제어흐름 전부 동일. 크기로 갈리는 조건 분기 없음. 0xce44는 .text 전역 유일 상수(@0x4b8d3c) — 클라가 opcode 0x0325 = 52804B를 **의도적으로 예약**했다는 결정적 증거.

## §4. 거부 조건표 (검사필드·임계·0x0325 통과여부)

| 함수 | 검사 | 필드/근거 | 임계 | 0x0325 |
|---|---|---|---|---|
| 8850 적재 | 슬롯 비었나 | `cmp [slot.bufptr],0` | ptr==0 | 빈 슬롯 존재(~12msg) → 통과 |
| 8850 적재 | opcode 등록됐나 | FUN_004b8b00 `test al,al` | 반환≠0 | **1 반환 → 통과** |
| 8850 적재 | malloc 됐나 | `test eax,eax` | ptr≠0 | malloc(52804) 성공 → 통과 |
| 8850 적재 | 큐 안 찼나 | `cmp ebx,0x1f4` | idx<500 | ~12msg → 통과 |
| 8850 적재 | **size 임계** | — | **없음** | — |
| 8950 드레인 | 슬롯 점유 | `test [slot.bufptr]` | ≠0 | 적재됨 → 통과 |
| 8950 드레인 | schedule 도래 | `cmp [slot.sched],0`/tick | 0 또는 ≤tick | schedule=0 → 즉시 통과 |
| 8950 드레인 | **size 임계** | — | **없음** | — |

**어떤 행도 52804를 거부하지 않는다.** 큐 경로 하드리밋 부재.

## §5. 결론 — 서버/클라 수정 방향

1. **큐 경로에 exe-patch로 완화할 사이즈 하드리밋은 없다.** 임계 자체가 없으므로 패치할 상수가 없다. 클라는 52804B 0x0325를 적재·드레인·디스패치할 능력이 코드상 완비돼 있다.
2. **원인은 큐 상류**: 0x0325가 디스패처에 안 뜬다면 **FUN_004b8850 적재가 애초에 호출되지 않는 것**이다(호출만 되면 §1대로 무조건 적재 성공). 소실은 적재 직전의 코덱/디프레임 경로(dispatch-skip.md §3의 FUN_006130a0 복호 반환 체크) 또는 라이브 전송 타이밍/클라 상태 의존. → **라이브 훅으로 적재 진입 여부를 이분(bisect)** 하는 게 유일한 확정 경로. 정적으로는 큐 함수 무혐의가 최종.
3. **서버 수정**: 프레임/크기/분할 손대지 말 것(반증됨). 만약 라이브 이분에서 "적재 호출 안 됨=상류 소실"로 나오면, 서버는 wire를 못 바꾸는 게 아니라 **송신 타이밍/순서**(0x0325를 클라 수신펌프·상태 준비 후 송신)로 우회한다. 큐 자체 우회는 필요 없다.

## 부록 — 근거
- 실바이트 디스어셈블 스크립트: 스크래치패드 `disq.py/disq2.py/disq3.py`(capstone 5.0.7, pefile). rva→file offset은 PE 섹션 매핑.
- 실바이트 확정: 적재 @0x4b8850(게이트 4종·malloc 0x5ffab7·rep movsd 고정복사), 드레인 @0x4b8950(schedule 게이트·디스패처 0x4ba2b0·압축), 룩업 @0x4b8d3a(0x325=0xce44 유일상수).
- 디컴 교차: `.omo/ghidra/export/decompiled/…` L36918(적재)/L37002(드레인)/L37093(룩업 case 0x325 @L37188).
- 상류 무혐의: `logh7-0325-dispatch-skip.md`(코덱 복호버퍼 61454, ECB 라운드트립 통과, 게임 수신경로 사이즈캡 부재).
