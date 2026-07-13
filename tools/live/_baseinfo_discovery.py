from __future__ import annotations

# LOGH VII 방어적 호환성 디스커버리 프로브. 전략맵 기지 커맨드 메뉴의 어느 항목이
# 창고 상세 정보패널(view kind 5/0x11)을 렌더시키는지 자연 UI 조작만으로 관측한다.
# tracer는 관측 전용(_frida_baseinfo_probe.js) — QA command injection(force export)은
# 절대 호출하지 않는다. LOGH_QA_WAREHOUSE_MARKER 는 설정하지 않는다(마커 OFF).

import hashlib
import json
import os
import subprocess
import sys
import time
from ctypes import wintypes
import ctypes
from pathlib import Path

import frida

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from logh7_agent_drive import client_geometry, do_login, find_client_hwnd, foreground, mouse_click, screenshot
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
    STRATEGY_REF,
    STRATEGY_UI_PATCH_MANIFEST,
    scale,
)

user32 = ctypes.windll.user32
ROOT = HERE.parents[1]
PROBE_JS = HERE / '_frida_baseinfo_probe.js'


def append_snapshot(path: Path, tag: str, snap: dict) -> None:
    with path.open('a', encoding='utf-8') as out:
        out.write(json.dumps({'tag': tag, 't': time.time(), **snap}, ensure_ascii=False) + '\n')


def is_detail_kind(kind) -> bool:
    return kind == 5 or kind == 0x11


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: py -3 _baseinfo_discovery.py <evidence-dir>')
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
            world_started = time.monotonic()
            world_ok = False
            while time.monotonic() < world_started + 8 and client.poll() is None:
                if 'ss-login-ok-sent' in server_log.read_text(encoding='utf-8', errors='ignore'):
                    world_ok = True
                    break
                time.sleep(0.25)
            (evdir / 'world-entry-gate.json').write_text(json.dumps({
                'success': world_ok, 'clientExitCode': client.poll(),
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            if not world_ok:
                raise RuntimeError('world entry success marker not observed')

            # 3) 전략맵 렌더 완료 대기 (결함 A 수정)
            # 과거: sel.get('hudModeF4') in (1, 2) 단독 판정 → NOW LOADING 화면에서 통과했다.
            # 실측 근거: 이 드라이버의 이전 런들(m3-baseinfo-view-trigger-discovery-*)은
            # hudModeF4=1 로 게이트를 통과했지만 shots/00-strategy-ready.png 는 NOW LOADING 이었고,
            # 이후 모든 클릭이 로딩 화면에 꽂혀 런 전체가 무의미했다.
            # 이제 렌더 완료 신호들의 논리곱을 연속 관측으로 요구하고, 타임아웃이면 fail-closed.
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

            # ===== STEP1: 기지 선택 (LOGH_BASEINFO_MARKER, 기본 610,380) =====
            raw_marker = os.environ.get('LOGH_BASEINFO_MARKER', '610,380')
            try:
                mx, my = (int(v) for v in raw_marker.split(','))
            except ValueError:
                mx, my = 610, 380
            marker_before = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'marker-before', marker_before)
            screenshot(hwnd, shots / '01-before-marker.png')
            ox, oy, width, height = client_geometry(hwnd)
            sx, sy = scale(STRATEGY_REF, (mx, my), width, height)
            foreground(hwnd)
            mouse_click(ox + sx, oy + sy)
            time.sleep(1.5)
            marker_after = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'marker-after', marker_after)
            screenshot(hwnd, shots / '02-after-marker.png')

            # ===== STEP2: 클릭 지점들 =====
            # LOGH_BASEINFO_POINTS="x,y;x,y;..." 가 있으면 그 명시 지점(라벨 버튼 등)을 순서대로 클릭.
            # 없으면 LOGH_BASEINFO_SWEEP="x,y0,step,count" 세로 스윕(기본 640,300,20,12).
            raw_points = os.environ.get('LOGH_BASEINFO_POINTS', '').strip()
            points: list = []
            if raw_points:
                for tok in raw_points.split(';'):
                    tok = tok.strip()
                    if not tok:
                        continue
                    try:
                        px, py = (int(v) for v in tok.split(','))
                        points.append((px, py))
                    except ValueError:
                        pass
            else:
                raw_sweep = os.environ.get('LOGH_BASEINFO_SWEEP', '640,300,20,12')
                try:
                    sweep_x, sweep_y0, sweep_step, sweep_count = (int(v) for v in raw_sweep.split(','))
                except ValueError:
                    sweep_x, sweep_y0, sweep_step, sweep_count = 640, 300, 20, 12
                points = [(sweep_x, sweep_y0 + i * sweep_step) for i in range(sweep_count)]
            sweep_records: list = []
            trigger_found = None
            for i, (px, py) in enumerate(points):
                before = script.exports_sync.snapshot()
                ox, oy, width, height = client_geometry(hwnd)
                dx, dy = scale(STRATEGY_REF, (px, py), width, height)
                foreground(hwnd)
                mouse_click(ox + dx, oy + dy)
                time.sleep(1.0)
                after = script.exports_sync.snapshot()
                screenshot(hwnd, shots / f'10-click-{i:02d}-{px}x{py}.png')

                b_view = before.get('view') or {}
                a_view = after.get('view') or {}
                b_render = before.get('render') or {}
                a_render = after.get('render') or {}
                b_slot = before.get('slot') or {}
                a_slot = after.get('slot') or {}
                after_kind = a_view.get('lastKind')
                slot_calls_delta = (a_slot.get('calls') or 0) - (b_slot.get('calls') or 0)
                record = {
                    'step': i,
                    'point': [px, py],
                    'viewCallsDelta': (a_view.get('calls') or 0) - (b_view.get('calls') or 0),
                    'lastKind': after_kind,
                    'renderNonzeroDelta': (a_render.get('nonzeroCalls') or 0) - (b_render.get('nonzeroCalls') or 0),
                    'slotCallsDelta': slot_calls_delta,
                    'slots': (a_slot.get('slots') or []),
                }
                sweep_records.append(record)
                append_snapshot(snapshots, f'sweep-{i:02d}', after)
                # view.lastKind 이 5/0x11 이 되거나 slot.calls 가 증가하면 트리거 발견 — 기록 후 즉시 중단.
                if is_detail_kind(after_kind) or slot_calls_delta > 0:
                    trigger_found = record
                    break

            final_snap = script.exports_sync.snapshot()
            append_snapshot(snapshots, 'final', final_snap)
            (evdir / 'baseinfo-discovery.json').write_text(json.dumps({
                'markerPoint': [mx, my],
                'markerBeforeSnap': marker_before,
                'markerAfterSnap': marker_after,
                'sweep': sweep_records,
                'triggerFound': trigger_found,
                'finalProbeSnapshot': final_snap,
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            screenshot(hwnd, shots / '99-final.png')

            print(json.dumps({
                'event': 'baseinfo-discovery-finished',
                'markerPoint': [mx, my],
                'sweepSteps': len(sweep_records),
                'triggerFound': trigger_found,
                'clientAlive': client.poll() is None,
                'evdir': str(evdir),
            }, ensure_ascii=False))
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
