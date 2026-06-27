"""LOGH VII 전략맵 "이동모드 진입 → 0x0b01 송신" 체인 Frida 상태 프로브.

이미 실행 중인 ``G7MTClient.exe``(=ui_explorer가 월드까지 띄워 둔 클라)에 **attach**해서
이동모드 상태머신의 핵심 함수들을 후킹하고, 함수 진입/이탈 시점의 전역·인스턴스 상태를
stdout + JSON으로 정밀 로깅한다. 목적은 ``docs/logh7-movemode-re.md`` §추정에서 가장 유력한
차단 지점(좌클릭이 목적지선택 대신 카메라 패닝으로 떨어지는 지점)을 라이브로 특정하는 것.

⚠️ 이 스크립트는 클라를 **spawn 하지 않는다**. ui_explorer가 이미 클라를 구동 중이라는 전제다
(스플래시 ~30초 대기·로그인·월드진입은 ui_explorer가 처리). 무모하게 클라를 띄우지 말 것.

------------------------------------------------------------------------------------------------
실행 방식 (attach 절차)
------------------------------------------------------------------------------------------------
1. 별도 콘솔에서 ui_explorer로 클라를 **전략맵(월드)까지** 띄운다(스플래시 ~30초 대기 후 로그인
   → 세션 → 캐릭 → 월드진입). 자세한 절차는 logh7-live 스킬 / docs/SESSION-HANDOFF-*.md 참조.
2. 클라 PID를 확인한다::

       tasklist | findstr /I G7MTClient

3. 그 PID로 이 프로브를 attach한다(레포 루트에서 모듈로 실행)::

       python -m tools.logh7_frida_movemode_probe --pid <G7MTClient PID> --seconds 60

   또는 프로세스명으로(여러 G7MTClient가 없을 때만 권장)::

       python -m tools.logh7_frida_movemode_probe --name G7MTClient.exe --seconds 60

4. attach가 걸려 "[ready] base=..." 가 찍히면, **그 클라 창에서** 함대를 클릭/우클릭하거나
   카테고리(이동) 단축키를 눌러 본다. 어느 훅이 찍히는지로 차단 지점을 특정한다:
     - ``catGate``(FUN_004fd100)만 찍히고 ``moveHandler``(FUN_00570a10)가 안 찍힘
       → 카테고리 다이얼로그 자체가 안 열림(입력/키바인딩 문제).
     - ``moveHandler`` 진입 시 ``this+0x48``(함대선택)이 0 → 함대 미선택(G5 링크 실패).
     - ``moveHandler``는 찍히는데 ``modeSetter``(FUN_004d51d0)가 mode=2로 안 불림
       → 카테고리에서 "이동" 항목이 선택 안 됨(항목 *(iVar7+0x14) 분기).
     - ``modeSetter(2)``까지 갔는데 좌클릭 후 ``navGate``(FUN_004d6310) 반환 false
       → 목적지 셀이 항행불가(terrain ∉ {1,3} / objectTable+0x3c==0 / 사거리초과).
     - 클릭이 ``PAN``(FUN_004f6f60)으로만 떨어짐 → 목적지선택 sub-state 미진입(최유력 차단).

------------------------------------------------------------------------------------------------
구문검증(클라 없이)
------------------------------------------------------------------------------------------------
- ``python -m tools.logh7_frida_movemode_probe --selfcheck`` : frida import + JS 구문 길이 +
  VA-rebase 단위검증만 수행(attach 없음, 클라 불필요). exit 0 = OK.
- frida.Script의 실제 JS 컴파일은 attach가 필요하므로 selfcheck는 컴파일까지는 안 한다
  (이 작업 범위는 스크립트 작성까지; 라이브런은 메인이 ui_explorer와 조율).

------------------------------------------------------------------------------------------------
VA-rebase 로직
------------------------------------------------------------------------------------------------
모든 Ghidra VA는 image-base 0x400000 기준이다. ASLR로 런타임 모듈베이스가 달라지므로
``runtime = moduleBase + (VA - 0x400000)`` 으로 rebase한다(기존 logh7_frida_trace.py의 G()와
동일 규약). JS측 ``G(a)``와 파이썬측 ``rebase_va()``가 같은 식을 쓴다.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 이미지 베이스(Ghidra VA 기준). 런타임 모듈베이스로 rebase하는 기준점.
IMAGE_BASE = 0x400000
CLIENT_MODULE = "G7MTClient.exe"


def rebase_va(va: int, module_base: int, image_base: int = IMAGE_BASE) -> int:
    """Ghidra VA(image_base 기준)를 런타임 모듈베이스로 rebase한다.

    JS측 G(a) = BASE.add(a - 0x400000) 과 동일한 식.
    """
    return module_base + (va - image_base)


# ------------------------------------------------------------------------------------------------
# 후킹 대상 함수 + 읽을 오프셋 (docs/logh7-movemode-re.md (c)/(d)·핵심 VA 색인 기준)
# ------------------------------------------------------------------------------------------------
# 각 항목: (이름, VA, 설명). JS측 TARGETS 와 1:1 매핑되며, 읽는 오프셋은 JS 본문에 함수별로 박혀 있다.
HOOK_TARGETS: list[tuple[str, int, str]] = [
    # 카테고리 다이얼로그 게이트: 메인 프레임 루프 → 전략맵 입력. onEnter에서 카테고리/취소
    # 결과 채널 전역(DAT_02214325/24)과 param_1+0xf4(상태) 로깅.
    ("catGate", 0x004FD100, "FUN_004fd100 카테고리 다이얼로그 게이트"),
    # 이동모드 핸들러(vtable[53]). onEnter에서 셀 채널 전역과 함대선택/모드/sub-state 로깅.
    ("moveHandler", 0x00570A10, "FUN_00570a10 이동모드 핸들러 (vtable[53])"),
    # 모드 세터: param_2(=설정 모드값). mode=2(이동/경로선택)로 불리는지 확인.
    ("modeSetter", 0x004D51D0, "FUN_004d51d0 모드세터 (param_2=mode, 2=이동)"),
    # 항행 게이트: onEnter 인자(목적지 셀) + onLeave 반환값(통과 여부=bool).
    ("navGate", 0x004D6310, "FUN_004d6310 항행 게이트 (셀 통과 여부)"),
    # (선택) 카메라 패닝: 호출만으로 "클릭이 패닝으로 샜다"는 신호.
    ("pan", 0x004F6F60, "FUN_004f6f60 카메라 패닝 (좌클릭이 패닝으로 샘)"),
    # --- 렌더-게이트 클러스터 (왜 함대가 안 보이나; logh7-client-re-frontier 워크플로 합성) ---
    # 렌더 FSM 게이트: turn-ready false면 함대/HUD 렌더 통째 스킵.
    ("renderGate", 0x004FEF90, "FUN_004fef90 렌더 FSM (turn-ready 게이트)"),
    # ★단일 분기점★ turn-ready 반환: 0이면 가설①(렌더 전부 스킵), 1이면 가설②(데이터/슬롯).
    ("turnReady", 0x004B7890, "FUN_004b7890 turn-ready (=FUN_004b8950()!=0)"),
    # recv 큐 스캐너: [*0x7ccffc]+0x3552b8 500엔트리 active(+0x10≠0) 카운트 → turn-ready 원천.
    ("recvQueueScan", 0x004B8950, "FUN_004b8950 recv 큐 스캔 (active 엔트리 → turn-ready)"),
    # own-fleet 렌더(case0): own_cell 읽어 함대 아이콘 배치. 4게이트 통과해야 그려짐.
    ("fleetRender", 0x0058D140, "FUN_0058d140 own-fleet 렌더 (own_cell 사용)"),
    # PLAYER_INFO 슬롯 리졸버: id 미스 시 0 반환 → 함대 렌더 데이터 없음(가설②).
    ("slotResolver", 0x004C7290, "FUN_004c7290 PLAYER_INFO 슬롯 리졸버 (miss=0)"),
    # --- 이동-명령 클러스터 (0x0b01 송신; logh7-client-re-frontier 합성). 플레이어 명령 프런티어. ---
    # ★0x0b01 송신 핵심★ FSM case 0x3a. 진입=명령이 와이어로 나갔다는 증거.
    ("sendB01", 0x0050D230, "FUN_0050d230 0x0b01 송신 (FSM case 0x3a)"),
    # 입력 접근자: param+offset 인덱스별 반환(어느 키/마우스 상태가 읽히나).
    ("inputAccessor", 0x0050CF40, "FUN_0050cf40 입력 상태 접근자"),
    # 클릭→셀 변환: 클릭 페이로드 → 셀 선택 상태스택 push.
    ("clickToCell", 0x004FD560, "FUN_004fd560 클릭→셀 변환"),
    # 셀 선택 상태머신: UI mode 갱신(0x0b01 송신 호출자).
    ("cellStatePush", 0x004FD7A0, "FUN_004fd7a0 셀 선택 상태 push"),
    # --- 입력-이벤트 소스 검증 클러스터 (클릭이 게임 이벤트시스템에 도달하나?) ---
    # ★클릭-이벤트 소스★ catGate가 iVar3=FUN_00502780(0,0) 후 *(iVar3+8)!=0면 클릭있음 판정. +8 읽어 도달 검증.
    ("inputEventSrc", 0x00502780, "FUN_00502780 입력-이벤트 소스 (+8=클릭 플래그)"),
    # 이벤트타입 매처: FUN_005015f0(type,evt,..) type4=좌클릭 type5=우클릭. 반환!=0=해당이벤트 발생.
    ("eventMatch", 0x005015F0, "FUN_005015f0 이벤트타입 매처 (4=L,5=R)"),
    # 우클릭 핸들러(type5 분기). 진입=우클릭이 이벤트시스템에 도달.
    ("rclickHandler", 0x004D4E90, "FUN_004d4e90 우클릭 핸들러"),
]

# 읽는 전역 DAT 주소 (Ghidra VA). JS측에서 동일 상수로 rebase하여 읽는다.
DAT_ADDRESSES: dict[str, int] = {
    # 카테고리 게이트(FUN_004fd100)에서 읽는 결과/취소 바이트 채널.
    "DAT_02214325": 0x02214325,
    "DAT_02214324": 0x02214324,
    # 이동 핸들러(FUN_00570a10)에서 읽는 셀/모드결과/전략맵 활성 채널.
    "DAT_009d2a3c": 0x009D2A3C,  # 모드/결과 값(0/2/3)
    "DAT_009d2a34": 0x009D2A34,  # 선택 그리드 셀ID (0x101=무효/취소)
    "DAT_02214bb0": 0x02214BB0,  # 전략맵 활성 플래그
    # --- 포인터 베이스(deref 1회 필요): 정적분석이 write를 놓친 이유 = mov ecx,[base]; mov [ecx+off],v ---
    "DAT_007ccffc": 0x007CCFFC,  # 월드매니저 베이스 포인터 (+0x3552b8 recv큐, +0x35837e command-phase 플래그, +8 fleet)
    "DAT_007cd04c": 0x007CD04C,  # 전략상태 베이스 포인터 (+0x11178 own-fleet cell)
    "DAT_007c25f4": 0x007C25F4,  # recv-큐 스캔 조건 전역
}

# 베이스 포인터에 더해질 오프셋(JS에서 derefBase 후 가산).
OFF_OWN_CELL = 0x11178       # [*0x7cd04c]+0x11178 = own-fleet cell (col+row*100)
OFF_RECV_QUEUE = 0x3552B8    # [*0x7ccffc]+0x3552b8 = recv 큐 head
OFF_CMD_PHASE = 0x35837E     # [*0x7ccffc]+0x35837e = command-phase 플래그


def build_js() -> str:
    """후킹 JS를 생성한다. 함수별 onEnter/onLeave에서 명시 오프셋을 읽어 send() 한다.

    안전: 각 Interceptor.attach는 try/catch로 감싸 훅 실패 시 스킵 + HOOK_FAIL 경고만 보낸다.
    포인터 역참조도 전부 try/catch로 보호한다(미초기화 전역/널 this 대비).
    """
    # 파이썬측 상수를 JS 리터럴로 직렬화(둘이 같은 값을 쓰도록 단일 출처화).
    targets_js = ",\n    ".join(
        f"{name!r}: 0x{va:x}" for name, va, _desc in HOOK_TARGETS
    )
    dats_js = ",\n    ".join(f"{name!r}: 0x{addr:x}" for name, addr in DAT_ADDRESSES.items())
    offs_js = (
        f"ownCell: 0x{OFF_OWN_CELL:x}, recvQueue: 0x{OFF_RECV_QUEUE:x}, cmdPhase: 0x{OFF_CMD_PHASE:x}"
    )

    return (
        r"""
