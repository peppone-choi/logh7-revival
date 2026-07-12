# 0x0325 "signed short 길이 오버플로" 가설 — 정적 RE로 반증 (정본 EXE 실바이트)

정본 EXE: `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 9c97de2ae426f011…). ImageBase 0x400000.
검증: Ghidra 디컴 + 정본 EXE 실바이트 capstone(5.0.7) 디스어셈블. 아래 주소·상수·니모닉은 전부 실바이트 확인.
목적(방어적): 2008 종료 MMO "은하영웅전설 VII" 합법 보존 복원 — 자체 서버 0x0325 유닛 레코드를 원본 클라가 수신·적재하게 한다.
선행: `logh7-0325-codec-handoff.md`(복호~OnRecv 무게이트), `logh7-0325-dispatch-skip.md`, `logh7-0325-recvque-gate.md`. 본 문서는 그 후속으로 "길이 signed 16bit 오버플로" 단일 가설을 실바이트로 마감한다.

## TL;DR — signed-short 오버플로는 존재하지 않는다. A도 B도 아니다.

- **수신 경로 전 함수에서 sign-extension 명령(movsx/cwde/cdq/cwd)이 0개.** 코덱·펌프·attach·스트림read/calc·메시지리더·헤더리더·OnRecv·로더·사이즈테이블 15개 함수 전수 스캔 결과 전부 clean. 길이를 signed로 읽는 명령 자체가 없다.
- **길이는 경로 전체에서 full uint32(또는 movzx u16)로만 읽힌다.** 메시지 리더 `FUN_006126b0`이 attach 길이를 `mov eax,[edi+8]`(full dword)로 읽고 `-6` 후 **unsigned `jbe`**로만 분기. 52810/52804는 양수로 통과.
- **52810 = 0xCE4A < 65536** → 코덱의 u16 저장(frame+0x2c)에서 절단 손실 없음. 모든 재독은 movzx(zero-extend) → 52810. **-12726(0xCE4A의 signed16 해석)은 어떤 명령도 만들지 않는다.**
- **클라 사이즈테이블(`FUN_004b8b00`)이 32768 초과 opcode를 다수 하드코딩**: 0x307=58802, 0x34f=46340, 0x321=36324, 0x32f=35588, 0x325=52804, 0x33b=31204. 클라는 설계상 >32768 메시지를 수신하도록 만들어졌다. 공유 수신 경로에 signed-16 게이트가 있었다면 이 opcode들이 전부 영구 불능 — 반증의 결정적 증거.
- **수정 방향 판정**:
  - **(B) exe-patch movsx→movzx: N/A(불가).** 패치할 signed 읽기 명령이 부재. 32768/0x8000 경계 비교도 부재.
  - **(A) 서버 body 축소: 틀렸고 해롭다.** 전제(32768 미만이면 signed 게이트 통과)가 거짓. 게다가 사이즈테이블이 0x0325=고정 0xce44(52804), count-유도 아님(*param_3=0) → 로더가 무조건 52804B 복사 → 짧은 body는 desync/over-read.
  - **결론: 서버는 0x0325 body를 0xce44(52804)B 전량 그대로 보내야 한다(현 `buildInformationUnitInner`가 이미 그렇게 함).** signed-length는 원인이 아니다.

## §1. 코덱→attach 핸드오프 — u16 무손실, movzx 재독 (실바이트)

펌프 `FUN_006122c0`(L295224):
```
puVar2 = FUN_006130a0(codec,state)          ; puVar2 = frame+0x24 (코덱 return piVar7+9)
FUN_006103e0(*puVar2, *(undefined2*)(puVar2+2))   ; attach(decbuf, len_u16)
```
- `*(undefined2*)(puVar2+2)` = frame+0x24+8 = **frame+0x2c** = 코덱이 저장한 길이. **16bit(word) 읽기** → Ghidra는 커서 전진에서 `(uint)*(ushort*)`로 zero-extend 사용 = movzx.
- 코덱 `FUN_006130a0`(L296091) 완성경로: `*(short*)(piVar7+0xb) = (short)unaff_EDI` (= frame+0x2c에 길이 16bit 저장). 이것이 팀 가설의 "L296169 (short) 저장"이다. **그러나 이는 truncating 16bit STORE일 뿐 — 같은 바이트를 저장한다. signed 여부는 STORE에서 무의미하고 READ에서만 발현된다.**
- 52810 = 0xCE4A < 0x10000 → u16 저장 무손실. 재독은 전부 movzx → **52810**. signed-16 해석(-12726)은 이 경로 어디에도 없다.
- (경계 주의: frame 길이가 ≥65536이면 이 u16 저장이 상위비트를 절단한다. 이는 unsigned wrap이지 signed 오버플로가 아니며, 0x0325(52810<65536)에는 해당 없음.)

## §2. 메시지 body 리더 `FUN_006126b0` — full uint32 길이, unsigned 분기 (실바이트)

메시지 객체 vtable(.rdata 0x681fac) +0xc = 0x6126b0 (리더). +8 = 0x6126a0(`mov [ecx+0x50],0; jmp 0x60ffe0` → `FUN_00610150` 디스패치). 리더 실바이트:
```
006126b4  mov edi,[esp+0xc]        ; edi = 스트림(attach된 mtStreamInputBuffer)
006126bb  mov eax,[edi]            ; 스트림 vtable
006126c0  call [eax+0x1c]          ; 헤더 4바이트 읽기 (FUN_00611a70 → &this+0x50)
006126cb  call [edx+0x20]          ; 헤더 2바이트 읽기 (FUN_00611a10 → &this+6)
006126ce  mov eax,[edi+8]          ; ★ 길이 = 스트림+8 = attach 길이 = 52810 (FULL DWORD, movzx/movsx 아님)
006126d1  add eax,-6               ; len-6 = 52804
006126d4  test eax,eax
006126d6  mov [esi+8],eax
006126d9  jbe 0x61270b            ; ★ UNSIGNED jbe: (len-6)<=0 이면 body 읽기 스킵. 52804는 양수 → 미발화
006126db  cmp eax,[esi+0xc]        ; (len-6) vs 리더버퍼 용량
006126de  jbe 0x6126f8            ; <=용량이면 통과
006126e0  … "illegal" 로그 후 [esi+8]=[esi+0xc] (용량으로 CLAMP, 드롭 아님)
006126f8  mov edx,[esi+8]; mov eax,[esi+0x14]
006126fe  push 2; push 0; push edx; push eax
00612706  call 0x610420           ; mtStreamInputBuffer::read(dst,size,0,SEEK_END)
```
- 길이 읽기 `mov eax,[edi+8]`는 **full 32bit** — signed 절단 없음. 52810 그대로.
- 유일한 조기탈출은 `jbe 0x61270b`(unsigned, (len-6)<=0). 52804는 양수라 미발화 → body 읽고 디스패치 진행.
- 헤더 리더 `FUN_00611a10`(vt+0x20)만 16bit 읽기(`mov ax,[ecx+edx]`)지만 이는 **msg 헤더 code 필드**(2바이트)를 읽는 것이지 프레임 길이가 아니다. 길이는 §1의 attach uint32.

## §3. 스트림 프리미티브 — negative SIZE만 거부, 길이는 full uint (실바이트/디컴)

- attach `FUN_006103e0`(L293038): `[obj+4]=buf; [obj+8]=len; [obj+0xc]=0`. len을 full 32bit 파라미터로 저장.
- read `FUN_00610420`(L293057): `else if ((int)param_2 < 0)` → **SIZE가 음수면 "illegal" 에러**. 여기 size=52804는 양수 → 통과. 이후 `if([obj+8] < start+size) size=[obj+8]-start`로 remaining 클램프(over-read 방지). len([obj+8]=52810) full uint 비교.
- calculate `FUN_006104b0`: `-1<(int)param_1 && param_1<=[obj+8]` (위치 경계). 전부 full uint 길이 대상. 52810 정상.
- re-recvque가 관측한 "signed int32 읽기"는 이 `(int)param_2 < 0`(음수 SIZE 거부)·calculate의 `-1<(int)`(음수 위치 거부)를 가리킨다. **전달되는 값(52804/위치)이 양수라 무해**. 여기가 signed-short 절단 지점이 아님을 교차 확인.

## §4. 사이즈테이블 `FUN_004b8b00` + 로더 `FUN_004b8850` — >32768 다수, unsigned 복사 (디컴)

opcode별 고정 body 크기(실측 switch):
| opcode | size | | opcode | size |
|---|---|---|---|---|
| 0x0307 | 0xe5b2 = **58802** | | 0x0325 | 0xce44 = **52804** |
| 0x0321 | 0x8de4 = **36324** | | 0x032f | 0x8b04 = **35588** |
| 0x034f | 0xb504 = **46340** | | 0x033b | 0x79e4 = 31204 |
| 0x0323 | 0x2d4 = 724 | | 0x0315 | 0x138c = 5004 |

- **32768 초과 opcode가 5종 이상.** 공유 수신 경로에 signed-16 게이트가 존재하면 클라가 자기 프로토콜 메시지(0x307=58802B 등)를 영구히 못 받는다 → 실배포 MMO에서 불가능. **signed-16 게이트 부재의 결정적 증거.**
- 0x0325는 `*param_4=0xce44; *param_3=0; return 1` — **고정 크기, count-유도 아님**(대조: 0x400/0x401/0x402는 `*param_3 = param_2[1]+*param_2` count-유도). 클라는 0x0325를 정확히 52804B로 기대.
- 로더 `FUN_004b8850`: `_malloc(param_4)` 후 `>>2`(dword)·`&3`(byte) **unsigned 복사 루프**로 param_4(테이블 크기)만큼 소스에서 복사. 52804 무손실. 서버가 짧은 body를 보내면 로더가 소스 밖 50600B를 over-read.

## §5. 0x0323(통과) vs 0x0325(관측상 유실) — signed로 갈리지 않는다

| 지점 | 0x0323 (724B) | 0x0325 (52804B) | signed로 갈리나 |
|---|---|---|---|
| 코덱 u16 저장(frame+0x2c) | 0x02D4 | 0xCE4A | No (둘 다 <65536, 무손실) |
| attach 길이 재독 | movzx→724 | movzx→52810 | No (zero-extend) |
| 리더 `mov eax,[edi+8]` | 724 | 52810 | No (full dword) |
| `add -6; jbe`(unsigned) | 718>0 통과 | 52804>0 통과 | No (양수) |
| 사이즈테이블 | 724 | 52804 | No (uint) |
| 로더 복사 | 724 | 52804 | No (unsigned) |

**정적으로 signed 해석이 개입해 한쪽만 탈락시키는 지점은 어디에도 없다.** 크기 축(32768/0x8000) 게이트도, movsx/short 재독도 부재.

## §6. 수정 방향 확정 — (A)도 (B)도 아님

1. **(B) exe-patch movsx→movzx: 불가.** 패치 대상 signed 명령이 존재하지 않는다(전수 스캔 0건). offset/current/target 상수 부재.
2. **(A) 서버 body 축소(4+count×0x58): 틀렸고 해롭다.**
   - 전제("32768 미만이면 통과") 거짓 — signed 게이트 없음.
   - 사이즈테이블이 0x0325=고정 52804 요구(count-유도 아님) → 로더가 무조건 52804B 복사 → 짧은 body는 소스 over-read/desync.
   - 팀 질문 "FUN_004b8b00의 0xce44가 malloc 상한(가변)인가 정확일치인가"의 답: **정확일치(고정)**. 가변 수용 아님. → **A 불가.**
3. **결론: 서버는 0x0325 body를 0xce44(52804)B 전량 그대로 송신해야 한다(현 구현이 이미 그러함). 리스크 최소 = 무변경.** signed-length는 M3 크래시의 원인이 아니다.

## §7. 그럼 라이브 유실은 무엇인가 — 다음 조사축 (RE 근거 기반 제언)

리더 `FUN_006126b0`의 유일한 client-side 조기탈출은 `jbe 0x61270b`(= `(attach_len - 6) <= 0`). 정상 52810 attach에는 미발화 → 리더는 body를 읽고 디스패치. 따라서 0x0325가 리더에서 실제로 탈락한다면 유력 원인은 **attach_len 값 자체가 52810이 아님**(서버 프레이밍의 길이 값 오류) 또는 **런타임/상태/타이밍**(codec-handoff §7 결론)이다. signed 절단이 아니다.
- 서버측 길이 정합 확인 필요: dispatch-skip의 TCP prefix 0xCE5E(52830) vs 코덱 복호 길이(frame+0x2c) vs body 52804. 이 셋의 산술(prefix − subheader − 2, 그리고 리더의 −6)이 테이블 52804와 정확히 맞물리는지 서버 프레이밍에서 검증. 어긋나면 리더의 `len-6`이 0 이하로 wrap하여 `jbe`가 발화할 수 있다 — 이는 **길이 VALUE 정확성 문제이지 signedness 문제가 아니다.**
- 라이브 훅 제언(qa-marker 조율): 리더 진입 시 `[edi+8]`(attach_len)을 0x0325 vs 0x0323 각각 로깅. 0x0325의 attach_len이 52810이면 리더 무혐의(원인은 상태/타이밍), 52810이 아니면 서버 프레이밍의 길이 값을 교정.

## 부록 — 근거
- 실바이트 스캔: 15개 수신경로 함수(코덱 0x6130a0, 펌프 0x6122c0, attach 0x6103e0, read 0x610420, calc 0x6104b0, 리더 0x6126b0/0x6126a0/0x60ffe0/0x610150, 헤더 0x611a70/0x611a10, OnRecv 0x4ae0d0, 로더 0x4b8850, 테이블 0x4b8b00, seekerr 0x610530) — sign-extension 명령 0건. 스크립트: scratchpad scan_signext.py / disq_reader.py / disq2.py (capstone 5.0.7).
- 정적 vtable: 메시지객체 .rdata 0x681fac (+8=0x6126a0, +c=0x6126b0), 스트림 0x681f1c(+1c=0x611a70 4B, +20=0x611a10 2B). 0x53247e0(라이브 핸들러)은 .data BSS(VSize 0x2bf4fa8, RawSize 0x63000)라 파일에 vtable 미존재 = 런타임 힙 객체 → 정적 미해소(codec-handoff §5와 동일). 단 리더가 쓰는 스트림 프리미티브·attach 길이는 공유·sign-clean이라 구상 리더가 무엇이든 길이 signed 절단 불가.
- 사이즈테이블: FUN_004b8b00 switch 실측(0x307=0xe5b2, 0x321=0x8de4, 0x325=0xce44, 0x32f=0x8b04, 0x34f=0xb504, 0x33b=0x79e4, 0x323=0x2d4).
