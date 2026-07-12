# 0x0325 코덱→OnRecv 전달 경로 — 정적 RE (정본 EXE 실바이트)

정본 EXE: `artifacts/logh7-install/…/exe/g7mtclient.exe` (sha256 9c97de2a…). ImageBase 0x400000.
검증: Ghidra 디컴 + **정본 EXE 실바이트 capstone 디스어셈블**(라이브 구동 EXE 그 바이트). 아래 주소·상수·분기는 전부 실바이트 확인. Ghidra는 이 구간에서 `unaff_EBX/EDI`·`CONCAT22`·void-리턴을 포인터로 오재구성 → **디컴 신뢰 금지, 실바이트만 채택**.
목적(방어적): 2008 종료 MMO "은하영웅전설 VII" 합법 보존 복원 — 자체 서버 0x0325 유닛 레코드(52804B)를 원본 클라가 수신·적재하게 한다.
선행: `logh7-0325-dispatch-skip.md`(상류 프레이밍 무혐의), `logh7-0325-recvque-gate.md`(큐 적재/드레인 무혐의). 본 문서는 그 사이 구간(코덱 복호완료 ~ OnRecv 진입)을 실바이트로 마감.

## TL;DR — 복호~OnRecv 전 구간에 크기 게이트는 없다 (체인 5함수 실바이트 완전 검증)

- 소실 의심 구간을 함수 단위로 전부 디스어셈블: **코덱 FUN_006130a0 → 펌프 FUN_006122c0 → 소비자포워드 FUN_00612510 → OnRecv FUN_004ae0d0 → 적재 FUN_004b8850.** 이 중 **메시지 길이를 상수와 비교해 대용량을 거부/스킵하는 분기는 0개.**
- **코덱은 0x0325를 복호 성공→완성프레임으로 반환**(실바이트): 완성 플래그 `+0x30=1`(@0x61322f), 길이 `+0x2c`에 **복호출력길이를 u16로 저장**(@0x613233 `mov [esi+0x2c],dx`), non-null 반환(esi+0x24). 52804=0xCE44는 u16에 그대로 들어가 **절단 손실 없음**. 라이브 관측(codec-ok, +0x30=1, retval≠0)과 바이트 일치.
- **펌프 소비자 룩업 키는 고정 채널 id `[pump+8]`(u16)** — 크기·버퍼주소 무관(@0x61233e `mov ax,[esi+8]`). Ghidra가 이 자리에 만든 `CONCAT22(버퍼주소>>16, …)`는 **디컴파일 허구**다. 따라서 드롭 분기(@0x61234c `je 0x612378`)는 0x0323·0x0325에 동일하게 작동 — 크기로 한쪽만 못 버린다.
- **OnRecv는 opcode 0x202/0x204만 특수 분기**, 그 외 전부 `call 0x4b8850`(적재)로 직행(@0x4ae0ff). 0x0325 크기 게이트 없음.
- **결론**: 복호~적재 전 구간에 **exe-patch로 완화할 크기 상수(하드리밋)가 존재하지 않는다.** 클라는 코드상 52804B 0x0325를 복호·전달·적재·디스패치할 능력이 완비돼 있다. 이로써 dispatch-skip(상류)·recvque-gate(큐)에 이어 **세 번째 독립 확인**.
- **유일한 미해소 링크**: 완성프레임을 실제로 읽어 OnRecv를 호출하는 **msg32 리더**(펌프의 message-factory `[pump+0x10]`의 vtable+8이 만든 메시지 객체의 vtable+8, @0x612357 `call [edx+8]`). 이건 런타임에 설치되는 구상 객체에 바인딩돼 **정적으로 최종 함수 확정 불가** — 라이브 훅으로만 특정된다. 형제 29프레임은 이 리더를 통과해 OnRecv 도달하므로 리더는 opcode/채널 균일 → 크기 선택적 드롭이라면 비정형적, 런타임/상태 원인 가능성이 더 큼.

## §1. 전달 체인 (실바이트 콜그래프)

연결 셋업 `FUN_004ad780`(mpsClientBaseSystem::create_connection): 트랜스포트 팩토리 `FUN_00612030(0x1f4000,0x3e8000,0xf000,…)` 생성(dispatch-skip §4의 그 팩토리) → 게임 수신핸들러 `FUN_004add60` 등록(@27804).

```
recv → FUN_004add60 → FUN_006122c0 (게이트 없는 펌프)
  └ FUN_006130a0(codec, state)      # 완성 0x0030 프레임 1개 반환 (복호)
  └ FUN_006103e0(decbuf, len_u16)   # mtStreamInputBuffer::attach(버퍼, 길이)
  └ FUN_00612510(channel_u16)       # (*[pump+0x10]->vt+8)(channel) → 메시지객체 or null(드롭)
  └ (*[msgobj->vt+8])(stream)        # ★ msg32 리더 — OnRecv 호출 (정적 미해소)
       └ FUN_004ae0d0 OnRecv(code,…,buf) → FUN_004b8850(code,buf)  # 적재
```

