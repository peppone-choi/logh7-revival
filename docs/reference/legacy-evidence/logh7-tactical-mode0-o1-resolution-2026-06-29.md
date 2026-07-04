# mode0 import O1 해소 — 0x345 등은 전제조건 아님 (2026-06-29, P0-08)

`docs/logh7-mode0-breakthrough-2026-06-26.md`의 **O1**("0x33f/0x341/0x345/0x347 빌더 미존재 →
`FUN_004c32a0`가 0x345(+0x4040dc)와 0x33b(+0x4271a8)를 모두 읽으므로 **최소 0x345+0x33b 동시 필요
가능성**")을 정적 RE로 확정 해소한다. 비-라이브(redex), 코드 변경 없음.

## 결론 (O1 = NEGATIVE)

**`0x345`(및 그 하위 0x33f/0x341/0x347 base/corps/obstacle 소스)는 mode0 import의 전제조건이 아니다.**
`FUN_004c32a0`(`@0x4c32a0`, WorldIn_TacticsFieldImport)의 디컴파일 제어구조:

```c
if (param_2 == 0) { FUN_004c45f0(FUN_004b5bb0(), 0); }   // 월드진입: mode_byte=0 세팅
if (*(char*)(param_1 + 0x126711) == 0) {                  // mode0 활성
    if (param_2 == 0) {                                   // ★ 월드진입 경로
        local_35c = *(byte*)(param_1 + 0x4040dc);         // 0x345 Base count
        if (local_35c != 0) {                             // ★ count!=0일 때만 base 객체 빌드
            do { ... FUN_004c46a0 ... } while (local_35c < 5);
        }
        // count==0이면 base 블록 통째 SKIP (return/abort 없음)
    }
    else if (*(char*)(param_1 + 0x126718) == 0) { goto LAB_004c4140; }  // (0xb0a 경로만 abort)

    uVar4 = *(ushort*)(param_1 + 0x4271a8);               // ★ 0x33b unit count (공통 코드)
    if (uVar4 != 0) {                                     // 0x33b!=0일 때 mode0 유닛 풀 빌드
        ... +0x41a368(0x0325 유닛테이블)/+0x126714 교차참조해 유닛 객체 alloc ...
    }
}
```

핵심:
1. **0x345 Base(`+0x4040dc`) 블록은 `if (count != 0)`로 게이트**되고 count==0이면 통째 스킵된다(하드
   return/abort 없음). base 하위 corps/obstacle(`+0x40443c/+0x4042e4/+0x4042f8/+0x40430c/+0x404428`,
   = 0x33f/0x341/0x347 목적지)은 base 블록 **내부**에 중첩되어 base가 없으면 애초에 참조되지 않는다.
2. **0x33b unit(`+0x4271a8`) 블록은 base 블록 뒤의 공통 코드**로, 월드진입(param_2==0) 경로에서 base
   유무와 무관하게 실행된다. 즉 mode0 **유닛 풀**의 필요충분 소스는 0x33b다.
3. 유일한 abort(`goto LAB_004c4140`)는 param_2!=0(0xb0a own-fleet-add) 경로에서 `+0x126718==0`일 때뿐 —
   월드진입(param_2==0)에는 해당 없음.

## 함의 (라이브 L1/L2 전 서버 작업 범위 축소)

- mode0 전환(L1: 0x0317 selector + 재arm) 성공 후 mode0 풀을 채우는 데 **신규 서버 빌더가 선결 아님.**
  이미 있는 **0x33b `buildResponseTacticsInformationInner`(`LOGH_TACTICS_UNIT=1`)** 가 유닛 풀 소스로 충분하다
  (`server/src/server/logh7-battle-engine.mjs` / `logh7-login-protocol.mjs`).
- 0x345/0x33f/0x341/0x347 빌더는 **base/장애물 객체 추가용 enhancement**이지 blocker가 아니다. 라이브에서
  유닛만으로 mode0 consume 경로(`FUN_0050d230`)가 도는지 먼저 확인하고, 필요 시 base 빌더를 후속 추가한다.

## 미해소(라이브 전제, 본 사이클 범위 밖)

- 라이브 O2/O3/O5(셀렉터 식별·타이밍·재arm 재실행)는 `mode0-breakthrough` L1 라이브 검증에 그대로 남는다.
- battle-engine `0x33b` 주석(`:189` "클라 미소비(오독 원인)라 드롭")은 **battle(전투) 경로**에서의 과거 판정이다.
  mode0 import 경로(`FUN_004c32a0`의 `+0x4271a8` read)에서 0x33b가 실제 소비되는지는 L2 라이브에서 확인한다.
- 라이브 미실행 사이클(정적 RE). 캐논 EXE 구동은 사용자 go 필요.

## 증거(재현 가능)

- `cd RE; python -m tools.logh7_redex func 0x004c32a0` — 위 제어구조(라인 95–105, 360–400).
- `docs/logh7-mode0-breakthrough-2026-06-26.md` (O1 원문, mode0 소스 테이블 표).
