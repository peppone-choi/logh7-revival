from __future__ import annotations

# noqa: SIZE_OK — 실클라이언트 세션과 화면 전환을 순서대로 관측하는 단일 QA 상태기계다.

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_agent_drive import client_geometry, do_login, find_client_hwnd, foreground, mouse_click, screenshot

user32 = ctypes.windll.user32
ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = Path(os.environ.get(
    'LOGH_CLIENT_EXE',
    r'E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe',
))
M2_LAUNCH = ROOT / 'tools' / 'live' / '_m2_launch.mjs'
PROBE_JS = Path(__file__).resolve().parent / '_frida_strategy_snapshot.js'
LOBBY_REF = (1024, 768)
GAME_START = (125, 191)
CHAR_CARD = (655, 305)
STRATEGY_REF = (1028, 772)
STRATEGY_AUTHORITY_TAB = (735, 580)
EXPECTED_CLIENT_SHA256 = '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51'

STORE = {
    'accounts': {'inei00': [{
        'id': 1, 'power': 2, 'camp': 2, 'blood': 1, 'sex': 0, 'generated': 1,
        'lastname': 'Reinhard', 'firstname': 'Lohengramm', 'face': 305419896,
        'ability8': [80, 75, 70, 65, 60, 55, 50, 45], 'bonusPoint': 0,
        'specialAbilityNum': 0, 'title': 0, 'rank': 13, 'charState': 1, 'age': 20,
    }]},
    'nextId': 2,
}


