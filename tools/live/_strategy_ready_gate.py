from __future__ import annotations

# LOGH VII 라이브QA 공용 strategy-ready 게이트.
#
# 왜 필요한가 (결함 A):
#   기존 게이트는 selection.hudModeF4 in (1, 2) 하나만 확인했다. 그런데 hudModeF4 는
#   "NOW LOADING" 로딩 화면에서 이미 1 이 된다 — 실측 근거:
#     .omo/live-qa/m3-baseinfo-view-trigger-discovery-20260713/
#       snapshots.jsonl 첫 레코드: selection = {"hudModeF4": 1}
#       shots/00-strategy-ready.png : 화면은 NOW LOADING (HUD 전무)
#   즉 hudModeF4 단독 게이트는 로딩 중에 통과한다. 그 뒤 클릭은 전부 로딩 화면에
#   꽂히고 런 전체가 무의미해진다 (B70~B74 계열 반복 실패의 근인).
#
# 강화 원칙:
#   맵이 "실제로 렌더됐다"를 메모리 관측 사실의 논리곱으로 요구한다. sleep 을 늘려
#   때우지 않는다. 타임아웃이면 fail-closed (StrategyNotReady) — 조용히 진행 금지.

from typing import Callable, Optional

# 화면 좌표로 인정할 상한. 위젯 원점 자리에서 포인터값(0x1337xxxx 등)이 읽히는
# 사고를 잡아내기 위한 안전망 — B74 는 원점 (322313472, 322290148) 을 그대로 믿고
# 화면 밖 (322313510, 322290155) 을 클릭했다.
MAX_SCREEN_COORD = 4096

# 게이트가 "안정적으로" 참인지 확인할 연속 관측 횟수. 렌더 직전 한 프레임만
# 조건이 스치는 경우를 배제한다.
DEFAULT_STABLE_POLLS = 3


class StrategyNotReady(RuntimeError):
    """전략맵이 렌더 완료 상태에 도달하지 못했다 (fail-closed)."""

    def __init__(self, message: str, detail: dict):
        super().__init__(message)
        self.detail = detail


def is_plausible_screen_xy(x, y, width: Optional[int] = None, height: Optional[int] = None) -> bool:
    """정수이고 클라이언트 화면 범위 안이면 True. 포인터 쓰레기값을 걸러낸다."""
    if not isinstance(x, int) or not isinstance(y, int):
        return False
    if isinstance(x, bool) or isinstance(y, bool):
        return False
    limit_x = width if isinstance(width, int) and width > 0 else MAX_SCREEN_COORD
    limit_y = height if isinstance(height, int) and height > 0 else MAX_SCREEN_COORD
    return 0 <= x <= limit_x and 0 <= y <= limit_y


def _nonnull_ptr(value) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        return int(value, 16) != 0
    except ValueError:
        return False


def extract_ready_signals(snap: dict) -> dict:
    """스냅샷(두 프로브 스키마 모두)에서 게이트 판정 입력만 뽑아낸다.

    새 프로브는 공통 블록 snap['strategyReady'] 를 내보낸다. 과거 evdir 픽스처는
    그 블록이 없으므로 legacy 경로(selection/systemDetail)에서 파생한다.
    """
    ready = snap.get('strategyReady') or {}
    sel = snap.get('selection') or {}

    hud_mode = ready.get('hudModeF4')
    if hud_mode is None:
        hud_mode = sel.get('hudModeF4')

    import_complete = ready.get('strategyFieldImportComplete')
    if import_complete is None:
        joins = ((snap.get('systemDetail') or {}).get('joins') or {}).get('expected') or {}
        import_complete = joins.get('strategyFieldImportComplete')

    hud_root = ready.get('hudRootPtr')
    if hud_root is None:
        hud_root = (sel.get('root') or {}).get('ptr')

    hud_origin = ready.get('hudOrigin')
    if hud_origin is None:
        hud_origin = sel.get('origin')

    rows_with_geometry = ready.get('hudRowsWithGeometry')
    if rows_with_geometry is None:
        rows_with_geometry = 0
        for row in (sel.get('rows') or []):
            primary = (row or {}).get('primary') or {}
            w = primary.get('rectW2c')
            h = primary.get('rectH30')
            if isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0:
                rows_with_geometry += 1

    return {
        'hudModeF4': hud_mode,
        'strategyFieldImportComplete': import_complete,
        'hudRootPtr': hud_root,
        'hudOrigin': hud_origin,
        'hudRowsWithGeometry': rows_with_geometry,
    }


