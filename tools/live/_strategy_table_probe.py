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
CANONICAL_CLIENT_EXE = ROOT / 'artifacts' / 'logh7-install' / '____________s___' / '____' / 'exe' / 'g7mtclient.exe'
PREPARE_STRATEGY_UI_CLIENT = ROOT / 'tools' / 'live' / 'prepare_strategy_ui_client.mjs'
STRATEGY_UI_PATCH_MANIFEST = ROOT / 'server' / 'content' / 'client' / 'logh7-strategy-ui-label-patch.json'
M2_LAUNCH = ROOT / 'tools' / 'live' / '_m2_launch.mjs'
PROBE_JS = Path(__file__).resolve().parent / '_frida_strategy_snapshot.js'
LOBBY_REF = (1024, 768)
GAME_START = (125, 191)
CHAR_CARD = (655, 305)
STRATEGY_REF = (1028, 772)
STRATEGY_AUTHORITY_TAB = (735, 580)
STRATEGY_SYSTEM_MARKER = (515, 390)
STRATEGY_C002_UNIT_ROW_MODE1 = (158, 456)
EXPECTED_CANONICAL_CLIENT_SHA256 = '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51'
SELECTION_ADMISSION_METRIC_KEYS = (
    'selectionAdmissionWriterCalls',
    'selectionAdmissionLatchCalls',
    'selectionAdmissionEvent2EnqueueCalls',
    'selectionAdmissionEvent2DequeueCalls',
    'selectionAdmissionCalls',
    'selectionAdmissionAccepted',
    'selectionAdmissionModeApplyCalls',
    'selectionAdmissionLayoutOpenCalls',
    'selectionAdmissionHudModeSetCalls',
    'selectionAdmissionHudFrameTransitionCalls',
)
SYSTEM_OUTPUT_STAGE_KEYS = (
    'commandCard0305',
    'factory41Granted',
    'factory41Selected',
    'factory41Handler',
    'selectDialogCtor',
    'selectDialogTick',
    'genericListRow70',
    'selector',
    'refresh031f',
    'refresh0327',
    'panelDispatch',
    'renderSink',
)
SYSTEM_OUTPUT_RESPONSE_STAGE_KEYS = ('response031f', 'response0327')
SYSTEM_OUTPUT_ID_STAGE_KEYS = {
    'genericListRow70',
    'selector',
    'refresh031f',
    'refresh0327',
    'response031f',
    'response0327',
    'panelDispatch',
    'renderSink',
}
SYSTEM_OUTPUT_FACTORY_STAGE_KEYS = {
    'factory41Granted',
    'factory41Selected',
    'factory41Handler',
}

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


def selection_admission_metrics(system_detail):
    admission = system_detail.get('selectionAdmission') or {}
    counts = admission.get('counts') or {}
    selection_list = admission.get('selectionList') or {}
    return {
        'selectionAdmissionWriterCalls': counts.get('writer') or 0,
        'selectionAdmissionLatchCalls': counts.get('latch') or 0,
        'selectionAdmissionEvent2EnqueueCalls': counts.get('event2Enqueue') or 0,
        'selectionAdmissionEvent2DequeueCalls': counts.get('event2Dequeue') or 0,
        'selectionAdmissionCalls': counts.get('admission') or 0,
        'selectionAdmissionAccepted': counts.get('admissionAccepted') or 0,
        'selectionAdmissionModeApplyCalls': counts.get('modeApply') or 0,
        'selectionAdmissionLayoutOpenCalls': counts.get('layoutOpen') or 0,
        'selectionAdmissionHudModeSetCalls': counts.get('hudModeSet') or 0,
        'selectionAdmissionHudFrameTransitionCalls': counts.get('hudFrameTransition') or 0,
        'selectionAdmissionLast': admission.get('last'),
        'selectionAdmissionListBase': selection_list.get('base'),
        'selectionAdmissionListCount188': selection_list.get('listCount188'),
        'selectionAdmissionListSelected189': selection_list.get('listSelected189'),
    }


def selection_admission_delta(current, baseline):
    return {
        key: (current.get(key) or 0) - (baseline.get(key) or 0)
        for key in SELECTION_ADMISSION_METRIC_KEYS
    }


def selection_admission_phase(before_snapshot, after_snapshot):
    before_detail = before_snapshot.get('systemDetail') or {}
    after_detail = after_snapshot.get('systemDetail') or {}
    before_admission = before_detail.get('selectionAdmission') or {}
    after_admission = after_detail.get('selectionAdmission') or {}
    before_metrics = selection_admission_metrics(before_detail)
    after_metrics = selection_admission_metrics(after_detail)
    before_sequence = before_admission.get('sequence') or 0
    timeline = [
        entry
        for entry in after_admission.get('ring') or []
        if (entry.get('sequence') or 0) > before_sequence
    ]
    return {
        'before': before_metrics,
        'after': after_metrics,
        'delta': selection_admission_delta(after_metrics, before_metrics),
        'timeline': timeline,
        'selectionList': {
            'before': before_admission.get('selectionList'),
            'after': after_admission.get('selectionList'),
        },
    }


