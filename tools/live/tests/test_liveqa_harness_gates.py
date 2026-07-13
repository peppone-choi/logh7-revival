from __future__ import annotations

# LOGH VII 라이브QA 하네스 오프라인 자기검증.
# 라이브 클라이언트를 띄우지 않고, 저장된 evdir 스냅샷(실측 픽스처)만으로
#   결함 A: strategy-ready 게이트가 NOW LOADING 을 거부하고 렌더 완료를 통과시키는가
#   결함 B: 행 좌표 계산기가 base 70 행을 결정적으로 산출/거부하는가
# 를 증명한다.
#
# 실행: py -3 tools\live\tests\test_liveqa_harness_gates.py

import io
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from _spot_dialog_geometry import SpotRowUnresolved, find_row_index, resolve_base_row_click
from _strategy_ready_gate import (
    StrategyNotReady,
    evaluate_strategy_ready,
    is_plausible_screen_xy,
    wait_strategy_ready,
)

ROOT = HERE.parents[2]
LIVEQA = ROOT / '.omo' / 'live-qa'

# 실측 픽스처.
#  - NOW LOADING(음성): 약한 게이트가 로딩 화면에서 통과해버린 런.
#    shots/00-strategy-ready.png 가 NOW LOADING 임을 육안 확인한 그 런이다.
#  - 렌더 완료(양성): B74 의 strategy-ready 스냅샷.
LOADING_EVDIRS = [
    LIVEQA / 'm3-baseinfo-view-trigger-discovery-20260713',
    LIVEQA / 'm3-baseinfo-view-trigger-discovery-run2-20260713',
    LIVEQA / 'm3-baseinfo-view-trigger-discovery-run3-20260713',
]
RENDERED_EVDIRS = [
    LIVEQA / 'm3-B74-rect-deterministic-20260713',
    LIVEQA / 'm3-B73-viewkind-marker-20260713',
]
B74 = LIVEQA / 'm3-B74-rect-deterministic-20260713'

CLIENT_W, CLIENT_H = 1028, 772

FAILURES = []
PASSES = []


def check(name: str, ok: bool, detail: str = '') -> None:
    if ok:
        PASSES.append(name)
        print(f'PASS  {name}' + (f'  [{detail}]' if detail else ''))
    else:
        FAILURES.append(name)
        print(f'FAIL  {name}' + (f'  [{detail}]' if detail else ''))


def first_snapshot(evdir: Path, tag: str = 'strategy-ready') -> dict:
    path = evdir / 'snapshots.jsonl'
    for line in io.open(path, encoding='utf-8'):
        rec = json.loads(line)
        if rec.get('tag') == tag:
            return rec
    raise AssertionError(f'{path}: tag {tag} not found')


# ===== 결함 A: strategy-ready 게이트 =====

def test_gate_rejects_now_loading():
    for evdir in LOADING_EVDIRS:
        snap = first_snapshot(evdir)
        verdict = evaluate_strategy_ready(snap, CLIENT_W, CLIENT_H)
        # 이 스냅샷은 hudModeF4 == 1 이라 '약한 게이트'는 통과했었다.
        weak_pass = (snap.get('selection') or {}).get('hudModeF4') in (1, 2)
        check(f'A/weak-gate-would-have-passed-loading[{evdir.name}]', weak_pass,
              'hudModeF4=1 while NOW LOADING')
        check(f'A/strong-gate-rejects-loading[{evdir.name}]', verdict['ready'] is False,
              'failed=' + ','.join(verdict['failed']))


def test_gate_accepts_rendered():
    for evdir in RENDERED_EVDIRS:
        snap = first_snapshot(evdir)
        verdict = evaluate_strategy_ready(snap, CLIENT_W, CLIENT_H)
        check(f'A/strong-gate-accepts-rendered[{evdir.name}]', verdict['ready'] is True,
              'checks=' + ','.join(k for k, v in verdict['checks'].items() if v))


def test_gate_fails_closed_on_timeout():
    loading = first_snapshot(LOADING_EVDIRS[0])
    clock = {'t': 0.0}

    def monotonic():
        return clock['t']

    def sleep(seconds):
        clock['t'] += seconds

    try:
        wait_strategy_ready(lambda: loading, timeout_s=5.0, sleep_fn=sleep,
                            monotonic_fn=monotonic, width=CLIENT_W, height=CLIENT_H)
        check('A/fail-closed-on-timeout', False, 'no exception raised')
    except StrategyNotReady as exc:
        check('A/fail-closed-on-timeout', True,
              'reason=' + ','.join(exc.detail.get('lastFailed') or []))


def test_gate_requires_stability():
    """한 프레임만 스치는 통과는 인정하지 않는다(연속 3회 요구)."""
    loading = first_snapshot(LOADING_EVDIRS[0])
    rendered = first_snapshot(B74)
    seq = [loading, rendered, loading, rendered, rendered, rendered, rendered]
    state = {'i': 0, 't': 0.0}

    def snapshot_fn():
        snap = seq[min(state['i'], len(seq) - 1)]
        state['i'] += 1
        return snap

    def monotonic():
        return state['t']

    def sleep(seconds):
        state['t'] += seconds

    result = wait_strategy_ready(snapshot_fn, timeout_s=30.0, sleep_fn=sleep,
                                 monotonic_fn=monotonic, width=CLIENT_W, height=CLIENT_H)
    # poll2 의 단발 통과는 poll3(loading)에서 리셋된다. poll4,5,6 이 연속 3회 → poll6 에서 확정.
    # 단발 통과를 인정했다면 polls==2 에서 끝났어야 한다 — 그러지 않음이 안정성 요구의 증거.
    check('A/requires-3-consecutive-passes', result['polls'] == 6 and result['stablePolls'] == 3,
          f"polls={result['polls']} stable={result['stablePolls']} (단발통과 poll2 는 기각됨)")