def scale(ref, point, width, height):
    return int(point[0] * width / ref[0]), int(point[1] * height / ref[1])


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: py -3 _strategy_table_probe.py <evidence-dir>')
    force_hud_mode2 = os.environ.get('LOGH_FORCE_HUD_MODE2') == '1'
    click_strategy_authority_tab = os.environ.get('LOGH_CLICK_STRATEGY_AUTHORITY_TAB') == '1'
    if force_hud_mode2 and click_strategy_authority_tab:
        raise SystemExit('LOGH_FORCE_HUD_MODE2 and LOGH_CLICK_STRATEGY_AUTHORITY_TAB are mutually exclusive')
    evdir = Path(sys.argv[1]).resolve()
    allowed_evidence_roots = [(ROOT / '.omo' / 'live-qa').resolve(), (ROOT / 'tools' / 'live' / '_ev').resolve()]
    if not any(evdir == root or root in evdir.parents for root in allowed_evidence_roots):
        raise SystemExit('evidence directory must be under .omo/live-qa or tools/live/_ev')
    if CLIENT_EXE.name.lower() != 'g7mtclient.exe' or not CLIENT_EXE.is_file():
        raise SystemExit('LOGH_CLIENT_EXE must point to an existing g7mtclient.exe')
    if os.environ.get('LOGH_ALLOW_NONCANONICAL_CLIENT') != '1':
        digest = hashlib.sha256(CLIENT_EXE.read_bytes()).hexdigest()
        if digest != EXPECTED_CLIENT_SHA256:
            raise SystemExit(f'client SHA-256 mismatch: {digest}')
    evdir.mkdir(parents=True, exist_ok=True)
    shots = evdir / 'shots'
    shots.mkdir(parents=True, exist_ok=True)
    (evdir / 'store.json').write_text(json.dumps(STORE, ensure_ascii=False, indent=2), encoding='utf-8')
    server_log = evdir / 'server-stdout.txt'
    snapshots = evdir / 'snapshots.jsonl'
    server = None
    client = None
    session = None
    script = None
    hwnd = None
    before_send_force_arm = None
    authority_tab_base_snapshot = None
    try:
        with server_log.open('w', encoding='utf-8') as log:
            server = subprocess.Popen(['node', str(M2_LAUNCH), str(evdir)], cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT)
            ready_deadline = time.time() + 20
            while time.time() < ready_deadline:
                text = server_log.read_text(encoding='utf-8', errors='ignore')
                if 'm2-server-ready' in text:
                    break
                if server.poll() is not None:
                    raise RuntimeError(f'server exited: {server.returncode}')
                time.sleep(0.25)
            else:
                raise RuntimeError('server did not become ready')

            client = subprocess.Popen([str(CLIENT_EXE)], cwd=str(CLIENT_EXE.parent))
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
                raise RuntimeError(f'client window PID mismatch: expected {client.pid}, got {pid.value}')
            session = frida.attach(pid.value)
            script = session.create_script(PROBE_JS.read_text(encoding='utf-8'))
            messages = []
            script.on('message', lambda message, _data: messages.append(message))
            script.load()
            time.sleep(0.5)
            width = height = 0
            try:
                _, _, width, height = client_geometry(hwnd)
            except (OSError, RuntimeError, TypeError, ValueError):
                pass
            if width < 900:
                do_login(hwnd, 'inei00', 'dummy', shots)
            login_gate_started = time.monotonic()
            lobby_deadline = login_gate_started + 20
            lobby_login_ok = False
            while time.monotonic() < lobby_deadline and client.poll() is None:
                try:
                    lobby_log = server_log.read_text(encoding='utf-8', errors='ignore')
                except OSError:
                    lobby_log = ''
                if 'lobby-login-ok-sent' in lobby_log:
                    lobby_login_ok = True
                    break
                time.sleep(0.5)
            login_gate_result = {
                'success': lobby_login_ok,
                'elapsed': time.monotonic() - login_gate_started,
                'clientExitCode': client.poll(),
                'serverLogMarkers': {
                    'lobby-login-ok-sent': lobby_login_ok,
                },
            }
            (evdir / 'login-gate.json').write_text(
                json.dumps(login_gate_result, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            if not lobby_login_ok:
                raise RuntimeError('lobby login success marker was not observed')
            time.sleep(9)
            if client.poll() is None:
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(LOBBY_REF, GAME_START, width, height)
                foreground(hwnd)
                mouse_click(ox + x, oy + y)
                time.sleep(3)
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(LOBBY_REF, CHAR_CARD, width, height)
                mouse_click(ox + x, oy + y)
                time.sleep(1)
                mouse_click(ox + x, oy + y)
            if os.environ.get('LOGH_INPUT_TICK') == '1' and client.poll() is None:
                armed = script.exports_sync.itick()
                time.sleep(1)
                (evdir / 'input-tick-force.json').write_text(
                    json.dumps(
                        {'armed': armed, 'result': script.exports_sync.iresult()},
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_GEOMETRY_TARGET_ONLY') == '1' and client.poll() is None:
                (evdir / 'geometry-force.json').write_text(
                    json.dumps(script.exports_sync.geometrytarget(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            elif os.environ.get('LOGH_FORCE_GEOMETRY') == '1' and client.poll() is None:
                (evdir / 'geometry-force.json').write_text(
                    json.dumps(script.exports_sync.geometry(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_OCCLUSION_CLEAR') == '1' and client.poll() is None:
                (evdir / 'occlusion-force.json').write_text(
                    json.dumps(script.exports_sync.occlusion(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_SELECTION_LATCH') == '1' and client.poll() is None:
                (evdir / 'selection-latch-force.json').write_text(
                    json.dumps(script.exports_sync.latch(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_SELECTION_HIT') == '1' and client.poll() is None:
                (evdir / 'selection-hit-force.json').write_text(
                    json.dumps(script.exports_sync.hit(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_COMMAND_HIT') == '1' and client.poll() is None:
                (evdir / 'command-hit-force.json').write_text(
                    json.dumps(script.exports_sync.command(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_COMMAND_LATCH') == '1' and client.poll() is None:
                (evdir / 'command-latch-force.json').write_text(
                    json.dumps(script.exports_sync.clatch(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_SELECTGRID_CONFIRM') == '1' and client.poll() is None:
                (evdir / 'selectgrid-confirm-force.json').write_text(
                    json.dumps(script.exports_sync.selectgridconfirm(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SEND') == '1' and client.poll() is None:
                before_send_force_arm = script.exports_sync.selectgridbeforesend()
            if click_strategy_authority_tab and client.poll() is None:
                authority_tab_base_started = time.monotonic()
                authority_tab_base_deadline = authority_tab_base_started + 30
                authority_tab_base_ready = False
                while time.monotonic() < authority_tab_base_deadline and client.poll() is None:
                    try:
                        authority_tab_base_snapshot = script.exports_sync.snapshot()
                    except (OSError, RuntimeError, TypeError, ValueError, frida.InvalidOperationError):
                        break
                    selection = authority_tab_base_snapshot.get('selection') or {}
                    linkage = authority_tab_base_snapshot.get('linkage') or {}
                    authority_tab_base_ready = (
                        selection.get('hudModeF4') == 1
                        and (selection.get('listCount188') or 0) >= 1
                        and (selection.get('payloadCount270') or 0) >= 1
                        and linkage.get('gridActive126710') == 1
                        and linkage.get('fieldMode126711') == 2
                        and (linkage.get('unit0Id') or 0) > 0
                        and (linkage.get('char0Flagship') or 0) > 0
                    )
                    if authority_tab_base_ready:
                        break
                    time.sleep(0.25)
                base_selection = (authority_tab_base_snapshot or {}).get('selection') or {}
                base_linkage = (authority_tab_base_snapshot or {}).get('linkage') or {}
                authority_tab_base_result = {
                    'ready': authority_tab_base_ready,
                    'elapsed': time.monotonic() - authority_tab_base_started,
                    'lastSnapshot': {
                        'hudModeF4': base_selection.get('hudModeF4'),
                        'listCount188': base_selection.get('listCount188'),
                        'payloadCount270': base_selection.get('payloadCount270'),
                        'gridActive126710': base_linkage.get('gridActive126710'),
                        'fieldMode126711': base_linkage.get('fieldMode126711'),
                        'unit0Id': base_linkage.get('unit0Id'),
                        'char0Flagship': base_linkage.get('char0Flagship'),
                    },
                }
                (evdir / 'strategy-authority-tab-ready.json').write_text(
                    json.dumps(authority_tab_base_result, ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
                if not authority_tab_base_ready:
                    raise RuntimeError('strategy authority tab base HUD did not become ready')
            if os.environ.get('LOGH_FORCE_COMMAND_TABLE') == '1' and client.poll() is None:
                (evdir / 'command-table-force.json').write_text(
                    json.dumps(script.exports_sync.commandtable(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_COMMAND_TABLE_APPLY') == '1' and client.poll() is None:
                time.sleep(0.5)
                (evdir / 'command-table-apply.json').write_text(
                    json.dumps(script.exports_sync.commandtableapply(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_FOCUS_CELL') == '1' and client.poll() is None:
                try:
                    focus_cell = int(os.environ.get('LOGH_FOCUS_CELL_VALUE', '2588'))
                except ValueError as exc:
                    raise RuntimeError('LOGH_FOCUS_CELL_VALUE must be an integer in [0, 4999]') from exc
                if not 0 <= focus_cell < 5000:
                    raise RuntimeError('LOGH_FOCUS_CELL_VALUE must be an integer in [0, 4999]')
                (evdir / 'focus-cell-force.json').write_text(
                    json.dumps(script.exports_sync.focuscell(focus_cell), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_HUD_MODE2') == '1' and client.poll() is None:
                force_result = evdir / 'hud-mode2-force.json'
                armed = script.exports_sync.force()
                result = None
                force_deadline = time.time() + 20
                while time.time() < force_deadline and client.poll() is None:
                    result = script.exports_sync.result()
                    if result is not None:
                        break
                    time.sleep(0.25)
                retry_armed = None
                if result is None and client.poll() is None:
                    retry_armed = script.exports_sync.force()
                    retry_deadline = time.time() + 10
                    while time.time() < retry_deadline and client.poll() is None:
                        result = script.exports_sync.result()
                        if result is not None:
                            break
                        time.sleep(0.25)
                time.sleep(1)
                force_result.write_text(json.dumps({'armed': armed, 'retryArmed': retry_armed, 'result': result}, ensure_ascii=False, indent=2), encoding='utf-8')
            if click_strategy_authority_tab and client.poll() is None and authority_tab_base_snapshot is not None:
                before_snapshot = script.exports_sync.snapshot()
                before_selection = before_snapshot.get('selection') or {}
                before_command = before_snapshot.get('command') or {}
                before_hud_mode = before_selection.get('hudModeF4')
                screenshot(hwnd, shots / 'strategy-authority-tab-before.png')
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(STRATEGY_REF, STRATEGY_AUTHORITY_TAB, width, height)
                foreground(hwnd)
                mouse_click(ox + x, oy + y)
                time.sleep(1)
                after_snapshot = script.exports_sync.snapshot()
                after_selection = after_snapshot.get('selection') or {}
                after_command = after_snapshot.get('command') or {}
                after_hud_mode = after_selection.get('hudModeF4')
                screenshot(hwnd, shots / 'strategy-authority-tab-after.png')
                authority_tab_result = {
                    'point': {
                        'reference': STRATEGY_AUTHORITY_TAB,
                        'screen': (ox + x, oy + y),
                    },
                    'beforeHudModeF4': before_hud_mode,
                    'afterHudModeF4': after_hud_mode,
                    'beforeSnapshot': {
                        'selectionOrigin': before_selection.get('origin'),
                        'selectionRowCount': len(before_selection.get('rows') or []),
                        'commandOrigin': before_command.get('origin'),
                        'commandRowCount': len(before_command.get('rows') or []),
                    },
                    'afterSnapshot': {
                        'selectionOrigin': after_selection.get('origin'),
                        'selectionRowCount': len(after_selection.get('rows') or []),
                        'commandOrigin': after_command.get('origin'),
                        'commandRowCount': len(after_command.get('rows') or []),
                    },
                    'timestamp': time.time(),
                    'success': before_hud_mode != 2 and after_hud_mode == 2,
                }
                (evdir / 'strategy-authority-tab-click.json').write_text(
                    json.dumps(authority_tab_result, ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
                if not authority_tab_result['success']:
                    raise RuntimeError('strategy authority tab click did not enter HUD mode 2')
            if os.environ.get('LOGH_WAIT_STRATEGY_READY') == '1':
                ready_started = time.monotonic()
                ready_deadline = ready_started + 30
                ready_snapshot = None
                ready = False
                while time.monotonic() < ready_deadline and client.poll() is None:
                    try:
                        ready_snapshot = script.exports_sync.snapshot()
                    except (OSError, RuntimeError, TypeError, ValueError, frida.InvalidOperationError):
                        break
                    selection = ready_snapshot.get('selection') or {}
                    linkage = ready_snapshot.get('linkage') or {}
                    selection_origin = selection.get('origin') or {}
                    ready = (
                        ((selection_origin.get('x') or 0) > 0)
                        and len(selection.get('rows') or []) > 0
                        and ((linkage.get('unit0Id') or 0) > 0)
                        and ((linkage.get('char0Flagship') or 0) > 0)
                    )
                    if ready:
                        break
                    time.sleep(0.25)
                ready_payload = {
                    'ready': ready,
                    'elapsed': time.monotonic() - ready_started,
                    'snapshot': ready_snapshot,
                }
                if not ready:
                    ready_payload['timeout'] = True
                (evdir / 'strategy-ready.json').write_text(
                    json.dumps(ready_payload, ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1' and client.poll() is None:
                (evdir / 'selectgrid-before-sweep-force.json').write_text(
                    json.dumps(script.exports_sync.selectgridconfirmnow(), ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
            if os.environ.get('LOGH_STRATEGY_CLICK_SWEEP') == '1' and client.poll() is None:
                sweep = snapshots.with_name('click-sweep.jsonl')
                sweep_points = [
                    ('selection-row-top', (158, 16)),
                    ('selection-row-legacy', (158, 146)),
                    ('command-row-legacy', (57, 146)),
                    ('fleet-panel', (158, 456)),
                    ('own-fleet-row', (158, 456)),
                    ('move-command', (57, 574)),
                    ('destination', (512, 268)),
                ]
                if os.environ.get('LOGH_STRATEGY_CLICK_DYNAMIC') == '1':
                    initial = script.exports_sync.snapshot()
                    def center(origin, row):
                        return (
                            origin['x'] + row['rectX20'] + row['rectW2c'] // 2,
                            origin['y'] + row['rectY24'] + row['rectH30'] // 2,
                        )
                    selection_origin = initial['selection'].get('origin')
                    dynamic = []
                    if selection_origin and (selection_origin.get('x') or 0) > 0 and initial['selection']['rows']:
                        dynamic.append(('selection-row-dynamic', center(selection_origin, initial['selection']['rows'][0]['primary'])))
                    destination_point = (512, 268)
                    raw_destination = os.environ.get('LOGH_STRATEGY_DESTINATION_POINT')
                    if raw_destination:
                        try:
                            destination_point = tuple(int(part.strip()) for part in raw_destination.split(',', 1))
                            if len(destination_point) != 2:
                                destination_point = (512, 268)
                        except (TypeError, ValueError):
                            destination_point = (512, 268)
                    dynamic.append(('destination-dynamic', destination_point))
                    if dynamic:
                        sweep_points = dynamic
                command_points_inserted = False
                for current_index, (label, point) in enumerate(sweep_points):
                    ox, oy, width, height = client_geometry(hwnd)
                    x, y = scale((1028, 772), point, width, height)
                    foreground(hwnd)
                    mouse_click(ox + x, oy + y)
                    time.sleep(1)
                    if client.poll() is not None:
                        break
                    if label == 'selection-row-dynamic':
                        state = script.exports_sync.snapshot()
                        if not command_points_inserted:
                            refreshed_command_origin = state['command'].get('origin')
                            command_points = []
                            if refreshed_command_origin and (refreshed_command_origin.get('x') or 0) > 0:
                                for row in (state['command'].get('rows') or [])[:10]:
                                    command_points.append((f"command-row-{row['index']}-dynamic", center(refreshed_command_origin, row)))
                            destination_index = next(
                                index
                                for index, (candidate_label, _candidate_point) in enumerate(sweep_points)
                                if candidate_label == 'destination-dynamic'
                            )
                            sweep_points[destination_index:destination_index] = command_points
                            command_points_inserted = True
                    if label.startswith('command-row-'):
                        if label.endswith('-dynamic'):
                            state = script.exports_sync.snapshot()
                            if state['selectGrid'].get('mode') != 0:
                                sweep_points[current_index + 1:] = [
                                    item
                                    for item in sweep_points[current_index + 1:]
                                    if item[0] == 'destination-dynamic' or not item[0].startswith('command-row-')
                                ]
                    if label == 'destination-dynamic':
                        if os.environ.get('LOGH_FORCE_SELECTGRID_CONFIRM_AFTER_TARGET') == '1':
                            (evdir / 'selectgrid-confirm-after-target.json').write_text(
                                json.dumps(script.exports_sync.selectgridconfirmnow(), ensure_ascii=False, indent=2),
                                encoding='utf-8',
                            )
                            time.sleep(1)
                        if os.environ.get('LOGH_CLICK_CONFIRM_AFTER_TARGET') == '1':
                            try:
                                screenshot(hwnd, shots / 'confirm-before.png')
                            except (OSError, RuntimeError, TypeError, ValueError):
                                pass
                            confirm_point = (
                                int(os.environ.get('LOGH_CONFIRM_X', '536')),
                                int(os.environ.get('LOGH_CONFIRM_Y', '487')),
                            )
                            ox, oy, width, height = client_geometry(hwnd)
                            cx, cy = scale((1028, 772), confirm_point, width, height)
                            foreground(hwnd)
                            mouse_click(ox + cx, oy + cy)
                            time.sleep(1)
                            try:
                                screenshot(hwnd, shots / 'confirm-after.png')
                            except (OSError, RuntimeError, TypeError, ValueError):
                                pass
                    state = script.exports_sync.snapshot()
                    with sweep.open('a', encoding='utf-8') as output:
                        output.write(json.dumps({'label': label, 'point': point, **state}, ensure_ascii=False) + '\n')
            if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SEND') == '1':
                (evdir / 'selectgrid-before-send-force.json').write_text(
                    json.dumps(
                        {
                            'armed': before_send_force_arm,
                            'result': script.exports_sync.selectgridbeforesendresult(),
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding='utf-8',
                )
            for index in range(12):
                time.sleep(1)
                if client.poll() is not None:
                    break
                snapshot = script.exports_sync.snapshot()
                record = {'index': index, **snapshot}
                with snapshots.open('a', encoding='utf-8') as output:
                    output.write(json.dumps(record, ensure_ascii=False) + '\n')
                if index in (0, 5, 11):
                    try:
                        screenshot(hwnd, shots / f'{index:02d}-snapshot.png')
                    except (OSError, RuntimeError, TypeError, ValueError):
                        pass
            print(json.dumps({'event': 'strategy-table-probe-finished', 'snapshots': str(snapshots), 'clientPid': client.pid}, ensure_ascii=False))
            return 0
    finally:
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
    raise SystemExit(main())