def system_output_trace_metrics(system_detail):
    trace = system_detail.get('systemOutputTrace') or {}
    counts = trace.get('counts') or {}
    last = trace.get('last') or {}
    correlation = trace.get('correlation') or {}
    command_card = trace.get('commandCard0305') or {}
    runtime = command_card.get('runtime') or {}
    panel_dispatch = last.get('panelDispatch') or {}
    render_sink = last.get('renderSink') or {}
    return {
        'sequence': trace.get('sequence') or 0,
        'stageCounts': {key: counts.get(key) or 0 for key in SYSTEM_OUTPUT_STAGE_KEYS},
        'commandCard0305Calls': counts.get('commandCard0305') or 0,
        'factory41GrantedCalls': counts.get('factory41Granted') or 0,
        'factory41SelectedCalls': counts.get('factory41Selected') or 0,
        'factory41HandlerCalls': counts.get('factory41Handler') or 0,
        'panelDispatchCalls': counts.get('panelDispatch') or 0,
        'renderSinkCalls': counts.get('renderSink') or 0,
        'response031fCalls': counts.get('response031f') or 0,
        'response0327Calls': counts.get('response0327') or 0,
        'panelDispatchId70': panel_dispatch.get('baseId') == 70,
        'renderSinkId70': render_sink.get('baseId') == 70,
        'factory41Granted': runtime.get('factory41Granted') is True,
        'runtimeFactoryIds': runtime.get('factoryIds') or [],
        'orderedId70Complete': correlation.get('orderedId70Complete') is True,
        'firstMissingStage': correlation.get('firstMissingStage'),
        'missingStages': correlation.get('missingStages') or [],
        'missingRequiredResponse0327': trace.get('missingRequiredResponse0327') is True,
        'panelStateMachineWaitsFor0327Ack': trace.get('panelStateMachineWaitsFor0327Ack') is True,
    }


def system_output_trace_delta(current, baseline):
    current_stages = current.get('stageCounts') or {}
    baseline_stages = baseline.get('stageCounts') or {}
    return {
        'stageCounts': {
            key: (current_stages.get(key) or 0) - (baseline_stages.get(key) or 0)
            for key in SYSTEM_OUTPUT_STAGE_KEYS
        },
        'panelDispatchDelta': (
            (current.get('panelDispatchCalls') or 0)
            - (baseline.get('panelDispatchCalls') or 0)
        ),
        'renderSinkDelta': (
            (current.get('renderSinkCalls') or 0)
            - (baseline.get('renderSinkCalls') or 0)
        ),
        'panelDispatchId70': current.get('panelDispatchId70') is True,
        'renderSinkId70': current.get('renderSinkId70') is True,
        'factory41Granted': current.get('factory41Granted') is True,
        'orderedId70Complete': current.get('orderedId70Complete') is True,
        'firstMissingStage': current.get('firstMissingStage'),
        'missingStages': current.get('missingStages') or [],
        'missingRequiredResponse0327': current.get('missingRequiredResponse0327') is True,
        'panelStateMachineWaitsFor0327Ack': (
            current.get('panelStateMachineWaitsFor0327Ack') is True
        ),
    }


def _system_output_trace_entry_matches(stage, entry):
    if stage in SYSTEM_OUTPUT_ID_STAGE_KEYS:
        return entry.get('baseId') == 70
    if stage in SYSTEM_OUTPUT_FACTORY_STAGE_KEYS:
        return entry.get('factoryId') == 0x41
    return True