def test_origin_plausibility():
    check('A/plausibility-rejects-pointer-garbage',
          is_plausible_screen_xy(322313472, 322290148, CLIENT_W, CLIENT_H) is False,
          'B74 parentOrigin')
    check('A/plausibility-accepts-real-point',
          is_plausible_screen_xy(296, 222, CLIENT_W, CLIENT_H) is True)


# ===== 결함 B: 拠点 행 좌표 계산기 =====

def test_row_index_from_list_data():
    spot = json.loads((B74 / 'spot-dialog-list.json').read_text(encoding='utf-8'))
    index = find_row_index(spot, 70)
    check('B/row-index-matched-from-list-data', index == 0,
          f'base70 -> rowIndex={index} (itemCount={spot.get("itemCount8e4")})')
    try:
        find_row_index(spot, 999)
        check('B/absent-base-fails-closed', False, 'no exception')
    except SpotRowUnresolved as exc:
        check('B/absent-base-fails-closed', exc.reason == 'base-row-not-in-list', exc.reason)


def test_b74_geometry_fails_closed():
    """B74 가 실제로 저장한 기하로는 좌표를 만들 수 없어야 한다.

    당시 드라이버는 parentOrigin(포인터값)을 믿고 (322313510, 322290155) 를 클릭했다.
    새 계산기는 거기서 조용히 진행하지 않고 fail-closed 여야 한다.
    """
    spot = json.loads((B74 / 'spot-dialog-list.json').read_text(encoding='utf-8'))
    try:
        out = resolve_base_row_click(spot, 70, CLIENT_W, CLIENT_H)
        check('B/b74-stored-geometry-fails-closed', False, f'wrongly produced {out["point"]}')
    except SpotRowUnresolved as exc:
        # rowGeometry 가 없으므로 행 기하 단계에서 먼저 걸린다.
        check('B/b74-stored-geometry-fails-closed',
              exc.reason in ('row-geometry-unavailable', 'no-plausible-origin'), exc.reason)

    # 원점 검증만 따로: 행 기하를 주더라도 원점이 포인터 쓰레기값이면 거부해야 한다.
    spot_with_geom = dict(spot)
    spot_with_geom['rowGeometry'] = {'rowHeight': 25, 'rowTop': 0, 'rowWidth': 232}
    try:
        out = resolve_base_row_click(spot_with_geom, 70, CLIENT_W, CLIENT_H)
        check('B/pointer-origin-rejected', False, f'wrongly produced {out["point"]}')
    except SpotRowUnresolved as exc:
        check('B/pointer-origin-rejected', exc.reason == 'no-plausible-origin',
              'rejected=' + json.dumps(exc.detail.get('rejected'), ensure_ascii=False))


def test_deterministic_point_when_origin_valid():
    """유효 원점이 노출되면 base 70 행 좌표가 결정적으로 나온다."""
    spot = json.loads((B74 / 'spot-dialog-list.json').read_text(encoding='utf-8'))
    spot = dict(spot)
    # 새 tracer 가 내보낼 형태: 검증된 원점 후보 + 명시적 행 기하.
    spot['originCandidates'] = [
        {'name': 'listWidget', 'x': 322313472, 'y': 322290148},  # 포인터 쓰레기 → 거부돼야 함
        {'name': 'dialogRoot', 'x': 264, 'y': 198},              # 타당 → 채택돼야 함
    ]
    spot['rowGeometry'] = {'rowHeight': 25, 'rowTop': 0, 'rowWidth': 232}

    out = resolve_base_row_click(spot, 70, CLIENT_W, CLIENT_H)
    expected = [264 + 0 + 232 // 2, 198 + 0 + 0 + 25 * 0 + 25 // 2]
    check('B/deterministic-point-for-base70',
          out['point'] == expected and out['originName'] == 'dialogRoot' and out['rowIndex'] == 0,
          f'point={out["point"]} origin={out["originName"]} rejected={len(out["rejectedOrigins"])}')

    # 결정성: 같은 입력 → 같은 출력.
    again = resolve_base_row_click(spot, 70, CLIENT_W, CLIENT_H)
    check('B/deterministic-repeatable', again['point'] == out['point'], f'{again["point"]}')

    # 행 인덱스가 좌표에 실제로 반영되는가(2행짜리 목록에서 index 1 은 rowHeight 만큼 아래).
    spot2 = dict(spot)
    spot2['rows'] = [
        {'index': 0, 'baseIdAt08': 12},
        {'index': 1, 'baseIdAt08': 70},
    ]
    out2 = resolve_base_row_click(spot2, 70, CLIENT_W, CLIENT_H)
    check('B/row-index-shifts-y', out2['point'][1] - out['point'][1] == 25,
          f'index1 y={out2["point"][1]} vs index0 y={out["point"][1]}')


def main() -> int:
    print('=== LOGH VII live-QA harness offline self-verification ===')
    print(f'fixtures: {LIVEQA}')
    print()
    print('--- 결함 A: strategy-ready gate ---')
    test_gate_rejects_now_loading()
    test_gate_accepts_rendered()
    test_gate_fails_closed_on_timeout()
    test_gate_requires_stability()
    test_origin_plausibility()
    print()
    print('--- 결함 B: base-row deterministic geometry ---')
    test_row_index_from_list_data()
    test_b74_geometry_fails_closed()
    test_deterministic_point_when_origin_valid()
    print()
    print(f'passed={len(PASSES)} failed={len(FAILURES)}')
    if FAILURES:
        print('FAILED: ' + ', '.join(FAILURES))
        return 1
    print('ALL GREEN')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
