from __future__ import annotations

# LOGH VII 라이브QA: 拠点(base) SelectDialog 좌측 목록의 행 클릭 좌표 계산기.
#
# 왜 필요한가 (결함 B):
#   B73 은 화면 좌표를 세로로 스윕해 찍었고(카메라가 세션마다 움직여 고정 좌표가
#   무의미 — B72 run1 (418,388) / run2 (595,385) / run3 (505,388)), B74 는 tracer 가
#   준 "원점"을 검증 없이 믿었다. 그 원점은 사실 포인터 쓰레기값이었다:
#     .omo/live-qa/m3-B74-rect-deterministic-20260713/step-d-base-row.json
#       parentOrigin = (322313472, 322290148)   ← 0x1337xxxx 대역 = 포인터
#       screen       = (322313510, 322290155)   ← 화면 밖을 클릭했다
#   두 런 모두 ["base-row-70", false]. 원인은 拠点 목록이 안 열린 게 아니라
#   (itemCount=1, rows[0].baseIdAt08=70 — 목록엔 base 70 이 분명히 있다)
#   클릭 좌표를 못 만든 것.
#
# 이 모듈의 계약:
#   - 행 인덱스는 목록 데이터(baseIdAt08)에서 매칭한다. 화면 위치 추측 금지.
#   - 절대 원점과 행 기하는 클라 메모리에서 온 값만 쓰되 전부 타당성 검증한다.
#   - 하나라도 못 구하면 조용히 진행하지 않고 SpotRowUnresolved 로 fail-closed.

from typing import Optional

from _strategy_ready_gate import is_plausible_screen_xy

# 원점 후보 우선순위. 새 tracer 는 originCandidates 를 직접 내보내고,
# 과거 evdir 픽스처는 아래 legacy 필드만 갖고 있다.
LEGACY_ORIGIN_FIELDS = ('listOrigin', 'parentOrigin')


class SpotRowUnresolved(RuntimeError):
    """拠点 행 클릭 좌표를 결정적으로 산출할 수 없다 (fail-closed)."""

    def __init__(self, reason: str, detail: dict):
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


def _origin_xy(origin) -> Optional[tuple]:
    if not isinstance(origin, dict):
        return None
    x, y = origin.get('x'), origin.get('y')
    if x is None or y is None:
        return None
    return (x, y)


def collect_origin_candidates(spot: dict) -> list:
    """원점 후보를 (이름, x, y) 로 모은다. 검증은 하지 않는다(호출측이 판정)."""
    out = []
    for cand in (spot.get('originCandidates') or []):
        if not isinstance(cand, dict):
            continue
        xy = _origin_xy(cand)
        if xy is not None:
            out.append((cand.get('name') or 'unnamed', xy[0], xy[1]))
    for index, col in enumerate(spot.get('columns') or []):
        xy = _origin_xy((col or {}).get('origin'))
        if xy is not None:
            out.append((f'columns{index}', xy[0], xy[1]))
    for field in LEGACY_ORIGIN_FIELDS:
        xy = _origin_xy(spot.get(field))
        if xy is not None:
            out.append((field, xy[0], xy[1]))
    return out


def find_row_index(spot: dict, base_id: int) -> int:
    """목록 데이터에서 base_id 를 가진 행의 인덱스를 찾는다(화면 추측 금지)."""
    rows = spot.get('rows') or []
    for row in rows:
        if (row or {}).get('baseIdAt08') == base_id:
            index = (row or {}).get('index')
            return index if isinstance(index, int) else rows.index(row)
    raise SpotRowUnresolved('base-row-not-in-list', {
        'baseId': base_id,
        'itemCount': spot.get('itemCount8e4'),
        'rowBaseIds': [(r or {}).get('baseIdAt08') for r in rows],
    })


def resolve_row_geometry(spot: dict) -> dict:
    """행 stride/높이/폭. tracer 가 명시적으로 준 값만 신뢰한다."""
    geom = spot.get('rowGeometry') or {}
    row_height = geom.get('rowHeight')
    if not isinstance(row_height, int) or row_height <= 0:
        raise SpotRowUnresolved('row-geometry-unavailable', {
            'rowGeometry': geom or None,
            'why': 'tracer가 행 높이(rowHeight)를 노출하지 않았다 — 추측 금지',
        })
    row_top = geom.get('rowTop') if isinstance(geom.get('rowTop'), int) else 0
    cell = (spot.get('columns') or [{}])[0] or {}
    rect = cell.get('rectAt20') or {}
    row_width = geom.get('rowWidth')
    if not isinstance(row_width, int) or row_width <= 0:
        row_width = rect.get('width')
    if not isinstance(row_width, int) or row_width <= 0:
        raise SpotRowUnresolved('row-geometry-unavailable', {
            'rowGeometry': geom or None, 'columnRect': rect or None,
            'why': '행 폭을 컬럼 셀 rect 에서도 얻지 못했다',
        })
    return {
        'rowHeight': row_height,
        'rowTop': row_top,
        'rowWidth': row_width,
        'cellX': rect.get('x') if isinstance(rect.get('x'), int) else 0,
        'cellY': rect.get('y') if isinstance(rect.get('y'), int) else 0,
    }


def resolve_base_row_click(spot: dict, base_id: int, width: Optional[int] = None,
                           height: Optional[int] = None) -> dict:
    """base_id 행의 클릭 기준점(참조 해상도 좌표)을 결정적으로 산출한다.

    실패 시 SpotRowUnresolved — 좌표를 지어내지 않는다.
    """
    row_index = find_row_index(spot, base_id)
    geom = resolve_row_geometry(spot)

    candidates = collect_origin_candidates(spot)
    rejected = []
    origin = None
    for name, ox, oy in candidates:
        if is_plausible_screen_xy(ox, oy, width, height):
            origin = (name, ox, oy)
            break
        rejected.append({'name': name, 'x': ox, 'y': oy, 'reason': 'implausible-screen-xy'})
    if origin is None:
        raise SpotRowUnresolved('no-plausible-origin', {
            'baseId': base_id, 'rowIndex': row_index,
            'candidates': [{'name': n, 'x': x, 'y': y} for n, x, y in candidates],
            'rejected': rejected,
            'why': '원점 후보가 없거나 전부 화면 좌표 범위를 벗어났다(포인터 쓰레기값 가능성)',
        })

    name, ox, oy = origin
    x = ox + geom['cellX'] + geom['rowWidth'] // 2
    y = oy + geom['cellY'] + geom['rowTop'] + geom['rowHeight'] * row_index + geom['rowHeight'] // 2
    if not is_plausible_screen_xy(x, y, width, height):
        raise SpotRowUnresolved('computed-point-implausible', {
            'baseId': base_id, 'rowIndex': row_index, 'origin': {'name': name, 'x': ox, 'y': oy},
            'geometry': geom, 'point': [x, y],
        })
    return {
        'point': [x, y],
        'rowIndex': row_index,
        'baseId': base_id,
        'originName': name,
        'origin': [ox, oy],
        'geometry': geom,
        'rejectedOrigins': rejected,
    }