def system_output_trace_phase(before_snapshot, after_snapshot):
    before_detail = before_snapshot.get('systemDetail') or {}
    after_detail = after_snapshot.get('systemDetail') or {}
    before_trace = before_detail.get('systemOutputTrace') or {}
    after_trace = after_detail.get('systemOutputTrace') or {}
    before_metrics = system_output_trace_metrics(before_detail)
    after_metrics = system_output_trace_metrics(after_detail)
    before_sequence = before_trace.get('sequence') or 0
    phase_timeline = [
        entry
        for entry in after_trace.get('timeline') or []
        if (entry.get('sequence') or 0) > before_sequence
    ]
    phase_ordered = []
    phase_ordered_by_stage = {}
    previous_sequence = before_sequence
    phase_first_unobserved_stage = None
    for stage in SYSTEM_OUTPUT_STAGE_KEYS:
        match = next((
            entry for entry in phase_timeline
            if (entry.get('sequence') or 0) > previous_sequence
            and entry.get('stage') == stage
            and _system_output_trace_entry_matches(stage, entry)
        ), None)
        if match is None:
            phase_first_unobserved_stage = stage
            break
        phase_ordered.append(match)
        phase_ordered_by_stage[stage] = match
        previous_sequence = match.get('sequence') or previous_sequence
    phase_response_dispatch_timeline = []
    for request_stage, response_stage in (
        ('refresh031f', 'response031f'),
        ('refresh0327', 'response0327'),
    ):
        request_entry = phase_ordered_by_stage.get(request_stage)
        response_entry = next((
            entry for entry in phase_timeline
            if request_entry is not None
            and (entry.get('sequence') or 0) > (request_entry.get('sequence') or 0)
            and entry.get('stage') == response_stage
            and _system_output_trace_entry_matches(response_stage, entry)
        ), None)
        if response_entry is not None:
            phase_response_dispatch_timeline.append(response_entry)
        elif phase_first_unobserved_stage is None:
            phase_first_unobserved_stage = response_stage
    phase_observed_stages = []
    for entry in phase_timeline:
        stage = entry.get('stage')
        if stage is not None and stage not in phase_observed_stages:
            phase_observed_stages.append(stage)
    phase_observed_stage_set = set(phase_observed_stages)
    phase_unobserved_stages = [
        stage for stage in SYSTEM_OUTPUT_STAGE_KEYS if stage not in phase_observed_stage_set
    ]
    for response_stage in SYSTEM_OUTPUT_RESPONSE_STAGE_KEYS:
        if not any(
            entry.get('stage') == response_stage
            for entry in phase_response_dispatch_timeline
        ):
            phase_unobserved_stages.append(response_stage)
    phase_panel_dispatch_id70 = any(
        entry.get('stage') == 'panelDispatch' and entry.get('baseId') == 70
        for entry in phase_timeline
    )
    phase_render_sink_id70 = any(
        entry.get('stage') == 'renderSink' and entry.get('baseId') == 70
        for entry in phase_timeline
    )
    phase_factory41_granted = any(
        entry.get('stage') == 'factory41Granted' and entry.get('factoryId') == 0x41
        for entry in phase_timeline
    )
    phase_response0327_observed = any(
        entry.get('stage') == 'response0327'
        for entry in phase_response_dispatch_timeline
    )
    delta = system_output_trace_delta(after_metrics, before_metrics)
    delta.update({
        'phasePanelDispatchId70': phase_panel_dispatch_id70,
        'phaseRenderSinkId70': phase_render_sink_id70,
        'phaseFactory41Granted': phase_factory41_granted,
        'phaseSequenceComplete': phase_first_unobserved_stage is None,
        'phaseFirstUnobservedStage': phase_first_unobserved_stage,
        'phaseUnobservedStages': phase_unobserved_stages,
        'phaseMissingRequiredResponse0327': not phase_response0327_observed,
    })
    return {
        'before': before_metrics,
        'after': after_metrics,
        'delta': delta,
        'runCorrelation': {
            'before': {
                'orderedId70Complete': before_metrics.get('orderedId70Complete') is True,
                'firstMissingStage': before_metrics.get('firstMissingStage'),
                'missingStages': before_metrics.get('missingStages') or [],
                'missingRequiredResponse0327': (
                    before_metrics.get('missingRequiredResponse0327') is True
                ),
            },
            'after': {
                'orderedId70Complete': after_metrics.get('orderedId70Complete') is True,
                'firstMissingStage': after_metrics.get('firstMissingStage'),
                'missingStages': after_metrics.get('missingStages') or [],
                'missingRequiredResponse0327': (
                    after_metrics.get('missingRequiredResponse0327') is True
                ),
            },
        },
        'orderedId70Complete': after_metrics.get('orderedId70Complete') is True,
        'firstMissingStage': after_metrics.get('firstMissingStage'),
        'missingStages': after_metrics.get('missingStages') or [],
        'missingRequiredResponse0327': after_metrics.get('missingRequiredResponse0327') is True,
        'phaseObservedStages': phase_observed_stages,
        'phaseTimeline': phase_timeline,
        'phaseOrderedTimeline': phase_ordered,
        'phaseResponseDispatchTimeline': phase_response_dispatch_timeline,
        'phasePanelDispatchId70': phase_panel_dispatch_id70,
        'phaseRenderSinkId70': phase_render_sink_id70,
        'phaseFactory41Granted': phase_factory41_granted,
        'phaseSequenceComplete': phase_first_unobserved_stage is None,
        'phaseFirstUnobservedStage': phase_first_unobserved_stage,
        'phaseUnobservedStages': phase_unobserved_stages,
        'phaseMissingRequiredResponse0327': not phase_response0327_observed,
    }


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
    evdir.mkdir(parents=True, exist_ok=True)
    ui_manifest = json.loads(STRATEGY_UI_PATCH_MANIFEST.read_text(encoding='utf-8'))
    expected_patched_sha256 = ui_manifest['expectedPatchedSha256'].lower()
    requested_client = os.environ.get('LOGH_CLIENT_EXE')
    if requested_client:
        client_exe = Path(requested_client).resolve()
        client_selection = {
            'path': str(client_exe),
            'mode': 'explicit',
            'manifestId': None,
        }
    else:
        prepared = subprocess.run(
            ['node', str(PREPARE_STRATEGY_UI_CLIENT)],
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        client_selection = json.loads(prepared.stdout)
        client_selection['selectionMode'] = 'default-overlay'
        client_exe = Path(client_selection['path']).resolve()
    if client_exe.name.lower() != 'g7mtclient.exe' or not client_exe.is_file():
        raise SystemExit('LOGH_CLIENT_EXE must point to an existing g7mtclient.exe')
    digest = hashlib.sha256(client_exe.read_bytes()).hexdigest()
    trusted_hashes = {EXPECTED_CANONICAL_CLIENT_SHA256, expected_patched_sha256}
    allow_noncanonical = os.environ.get('LOGH_ALLOW_NONCANONICAL_CLIENT') == '1'
    if digest not in trusted_hashes and not allow_noncanonical:
        raise SystemExit(f'client SHA-256 mismatch: {digest}')
    client_selection.update({
        'path': str(client_exe),
        'sha256': digest,
        'trusted': digest in trusted_hashes,
        'allowNoncanonical': allow_noncanonical,
        'canonicalPath': str(CANONICAL_CLIENT_EXE.resolve()),
    })
    (evdir / 'client-selection.json').write_text(
        json.dumps(client_selection, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
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
            world_entry_started = time.monotonic()
            world_entry_deadline = time.monotonic() + 8
            world_entry_ok = False
            retry_attempted = False
            retry_game_start_point = None
            retry_char_card_point = None
            while time.monotonic() < world_entry_deadline and client.poll() is None:
                try:
                    world_entry_log = server_log.read_text(encoding='utf-8', errors='ignore')
                except OSError:
                    world_entry_log = ''
                if 'ss-login-ok-sent' in world_entry_log:
                    world_entry_ok = True
                    break
                time.sleep(0.25)
            if not world_entry_ok and client.poll() is None:
                retry_attempted = True
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(LOBBY_REF, GAME_START, width, height)
                retry_game_start_point = (ox + x, oy + y)
                foreground(hwnd)
                mouse_click(ox + x, oy + y)
                time.sleep(3)
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(LOBBY_REF, CHAR_CARD, width, height)
                retry_char_card_point = (ox + x, oy + y)
                mouse_click(ox + x, oy + y)
                time.sleep(1)
                mouse_click(ox + x, oy + y)
                retry_deadline = time.monotonic() + 8
                while time.monotonic() < retry_deadline and client.poll() is None:
                    try:
                        world_entry_log = server_log.read_text(encoding='utf-8', errors='ignore')
                    except OSError:
                        world_entry_log = ''
                    if 'ss-login-ok-sent' in world_entry_log:
                        world_entry_ok = True
                        break
                    time.sleep(0.25)
            world_entry_result = {
                'success': world_entry_ok,
                'retryAttempted': retry_attempted,
                'elapsed': time.monotonic() - world_entry_started,
                'clientExitCode': client.poll(),
                'points': {
                    'retryGameStart': retry_game_start_point,
                    'retryCharCard': retry_char_card_point,
                },
            }
            (evdir / 'world-entry-gate.json').write_text(
                json.dumps(world_entry_result, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            if not world_entry_ok:
                raise RuntimeError('world entry success marker was not observed')
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
                        'cardKinds': base_selection.get('cardKinds') or [],
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
                authority_admission = selection_admission_phase(before_snapshot, after_snapshot)
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
                        'selectionListBase': before_selection.get('listBase'),
                        'listCount188': before_selection.get('listCount188'),
                        'listSelected189': before_selection.get('listSelected189'),
                        'commandOrigin': before_command.get('origin'),
                        'commandRowCount': len(before_command.get('rows') or []),
                    },
                    'afterSnapshot': {
                        'selectionOrigin': after_selection.get('origin'),
                        'selectionRowCount': len(after_selection.get('rows') or []),
                        'selectionListBase': after_selection.get('listBase'),
                        'listCount188': after_selection.get('listCount188'),
                        'listSelected189': after_selection.get('listSelected189'),
                        'commandOrigin': after_command.get('origin'),
                        'commandRowCount': len(after_command.get('rows') or []),
                    },
                    'selectionAdmission': authority_admission,
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
                    selection_hud_mode = selection.get('hudModeF4')
                    selection_origin_x = selection_origin.get('x')
                    selection_origin_y = selection_origin.get('y')
                    selection_origin_ready = (
                        (
                            selection_hud_mode == 1
                            and selection_origin_x == 0
                            and selection_origin_y == 0
                        )
                        or (
                            selection_origin_x is not None
                            and selection_origin_y is not None
                            and (selection_origin_x != 0 or selection_origin_y != 0)
                        )
                    )
                    ready = (
                        selection_origin_ready
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
                if not ready:
                    raise RuntimeError('strategy map did not become ready')
            if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1' and client.poll() is None:
                system_detail_ready_started = time.monotonic()
                system_detail_ready_deadline = system_detail_ready_started + 30
                system_detail_ready_snapshot = None
                system_detail_ready = False
                system_detail = {}
                summary = {}
                while time.monotonic() < system_detail_ready_deadline and client.poll() is None:
                    try:
                        system_detail_ready_snapshot = script.exports_sync.snapshot()
                    except (OSError, RuntimeError, TypeError, ValueError, frida.InvalidOperationError):
                        break
                    system_detail = system_detail_ready_snapshot.get('systemDetail') or {}
                    summary = system_detail.get('summary') or {}
                    system_detail_ready = (
                        summary.get('protocolAllDispatch') is True
                        and summary.get('cacheJoinComplete') is True
                    )
                    if system_detail_ready:
                        break
                    time.sleep(0.25)
                system_detail_ready_result = {
                    'ready': system_detail_ready,
                    'elapsed': time.monotonic() - system_detail_ready_started,
                    'lastSummary': summary,
                    'lastProtocol': system_detail.get('protocol'),
                    'lastCaches': system_detail.get('caches'),
                }
                (evdir / 'strategy-system-detail-ready.json').write_text(
                    json.dumps(system_detail_ready_result, ensure_ascii=False, indent=2),
                    encoding='utf-8',
                )
                if not system_detail_ready:
                    raise RuntimeError('system detail cache did not become ready')

                time.sleep(1.5)
                render_settled_at = time.time()
                ox, oy, width, height = client_geometry(hwnd)
                x, y = scale(STRATEGY_REF, STRATEGY_SYSTEM_MARKER, width, height)
                foreground(hwnd)

                before_captured_at = time.time()
                before_snapshot = script.exports_sync.snapshot()
                screenshot(hwnd, shots / 'strategy-system-marker-before.png')
                before_detail = before_snapshot.get('systemDetail') or {}
                before_lookups = before_detail.get('lookups') or {}
                before_base_lookup = before_lookups.get('base031f') or {}
                before_institution_lookup = before_lookups.get('institution0321') or {}
                before_panel = before_detail.get('panel') or {}
                before_selection_index = before_detail.get('selectionIndex') or {}
                before_selection_hit = before_snapshot.get('selectionHit') or {}
                before_metrics = {
                    'clientSpotResolverBase': before_detail.get('clientSpotResolverBase'),
                    'clientSpotResolverBaseReason': before_detail.get('clientSpotResolverBaseReason'),
                    'unit0SpotResolverBase': before_detail.get('unit0SpotResolverBase'),
                    'baseLookupTotalCalls': before_base_lookup.get('totalCalls') or 0,
                    'institutionLookupTotalCalls': before_institution_lookup.get('totalCalls') or 0,
                    'panelTotalCalls': before_panel.get('totalCalls') or 0,
                    'selectionIndexValidCalls': before_selection_index.get('validCalls') or 0,
                    'selectionIndexInRangeCalls': before_selection_index.get('inRangeCalls') or 0,
                    'selectionIndexChangedCalls': before_selection_index.get('selectionChangedCalls') or 0,
                    'infoPanelCandidateCalls': before_selection_index.get('infoPanelCandidateCalls') or 0,
                    'infoPanelSelectionChangedCalls': before_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                    'selectionHitCalls': before_selection_hit.get('calls') or 0,
                    'selectionHitAccepted': before_selection_hit.get('accepted') or 0,
                    'selectionHitRejected': before_selection_hit.get('rejected') or 0,
                    **selection_admission_metrics(before_detail),
                }

                mouse_click(ox + x, oy + y)
                single_clicked_at = time.time()
                time.sleep(0.5)
                single_captured_at = time.time()
                single_snapshot = script.exports_sync.snapshot()
                screenshot(hwnd, shots / 'strategy-system-marker-single.png')
                single_detail = single_snapshot.get('systemDetail') or {}
                single_lookups = single_detail.get('lookups') or {}
                single_base_lookup = single_lookups.get('base031f') or {}
                single_institution_lookup = single_lookups.get('institution0321') or {}
                single_panel = single_detail.get('panel') or {}
                single_selection_index = single_detail.get('selectionIndex') or {}
                single_selection_hit = single_snapshot.get('selectionHit') or {}
                single_metrics = {
                    'clientSpotResolverBase': single_detail.get('clientSpotResolverBase'),
                    'clientSpotResolverBaseReason': single_detail.get('clientSpotResolverBaseReason'),
                    'unit0SpotResolverBase': single_detail.get('unit0SpotResolverBase'),
                    'baseLookupTotalCalls': single_base_lookup.get('totalCalls') or 0,
                    'institutionLookupTotalCalls': single_institution_lookup.get('totalCalls') or 0,
                    'panelTotalCalls': single_panel.get('totalCalls') or 0,
                    'selectionIndexValidCalls': single_selection_index.get('validCalls') or 0,
                    'selectionIndexInRangeCalls': single_selection_index.get('inRangeCalls') or 0,
                    'selectionIndexChangedCalls': single_selection_index.get('selectionChangedCalls') or 0,
                    'infoPanelCandidateCalls': single_selection_index.get('infoPanelCandidateCalls') or 0,
                    'infoPanelSelectionChangedCalls': single_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                    'selectionHitCalls': single_selection_hit.get('calls') or 0,
                    'selectionHitAccepted': single_selection_hit.get('accepted') or 0,
                    'selectionHitRejected': single_selection_hit.get('rejected') or 0,
                    **selection_admission_metrics(single_detail),
                }
                single_delta = {
                    'baseLookupTotalCalls': single_metrics['baseLookupTotalCalls'] - before_metrics['baseLookupTotalCalls'],
                    'institutionLookupTotalCalls': single_metrics['institutionLookupTotalCalls'] - before_metrics['institutionLookupTotalCalls'],
                    'panelTotalCalls': single_metrics['panelTotalCalls'] - before_metrics['panelTotalCalls'],
                    'selectionIndexValidCalls': single_metrics['selectionIndexValidCalls'] - before_metrics['selectionIndexValidCalls'],
                    'selectionIndexInRangeCalls': single_metrics['selectionIndexInRangeCalls'] - before_metrics['selectionIndexInRangeCalls'],
                    'selectionIndexChangedCalls': single_metrics['selectionIndexChangedCalls'] - before_metrics['selectionIndexChangedCalls'],
                    'infoPanelCandidateCalls': single_metrics['infoPanelCandidateCalls'] - before_metrics['infoPanelCandidateCalls'],
                    'infoPanelSelectionChangedCalls': single_metrics['infoPanelSelectionChangedCalls'] - before_metrics['infoPanelSelectionChangedCalls'],
                    'selectionHitCalls': single_metrics['selectionHitCalls'] - before_metrics['selectionHitCalls'],
                    'selectionHitAccepted': single_metrics['selectionHitAccepted'] - before_metrics['selectionHitAccepted'],
                    'selectionHitRejected': single_metrics['selectionHitRejected'] - before_metrics['selectionHitRejected'],
                    **selection_admission_delta(single_metrics, before_metrics),
                }
                single_panel_delta = single_delta['panelTotalCalls']

                row_click_attempted = False
                row_reference_point = None
                row_screen_point = None
                row_point_source = None
                row_before_captured_at = None
                row_clicked_at = None
                row_captured_at = None
                row_before_snapshot = None
                row_before_metrics = None
                row_snapshot = None
                row_metrics = None
                row_delta = None
                row_panel_activated = False
                row_selection_activated = False
                row_info_panel_selection_activated = False
                row_activated = False
                selection = single_snapshot.get('selection') or {}
                selection_origin = selection.get('origin')
                selection_rows = selection.get('rows') or []
                row_primary = selection_rows[0].get('primary') if selection_rows else None
                row_mode1_zero_origin = (
                    selection.get('hudModeF4') == 1
                    and selection_origin is not None
                    and selection_origin.get('x') == 0
                    and selection_origin.get('y') == 0
                )
                row_dynamic_origin = (
                    selection_origin is not None
                    and selection_origin.get('x') is not None
                    and selection_origin.get('y') is not None
                    and (selection_origin.get('x') != 0 or selection_origin.get('y') != 0)
                )
                row_geometry_valid = (
                    (selection.get('listCount188') or 0) >= 1
                    and (row_mode1_zero_origin or row_dynamic_origin)
                    and row_primary is not None
                    and row_primary.get('rectX20') is not None
                    and row_primary.get('rectY24') is not None
                    and (row_primary.get('rectW2c') or 0) > 0
                    and (row_primary.get('rectH30') or 0) > 0
                )
                if single_panel_delta <= 0 and row_geometry_valid:
                    row_click_attempted = True
                    if row_mode1_zero_origin:
                        row_reference_point = STRATEGY_C002_UNIT_ROW_MODE1
                        row_point_source = 'hud-mode1-fixed'
                    else:
                        row_reference_point = (
                            selection_origin['x'] + row_primary['rectX20'] + row_primary['rectW2c'] // 2,
                            selection_origin['y'] + row_primary['rectY24'] + row_primary['rectH30'] // 2,
                        )
                        row_point_source = 'dynamic-origin'
                    row_ox, row_oy, row_width, row_height = client_geometry(hwnd)
                    row_x, row_y = scale(STRATEGY_REF, row_reference_point, row_width, row_height)
                    row_screen_point = (row_ox + row_x, row_oy + row_y)
                    foreground(hwnd)
                    row_before_captured_at = time.time()
                    row_before_snapshot = script.exports_sync.snapshot()
                    screenshot(hwnd, shots / 'strategy-c002-unit-row-before.png')
                    row_before_detail = row_before_snapshot.get('systemDetail') or {}
                    row_before_lookups = row_before_detail.get('lookups') or {}
                    row_before_base_lookup = row_before_lookups.get('base031f') or {}
                    row_before_institution_lookup = row_before_lookups.get('institution0321') or {}
                    row_before_panel = row_before_detail.get('panel') or {}
                    row_before_selection_index = row_before_detail.get('selectionIndex') or {}
                    row_before_selection_hit = row_before_snapshot.get('selectionHit') or {}
                    row_before_metrics = {
                        'clientSpotResolverBase': row_before_detail.get('clientSpotResolverBase'),
                        'clientSpotResolverBaseReason': row_before_detail.get('clientSpotResolverBaseReason'),
                        'unit0SpotResolverBase': row_before_detail.get('unit0SpotResolverBase'),
                        'baseLookupTotalCalls': row_before_base_lookup.get('totalCalls') or 0,
                        'institutionLookupTotalCalls': row_before_institution_lookup.get('totalCalls') or 0,
                        'panelTotalCalls': row_before_panel.get('totalCalls') or 0,
                        'selectionIndexValidCalls': row_before_selection_index.get('validCalls') or 0,
                        'selectionIndexInRangeCalls': row_before_selection_index.get('inRangeCalls') or 0,
                        'selectionIndexChangedCalls': row_before_selection_index.get('selectionChangedCalls') or 0,
                        'infoPanelCandidateCalls': row_before_selection_index.get('infoPanelCandidateCalls') or 0,
                        'infoPanelSelectionChangedCalls': row_before_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                        'selectionHitCalls': row_before_selection_hit.get('calls') or 0,
                        'selectionHitAccepted': row_before_selection_hit.get('accepted') or 0,
                        'selectionHitRejected': row_before_selection_hit.get('rejected') or 0,
                        **selection_admission_metrics(row_before_detail),
                    }
                    mouse_click(row_ox + row_x, row_oy + row_y)
                    row_clicked_at = time.time()
                    time.sleep(0.5)
                    row_captured_at = time.time()
                    row_snapshot = script.exports_sync.snapshot()
                    screenshot(hwnd, shots / 'strategy-c002-unit-row-after.png')
                    row_detail = row_snapshot.get('systemDetail') or {}
                    row_lookups = row_detail.get('lookups') or {}
                    row_base_lookup = row_lookups.get('base031f') or {}
                    row_institution_lookup = row_lookups.get('institution0321') or {}
                    row_panel = row_detail.get('panel') or {}
                    row_selection_index = row_detail.get('selectionIndex') or {}
                    row_selection_hit = row_snapshot.get('selectionHit') or {}
                    row_metrics = {
                        'clientSpotResolverBase': row_detail.get('clientSpotResolverBase'),
                        'clientSpotResolverBaseReason': row_detail.get('clientSpotResolverBaseReason'),
                        'unit0SpotResolverBase': row_detail.get('unit0SpotResolverBase'),
                        'baseLookupTotalCalls': row_base_lookup.get('totalCalls') or 0,
                        'institutionLookupTotalCalls': row_institution_lookup.get('totalCalls') or 0,
                        'panelTotalCalls': row_panel.get('totalCalls') or 0,
                        'selectionIndexValidCalls': row_selection_index.get('validCalls') or 0,
                        'selectionIndexInRangeCalls': row_selection_index.get('inRangeCalls') or 0,
                        'selectionIndexChangedCalls': row_selection_index.get('selectionChangedCalls') or 0,
                        'infoPanelCandidateCalls': row_selection_index.get('infoPanelCandidateCalls') or 0,
                        'infoPanelSelectionChangedCalls': row_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                        'selectionHitCalls': row_selection_hit.get('calls') or 0,
                        'selectionHitAccepted': row_selection_hit.get('accepted') or 0,
                        'selectionHitRejected': row_selection_hit.get('rejected') or 0,
                        **selection_admission_metrics(row_detail),
                    }
                    row_delta = {
                        'baseLookupTotalCalls': row_metrics['baseLookupTotalCalls'] - row_before_metrics['baseLookupTotalCalls'],
                        'institutionLookupTotalCalls': row_metrics['institutionLookupTotalCalls'] - row_before_metrics['institutionLookupTotalCalls'],
                        'panelTotalCalls': row_metrics['panelTotalCalls'] - row_before_metrics['panelTotalCalls'],
                        'selectionIndexValidCalls': row_metrics['selectionIndexValidCalls'] - row_before_metrics['selectionIndexValidCalls'],
                        'selectionIndexInRangeCalls': row_metrics['selectionIndexInRangeCalls'] - row_before_metrics['selectionIndexInRangeCalls'],
                        'selectionIndexChangedCalls': row_metrics['selectionIndexChangedCalls'] - row_before_metrics['selectionIndexChangedCalls'],
                        'infoPanelCandidateCalls': row_metrics['infoPanelCandidateCalls'] - row_before_metrics['infoPanelCandidateCalls'],
                        'infoPanelSelectionChangedCalls': row_metrics['infoPanelSelectionChangedCalls'] - row_before_metrics['infoPanelSelectionChangedCalls'],
                        'selectionHitCalls': row_metrics['selectionHitCalls'] - row_before_metrics['selectionHitCalls'],
                        'selectionHitAccepted': row_metrics['selectionHitAccepted'] - row_before_metrics['selectionHitAccepted'],
                        'selectionHitRejected': row_metrics['selectionHitRejected'] - row_before_metrics['selectionHitRejected'],
                        **selection_admission_delta(row_metrics, row_before_metrics),
                    }
                    row_panel_activated = row_delta['panelTotalCalls'] > 0
                    row_selection_activated = row_delta['selectionIndexChangedCalls'] > 0
                    row_info_panel_selection_activated = row_delta['infoPanelSelectionChangedCalls'] > 0
                    row_activated = row_panel_activated or row_selection_activated

                double_before_captured_at = None
                double_before_snapshot = None
                double_before_metrics = None
                double_clicked_at = None
                double_captured_at = None
                double_snapshot = None
                double_metrics = None
                double_delta = None
                fallback_attempted = False
                if single_panel_delta <= 0 and not row_activated:
                    fallback_attempted = True
                    double_before_captured_at = time.time()
                    double_before_snapshot = script.exports_sync.snapshot()
                    double_before_detail = double_before_snapshot.get('systemDetail') or {}
                    double_before_lookups = double_before_detail.get('lookups') or {}
                    double_before_base_lookup = double_before_lookups.get('base031f') or {}
                    double_before_institution_lookup = double_before_lookups.get('institution0321') or {}
                    double_before_panel = double_before_detail.get('panel') or {}
                    double_before_selection_index = double_before_detail.get('selectionIndex') or {}
                    double_before_selection_hit = double_before_snapshot.get('selectionHit') or {}
                    double_before_metrics = {
                        'clientSpotResolverBase': double_before_detail.get('clientSpotResolverBase'),
                        'clientSpotResolverBaseReason': double_before_detail.get('clientSpotResolverBaseReason'),
                        'unit0SpotResolverBase': double_before_detail.get('unit0SpotResolverBase'),
                        'baseLookupTotalCalls': double_before_base_lookup.get('totalCalls') or 0,
                        'institutionLookupTotalCalls': double_before_institution_lookup.get('totalCalls') or 0,
                        'panelTotalCalls': double_before_panel.get('totalCalls') or 0,
                        'selectionIndexValidCalls': double_before_selection_index.get('validCalls') or 0,
                        'selectionIndexInRangeCalls': double_before_selection_index.get('inRangeCalls') or 0,
                        'selectionIndexChangedCalls': double_before_selection_index.get('selectionChangedCalls') or 0,
                        'infoPanelCandidateCalls': double_before_selection_index.get('infoPanelCandidateCalls') or 0,
                        'infoPanelSelectionChangedCalls': double_before_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                        'selectionHitCalls': double_before_selection_hit.get('calls') or 0,
                        'selectionHitAccepted': double_before_selection_hit.get('accepted') or 0,
                        'selectionHitRejected': double_before_selection_hit.get('rejected') or 0,
                        **selection_admission_metrics(double_before_detail),
                    }
                    mouse_click(ox + x, oy + y)
                    time.sleep(0.15)
                    mouse_click(ox + x, oy + y)
                    double_clicked_at = time.time()
                    time.sleep(0.5)
                    double_captured_at = time.time()
                    double_snapshot = script.exports_sync.snapshot()
                    screenshot(hwnd, shots / 'strategy-system-marker-double.png')
                    double_detail = double_snapshot.get('systemDetail') or {}
                    double_lookups = double_detail.get('lookups') or {}
                    double_base_lookup = double_lookups.get('base031f') or {}
                    double_institution_lookup = double_lookups.get('institution0321') or {}
                    double_panel = double_detail.get('panel') or {}
                    double_selection_index = double_detail.get('selectionIndex') or {}
                    double_selection_hit = double_snapshot.get('selectionHit') or {}
                    double_metrics = {
                        'clientSpotResolverBase': double_detail.get('clientSpotResolverBase'),
                        'clientSpotResolverBaseReason': double_detail.get('clientSpotResolverBaseReason'),
                        'unit0SpotResolverBase': double_detail.get('unit0SpotResolverBase'),
                        'baseLookupTotalCalls': double_base_lookup.get('totalCalls') or 0,
                        'institutionLookupTotalCalls': double_institution_lookup.get('totalCalls') or 0,
                        'panelTotalCalls': double_panel.get('totalCalls') or 0,
                        'selectionIndexValidCalls': double_selection_index.get('validCalls') or 0,
                        'selectionIndexInRangeCalls': double_selection_index.get('inRangeCalls') or 0,
                        'selectionIndexChangedCalls': double_selection_index.get('selectionChangedCalls') or 0,
                        'infoPanelCandidateCalls': double_selection_index.get('infoPanelCandidateCalls') or 0,
                        'infoPanelSelectionChangedCalls': double_selection_index.get('infoPanelSelectionChangedCalls') or 0,
                        'selectionHitCalls': double_selection_hit.get('calls') or 0,
                        'selectionHitAccepted': double_selection_hit.get('accepted') or 0,
                        'selectionHitRejected': double_selection_hit.get('rejected') or 0,
                        **selection_admission_metrics(double_detail),
                    }
                    double_delta = {
                        'baseLookupTotalCalls': double_metrics['baseLookupTotalCalls'] - double_before_metrics['baseLookupTotalCalls'],
                        'institutionLookupTotalCalls': double_metrics['institutionLookupTotalCalls'] - double_before_metrics['institutionLookupTotalCalls'],
                        'panelTotalCalls': double_metrics['panelTotalCalls'] - double_before_metrics['panelTotalCalls'],
                        'selectionIndexValidCalls': double_metrics['selectionIndexValidCalls'] - double_before_metrics['selectionIndexValidCalls'],
                        'selectionIndexInRangeCalls': double_metrics['selectionIndexInRangeCalls'] - double_before_metrics['selectionIndexInRangeCalls'],
                        'selectionIndexChangedCalls': double_metrics['selectionIndexChangedCalls'] - double_before_metrics['selectionIndexChangedCalls'],
                        'infoPanelCandidateCalls': double_metrics['infoPanelCandidateCalls'] - double_before_metrics['infoPanelCandidateCalls'],
                        'infoPanelSelectionChangedCalls': double_metrics['infoPanelSelectionChangedCalls'] - double_before_metrics['infoPanelSelectionChangedCalls'],
                        'selectionHitCalls': double_metrics['selectionHitCalls'] - double_before_metrics['selectionHitCalls'],
                        'selectionHitAccepted': double_metrics['selectionHitAccepted'] - double_before_metrics['selectionHitAccepted'],
                        'selectionHitRejected': double_metrics['selectionHitRejected'] - double_before_metrics['selectionHitRejected'],
                        **selection_admission_delta(double_metrics, double_before_metrics),
                    }

                final_metrics = double_metrics or row_metrics or single_metrics
                final_snapshot = double_snapshot or row_snapshot or single_snapshot
                final_delta = {
                    'baseLookupTotalCalls': final_metrics['baseLookupTotalCalls'] - before_metrics['baseLookupTotalCalls'],
                    'institutionLookupTotalCalls': final_metrics['institutionLookupTotalCalls'] - before_metrics['institutionLookupTotalCalls'],
                    'panelTotalCalls': final_metrics['panelTotalCalls'] - before_metrics['panelTotalCalls'],
                    'selectionIndexValidCalls': final_metrics['selectionIndexValidCalls'] - before_metrics['selectionIndexValidCalls'],
                    'selectionIndexInRangeCalls': final_metrics['selectionIndexInRangeCalls'] - before_metrics['selectionIndexInRangeCalls'],
                    'selectionIndexChangedCalls': final_metrics['selectionIndexChangedCalls'] - before_metrics['selectionIndexChangedCalls'],
                    'infoPanelCandidateCalls': final_metrics['infoPanelCandidateCalls'] - before_metrics['infoPanelCandidateCalls'],
                    'infoPanelSelectionChangedCalls': final_metrics['infoPanelSelectionChangedCalls'] - before_metrics['infoPanelSelectionChangedCalls'],
                    'selectionHitCalls': final_metrics['selectionHitCalls'] - before_metrics['selectionHitCalls'],
                    'selectionHitAccepted': final_metrics['selectionHitAccepted'] - before_metrics['selectionHitAccepted'],
                    'selectionHitRejected': final_metrics['selectionHitRejected'] - before_metrics['selectionHitRejected'],
                    **selection_admission_delta(final_metrics, before_metrics),
                }
                final_panel_delta = final_delta['panelTotalCalls']
                marker_result = {
                    'point': {
                        'reference': STRATEGY_SYSTEM_MARKER,
                        'screen': (ox + x, oy + y),
                    },
                    'gesture': {
                        'primary': 'single-left-click',
                        'fallback': 'double-left-click',
                        'fallbackAttempted': fallback_attempted,
                        'fallbackCondition': 'single panel delta <= 0 and row did not activate panel or selection index',
                        'doubleIntervalSeconds': 0.15,
                    },
                    'rowClickAttempted': row_click_attempted,
                    'rowPoint': {
                        'reference': row_reference_point,
                        'screen': row_screen_point,
                    },
                    'rowPointSource': row_point_source,
                    'rowPanelActivated': row_panel_activated,
                    'rowSelectionActivated': row_selection_activated,
                    'rowInfoPanelSelectionActivated': row_info_panel_selection_activated,
                    'rowActivated': row_activated,
                    'renderSettleSeconds': 1.5,
                    'renderSettledAt': render_settled_at,
                    'timestamps': {
                        'beforeCapturedAt': before_captured_at,
                        'singleClickedAt': single_clicked_at,
                        'singleCapturedAt': single_captured_at,
                        'rowBeforeCapturedAt': row_before_captured_at,
                        'rowClickedAt': row_clicked_at,
                        'rowCapturedAt': row_captured_at,
                        'doubleBeforeCapturedAt': double_before_captured_at,
                        'doubleClickedAt': double_clicked_at,
                        'doubleCapturedAt': double_captured_at,
                    },
                    'before': before_metrics,
                    'single': single_metrics,
                    'rowBefore': row_before_metrics,
                    'row': row_metrics,
                    'doubleBefore': double_before_metrics,
                    'double': double_metrics,
                    'after': final_metrics,
                    'baselines': {
                        'marker': before_metrics,
                        'row': row_before_metrics,
                        'double': double_before_metrics,
                    },
                    'deltas': {
                        'singleFromBefore': single_delta,
                        'rowFromRowBefore': row_delta,
                        'doubleFromDoubleBefore': double_delta,
                        'finalFromBefore': final_delta,
                    },
                    'systemOutputTrace': {
                        'singleFromBefore': system_output_trace_phase(
                            before_snapshot, single_snapshot,
                        ),
                        'rowFromRowBefore': (
                            system_output_trace_phase(row_before_snapshot, row_snapshot)
                            if row_before_snapshot is not None and row_snapshot is not None
                            else None
                        ),
                        'doubleFromDoubleBefore': (
                            system_output_trace_phase(double_before_snapshot, double_snapshot)
                            if double_before_snapshot is not None and double_snapshot is not None
                            else None
                        ),
                        'finalFromBefore': system_output_trace_phase(before_snapshot, final_snapshot),
                    },
                    'selectionAdmissionLast': {
                        'markerBefore': before_metrics['selectionAdmissionLast'],
                        'single': single_metrics['selectionAdmissionLast'],
                        'rowBefore': (
                            row_before_metrics['selectionAdmissionLast'] if row_before_metrics else None
                        ),
                        'row': row_metrics['selectionAdmissionLast'] if row_metrics else None,
                        'doubleBefore': (
                            double_before_metrics['selectionAdmissionLast'] if double_before_metrics else None
                        ),
                        'double': double_metrics['selectionAdmissionLast'] if double_metrics else None,
                        'final': final_metrics['selectionAdmissionLast'],
                    },
                    'snapshots': {
                        'before': before_snapshot,
                        'single': single_snapshot,
                        'rowBefore': row_before_snapshot,
                        'row': row_snapshot,
                        'doubleBefore': double_before_snapshot,
                        'double': double_snapshot,
                        'after': final_snapshot,
                    },
                    'consumerActivated': final_panel_delta > 0,
                    'selectionActivated': final_delta['selectionIndexChangedCalls'] > 0,
                    'infoPanelSelectionActivated': final_delta['infoPanelSelectionChangedCalls'] > 0,
                    'lookupActivated': (
                        final_delta['baseLookupTotalCalls'] > 0
                        or final_delta['institutionLookupTotalCalls'] > 0
                    ),
                }
                (evdir / 'strategy-system-marker-click.json').write_text(
                    json.dumps(marker_result, ensure_ascii=False, indent=2),
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