def evaluate_strategy_ready(snap: dict, width: Optional[int] = None,
                            height: Optional[int] = None) -> dict:
    """스냅샷 1건이 '전략맵 렌더 완료'인지 판정. 모든 조건의 논리곱."""
    sig = extract_ready_signals(snap)
    origin = sig['hudOrigin'] if isinstance(sig['hudOrigin'], dict) else {}

    checks = {
        # 1) HUD 모드가 맵 모드. (단독으로는 NOW LOADING 중에도 참 — 반드시 아래와 함께)
        'hudMode': sig['hudModeF4'] in (1, 2),
        # 2) 전략필드 import 완료 플래그(clientBase+0x2a58fa).
        'importComplete': sig['strategyFieldImportComplete'] is True,
        # 3) HUD 위젯 트리가 실제로 생성됨(루트 포인터 non-null).
        'hudTreeBuilt': _nonnull_ptr(sig['hudRootPtr']),
        # 4) HUD 루트 원점이 진짜 화면 좌표(포인터 쓰레기값이 아님).
        'hudOriginPlausible': is_plausible_screen_xy(
            origin.get('x'), origin.get('y'), width, height),
        # 5) HUD 행 위젯이 실제 rect 기하를 가짐 — 렌더 레이아웃이 돌았다는 증거.
        'hudRowsRendered': sig['hudRowsWithGeometry'] >= 1,
    }
    ready = all(checks.values())
    return {
        'ready': ready,
        'checks': checks,
        'signals': sig,
        'failed': sorted(name for name, ok in checks.items() if not ok),
    }


def wait_strategy_ready(snapshot_fn: Callable[[], dict], timeout_s: float,
                        sleep_fn: Callable[[float], None],
                        monotonic_fn: Callable[[], float],
                        width: Optional[int] = None, height: Optional[int] = None,
                        stable_polls: int = DEFAULT_STABLE_POLLS,
                        poll_interval_s: float = 0.5,
                        alive_fn: Optional[Callable[[], bool]] = None) -> dict:
    """전략맵 렌더 완료까지 폴링. 연속 stable_polls 회 통과해야 인정.

    타임아웃/클라 종료 시 StrategyNotReady 를 던진다 (fail-closed). 폴백 없음.
    """
    deadline = monotonic_fn() + timeout_s
    consecutive = 0
    last = None
    polls = 0
    while monotonic_fn() < deadline:
        if alive_fn is not None and not alive_fn():
            raise StrategyNotReady('client exited before strategy map rendered', {
                'polls': polls, 'last': last,
            })
        snap = snapshot_fn()
        polls += 1
        last = evaluate_strategy_ready(snap, width, height)
        if last['ready']:
            consecutive += 1
            if consecutive >= stable_polls:
                return {'ready': True, 'polls': polls, 'stablePolls': consecutive,
                        'checks': last['checks'], 'signals': last['signals'], 'snapshot': snap}
        else:
            consecutive = 0
        sleep_fn(poll_interval_s)
    raise StrategyNotReady('strategy map did not reach rendered state within timeout', {
        'timeoutSeconds': timeout_s, 'polls': polls,
        'stableRequired': stable_polls, 'stableReached': consecutive,
        'lastChecks': (last or {}).get('checks'),
        'lastFailed': (last or {}).get('failed'),
        'lastSignals': (last or {}).get('signals'),
    })