'use strict';
// 모듈베이스 해석(ASLR). 기존 트레이서 G() 규약: runtime = BASE + (VA - 0x400000).
const mod = Process.getModuleByName('"""
        + CLIENT_MODULE
        + r"""');
const BASE = mod.base;
const IMAGE_BASE = """
        + f"0x{IMAGE_BASE:x}"
        + r""";
const G = (a) => BASE.add(a - IMAGE_BASE);   // VA → 런타임 포인터
const gh = (addr) => {                         // 런타임 포인터 → Ghidra VA 문자열(역매핑)
  try { return '0x' + addr.sub(BASE).add(IMAGE_BASE).toString(16); } catch (e) { return String(addr); }
};

const TARGETS = {
    """
        + targets_js
        + r"""
};
const DAT = {
    """
        + dats_js
        + r"""
};
const OFF = { """
        + offs_js
        + r""" };

// 안전한 메모리 리더 헬퍼 (실패 시 null).
function rdU8(va)  { try { return G(va).readU8();  } catch (e) { return null; } }
function rdU32(va) { try { return G(va).readU32(); } catch (e) { return null; } }
function hex(v)    { return (v === null || v === undefined) ? null : '0x' + (v >>> 0).toString(16); }
// this/포인터 기준 오프셋 읽기.
function offU8(base, off)  { try { return base.add(off).readU8();  } catch (e) { return null; } }
function offU32(base, off) { try { return base.add(off).readU32(); } catch (e) { return null; } }
// arg0 (스택 [esp+4]) 읽기 — __thiscall이면 this는 ecx, stdcall/cdecl 인자는 스택.
function stackArg(ctx, idx) {
  try { return ctx.esp.add(4 * (idx + 1)).readU32(); } catch (e) { return null; }
}

let HOOKED = [];
let FAILED = [];

// --- FUN_004fd100 카테고리 다이얼로그 게이트 ---------------------------------------------------
// onEnter: DAT_02214325 / DAT_02214324(결과·취소 바이트) + param_1+0xf4(상태).
//   호출규약상 첫 인자(param_1)는 ecx(thiscall) 또는 [esp+4](stdcall) 양쪽을 모두 캡처.
try {
  Interceptor.attach(G(TARGETS.catGate), {
    onEnter(args) {
      const ctx = this.context;
      const p1_ecx = ctx.ecx;                 // thiscall 가정 param_1
      const p1_stk = stackArg(ctx, 0);        // stdcall 가정 param_1
      let stateEcx = null, stateStk = null;
      try { stateEcx = p1_ecx.add(0xf4).readU32(); } catch (e) {}
      try { if (p1_stk) stateStk = ptr(p1_stk).add(0xf4).readU32(); } catch (e) {}
      send({
        fn: 'catGate', va: '0x4fd100',
        DAT_02214325: hex(rdU8(DAT.DAT_02214325)),
        DAT_02214324: hex(rdU8(DAT.DAT_02214324)),
        state_ecx_pf4: hex(stateEcx),
        state_stk_pf4: hex(stateStk),
        ecx: '0x' + ctx.ecx.toUInt32().toString(16),
      });
    },
  });
  HOOKED.push('catGate');
} catch (e) { FAILED.push('catGate'); send({ fn: 'HOOK_FAIL', target: 'catGate', err: String(e) }); }

// --- FUN_00570a10 이동모드 핸들러 (vtable[53], __thiscall: this=ecx) -----------------------------
// onEnter: DAT_009d2a3c / DAT_009d2a34(0x101 여부) / DAT_02214bb0
//          + this+0x48(함대선택 여부) / this+0x14(mode) / this+0xc(sub-state).
try {
  Interceptor.attach(G(TARGETS.moveHandler), {
    onEnter(args) {
      const self = this.context.ecx;          // vtable 메서드 → this=ecx
      const cell = rdU32(DAT.DAT_009d2a34);
      send({
        fn: 'moveHandler', va: '0x570a10',
        DAT_009d2a3c: hex(rdU32(DAT.DAT_009d2a3c)),
        DAT_009d2a34: hex(cell),
        cell_is_0x101: (cell === 0x101),       // true면 무효/취소 셀
        DAT_02214bb0: hex(rdU8(DAT.DAT_02214bb0)),
        this_p48_fleetSel: hex(offU32(self, 0x48)),  // !=0 이어야 함대 선택됨
        this_p14_mode: hex(offU32(self, 0x14)),      // 0/1/2 (2=이동)
        this_pc_substate: hex(offU8(self, 0x0c)),    // 1=목적지선택 / 2=확정 / 3=취소
        ecx: '0x' + self.toUInt32().toString(16),
      });
    },
  });
  HOOKED.push('moveHandler');
} catch (e) { FAILED.push('moveHandler'); send({ fn: 'HOOK_FAIL', target: 'moveHandler', err: String(e) }); }

// --- FUN_004d51d0 모드세터 (__thiscall: this=ecx, param_2=[esp+4]) -------------------------------
// onEnter: param_2(설정 모드값). mode=2(이동/경로) 호출되는지 핵심 신호.
try {
  Interceptor.attach(G(TARGETS.modeSetter), {
    onEnter(args) {
      const ctx = this.context;
      const mode = stackArg(ctx, 0);           // thiscall: 첫 명시 인자 = [esp+4]
      send({
        fn: 'modeSetter', va: '0x4d51d0',
        param2_mode: hex(mode),
        is_move_mode_2: (mode === 2),
        ecx_this: '0x' + ctx.ecx.toUInt32().toString(16),
      });
    },
  });
  HOOKED.push('modeSetter');
} catch (e) { FAILED.push('modeSetter'); send({ fn: 'HOOK_FAIL', target: 'modeSetter', err: String(e) }); }

// --- FUN_004d6310 항행 게이트 (셀x, 셀y, range) → bool -------------------------------------------
// onEnter: 인자(목적지 셀 좌표/사거리). onLeave: 반환값(통과 여부).
//   호출규약 미확정 구간이므로 스택 인자 3개를 모두 캡처(thiscall이면 this=ecx 별도).
try {
  Interceptor.attach(G(TARGETS.navGate), {
    onEnter(args) {
      const ctx = this.context;
      this._a0 = stackArg(ctx, 0);
      this._a1 = stackArg(ctx, 1);
      this._a2 = stackArg(ctx, 2);
      this._ecx = ctx.ecx.toUInt32();
    },
    onLeave(ret) {
      send({
        fn: 'navGate', va: '0x4d6310',
        arg0_cellx: hex(this._a0),
        arg1_celly: hex(this._a1),
        arg2_range: hex(this._a2),
        ecx_this: '0x' + (this._ecx >>> 0).toString(16),
        ret: ret.toInt32(),                    // 0=차단, !=0=통과
        passed: (ret.toInt32() !== 0),
      });
    },
  });
  HOOKED.push('navGate');
} catch (e) { FAILED.push('navGate'); send({ fn: 'HOOK_FAIL', target: 'navGate', err: String(e) }); }

// --- (선택) FUN_004f6f60 카메라 패닝 ------------------------------------------------------------
// 호출만으로 "좌클릭이 목적지선택이 아니라 패닝으로 떨어졌다"는 신호. 스팸 방지로 카운트만.
let PAN_COUNT = 0;
try {
  Interceptor.attach(G(TARGETS.pan), {
    onEnter(args) {
      PAN_COUNT += 1;
      // 처음 몇 번과 이후 16의 배수마다만 보고(이벤트 스팸 억제).
      if (PAN_COUNT <= 3 || (PAN_COUNT % 16) === 0) {
        send({ fn: 'PAN', va: '0x4f6f60', count: PAN_COUNT });
      }
    },
  });
  HOOKED.push('pan');
} catch (e) { FAILED.push('pan'); send({ fn: 'HOOK_FAIL', target: 'pan', err: String(e) }); }

// =============================================================================================
// 렌더-게이트 클러스터 — 왜 함대가 안 보이나 (logh7-client-re-frontier 워크플로 합성).
// 포인터 베이스(DAT_007ccffc/7cd04c)는 deref 1회 필요(정적이 write 놓친 이유: mov ecx,[base];mov [ecx+off],v).
// =============================================================================================
function derefBase(va) { try { const p = G(va).readU32(); return (p === 0) ? null : ptr(p); } catch (e) { return null; } }
function unpackCell(v) { return (v === null) ? null : { x: v % 100, y: (v / 100) | 0 }; }
const _seen = {};
function changed(key, val) { if (_seen[key] === val) return false; _seen[key] = val; return true; }
let _frame = 0;

// R2 ★단일 분기점★ turnReady 반환: 0=가설①(렌더 통째 스킵), 1=가설②(데이터/슬롯). 값 변할 때만 보고.
try {
  Interceptor.attach(G(TARGETS.turnReady), {
    onLeave(ret) { const r = ret.toInt32(); if (changed('turnReady', r)) send({ fn: 'turnReady', va: '0x4b7890', ret: r }); },
  });
  HOOKED.push('turnReady');
} catch (e) { FAILED.push('turnReady'); send({ fn: 'HOOK_FAIL', target: 'turnReady', err: String(e) }); }

// R3 recvQueueScan: [*0x7ccffc]+0x3552b8 500엔트리 active(+0x10≠0) 카운트 + DAT_007c25f4 + 반환.
try {
  Interceptor.attach(G(TARGETS.recvQueueScan), {
    onEnter(args) { this._wm = derefBase(DAT.DAT_007ccffc); },
    onLeave(ret) {
      const r = ret.toInt32();
      let active = null;
      try {
        if (this._wm) { const q = this._wm.add(OFF.recvQueue); active = 0;
          for (let i = 0; i < 500; i++) { if (q.add(i * 0x14 + 0x10).readU32() !== 0) active++; } }
      } catch (e) {}
      const cond = rdU32(DAT.DAT_007c25f4);
      if (changed('recvQueueScan', r + ':' + active + ':' + cond))
        send({ fn: 'recvQueueScan', va: '0x4b8950', ret: r, active: active, DAT_007c25f4: hex(cond) });
    },
  });
  HOOKED.push('recvQueueScan');
} catch (e) { FAILED.push('recvQueueScan'); send({ fn: 'HOOK_FAIL', target: 'recvQueueScan', err: String(e) }); }

// R6 fleetRender onEnter: own_cell 값/범위(스팸 억제: 첫4 + 64배수).
try {
  Interceptor.attach(G(TARGETS.fleetRender), {
    onEnter(args) {
      _frame++; if (_frame > 4 && (_frame % 64) !== 0) return;
      const sb = derefBase(DAT.DAT_007cd04c);
      let cell = null; try { if (sb) cell = sb.add(OFF.ownCell).readU32(); } catch (e) {}
      const c = unpackCell(cell);
      send({ fn: 'fleetRender', va: '0x58d140', frame: _frame, ownCell: cell, x: c ? c.x : null, y: c ? c.y : null,
             inRange: c ? (c.x >= 0 && c.x < 100 && c.y >= 0 && c.y < 50) : null });
    },
  });
  HOOKED.push('fleetRender');
} catch (e) { FAILED.push('fleetRender'); send({ fn: 'HOOK_FAIL', target: 'fleetRender', err: String(e) }); }

// R8 slotResolver onEnter/onLeave: id + 반환(0=miss=가설②).
try {
  Interceptor.attach(G(TARGETS.slotResolver), {
    onEnter(args) { this._id = stackArg(this.context, 0); },
    onLeave(ret) { const r = ret.toUInt32();
      if (changed('slotResolver', (this._id >>> 0) + ':' + (r !== 0)))
        send({ fn: 'slotResolver', va: '0x4c7290', id: hex(this._id), ret: hex(r), miss: (r === 0) }); },
  });
  HOOKED.push('slotResolver');
} catch (e) { FAILED.push('slotResolver'); send({ fn: 'HOOK_FAIL', target: 'slotResolver', err: String(e) }); }

// R1 renderGate(FUN_004fef90, __fastcall: param_1=ecx). FSM 상태 *(param_1+4) 로깅 — case0(상태0)=함대렌더,
// case1(상태1)=HUD. fleetRender 0회면 상태가 0으로 안 돌아오는 것. 상태 변할 때만 보고.
try {
  Interceptor.attach(G(TARGETS.renderGate), {
    onEnter(args) {
      let st = null; try { st = this.context.ecx.add(4).readU32(); } catch (e) {}
      if (changed('fsmState', st)) send({ fn: 'renderGate', va: '0x4fef90', fsmState: st });
    },
  });
  HOOKED.push('renderGate');
} catch (e) { FAILED.push('renderGate'); send({ fn: 'HOOK_FAIL', target: 'renderGate', err: String(e) }); }

// W1 own_cell write-watch: [*0x7cd04c]+0x11178 (4B). 트리거 시 backtrace로 writer VA 특정.
try {
  const sb = derefBase(DAT.DAT_007cd04c);
  if (sb) {
    const cellAddr = sb.add(OFF.ownCell);
    MemoryAccessMonitor.enable([{ base: cellAddr, size: 4 }], {
      onAccess(details) {
        if (details.operation === 'write') {
          let bt = []; try { bt = Thread.backtrace(details.context, Backtracer.ACCURATE).slice(0, 6).map(gh); } catch (e) {}
          send({ fn: 'OWNCELL_WRITE', addr: String(details.address), from: gh(details.from), bt: bt });
        }
      },
    });
    send({ fn: 'WATCH_ARMED', target: 'own_cell', addr: String(cellAddr) });
  } else { send({ fn: 'WATCH_SKIP', target: 'own_cell', reason: 'DAT_007cd04c null (월드 미진입?)' }); }
} catch (e) { send({ fn: 'HOOK_FAIL', target: 'own_cell_watch', err: String(e) }); }

// === 이동-명령 클러스터 (0x0b01 송신 경로). 플레이어가 함대를 직접 이동시키는 프런티어. ===
// C1 sendB01(FUN_0050d230): 0x0b01 송신 핵심. 진입=명령이 와이어로 나갔다는 직접 증거.
// 이게 안 찍히면 입력게이트(클릭→셀)에서 막힌 것, 찍히는데 서버 미수신이면 송신측 문제.
try {
  Interceptor.attach(G(TARGETS.sendB01), {
    onEnter(args) { send({ fn: 'sendB01', va: '0x50d230', note: '0x0b01 송신 진입' }); },
  });
  HOOKED.push('sendB01');
} catch (e) { FAILED.push('sendB01'); send({ fn: 'HOOK_FAIL', target: 'sendB01', err: String(e) }); }

// C3 clickToCell(FUN_004fd560): 클릭 페이로드 → 셀 선택. 진입=좌클릭이 목적지선택으로 라우팅됨
// (PAN으로만 떨어지면 이게 안 찍힘 = 최유력 차단). 진입만 보고(인자 의미 미확정).
try {
  Interceptor.attach(G(TARGETS.clickToCell), {
    onEnter(args) { if (changed('clickToCell', '1')) send({ fn: 'clickToCell', va: '0x4fd560', note: '클릭→셀 진입' }); },
  });
  HOOKED.push('clickToCell');
} catch (e) { FAILED.push('clickToCell'); send({ fn: 'HOOK_FAIL', target: 'clickToCell', err: String(e) }); }

// C2 inputAccessor(FUN_0050cf40, __thiscall(this, idx)): 입력-상태 테이블 룩업 *(this+4+idx*4), 115엔트리.
// ★게이트 핵심★ FUN_004fc470이 inputAccessor(0x6a)!=0를 요구 → 이동경로 전체가 액션 0x6a(106)에 게이트.
// idx 0x6a/0x32(catGate 관련)만 change-gated 로깅 → 어느 입력 순간 0x6a가 켜지는지 라이브 특정.
try {
  Interceptor.attach(G(TARGETS.inputAccessor), {
    onEnter(args) { this._idx = stackArg(this.context, 0); },
    onLeave(ret) {
      const idx = (this._idx >>> 0); if (idx !== 0x6a && idx !== 0x32) return;
      const r = ret.toUInt32();
      if (changed('inputAcc:' + idx, r)) send({ fn: 'inputAccessor', va: '0x50cf40', idx: hex(idx), ret: hex(r), active: (r !== 0) });
    },
  });
  HOOKED.push('inputAccessor');
} catch (e) { FAILED.push('inputAccessor'); send({ fn: 'HOOK_FAIL', target: 'inputAccessor', err: String(e) }); }

// C4 cellStatePush(FUN_004fd7a0): 셀 선택 상태 push(0x0b01 송신 호출자 후보). 진입만 보고.
try {
  Interceptor.attach(G(TARGETS.cellStatePush), {
    onEnter(args) { send({ fn: 'cellStatePush', va: '0x4fd7a0', note: '셀 선택 push 진입' }); },
  });
  HOOKED.push('cellStatePush');
} catch (e) { FAILED.push('cellStatePush'); send({ fn: 'HOOK_FAIL', target: 'cellStatePush', err: String(e) }); }

// Z2 입력게이트 write-watch: DAT_02214325 &0x40 = 이동모드 진입 비트(추정). 누가/언제 set하나.
// 값이 영영 안 바뀌면 입력게이트가 닫힌 채라 클릭이 이동선택으로 안 감(차단 가설).
try {
  const gateAddr = G(DAT.DAT_02214325 || 0x02214325);
  MemoryAccessMonitor.enable([{ base: gateAddr, size: 1 }], {
    onAccess(details) {
      if (details.operation === 'write') {
        let v = null; try { v = gateAddr.readU8(); } catch (e) {}
        send({ fn: 'INPUTGATE_WRITE', addr: String(details.address), from: gh(details.from), val: v });
      }
    },
  });
  send({ fn: 'WATCH_ARMED', target: 'input_gate', addr: String(gateAddr) });
} catch (e) { send({ fn: 'HOOK_FAIL', target: 'input_gate_watch', err: String(e) }); }

// === 입력-이벤트 소스 검증 클러스터 (마우스 클릭이 게임 이벤트시스템에 도달하는지 판정) ===
// E1 inputEventSrc(FUN_00502780): onLeave에서 *(ret+8)(클릭 플래그) 읽기. 평소 0, 내 클릭 순간 !=0면
// 클릭이 이벤트시스템에 도달(=차단은 hit-test/선택가능성). 영영 0이면 주입이 이벤트소스에 안 닿음.
try {
  Interceptor.attach(G(TARGETS.inputEventSrc), {
    onLeave(ret) {
      let flag = null; try { flag = ptr(ret.toUInt32()).add(8).readU8(); } catch (e) {}
      // 버그수정: flag==0도 로깅(전이 추적)해야 1→0→1 클릭사이클을 탐지(이전엔 0 스킵→changed 리셋 안돼 누락).
      if (flag !== null && changed('evtFlag', flag))
        send({ fn: 'inputEventSrc', va: '0x502780', evtPtr: hex(ret.toUInt32()), clickFlag: flag });
    },
  });
  HOOKED.push('inputEventSrc');
} catch (e) { FAILED.push('inputEventSrc'); send({ fn: 'HOOK_FAIL', target: 'inputEventSrc', err: String(e) }); }

// E2 eventMatch(FUN_005015f0, __thiscall/cdecl: arg0=type 4=L/5=R): 반환!=0=해당 클릭이벤트 발생.
// 진입+반환 로깅(type별 change-gated) → 좌/우클릭이 매처를 통과하는 순간 포착.
try {
  Interceptor.attach(G(TARGETS.eventMatch), {
    onEnter(args) { this._t = stackArg(this.context, 0); },
    onLeave(ret) { const t = (this._t >>> 0) & 0xff, r = ret.toUInt32();
      if ((t === 4 || t === 5) && r !== 0 && changed('evtMatch:' + t, r))
        send({ fn: 'eventMatch', va: '0x5015f0', type: t, ret: hex(r), note: (t===4?'좌클릭':'우클릭') + ' 이벤트 통과' }); },
  });
  HOOKED.push('eventMatch');
} catch (e) { FAILED.push('eventMatch'); send({ fn: 'HOOK_FAIL', target: 'eventMatch', err: String(e) }); }

// E3 rclickHandler(FUN_004d4e90): catGate의 type5 분기. 진입=우클릭이 catGate 클릭경로까지 도달.
try {
  Interceptor.attach(G(TARGETS.rclickHandler), {
    onEnter(args) { send({ fn: 'rclickHandler', va: '0x4d4e90', note: '우클릭 핸들러 진입' }); },
  });
  HOOKED.push('rclickHandler');
} catch (e) { FAILED.push('rclickHandler'); send({ fn: 'HOOK_FAIL', target: 'rclickHandler', err: String(e) }); }

// === Win32 입력 API 관찰 (인-월드 입력원 판정 — DirectInput vs GetAsyncKeyState) ===
// Z3 GetAsyncKeyState: 게임이 폴링하는 VK 중 '눌림'으로 잡히는 것을 보고(VK별 change-gated). PostMessage는
// 이 API를 못 바꾸지만 keybd_event(하드웨어)는 바꾼다 → 내 주입 키가 여기 pressed로 뜨면 keybd_event 경로 유효.
try {
  const gaks = Module.findExportByName('user32.dll', 'GetAsyncKeyState');
  if (gaks) {
    Interceptor.attach(gaks, {
      onEnter(args) { this._vk = args[0].toInt32(); },
      onLeave(ret) {
        if (((ret.toInt32() & 0x8000) !== 0) && changed('gaks:' + this._vk, '1'))
          send({ fn: 'GetAsyncKeyState', vk: hex(this._vk), pressed: true });
      },
    });
    HOOKED.push('GetAsyncKeyState');
  } else { send({ fn: 'HOOK_SKIP', target: 'GetAsyncKeyState', reason: 'export not found' }); }
} catch (e) { FAILED.push('GetAsyncKeyState'); send({ fn: 'HOOK_FAIL', target: 'GetAsyncKeyState', err: String(e) }); }

send({ fn: '__ready__', base: BASE.toString(), hooked: HOOKED, failed: FAILED });
"""
    )


