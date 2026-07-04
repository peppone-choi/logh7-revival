# LOGH VII 게임 상태전환 메커니즘 — 결정적 RE (2026-06-25)

> 2026-06-30 live correction: `0x0f1f NotifyTactics` is no longer treated as a safe default transition lever.
> Live bisection showed `0x042f NotifyChangeMode` alone is safe and leaves the strategy UI alive, while
> `0x0f1f` immediately triggers APPCRASH `c0000005` at fault offset `0x0018f83a` (VA `0x0058f83a`,
> inside `FUN_0058ee70`) when emitted with the current server-side tactical prerequisites.
> Server default battle-entry probes now stop at `0x042f`; `0x0f1f` is opt-in only via
> `LOGH_BATTLE_ENTRY_NOTIFY_TACTICS=1` or explicit `LOGH_BATTLE_ENTRY_CODES=0x0f1f` for crash/RE sessions.

워크플로 `wyeb22m23`(6에이전트 심층 RE). 사용자 "게임 상태 바꾸는 방법 확실히 RE / 며칠째 전략맵 정체".

## 핵심 결론: 상태전환은 2개의 분리된 축. C002는 그 중 하나일 뿐.

### AXIS 1 — 씬 KIND (로그인↔월드↔패널)
- 전환자 = **`FUN_0054e570(DAT_02215e2c, kind)`**: `*mgr=kind`, 인스턴스 alloc(`FUN_0050b8e0`), 디스패치
  kind1→`FUN_005123b0`(로그인/로비)·kind2→`FUN_004ff3c0`(월드/전략)·kind3→`FUN_0051ca30`(패널/전술-ish), `**(mgr+0xc)=1`.
- **호출처 = FSM `FUN_004b68f0` 단 하나**(전 18k함수 유일). 즉 **씬 KIND는 어떤 와이어 핸들러도 안 씀**.
- 모드 바이트(+0x126711) writer = **`FUN_004c45f0`** 단독(mode2=전략 +0x2a58f8 / mode0=전술 +0x126718). FSM에서만 도달.
- → **씬 KIND 전환은 서버푸시 불가. 로컬 invoke(Frida/code-cave)로만** = 사용자 브루트포스 발상의 정답 축.

### ★AXIS 2 — 로드-트리거(전략↔전술 모드 전환) = **서버푸시 가능!**
- **`0x0f1f` NotifyTactics → `FUN_004c1b20`**: 전략맵 위(+0x2a58f8≠0)에서 payload byte0=1이면 load-arm:
  `+0x357e8c=2`(전술; byte0≠1이면 0=전략복귀)·`+0x357e84=0`·**`+0x357e88=0x3f800000`**·`*param=1`·`+4=1` = **클릭 없이 전환 시작**.
- `0x0b0a` NotifyEnterGridEnd(byte0≠0, mode==2): StrategySequence 시작(`*DAT_007ccffc=1, +4=1`).
- `0x0b09` NotifyEnterGridBegin: 0xb0a 분기 선택 게이트(+0x4376ec).
- `0x0b07` NotifyMovedGrid → `FUN_004bee20`(+0x2a58f8≠0 게이트): **클릭 없이 가시 마커 이동**.
- 레버 선택: 라이브로 `worldbase+0x3579cc` 읽어 0이면 0x0f1f, 아니면 0xb09+0xb0a.

### 입력 게이트(C002, 서버푸시 불가)
- 패널 오픈(+0x234 writer FUN_00577e70)·전략 위젯 클릭확정(event9, FUN_00501e30→FUN_00507f20)·씬KIND전환.
- **★C002(클릭)와 로드-트리거(상태전환)는 decoupled.** 수십 사이클 C002만 두드린 게 정체 원인.

## 액션 (정체 돌파, 권고 순)
1. 라이브 `worldbase+0x3579cc` 1-watch로 레버 선택.
2. **서버 기본 probe는 `0x042f`까지만 푸시** → 전략 UI 생존과 mode-change grant를 먼저 관측한다.
   `0x0f1f(byte0=1)`은 현재 `FUN_0058ee70` 크래시를 내므로, 선행조건 RE/crash bisection용 opt-in으로만 사용한다.
3. 안 되면 0xb09+0xb0a, 또는 0xb07(마커 이동).
4. 씬 KIND 전환(패널 등)은 Frida invoke `FUN_0054e570(DAT_02215e2c, kind)` (하네스 `abe52a7f`).

## 갭
- +0x35f35a / 스테이지 latch writer 미해결(라이브 watchpoint 필요) — 서버 0x0f-family가 간접 advance하는지.
- `FUN_004ff3c0`(kind2 월드씬) 내부 — "stars만, 전환불가" 증상이 여기 블록인지.
