# FUN_004b68f0 mode-routing patch (정밀 A1) — 2026-06-26

저장소 E:/logh7-revival · Ghidra export `.omo/ghidra/export/G7MTClient` (imagebase 0x400000) ·
캐논 playable `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` (sha 992dc7e2, **미교체**).

---

## 1. RE 확정: FUN_004b68f0 mode 디스패처

`FUN_004b68f0(param_1)` = 월드-인 메인 루프 디스패처. param_1 = 거대 전역 객체(=esi).
월드진입 1회 트랜지션 블록(게이트 `param_1[0x35837f]==0`, 자기 자신을 1로 latch)에서 **import 모드를
선택**한다. 디컴파일 + 디스어셈블(아래) 교차확정:

```
0x4b6af2  8a8e 5af33500   mov  cl, [esi+0x35f35a]   ; ★ latch selector read (read1/write0)
0x4b6afb  84c9            test cl, cl
0x4b6afd  b8 02000000     mov  eax, 2               ; iVar7 = 2 (기본 = mode2)
0x4b6b02  89442410        mov  [esp+0x10], eax       ; local_20 = 2
0x4b6b06  7409            je   0x4b6b11             ; latch==0 이면 2 유지
0x4b6b08  b8 01000000     mov  eax, 1               ; latch!=0 → iVar7 = 1 (mode0)
0x4b6b0d  89442410        mov  [esp+0x10], eax
0x4b6b11  32db            xor  bl, bl
0x4b6b13  83f801          cmp  eax, 1
0x4b6b16  7528            jne  0x4b6b40             ; ≠1 → mode2 분기로
        ; --- iVar7==1 (mode0) 분기 ---
0x4b6b18  push 0xff / push 2 / mov ecx,esi / call FUN_004b63c0
          call FUN_0054e570
          call FUN_004c32a0   ; ★ mode0 setter = "WorldIn_TacticsFieldImport"
        ; --- 0x4b6b40 iVar7==2 (mode2) 분기 ---
          cVar1 = param_1[0x358382]; if (cVar1==-1 || cVar1!=2)
          call FUN_004b63c0(0,cVar1) / FUN_0054e570 / FUN_004c4170  ; ★ mode2 setter = "StrategyFieldImport"
```

### setter → 디스패처 바이트 → poller (확정 체인)

setter는 `FUN_004c45f0(obj, mode)`(byte writer @0x126710)를 호출해 디스패처 바이트를 세팅한다:

- **mode2 setter `FUN_004c4170`** ("WorldIn_StrategyFieldImport") → `FUN_004c45f0(.,2)` →
  `[+0x126710]=CONCAT31(2,1)` 즉 **byte[0x126711]=2**, init 영역 0x2a58f8 zeroing(0x6959 dword).
- **mode0 setter `FUN_004c32a0`** ("WorldIn_TacticsFieldImport", `param_2==0`일 때) → `FUN_004c45f0(.,0)` →
  **byte[0x126711]=0**, init 영역 0x126718 zeroing(0x5fc77 dword = 대용량).

매 프레임 poller 디스패치(`cVar1 = param_1[0x126711]`):

| 0x126711 | 게이트 | 호출 poller | 의미 |
|---|---|---|---|
| **0** | 0x126718!=0 | FUN_004f6f60·FUN_005266e0·**FUN_0050d230**·FUN_0050cf10·FUN_004b6e00·FUN_004c9640 | ★ **interactive/consume** (0x0b01 소비처 FUN_0050d230) |
| 1 | — | (없음) | idle/transition |
| **2** | 0x2a58f8!=0 | FUN_004f6f60·FUN_005266e0·**FUN_004fef90**·FUN_0050cf10 | ★ **strategic enqueue** (event-9 enqueue FUN_004fef90) |
| else | — | FUN_005923a0(에러) | 비정상 |

`else { FUN_0054eda0(); FUN_0054ee60(); ... }` 분기는 **트랜지션 미완(0x35837f 게이트 이전)**일 때 도는
별도 부트스트랩 경로이지 mode poller가 아니다.

### ★ interactive-mode = 0x126711 == 0 (mode0 / FUN_004c32a0 setter / FUN_0050d230 consume)
latch `0x35f35a`가 **iVar7→setter→0x126711→poller**를 선택. 라이브 11-run의 dialog/0x0b01/own-fleet
select가 전부 여기에 gate된다. memory의 "mode 배타 근본"(enqueue mode2 ↔ consume mode0가 절대 co-run
안 함)과 정합. **단 mode0 setter가 'Tactics'(전술/배틀) import 라벨**이라는 점이 위험요인(§4).

---

## 2. patch 후보 (byte-verified, same-length)

### (a) ★ 채택 — 기본 mode2→mode0 전환 (1바이트)
`mov eax,2`(0x4b6afd)의 imm을 1로. latch==0(기본) 경로가 mode0(interactive)로 가고, latch!=0도
이미 1이라 **무조건 mode0**.