def selfcheck() -> int:
    """클라 없이 가능한 자가검증: import + VA-rebase 단위검증 + JS 빌드(구문 길이) 확인."""
    import frida  # noqa: F401  # import 가능 여부 검증

    ok = True

    # 1) VA-rebase 단위검증: image-base 자체는 모듈베이스로 그대로 매핑.
    base = 0x00C70000  # 임의 런타임 베이스(ASLR 가정값)
    assert rebase_va(IMAGE_BASE, base) == base, "image-base rebase 실패"
    for name, va, _desc in HOOK_TARGETS:
        expect = base + (va - IMAGE_BASE)
        got = rebase_va(va, base)
        if got != expect:
            print(f"[selfcheck] FAIL rebase {name} {hex(va)} -> {hex(got)} != {hex(expect)}")
            ok = False
    # 대표값 직접 확인(0x4fd100 등이 base+오프셋으로 맞는지).
    assert rebase_va(0x004FD100, base) == base + 0x000FD100
    assert rebase_va(0x00570A10, base) == base + 0x00170A10
    assert rebase_va(0x004D51D0, base) == base + 0x000D51D0
    assert rebase_va(0x004D6310, base) == base + 0x000D6310
    assert rebase_va(0x004F6F60, base) == base + 0x000F6F60
    # 이동-명령 클러스터 대표 VA.
    assert rebase_va(0x0050D230, base) == base + 0x0010D230
    assert rebase_va(0x004FD560, base) == base + 0x000FD560
    assert rebase_va(0x004FD7A0, base) == base + 0x000FD7A0

    # 2) JS 빌드: 구문 길이 + 핵심 토큰 존재(컴파일은 attach 필요하므로 여기선 생략).
    js = build_js()
    assert len(js) > 500, "JS 본문이 비정상적으로 짧음"
    for token in (
        "catGate", "moveHandler", "modeSetter", "navGate", "PAN", "__ready__",
        # 렌더-게이트 클러스터 신규 토큰.
        "turnReady", "recvQueueScan", "fleetRender", "slotResolver", "renderGate",
        "OWNCELL_WRITE", "derefBase", "MemoryAccessMonitor",
        # 이동-명령 클러스터 신규 토큰.
        "sendB01", "clickToCell", "cellStatePush", "INPUTGATE_WRITE", "inputAccessor",
        # 입력-이벤트 소스 검증 클러스터.
        "inputEventSrc", "eventMatch", "rclickHandler",
        # Win32 입력 API 관찰(인-월드 입력원 판정).
        "GetAsyncKeyState",
    ):
        if token not in js:
            print(f"[selfcheck] FAIL JS에 토큰 누락: {token}")
            ok = False
    # OFF 상수(베이스+오프셋)가 JS에 들어갔는지.
    for off in (OFF_OWN_CELL, OFF_RECV_QUEUE, OFF_CMD_PHASE):
        if f"0x{off:x}" not in js:
            print(f"[selfcheck] FAIL JS에 OFF 0x{off:x} 누락")
            ok = False
    # 각 타깃 VA가 JS 리터럴로 들어갔는지.
    for name, va, _desc in HOOK_TARGETS:
        if f"0x{va:x}" not in js:
            print(f"[selfcheck] FAIL JS에 {name} VA 0x{va:x} 누락")
            ok = False
    # 각 DAT 주소가 JS에 들어갔는지.
    for name, addr in DAT_ADDRESSES.items():
        if f"0x{addr:x}" not in js:
            print(f"[selfcheck] FAIL JS에 {name} 주소 0x{addr:x} 누락")
            ok = False

    if ok:
        print("[selfcheck] OK: frida import + VA-rebase + JS 빌드 검증 통과")
        print(f"[selfcheck] hooks={len(HOOK_TARGETS)} dats={len(DAT_ADDRESSES)} js_len={len(js)}")
        return 0
    print("[selfcheck] FAILED")
    return 1


