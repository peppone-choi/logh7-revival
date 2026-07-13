from __future__ import annotations

# noqa: SIZE_OK — B71 자연 라이브 QA 상태기계. 職務権限カード → Captain kind 59 →
# factory 0x2d 명령행까지 원본 UI 조작만으로 진행하고 tracer는 관측 전용으로 쓴다.
# QA command injection(force export) 은 절대 호출하지 않는다.

import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

import frida

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from logh7_agent_drive import (
    DISMISSED_TOASTS,
    ClickOccludedError,
    click_guarded,
    client_geometry,
    do_login,
    find_client_hwnd,
    foreground,
    mouse_click,
    screenshot,
)
from _spot_dialog_geometry import SpotRowUnresolved, resolve_base_row_click
from _strategy_ready_gate import StrategyNotReady, wait_strategy_ready
# 검증된 상수·STORE·경로는 기존 드라이버에서 재사용한다(main() 은 __main__ 아래라 임포트해도 실행 안 됨).
from _strategy_table_probe import (
    CANONICAL_CLIENT_EXE,
    CHAR_CARD,
    EXPECTED_CANONICAL_CLIENT_SHA256,
    GAME_START,
    LOBBY_REF,
    M2_LAUNCH,
    PREPARE_STRATEGY_UI_CLIENT,
    STORE,
    STRATEGY_AUTHORITY_TAB,
    STRATEGY_REF,
    STRATEGY_UI_PATCH_MANIFEST,
    scale,
)

user32 = ctypes.windll.user32
ROOT = HERE.parents[1]
PROBE_JS = HERE / '_frida_strategy_snapshot.js'
CAPTAIN_KIND = 59
FACTORY_0X2D = 0x2d
# 목표 拠点 = 70 (ヴァルハラ). 행 인덱스가 아니라 목록 데이터의 baseId 로 매칭한다.
TARGET_BASE_ID = 70


def append_snapshot(path: Path, tag: str, snap: dict) -> None:
    with path.open('a', encoding='utf-8') as out:
        out.write(json.dumps({'tag': tag, 't': time.time(), **snap}, ensure_ascii=False) + '\n')


def b71_verdict(snap: dict) -> dict:
    detail = snap.get('systemDetail') or {}
    trace = detail.get('systemOutputTrace') or {}
    return trace.get('b71Verdict') or {}


