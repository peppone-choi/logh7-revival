import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const PROBE_URL = new URL('../../tools/live/_strategy_table_probe.py', import.meta.url);
const FRIDA_URL = new URL('../../tools/live/_frida_strategy_snapshot.js', import.meta.url);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `invalid source slice: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

test('로그인 성공 마커가 없으면 로비 안정화와 클릭 전에 중단한다', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const login = sliceBetween(
    source,
    'if width < 900:',
    "if os.environ.get('LOGH_INPUT_TICK') == '1'",
  );

  assert.match(login, /lobby_login_ok = False/);
  assert.match(login, /if 'lobby-login-ok-sent' in lobby_log:\s+lobby_login_ok = True/);
  assert.match(login, /'success': lobby_login_ok/);
  assert.match(login, /'elapsed': time\.monotonic\(\) - login_gate_started/);
  assert.match(login, /'clientExitCode': client\.poll\(\)/);
  assert.match(login, /'lobby-login-ok-sent': lobby_login_ok/);
  const artifactIndex = login.indexOf("(evdir / 'login-gate.json').write_text(");
  const failureIndex = login.indexOf('if not lobby_login_ok:');
  const runtimeFailureIndex = login.indexOf("raise RuntimeError('lobby login success marker was not observed')");
  const stabilizationIndex = login.indexOf('time.sleep(9)');
  const lobbyClickIndex = login.indexOf('mouse_click(ox + x, oy + y)');
  assert.ok(artifactIndex >= 0);
  assert.ok(failureIndex > artifactIndex);
  assert.ok(runtimeFailureIndex > failureIndex);
  assert.ok(stabilizationIndex > runtimeFailureIndex);
  assert.ok(lobbyClickIndex > stabilizationIndex);
  assert.match(login, /raise RuntimeError\('lobby login success marker was not observed'\)/);
});

test('전략 프로브는 명령표 주입·적용과 초점 셀 뒤에 HUD 전환을 실행한다', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const markers = [
    'if click_strategy_authority_tab and client.poll() is None:',
    "if os.environ.get('LOGH_FORCE_COMMAND_TABLE') == '1'",
    "if os.environ.get('LOGH_FORCE_COMMAND_TABLE_APPLY') == '1'",
    "if os.environ.get('LOGH_FORCE_FOCUS_CELL') == '1'",
    "if os.environ.get('LOGH_FORCE_HUD_MODE2') == '1'",
    'if click_strategy_authority_tab and client.poll() is None and authority_tab_base_snapshot is not None:',
    "if os.environ.get('LOGH_WAIT_STRATEGY_READY') == '1'",
  ];
  const positions = markers.map((marker) => source.indexOf(marker));

  assert.equal(positions.every((position) => position >= 0), true, `missing marker: ${JSON.stringify(positions)}`);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
});

test('전략 readiness는 선택 행만 기다리고 명령 원점은 선택 클릭 뒤에 연다', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const readiness = sliceBetween(
    source,
    "if os.environ.get('LOGH_WAIT_STRATEGY_READY') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  assert.match(readiness, /selection_origin/);
  assert.doesNotMatch(readiness, /command_origin/);
  assert.doesNotMatch(readiness, /len\(command\.get\('rows'\)/);
});

test('동적 클릭은 선택 뒤 새 명령 원점으로 명령 좌표를 다시 만든다', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const sweep = sliceBetween(
    source,
    "if os.environ.get('LOGH_STRATEGY_CLICK_SWEEP') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SEND') == '1'",
  );

  assert.match(sweep, /if label == 'selection-row-dynamic':/);
  assert.match(sweep, /refreshed_command_origin = state\['command'\]\.get\('origin'\)/);
  assert.match(sweep, /sweep_points\[destination_index:destination_index\] = command_points/);
});

test('active selectGrid removes only later dynamic commands and preserves destination', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const sweep = sliceBetween(
    source,
    "if os.environ.get('LOGH_STRATEGY_CLICK_SWEEP') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SEND') == '1'",
  );

  assert.match(sweep, /for current_index, \(label, point\) in enumerate\(sweep_points\):/);
  assert.match(sweep, /if label\.startswith\('command-row-'\):/);
  assert.match(sweep, /state\['selectGrid'\]\.get\('mode'\) != 0/);
  assert.match(sweep, /sweep_points\[current_index \+ 1:\] = \[/);
  assert.match(sweep, /item\[0\] == 'destination-dynamic'/);
});

test('QA 명령표 주입은 자연 선택 범주 0과 1을 함께 채운다', async () => {
  const source = await readFile(FRIDA_URL, 'utf8');

  assert.match(source, /for \(const category of \[0, 1\]\)/);
  assert.match(source, /const record = table\.add\(category \* 0x46\)/);
  assert.match(source, /record\.add\(0x1e\)\.writeU8\(2\)/);
});

test('자연 확인 대화상자 클릭은 강제 확인 없이도 실행된다', async () => {
  const source = await readFile(PROBE_URL, 'utf8');
  const sweep = sliceBetween(
    source,
    "if os.environ.get('LOGH_STRATEGY_CLICK_SWEEP') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SEND') == '1'",
  );
  const lines = sweep.split('\n');
  const destinationIndex = lines.findIndex((line) => line.includes("if label == 'destination-dynamic':"));
  const forceIndex = lines.findIndex((line, index) => (
    index > destinationIndex
      && line.includes("if os.environ.get('LOGH_FORCE_SELECTGRID_CONFIRM_AFTER_TARGET') == '1':")
  ));
  const clickIndex = lines.findIndex((line, index) => (
    index > destinationIndex
      && line.includes("if os.environ.get('LOGH_CLICK_CONFIRM_AFTER_TARGET') == '1':")
  ));

  assert.ok(destinationIndex >= 0);
  assert.ok(forceIndex > destinationIndex);
  assert.ok(clickIndex > forceIndex);
  const indentation = (line) => line.match(/^\s*/)[0].length;
  assert.equal(indentation(lines[forceIndex]), indentation(lines[clickIndex]));
  assert.equal(indentation(lines[forceIndex]), indentation(lines[destinationIndex]) + 4);
});

test('전략 권한 탭 클릭은 강제 HUD mode2와 함께 실행할 수 없다', async () => {
  // 준비: 프로브 main 진입부만 읽는다.
  const source = await readFile(PROBE_URL, 'utf8');

  // 실행: 라이브 부작용이 시작되기 전 구간을 분리한다.
  const startup = sliceBetween(source, 'def main():', 'evdir = Path(sys.argv[1]).resolve()');

  // 검증: 두 QA 경로를 먼저 파싱하고 동시에 켜진 실행을 즉시 거부한다.
  assert.match(startup, /force_hud_mode2 = os\.environ\.get\('LOGH_FORCE_HUD_MODE2'\) == '1'/);
  assert.match(startup, /click_strategy_authority_tab = os\.environ\.get\('LOGH_CLICK_STRATEGY_AUTHORITY_TAB'\) == '1'/);
  assert.match(startup, /if force_hud_mode2 and click_strategy_authority_tab:/);
  assert.match(startup, /raise SystemExit\('LOGH_FORCE_HUD_MODE2 and LOGH_CLICK_STRATEGY_AUTHORITY_TAB are mutually exclusive'\)/);
});

test('자연 전략 권한 탭은 기본 HUD 준비를 확인한 뒤 강제 단계를 실행한다', async () => {
  // 준비: 자연 클릭 전용 준비 구간을 읽는다.
  const source = await readFile(PROBE_URL, 'utf8');

  // 실행: base readiness와 첫 강제 단계 사이를 분리한다.
  const readiness = sliceBetween(
    source,
    'if click_strategy_authority_tab and client.poll() is None:',
    "if os.environ.get('LOGH_FORCE_COMMAND_TABLE') == '1'",
  );

  // 검증: 실제 전략 HUD의 모든 필수 상태를 30초 안에 관측한다.
  assert.match(readiness, /authority_tab_base_deadline = authority_tab_base_started \+ 30/);
  assert.match(readiness, /selection\.get\('hudModeF4'\) == 1/);
  assert.match(readiness, /\(selection\.get\('listCount188'\) or 0\) >= 1/);
  assert.match(readiness, /\(selection\.get\('payloadCount270'\) or 0\) >= 1/);
  assert.match(readiness, /linkage\.get\('gridActive126710'\) == 1/);
  assert.match(readiness, /linkage\.get\('fieldMode126711'\) == 2/);
  assert.match(readiness, /\(linkage\.get\('unit0Id'\) or 0\) > 0/);
  assert.match(readiness, /\(linkage\.get\('char0Flagship'\) or 0\) > 0/);
  assert.match(readiness, /strategy-authority-tab-ready\.json/);
  assert.match(readiness, /'ready'/);
  assert.match(readiness, /'elapsed'/);
  assert.match(readiness, /'lastSnapshot'/);
  const artifactIndex = readiness.indexOf("(evdir / 'strategy-authority-tab-ready.json').write_text(");
  const failureIndex = readiness.indexOf('if not authority_tab_base_ready:');
  assert.ok(artifactIndex >= 0);
  assert.ok(failureIndex > artifactIndex);
  assert.match(readiness, /raise RuntimeError\('strategy authority tab base HUD did not become ready'\)/);
});

test('자연 전략 권한 탭 클릭은 고정 좌표와 전환 증거를 남긴다', async () => {
  // 준비: 전략 HUD 좌표계와 클릭 단계가 포함된 프로브를 읽는다.
  const source = await readFile(PROBE_URL, 'utf8');

  // 실행: 자연 클릭 블록만 분리한다.
  const click = sliceBetween(
    source,
    'if click_strategy_authority_tab and client.poll() is None and authority_tab_base_snapshot is not None:',
    "if os.environ.get('LOGH_WAIT_STRATEGY_READY') == '1'",
  );

  // 검증: 실측 탭을 클릭하고 전후 PNG 및 최소 HUD 스냅샷을 기록한다.
  assert.match(source, /STRATEGY_REF = \(1028, 772\)/);
  assert.match(source, /STRATEGY_AUTHORITY_TAB = \(735, 580\)/);
  assert.match(click, /scale\(STRATEGY_REF, STRATEGY_AUTHORITY_TAB, width, height\)/);
  assert.match(click, /mouse_click\(ox \+ x, oy \+ y\)/);
  assert.match(click, /strategy-authority-tab-before\.png/);
  assert.match(click, /strategy-authority-tab-after\.png/);
  assert.match(click, /strategy-authority-tab-click\.json/);
  assert.match(click, /'beforeHudModeF4'/);
  assert.match(click, /'afterHudModeF4'/);
  assert.match(click, /'beforeSnapshot'/);
  assert.match(click, /'afterSnapshot'/);
  assert.match(click, /'timestamp'/);
  assert.match(click, /'success'/);
  assert.ok(click.match(/script\.exports_sync\.snapshot\(\)/g)?.length >= 2);
  const artifactIndex = click.indexOf("(evdir / 'strategy-authority-tab-click.json').write_text(");
  const failureIndex = click.indexOf("if not authority_tab_result['success']:");
  assert.ok(artifactIndex >= 0);
  assert.ok(failureIndex > artifactIndex);
  assert.match(click, /raise RuntimeError\('strategy authority tab click did not enter HUD mode 2'\)/);
});

test('constmsg 조회 계측은 대상 그룹과 호출자 및 반환 원문만 제한적으로 기록한다', async () => {
  // 준비: 전략 스냅샷 Frida 소스를 읽는다.
  const source = await readFile(FRIDA_URL, 'utf8');

  // 실행: constmsg 조회 hook 구간만 분리한다.
  const hook = sliceBetween(
    source,
    "const CONST_MSG_LOOKUP = abs('0x00522010');",
    'const selectionHitState =',
  );

  // 검증: 읽기 전용 계측 주소·필터·호출자·bounded ring·반환 원문을 고정한다.
  assert.match(hook, /const CONST_MSG_LOOKUP_RING_LIMIT = 128;/);
  assert.match(hook, /Interceptor\.attach\(CONST_MSG_LOOKUP, \{/);
  assert.match(hook, /const group = safe\(\(\) => args\[0\]\.toInt32\(\)\);/);
  assert.match(hook, /const subId = safe\(\(\) => args\[1\]\.toInt32\(\)\);/);
  assert.match(hook, /if \(group !== 0x62 && group !== 0x67\) return;/);
  assert.match(hook, /totalMatchedCalls \+= 1/);
  assert.match(hook, /ptr\(this\.returnAddress\)\.sub\(moduleBase\)\.add\(IMAGE_BASE\)\.toString\(\)/);
  assert.match(hook, /constMsgLookupState\.ring\.push\(entry\)/);
  assert.match(hook, /constMsgLookupState\.ring\.length > CONST_MSG_LOOKUP_RING_LIMIT/);
  assert.match(hook, /constMsgLookupState\.ring\.shift\(\)/);
  assert.match(hook, /entry\.returnPtr = ptrHex\(retval\)/);
  assert.match(hook, /entry\.returnRawHex = readHex\(retval, 64\)/);
  assert.doesNotMatch(hook, /\.write(?:U8|U16|U32|Pointer|ByteArray)?\(/);
  assert.doesNotMatch(hook, /force/i);
  assert.match(source, /constMsgLookups: constMsgLookupState,/);
});