def _resolve_pid(name: str) -> int:
    """프로세스명으로 PID 해석(여러 개면 에러).

    frida 17.x는 top-level enumerate_processes()가 없으므로 local device 경유로 열거한다.
    """
    import frida

    processes = frida.get_local_device().enumerate_processes()
    matches = [p for p in processes if p.name.lower() == name.lower()]
    if not matches:
        raise SystemExit(f"프로세스 '{name}' 미발견 — ui_explorer로 클라를 먼저 띄울 것. (tasklist 확인)")
    if len(matches) > 1:
        pids = ", ".join(str(p.pid) for p in matches)
        raise SystemExit(f"'{name}' 프로세스 {len(matches)}개({pids}) — --pid 로 명시할 것.")
    return matches[0].pid


def attach_and_probe(pid: int, seconds: int, out: Path) -> int:
    """실행 중인 클라에 attach해서 후킹 JS를 로드하고, seconds 동안 이벤트를 수집한다.

    이 함수는 라이브런 경로다(메인이 ui_explorer와 조율해 호출). 클라를 spawn하지 않는다.
    """
    import frida

    events: list[dict] = []

    def on_message(message, data):
        if message.get("type") == "send":
            payload = message["payload"]
            events.append(payload)
            _print_event(payload)
        else:
            err = {"fn": "ERROR", "raw": str(message)}
            events.append(err)
            print("  [error]", json.dumps(err, ensure_ascii=False))

    print(f"[attach] pid={pid} module={CLIENT_MODULE}")
    session = frida.attach(pid)
    script = session.create_script(build_js())
    script.on("message", on_message)
    try:
        script.load()
        print(f"[probe] {seconds}s 동안 입력을 받습니다 — 그 클라 창에서 함대 클릭/우클릭/키 입력을 해보세요.")
        time.sleep(seconds)
    finally:
        try:
            script.unload()
        except Exception:
            pass
        try:
            session.detach()
        except Exception:
            pass

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[done] captured {len(events)} events -> {out}")
    _print_summary(events)
    return 0