- VA **0x4b6afd**, fileoff **0xb6afd**
- originalHex(16B guard 창 9B): `b8 02 00 00 00 89 44 24 10`  (mov eax,2 ; mov [esp+0x10],eax)
- patchedHex:                  `b8 01 00 00 00 89 44 24 10`  (mov eax,1 ; …)
- 실변경 = 1바이트 (0xb6afe: `02`→`01`)

### (b) 대안 — je 무력화 (동등, 1바이트)
`je 0x4b6b11`(0x4b6b06 `74 09`)를 `jmp`(`eb 09`)로. latch==0이어도 eax=1 경로로 점프 → 항상 mode0.
- VA 0x4b6b06, originalHex `74 09 b8 01 00 00 00`, patchedHex `eb 09 b8 01 00 00 00`. (a)와 효과 동일,
  (a)가 더 직접적이라 (a) 채택.

### (c) 미채택 — setter 재배선
mode2 분기에서 `call FUN_004c4170`을 `call FUN_004c32a0`으로 바꾸는 안. rel32 재계산 필요+분기 내
선행 조건(0x358382)과 충돌, 위험 큼. (a)가 최소·정확.

---

## 3. 후보 EXE 빌드 + byte-verify

`scratchpad/patch.py` (pefile, VA→off):

```
canon sha 992dc7e2
off 0xb6afd actual b80200000089442410 expect b80200000089442410 MATCH   ← originalHex guard PASS
wrote .omo/work/G7MTClient.playable-moderoute.exe sha 0fda544e
patched region b80100000089442410 OK
total differing bytes vs canon: 1 (expect 1)                            ← 정확히 1바이트
```

산출 EXE: `.omo/work/G7MTClient.playable-moderoute.exe` (sha **0fda544e**). **--deploy 안 함**(캐논 미교체).

---

## 4. 라이브 테스트 절차 (logh7-live)

전제: 스플래시 ~30s 대기 후 드라이브, 스테일 node kill, **stop 시 SHA 복원 필수**.

1. **기동**: `ui_explorer start --patched-exe .omo/work/G7MTClient.playable-moderoute.exe --env …`
   (autologin 변종 또는 real-login). PowerShell 포그라운드 ~35s 유지로 월드진입.
2. **mode probe**: 월드 도달 후 `[esi+0x126711]` 값 캡처 — **0 기대**(mode0). 동시에 0x126718!=0
   (init 완료) 확인. enqueue 측 0x2a58f8 / FUN_004fef90 호출수와 consume 측 FUN_0050d230 호출수 비교.
3. **own-fleet 렌더 shot**: 전략맵에서 own-fleet selectable 스프라이트 렌더 여부 스크린샷.
4. **클릭 체인**: 그리드 셀/함대 클릭 → +0xb00 선택 latch → 명령메뉴 → **0x0b01 trace**(서버 송신).
   FUN_0050d230 dequeue가 +0xb01/+0xb02를 켜는지.
5. **크래시/스톨 시**: 즉시 stop + 캐논 SHA(992dc7e2) 복원, 저널에 회귀 기록.

---

## 5. 위험 / 불확실 (동작 단정 금지)

- ★ **정적식별 라이브-반증 전례 다수(P1)**: 본 코드베이스에서 mode/owner/gate 정적 RE가 라이브에서
  반증된 사례가 여러 번(0x031f group0x5f, owner gate param_2+5, DAT_007ccffc+4 등). 본 patch가
  "interactive 라우팅을 켠다"는 것은 **정적 추론**이며 라이브 측정 전까지 단정 불가.
- ★ **mode0 = "Tactics"(전술/배틀) import 라벨**: mode0 setter `FUN_004c32a0`는 TacticsFieldImport.
  강제 mode0가 전략맵에서 **전술/배틀 데이터(NPC_SEED 시드셋) 미비로 stall/crash** 위험
  (참조: tactical-map-entry 메모 — placeholder 전술데이터 불완전→stall/crash 전례). 즉 patch가
  "consume poller를 켜되 전술 import 부작용"을 동반할 수 있음.
- **0x126718 대용량 zeroing(0x5fc77 dword≈1.5MB)**: mode0 init이 강제 실행되면 전략 객체 영역을
  덮을 수 있음 — 전략맵 렌더/own-cell과 충돌 가능(value0 함대렌더 vs 클릭가능 배타와 동류 위험).
- **latch 실측 미확인**: 0x35f35a 월드진입 시 실제값(0 vs 1) 라이브 미측정. memory는 read1을 시사하나
  본 디스어셈블 기본은 mode2. patch (a)는 어느 쪽이든 mode0 고정하므로 게이팅엔 무관하나, 만약
  실측 latch가 이미 1(=이미 mode0)이라면 **patch가 무효과**일 수 있다(그땐 근본은 다른 곳).
- **추측 P0 금지**: 본 문서의 ✓ 항목은 디컴파일+디스어셈블 확정. mode0 라우팅의 게임플레이 효과는
  §4 라이브 측정으로만 P0 승격 가능.