팩토리 구조(실바이트/디컴): `FUN_00612030` → 펌프 `FUN_00611f90`→`FUN_00612100`(vtable 객체) 생성, 그 `[pump+0x14]=codec`(FUN_006127d0, child ECB). 소비자 포워드가 쓰는 `[pump+0x10]`은 FUN_00612100이 채우는 message-factory 멤버.

## §2. 코덱 FUN_006130a0 — 완성프레임 반환, 크기 절단 없음 (실바이트)

완성(비-0x31) 경로 @0x613222:
```
0x613224  mov dx,  [esp+0x10]     ; dx = 복호출력 실길이 (decrypt vtable가 &[esp+0x10]로 갱신한 out값)
0x613229  lea eax, [esi+0x24]     ; 반환 포인터 = frame+0x24
0x61322c  mov [esi+0x28], edi     ; +0x28 = decbuf
0x61322f  mov byte [esi+0x30], 1  ; +0x30 = 완성 플래그  ← 라이브 관측
0x613233  mov [esi+0x2c], dx      ; +0x2c = 길이 (u16!)  ← 52804=0xCE44, u16에 안전
0x613237  mov [eax], edi          ; +0x24 = decbuf
          return esi+0x24         ; non-null
```
- 복호 호출 @0x613193 `call [edx+0x18]`: 입력길이 = `[codecobj+8](u16) - subheader - 2`. 0x0325 TCP len prefix 0xCE5E(52830) → 52830-4-2=52824. 출력버퍼 용량 `[esi+0x1c]`=0xf00e(61454, dispatch-skip §4 실바이트 확정) > 52824 → 오버플로 불가. 복호 성공(al≠0, 라이브 확인).
- **null 반환 조건은 오직 복호 실패**(@0x613196 `test al,al; …xor eax,eax`) — 라이브상 0x0325는 복호 성공이므로 **해당 없음.** 크기 기반 null 반환 분기 없음.
- `+0x2c` u16 저장은 상위16비트 미기록이나, 소비자가 `movzx`(u16)로만 읽어(§3) 문제없음. 52804<65536이라 u16 자체로도 무손실.

## §3. 펌프 FUN_006122c0 — 채널 기반 드롭, 크기 무관 (실바이트)

```
0x612309  call 0x6130a0            ; edi = 완성프레임 (or null→루프탈출)
loop @0x61231b:
  mov ecx,[edi]                    ; decbuf (+0x24)
  movzx eax, word [edi+8]          ; len = [frame+0x2c] u16 = 52804
  push eax; push ecx
  lea ecx,[esp+0x10]; call 0x6103e0 ; attach(decbuf, 52804)
  mov eax,[edi+4]; movzx edx,word [edi+8]; add eax,edx; mov [edi+4],eax  ; 커서 += 52804 (unsigned)
  movzx eax, word [esi+8]          ; ★ 룩업 키 = [pump+8] = 고정 채널 id (u16). 크기·주소 무관
  push eax; mov ecx,esi; call 0x612510  ; 메시지객체 = (*[pump+0x10]->vt+8)(channel)
  mov edi,eax; test edi,edi; je 0x612378 ; null → DROP (채널 기반, 0x0323/0x0325 동일)
  ; ── 정상: 메시지 읽기 ──
  mov edx,[edi]; lea eax,[esp+8]; push eax; mov ecx,edi
  call [edx+8]                     ; ★ msg32 리더 (스트림 읽어 OnRecv 호출) — §5
  … FUN_00612520 (릴리스) …
  call 0x6130a0                    ; 다음 프레임
```
- **드롭 분기 `je 0x612378`의 조건은 채널 룩업 결과(null)뿐.** 채널 id는 `[pump+8]` 고정 → 0x0325만 선택적으로 드롭 불가.
- attach 길이·커서 전진 전부 u16 unsigned 52804 → 정상. 크기 임계 비교 없음.
- 보조근거: `FUN_006103e0`=mtStreamInputBuffer::attach는 `[obj+8]=len` 저장만(디컴 L293049), 소비 시 `FUN_00610420`가 이 len으로 read를 클램프(L293081) — 52804면 52804까지 읽음. 손실 아닌 정상 경로.

## §4. OnRecv FUN_004ae0d0 — opcode 0x202/0x204만 특수, 그 외 적재 (실바이트)

```
0x4ae0d4  mov eax,edx; and eax,0xffff; sub eax,0x202
0x4ae0e9  je 0x4ae163              ; code==0x202 특수
0x4ae0eb  sub eax,2; je 0x4ae10e   ; code==0x204 특수
          ; 그 외(0x0325 포함):
0x4ae0f0  mov eax,[esp+0x114]      ; buf
0x4ae0f7  mov ecx,[0x7ccffc]       ; RecvQue base
0x4ae0ff  call 0x4b8850            ; ← 적재 (0x0325 여기로)
          ret 0xc
```
크기 게이트 전무. 0x0325는 무조건 적재 호출. (적재/드레인 무게이트는 recvque-gate.md에서 실바이트 확정.)