def _print_event(e: dict) -> None:
    fn = e.get("fn", "?")
    if fn == "__ready__":
        print(f"  [ready] base={e.get('base')} hooked={e.get('hooked')} failed={e.get('failed')}")
    elif fn == "HOOK_FAIL":
        print(f"  [HOOK_FAIL] {e.get('target')}: {e.get('err')}")
    else:
        # 핵심 상태 필드만 압축 출력.
        rest = {k: v for k, v in e.items() if k not in ("fn", "va")}
        print(f"  {fn}({e.get('va','')}) {json.dumps(rest, ensure_ascii=False)}")


def _print_summary(events: list[dict]) -> None:
    counts: dict[str, int] = {}
    for e in events:
        counts[e.get("fn", "?")] = counts.get(e.get("fn", "?"), 0) + 1
    print("[summary] 훅별 히트수:")
    for fn, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {fn}: {n}")
    # 차단 지점 힌트.
    if counts.get("catGate", 0) and not counts.get("moveHandler", 0):
        print("    → 힌트: 카테고리 게이트는 돌았으나 이동핸들러 미진입(다이얼로그 미오픈/입력 문제).")
    if counts.get("moveHandler", 0) and not counts.get("modeSetter", 0):
        print("    → 힌트: 이동핸들러 진입했으나 모드세터 미호출(함대선택 this+0x48==0 또는 항목분기).")
    if counts.get("pan", 0) and not counts.get("navGate", 0):
        print("    → 힌트: 클릭이 패닝(FUN_004f6f60)으로만 소비 — 목적지선택 sub-state 미진입(최유력).")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--pid", type=int, default=None, help="attach할 G7MTClient PID (tasklist로 확인)")
    g.add_argument("--name", type=str, default=None, help="attach할 프로세스명 (예: G7MTClient.exe)")
    p.add_argument("--seconds", type=int, default=60, help="이벤트 수집 시간(초)")
    p.add_argument(
        "--out",
        type=Path,
        default=ROOT / ".omo/ui-explorer/frida-movemode-probe.json",
        help="이벤트 JSON 출력 경로",
    )
    p.add_argument("--selfcheck", action="store_true", help="클라 없이 import+VA-rebase+JS빌드만 검증")
    args = p.parse_args(argv)

    if args.selfcheck:
        return selfcheck()

    if args.pid is None and args.name is None:
        # 안전: attach 대상이 없으면 spawn 금지 — 자가검증만 안내.
        p.error("--pid 또는 --name 중 하나가 필요합니다 (ui_explorer로 띄운 클라에 attach). "
                "클라 없이 검증만 하려면 --selfcheck.")

    pid = args.pid if args.pid is not None else _resolve_pid(args.name)
    return attach_and_probe(pid, args.seconds, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