def rect_center_point(origin, primary):
    if not origin or not primary:
        return None
    ox = origin.get('x')
    oy = origin.get('y')
    rx = primary.get('rectX20')
    ry = primary.get('rectY24')
    rw = primary.get('rectW2c') or 0
    rh = primary.get('rectH30') or 0
    if None in (ox, oy, rx, ry):
        return None
    return (ox + rx + rw // 2, oy + ry + rh // 2)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: py -3 _strategy_b71_probe.py <evidence-dir>')
    evdir = Path(sys.argv[1]).resolve()
    allowed = (ROOT / '.omo' / 'live-qa').resolve()
    if not (evdir == allowed or allowed in evdir.parents):
        raise SystemExit('evidence directory must be under .omo/live-qa')
    evdir.mkdir(parents=True, exist_ok=True)

    ui_manifest = json.loads(STRATEGY_UI_PATCH_MANIFEST.read_text(encoding='utf-8'))
    expected_patched_sha256 = ui_manifest['expectedPatchedSha256'].lower()
    prepared = subprocess.run(
        ['node', str(PREPARE_STRATEGY_UI_CLIENT)],
        cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
    )
    client_selection = json.loads(prepared.stdout)
    client_selection['selectionMode'] = 'default-overlay'
    client_exe = Path(client_selection['path']).resolve()
    if client_exe.name.lower() != 'g7mtclient.exe' or not client_exe.is_file():
        raise SystemExit('prepared client is not a valid g7mtclient.exe')
    digest = hashlib.sha256(client_exe.read_bytes()).hexdigest()
    trusted = {EXPECTED_CANONICAL_CLIENT_SHA256, expected_patched_sha256}
    if digest not in trusted:
        raise SystemExit(f'client SHA-256 mismatch: {digest}')
    client_selection.update({
        'path': str(client_exe), 'sha256': digest, 'trusted': True,
        'canonicalPath': str(CANONICAL_CLIENT_EXE.resolve()),
    })
    (evdir / 'client-selection.json').write_text(
        json.dumps(client_selection, ensure_ascii=False, indent=2), encoding='utf-8')

    shots = evdir / 'shots'
    shots.mkdir(parents=True, exist_ok=True)
    (evdir / 'store.json').write_text(json.dumps(STORE, ensure_ascii=False, indent=2), encoding='utf-8')
    server_log = evdir / 'server-stdout.txt'
    snapshots = evdir / 'snapshots.jsonl'
    steps: list = []

    server = client = session = script = hwnd = None
    try:
        with server_log.open('w', encoding='utf-8') as log:
            server = subprocess.Popen(['node', str(M2_LAUNCH), str(evdir)], cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT)
            ready_deadline = time.time() + 20
            while time.time() < ready_deadline:
                if 'm2-server-ready' in server_log.read_text(encoding='utf-8', errors='ignore'):
                    break
                if server.poll() is not None:
                    raise RuntimeError(f'server exited: {server.returncode}')
                time.sleep(0.25)
            else:
                raise RuntimeError('server did not become ready')

            client = subprocess.Popen([str(client_exe)], cwd=str(client_exe.parent))
            deadline = time.time() + 30
            while time.time() < deadline:
                try:
                    hwnd = find_client_hwnd(client.pid)
                    if hwnd:
                        break
                except (OSError, RuntimeError):
                    pass
                time.sleep(0.4)
            if not hwnd:
                raise RuntimeError('client window not found')
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value != client.pid:
                raise RuntimeError(f'client window PID mismatch: {client.pid} != {pid.value}')

            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding='utf-8'))
            script.on('message', lambda message, _data: None)
            script.load()
            time.sleep(0.5)

            width = height = 0
            try:
                _, _, width, height = client_geometry(hwnd)
            except (OSError, RuntimeError, TypeError, ValueError):
                pass
            if width < 900:
                do_login(hwnd, 'inei00', 'dummy', shots)

            # 1) 로비 로그인 게이트
            gate_started = time.monotonic()
            lobby_ok = False
            while time.monotonic() < gate_started + 20 and client.poll() is None:
                if 'lobby-login-ok-sent' in server_log.read_text(encoding='utf-8', errors='ignore'):
                    lobby_ok = True
                    break
                time.sleep(0.5)
            (evdir / 'login-gate.json').write_text(json.dumps({
                'success': lobby_ok, 'clientExitCode': client.poll(),
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            if not lobby_ok:
                raise RuntimeError('lobby login success marker not observed')

            # 2) 월드 진입 (ゲームスタート → キャラカード)
            #
            # 이 sleep(9) 는 근거 있는 대기다. 지우지 말 것.
            # 로비 로그인 OK(0x2001) 가 나간 직후 클라는 아직 로비 UI를 구성하는 중이라
            # ゲームスタート 버튼이 히트박스를 갖지 않는다. 통과 런의 서버 로그에서도
            # 로그인 OK 부터 첫 0x2003 요청까지 11초가 걸렸다:
            #   .omo/live-qa/m3-B74-rect-deterministic-20260713/server-stdout.txt
            #   14:17:40.733 lobby-login-ok-sent → 14:17:52.029 0x2003 (=ゲームスタート 클릭 반응)
            # 즉 클릭이 먹히기 시작하는 시점이 대략 +9~11초다. 이 대기를 "근거 없는 sleep"
            # 으로 보고 제거하면 클릭이 아직 살아있지 않은 UI에 나간다.
            # 관측 가능한 로비-준비 신호(0x2003 이전에 클라가 내는 신호)를 찾기 전까지는
            # 이 대기가 정본이다. 대신 클릭 자체는 아래 click_guarded 로 검증한다.
            time.sleep(9)

            # 클릭 시퀀스는 2회까지 재시도한다. 구 드라이버(_strategy_table_probe.py:504)
            # 에도 있던 재시도이며, 첫 클릭이 UI 구성 타이밍에 걸려 한 번 빗나가도 런
            # 전체가 죽지 않게 한다. 재시도해도 안 되면 fail-closed(예외).
            world_entry_attempts = []
            world_ok = False
            for attempt in range(1, 3):
                if client.poll() is not None:
                    break
                record = {'attempt': attempt, 'clicks': []}
                try:
                    ox, oy, width, height = client_geometry(hwnd)
                    x, y = scale(LOBBY_REF, GAME_START, width, height)
                    record['clicks'].append(click_guarded(hwnd, ox + x, oy + y, label='game-start'))
                    time.sleep(3)
                    screenshot(hwnd, shots / f'02b-char-card-before-{attempt}.png')
                    ox, oy, width, height = client_geometry(hwnd)
                    x, y = scale(LOBBY_REF, CHAR_CARD, width, height)
                    # キャラカード는 1클릭=선택 / 2클릭=확정이라 두 번 누른다. B74 통과 런에서도
                    # 두 번째 클릭 직후에야 0x2009(SSGameLogin 요청)가 나갔다.
                    record['clicks'].append(click_guarded(hwnd, ox + x, oy + y, label='char-card-1'))
                    time.sleep(1)
                    record['clicks'].append(click_guarded(hwnd, ox + x, oy + y, label='char-card-2'))
                    screenshot(hwnd, shots / f'02c-char-card-after-{attempt}.png')
                except ClickOccludedError as occluded:
                    # 클릭점을 남의 창(알림 토스트 등)이 계속 덮고 있었다 — B75 를 죽인 그 실패다.
                    # 증거로 가린 창의 정체를 남기고 다음 attempt 에서 다시 노린다.
                    record['occluded'] = {
                        'label': occluded.label,
                        'point': list(occluded.point),
                        'offender': occluded.offender,
                    }
                    world_entry_attempts.append(record)
                    continue
                deadline = time.monotonic() + 12
                while time.monotonic() < deadline and client.poll() is None:
                    if 'ss-login-ok-sent' in server_log.read_text(encoding='utf-8', errors='ignore'):
                        world_ok = True
                        break
                    time.sleep(0.25)
                record['worldOk'] = world_ok
                world_entry_attempts.append(record)
                if world_ok:
                    break
            (evdir / 'world-entry-gate.json').write_text(json.dumps({
                'success': world_ok, 'clientExitCode': client.poll(),
                'attempts': world_entry_attempts,
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            if not world_ok:
                raise RuntimeError('world entry success marker not observed')

            # 3) 전략맵 렌더 완료 대기 (결함 A 수정)
            # 과거 이 게이트는 import 신호를 못 보면 hudModeF4 단독으로 "폴백"해 진행했다.
            # 그 폴백이 곧 fail-open 이다 — hudModeF4 는 NOW LOADING 중에도 1 이므로
            # (실측: m3-baseinfo-view-trigger-discovery-*/shots/00-strategy-ready.png)
            # 로딩 화면에서 그대로 통과해 이후 클릭이 전부 허공에 나간다.
            # 이제 렌더 완료 신호 논리곱을 연속 관측으로 요구하고, 못 채우면 fail-closed.
            _, _, width, height = client_geometry(hwnd)
            try:
                gate = wait_strategy_ready(
                    lambda: script.exports_sync.snapshot(),
                    timeout_s=60.0, sleep_fn=time.sleep, monotonic_fn=time.monotonic,
                    width=width, height=height,
                    alive_fn=lambda: client.poll() is None,
                )
            except StrategyNotReady as exc:
                (evdir / 'strategy-ready-gate.json').write_text(json.dumps({
                    'ready': False, 'reason': str(exc), 'detail': exc.detail,
                    'clientExitCode': client.poll(),
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                screenshot(hwnd, shots / '00-strategy-not-ready.png')
                raise
            append_snapshot(snapshots, 'strategy-ready', gate['snapshot'])
            (evdir / 'strategy-ready-gate.json').write_text(json.dumps({
                'ready': True, 'polls': gate['polls'], 'stablePolls': gate['stablePolls'],
                'checks': gate['checks'], 'signals': gate['signals'],
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            screenshot(hwnd, shots / '00-strategy-ready.png')

            # ===== STEP A: 職務権限カード (좌측 버튼, 735,580) → HUD mode 2 + 카드 목록 로드 =====
            # 빈 카드 목록(ingest race) 방지: 목록이 채워질 때까지 탭 열기를 재시도한다.
            before = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'authority-tab-before', before)
            screenshot(hwnd, shots / '01-authority-tab-before.png')
            before_hud = (before.get('selection') or {}).get('hudModeF4')
            after = before
            after_hud = before_hud
            kinds = []
            open_attempts = 0
            ax = ay = ox = oy = 0
            for attempt in range(6):
                open_attempts = attempt + 1
                ox, oy, width, height = client_geometry(hwnd)
                ax, ay = scale(STRATEGY_REF, STRATEGY_AUTHORITY_TAB, width, height)
                foreground(hwnd)
                mouse_click(ox + ax, oy + ay)
                time.sleep(2.0)
                card_deadline = time.monotonic() + 6
                while time.monotonic() < card_deadline and client.poll() is None:
                    after = script.exports_sync.snapshot()
                    sel = after.get('selection') or {}
                    after_hud = sel.get('hudModeF4')
                    kinds = sel.get('cardKinds') or []
                    if after_hud == 2 and kinds:
                        break
                    time.sleep(0.4)
                if after_hud == 2 and kinds:
                    break
                # 모드 2인데 목록이 비었으면 다시 눌러 닫고(2→1) 재시도한다.
                if after_hud == 2 and client.poll() is None:
                    mouse_click(ox + ax, oy + ay)
                    time.sleep(1.5)
            append_snapshot(snapshots, 'authority-tab-after', after)
            screenshot(hwnd, shots / '02-authority-tab-after.png')
            authority_ok = after_hud == 2 and bool(kinds)
            (evdir / 'step-a-authority-tab.json').write_text(json.dumps({
                'reference': STRATEGY_AUTHORITY_TAB, 'screen': [ox + ax, oy + ay],
                'beforeHudModeF4': before_hud, 'afterHudModeF4': after_hud,
                'openAttempts': open_attempts, 'success': authority_ok,
                'cardKinds': kinds,
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            steps.append(('authority-tab', authority_ok))
            if not authority_ok:
                raise RuntimeError(f'authority tab card list did not load (hud={after_hud}, cardKinds={kinds}, attempts={open_attempts})')

            # ===== STEP B: Captain kind 59 카드 자연 선택 =====
            card_snap = after
            sel = card_snap.get('selection') or {}
            kinds = sel.get('cardKinds') or []
            rows = sel.get('rows') or []
            origin = sel.get('origin')
            card_idx = kinds.index(CAPTAIN_KIND) if CAPTAIN_KIND in kinds else None
            if card_idx is None:
                (evdir / 'step-b-captain-card.json').write_text(json.dumps({
                    'success': False, 'reason': 'kind-59-not-in-cardKinds',
                    'cardKinds': kinds, 'listCount188': sel.get('listCount188'),
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                steps.append(('captain-card', False))
                raise RuntimeError(f'Captain kind 59 not present in card list; cardKinds={kinds}')
            # cardKinds 배열 순서는 렌더 행 순서의 역순이다(艦長=최상단 행, 개인=하단 행).
            # 따라서 payload index 를 (listCount-1) 기준으로 뒤집어 실제 rect 행을 고른다.
            list_count = sel.get('listCount188') or len(rows)
            rect_row = (list_count - 1) - card_idx
            if not (0 <= rect_row < len(rows)):
                rect_row = card_idx
            primary = rows[rect_row].get('primary') if rect_row < len(rows) else None
            card_point = rect_center_point(origin, primary)
            append_snapshot(snapshots, 'captain-card-before', card_snap)
            screenshot(hwnd, shots / '03-captain-card-before.png')
            if card_point is None:
                (evdir / 'step-b-captain-card.json').write_text(json.dumps({
                    'success': False, 'reason': 'card-row-geometry-missing',
                    'cardKinds': kinds, 'cardIndex': card_idx, 'origin': origin,
                    'primary': primary,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                steps.append(('captain-card', False))
                raise RuntimeError('card row geometry unavailable for kind 59')
            ox, oy, width, height = client_geometry(hwnd)
            cx, cy = scale(STRATEGY_REF, card_point, width, height)
            foreground(hwnd)
            mouse_click(ox + cx, oy + cy)
            time.sleep(1.5)
            card_after = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'captain-card-after', card_after)
            screenshot(hwnd, shots / '04-captain-card-after.png')
            v_after_card = b71_verdict(card_after)
            cmd_after = card_after.get('command') or {}
            (evdir / 'step-b-captain-card.json').write_text(json.dumps({
                'success': True, 'cardKinds': kinds, 'cardKindPayloadIndex': card_idx,
                'rectRow': rect_row, 'listCount188': list_count,
                'cardReferencePoint': card_point, 'screen': [ox + cx, oy + cy],
                'factory2dGrantedAfterCard': v_after_card.get('factory2dGranted'),
                'commandRowCountD4': cmd_after.get('rowCountD4'),
                'commandRows': len(cmd_after.get('rows') or []),
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            steps.append(('captain-card', True))

            # ===== STEP C: factory 0x2d 명령행 클릭 (실제 이동 확인은 누르지 않음) =====
            # 카드 목록이 역순 렌더였으므로 명령 목록도 동일 가정: canonical [0x2b,0x2d] → 최상단 행이 0x2d.
            # 클릭 후 verdict(handler2dEntered/factory2dSelected)로 실제 명중을 검증한다.
            cmd_deadline = time.monotonic() + 10
            cmd_snap = card_after
            while time.monotonic() < cmd_deadline and client.poll() is None:
                cmd_snap = script.exports_sync.snapshot()
                cmd = cmd_snap.get('command') or {}
                if (cmd.get('rowCountD4') or 0) >= 2:
                    break
                time.sleep(0.4)
            cmd = cmd_snap.get('command') or {}
            cmd_rows = cmd.get('rows') or []
            cmd_origin = cmd.get('origin')
            row_count = cmd.get('rowCountD4') or 0
            # 명령 버튼 행 선택. '역순 가정상 0x2d=행0' 은 실측으로 반증됐다(B79, 2026-07-14).
            # 실제 화면: 두 버튼이 가로로 나란히 있고 왼쪽=ワープ航行(0x2b), 오른쪽=寄港(0x2d).
            # 트레이서 rect 도 일치한다 — 행0 rectX20=12(왼쪽), 행1 rectX20=113(오른쪽).
            # 행0 을 눌렀더니 게임이 ワープ航行 그리드 선택 모드로 들어갔다(증거 스크린샷:
            #   .omo/live-qa/m3-B79-toast-dismiss-worldentry-20260714/shots/
            #     05-factory-0x2d-before.png (버튼 라벨), 06b-base-row-before.png ("Please choose
            #     the grid." + "* ワープ航行コマンド選択を行います。")).
            # 따라서 寄港 = 행1. 행에 factory 코드 필드가 없어 위치로 고를 수밖에 없다.
            target_idx = int(os.environ.get('LOGH_B71_CMD_ROW', '1'))
            if not (0 <= target_idx < len(cmd_rows)):
                target_idx = 0 if cmd_rows else None
            target_primary = cmd_rows[target_idx] if (target_idx is not None and target_idx < len(cmd_rows)) else None
            row_point = rect_center_point(cmd_origin, target_primary)
            append_snapshot(snapshots, 'factory-0x2d-before', cmd_snap)
            screenshot(hwnd, shots / '05-factory-0x2d-before.png')
            if row_point is None:
                # 명령행이 뜨지 않았다 — 최초 누락 경계로 기록하고 판정까지 진행한다(하드 실패 아님).
                (evdir / 'step-c-factory-0x2d.json').write_text(json.dumps({
                    'success': False, 'reason': 'command-row-geometry-missing',
                    'rowCountD4': row_count, 'commandRows': len(cmd_rows), 'origin': cmd_origin,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                steps.append(('factory-0x2d', False))
                final_snap = script.exports_sync.snapshot()
                verdict = b71_verdict(final_snap)
                screenshot(hwnd, shots / '07-final.png')
                (evdir / 'b71-verdict.json').write_text(json.dumps({
                    'verdict': verdict, 'runtimeTables': final_snap.get('runtimeTables'),
                    'steps': steps, 'firstMissingBoundary': 'command-list-empty-after-captain-card',
                    'clientAlive': client.poll() is None,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'event': 'b71-probe-finished', 'pass': verdict.get('pass'),
                                  'verdict': verdict, 'steps': steps, 'evdir': str(evdir)}, ensure_ascii=False))
                return 0
            ox, oy, width, height = client_geometry(hwnd)
            rx, ry = scale(STRATEGY_REF, row_point, width, height)
            foreground(hwnd)
            mouse_click(ox + rx, oy + ry)
            time.sleep(2.0)
            (evdir / 'step-c-factory-0x2d.json').write_text(json.dumps({
                'success': True, 'rowCountD4': row_count, 'targetIndex': target_idx,
                'rowReferencePoint': row_point, 'screen': [ox + rx, oy + ry],
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            steps.append(('factory-0x2d', True))
            screenshot(hwnd, shots / '06-factory-0x2d-after.png')

            # ===== STEP D: kind5 SelectDialog 좌측 拠点 목록에서 base 70(ヴァルハラ) 행 자연 클릭 =====
            # 상세가 렌더되는 지점까지만 — 決定/取消し(최종 이동 확정) 버튼은 누르지 않는다.
            # 결함 B 수정: 행 좌표를 클라 메모리 기하에서 결정적으로 계산한다.
            # 과거: B73 은 화면 좌표 세로 스윕(카메라가 세션마다 움직여 무의미),
            #       B74 는 tracer 의 parentOrigin 을 검증 없이 믿었는데 그 값은 포인터
            #       쓰레기값(322313472, 322290148)이라 화면 밖을 클릭했다 → 둘 다 실패.
            # 이제: 행 인덱스는 목록 데이터(baseIdAt08)로 매칭하고, 원점은 plausible 한
            #       후보만 쓰며, 좌표를 못 만들면 좌표를 지어내지 않고 fail-closed 한다.
            base_before = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'base-row-before', base_before)
            screenshot(hwnd, shots / '06b-base-row-before.png')
            spot = base_before.get('spotDialogList') or {}

            # 행 기하 확정 소스가 아직 없다(행 rect 는 draw 시점 계산). tracer 가 rowGeometry.rowHeight
            # 를 못 채우면 기본은 fail-closed. 가설 검증용 주입만 LOGH_B71_ROW_GEOMETRY 로 허용한다.
            raw_geom = os.environ.get('LOGH_B71_ROW_GEOMETRY', '').strip()
            if raw_geom:
                try:
                    gh, gt, gw = (int(v) for v in raw_geom.split(','))
                    spot = dict(spot)
                    spot['rowGeometry'] = {'rowHeight': gh, 'rowTop': gt, 'rowWidth': gw,
                                           'source': 'LOGH_B71_ROW_GEOMETRY'}
                except ValueError:
                    pass
            (evdir / 'spot-dialog-list.json').write_text(
                json.dumps(spot, ensure_ascii=False, indent=2), encoding='utf-8')

            ox, oy, width, height = client_geometry(hwnd)
            try:
                resolved = resolve_base_row_click(spot, TARGET_BASE_ID, width, height)
            except SpotRowUnresolved as exc:
                (evdir / 'step-d-base-row.json').write_text(json.dumps({
                    'success': False, 'reason': exc.reason, 'detail': exc.detail,
                    'itemCount': spot.get('itemCount8e4'),
                    'rowBaseIds': [(r or {}).get('baseIdAt08') for r in (spot.get('rows') or [])],
                    'originCandidates': spot.get('originCandidates'),
                    'rowGeometry': spot.get('rowGeometry'),
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                steps.append(('base-row-70', False))
                raise RuntimeError(f'base row click point unresolved: {exc.reason}')

            bx, by = resolved['point']
            dx, dy = scale(STRATEGY_REF, (bx, by), width, height)
            foreground(hwnd)
            mouse_click(ox + dx, oy + dy)
            base_after = base_before
            selected_base = None
            sel_deadline = time.monotonic() + 5
            while time.monotonic() < sel_deadline and client.poll() is None:
                base_after = script.exports_sync.snapshot()
                selected_base = b71_verdict(base_after).get('selectedBaseId')
                if selected_base == TARGET_BASE_ID:
                    break
                time.sleep(0.3)
            append_snapshot(snapshots, 'base-row-after', base_after)
            screenshot(hwnd, shots / '06c-base-row-after.png')
            v_base = b71_verdict(base_after)
            (evdir / 'step-d-base-row.json').write_text(json.dumps({
                'success': v_base.get('selectedBaseId') == TARGET_BASE_ID,
                'resolved': resolved, 'screen': [ox + dx, oy + dy],
                'itemCount': spot.get('itemCount8e4'),
                'selectedBaseIdAfter': v_base.get('selectedBaseId'),
                'phase0SeenAfter': v_base.get('phase0Seen'),
                'phase1SeenAfter': v_base.get('phase1Seen'),
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            steps.append(('base-row-70', v_base.get('selectedBaseId') == TARGET_BASE_ID))

            # ===== 판정 안정화: phase1/renderer 완료까지 폴링 =====
            # phase1Seen 최초 true 시점의 상세 패널을 별도 스크린샷으로 확정한다.
            verdict_deadline = time.monotonic() + 25
            final_snap = script.exports_sync.snapshot()
            verdict = b71_verdict(final_snap)
            idx = 0
            phase1_shot = False
            while time.monotonic() < verdict_deadline and client.poll() is None:
                final_snap = script.exports_sync.snapshot()
                verdict = b71_verdict(final_snap)
                append_snapshot(snapshots, f'settle-{idx:02d}', final_snap)
                if verdict.get('phase1Seen') and not phase1_shot:
                    screenshot(hwnd, shots / '06d-phase1-rendered.png')
                    phase1_shot = True
                if verdict.get('pass'):
                    break
                idx += 1
                time.sleep(0.5)
            screenshot(hwnd, shots / '07-final.png')

            (evdir / 'b71-verdict.json').write_text(json.dumps({
                'verdict': verdict,
                'runtimeTables': final_snap.get('runtimeTables'),
                'steps': steps,
                'clientAlive': client.poll() is None,
            }, ensure_ascii=False, indent=2), encoding='utf-8')

            print(json.dumps({
                'event': 'b71-probe-finished',
                'pass': verdict.get('pass'),
                'verdict': verdict,
                'steps': steps,
                'evdir': str(evdir),
            }, ensure_ascii=False))
            return 0
    finally:
        # 닫은 알림 토스트 목록은 성공/실패와 무관하게 항상 남긴다 — 조용한 dismissal 금지.
        try:
            (evdir / 'toast-dismissals.json').write_text(json.dumps({
                'count': len(DISMISSED_TOASTS), 'dismissed': DISMISSED_TOASTS,
            }, ensure_ascii=False, indent=2), encoding='utf-8')
        except OSError:
            pass
        if script is not None:
            try:
                script.unload()
            except (OSError, RuntimeError, TypeError, ValueError, frida.InvalidOperationError):
                pass
        if session is not None:
            try:
                session.detach()
            except (OSError, RuntimeError, TypeError, ValueError, frida.InvalidOperationError):
                pass
        if client is not None and client.poll() is None:
            client.terminate()
            try:
                client.wait(timeout=5)
            except subprocess.TimeoutExpired:
                client.kill()
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == '__main__':
    # 예외를 삼키지 않되, 반드시 evdir 에 full traceback 을 남긴다.
    # B76 run3 는 드라이버 stdout 이 비어 있어 왜 죽었는지 아무도 몰랐다 — 파이썬
    # 트레이스백이 stderr 로만 나가서 캡처되지 않았기 때문이다. 여기서 파일로 못 박는다.
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException:
        import traceback
        tb = traceback.format_exc()
        try:
            crash_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE
            crash_dir.mkdir(parents=True, exist_ok=True)
            (crash_dir / 'driver-traceback.txt').write_text(tb, encoding='utf-8')
        except OSError:
            pass
        print(json.dumps({'event': 'b71-probe-crashed', 'traceback': tb}, ensure_ascii=False))
        sys.stderr.write(tb)
        raise SystemExit(1)