## §5. 유일 미해소 링크 — msg32 리더 (@0x612357 `call [edx+8]`)

완성프레임을 스트림에서 실제로 읽어 OnRecv를 호출하는 최종 리더는 **런타임에 설치되는 메시지 객체의 vtable+8**이다. 그 객체는 `(*[pump+0x10]->vt+8)(channel)`(FUN_00612510)이 반환하며, `[pump+0x10]`은 팩토리 `FUN_00612100`이 채우는 구상 객체 — **정적으로 최종 구상 함수까지 확정 불가**(4단계 vtable 간접, 런타임 바인딩). 여기가 유일하게 남은 소실 후보 지점이다.

- 이 리더가 스트림(길이 52804 클램프)에서 msg32(dword0/code@4/body)를 읽어 `OnRecv(code, ptr)` 호출. OnRecv는 길이를 안 받고 적재가 `FUN_004b8b00[code]=52804`로 복사하므로, 리더는 code만 넘기면 됨.
- 리더가 0x0325를 스킵하려면 자체 크기 검사가 있어야 하는데, **형제 29프레임(0x0323 포함)이 이 동일 리더를 통과해 OnRecv 도달**(라이브) → 리더는 opcode/채널 균일 경로. 크기 선택적 드롭이라면 비정형.

## §6. 0x0323(통과) vs 0x0325(유실) — 이 구간 diff

| 지점 | 0x0323(752B) | 0x0325(52832B) | 크기로 갈리나 |
|---|---|---|---|
| 코덱 복호 | 성공, +0x30=1, +0x2c=724 | 성공, +0x30=1, +0x2c=52804 | No (u16 안전) |
| attach 길이 | 724 | 52804 | No (unsigned) |
| 채널 룩업 키 | [pump+8] | [pump+8] | **동일** |
| 드롭 분기 | 통과 | ? | 채널 동일 → 크기로 못 가름 |
| OnRecv 진입 | 도달(라이브) | 미도달(라이브) | — |
| msg32 리더(§5) | 통과 | ? (정적 미해소) | 라이브 확정 필요 |

정적으로 갈리는 크기 임계는 **어느 지점에도 없다.** 라이브 diff는 리더(§5)에서만 관측 가능.

## §7. 수정 방향

1. **exe-patch할 크기 상수(하드리밋)는 이 체인에 없다.** 모든 크기 처리가 동적/ u16-안전(52804<65536). 패치할 offset/current/target 상수가 부재 → **사이즈 캡 완화 패치는 N/A.**
2. **서버는 프레이밍/크기/분할을 못 고치는 게 아니라, 고칠 게 없다**(반증 완료). 만약 라이브(§5 리더 훅)에서 "리더가 0x0325를 드롭"으로 확정되면, 그 구상 리더 함수를 그때 지목해 재RE. 확률이 더 높은 쪽은 **런타임/상태/타이밍**(대용량 0x0325의 늦은 도착 vs 클라 상태 전환) — 이 경우 서버는 **0x0325 송신 타이밍/순서**(클라 수신펌프·전략맵 상태 준비 후 송신)로 우회한다. 내용/프레임 불변.
3. **라이브 확정 훅(qa-marker와 조율)**: ① `FUN_006122c0` @0x61234c 직후 `edi`(메시지객체 null 여부) — 드롭 분기 발화 계측. ② @0x612357 `call [edx+8]` 진입 시 `[edx+8]` 실주소 로깅 → **msg32 리더 구상 함수 확정**. ③ 그 리더 내부에서 OnRecv(0x4ae0d0) 호출 직전 code 로깅. 이 3점이면 0x0325 소실 지점이 리더 진입 전/후/내부 중 어디인지 이분된다.

## 부록 — 근거
- 실바이트: 코덱 @0x6130a0(완성경로 0x613222, 복호 0x613193, null-경로 0x613196), 펌프 @0x6122c0(채널키 0x61233e, 드롭 0x61234c, 리더콜 0x612357), OnRecv @0x4ae0d0(적재콜 0x4ae0ff). 스크립트: 스크래치패드 disq4~disq8.py(capstone 5.0.7).
- vtable: OnRecv는 .rdata 0x66e0f0(단일 참조), 설치 @0x4ad81a/0x4adaf2(FUN_004ad780/FUN_004adac0).
- 디컴 교차: FUN_006122c0 L295224, 코덱 L296091, FUN_006103e0/00610420 L293038/293057(stream attach/read), OnRecv 부재(간접호출), 팩토리 FUN_00612030 L294996 / FUN_00611f90 L294965 / FUN_00612100 L295063.
- 선행 무혐의: dispatch-skip.md(복호버퍼 61454, ECB 라운드트립), recvque-gate.md(적재/드레인 게이트 0개).
