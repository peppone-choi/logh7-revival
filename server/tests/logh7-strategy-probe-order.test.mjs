import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const PROBE_URL = new URL('../../tools/live/_strategy_table_probe.py', import.meta.url);
const FRIDA_URL = new URL('../../tools/live/_frida_strategy_snapshot.js', import.meta.url);
const LIVE_DIR = fileURLToPath(new URL('../../tools/live/', import.meta.url));
const execFileAsync = promisify(execFile);

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

test('월드 진입은 최초 캐릭터 더블 클릭 뒤 한 번만 자연 재시도하고 증거를 남긴다', async () => {
  // Given: 로비 로그인 이후 캐릭터 선택 구간
  const source = await readFile(PROBE_URL, 'utf8');

  // When: 최초 게임 시작부터 첫 QA 옵션 전까지를 분리한다.
  const navigation = sliceBetween(
    source,
    'if client.poll() is None:',
    "if os.environ.get('LOGH_INPUT_TICK') == '1'",
  );
  const retry = sliceBetween(
    navigation,
    'if not world_entry_ok and client.poll() is None:',
    "(evdir / 'world-entry-gate.json').write_text(",
  );

  // Then: 최초 더블 클릭을 마친 뒤에만 전체 자연 이동을 최대 한 번 재시도한다.
  const initialCardIndex = navigation.indexOf('scale(LOBBY_REF, CHAR_CARD, width, height)');
  const gateIndex = navigation.indexOf('world_entry_started = time.monotonic()');
  const artifactIndex = navigation.indexOf("(evdir / 'world-entry-gate.json').write_text(");
  const failureIndex = navigation.indexOf("raise RuntimeError('world entry success marker was not observed')");
  assert.ok(initialCardIndex >= 0);
  assert.ok(gateIndex > initialCardIndex);
  assert.match(navigation, /'ss-login-ok-sent' in world_entry_log/);
  assert.match(navigation, /world_entry_deadline = time\.monotonic\(\) \+ 8/);
  assert.match(retry, /retry_attempted = True/);
  assert.match(retry, /scale\(LOBBY_REF, GAME_START, width, height\)/);
  assert.match(retry, /scale\(LOBBY_REF, CHAR_CARD, width, height\)/);
  assert.equal(retry.match(/mouse_click\(ox \+ x, oy \+ y\)/g)?.length, 3);
  assert.equal(navigation.match(/retry_attempted = True/g)?.length, 1);
  assert.match(navigation, /'retryGameStart': retry_game_start_point/);
  assert.match(navigation, /'retryCharCard': retry_char_card_point/);
  assert.ok(artifactIndex > gateIndex);
  assert.ok(failureIndex > artifactIndex);
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
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
  );

  assert.match(readiness, /selection_origin/);
  assert.match(readiness, /selection_hud_mode = selection\.get\('hudModeF4'\)/);
  assert.match(readiness, /selection_origin_x = selection_origin\.get\('x'\)/);
  assert.match(readiness, /selection_origin_y = selection_origin\.get\('y'\)/);
  assert.match(readiness, /selection_hud_mode == 1/);
  assert.match(readiness, /selection_origin_x == 0/);
  assert.match(readiness, /selection_origin_y == 0/);
  assert.match(readiness, /selection_origin_x != 0 or selection_origin_y != 0/);
  assert.match(readiness, /selection_origin_ready/);
  assert.doesNotMatch(readiness, /\(\(selection_origin\.get\('x'\) or 0\) > 0\)/);
  assert.match(readiness, /len\(selection\.get\('rows'\) or \[\]\) > 0/);
  assert.match(readiness, /linkage\.get\('unit0Id'\)/);
  assert.match(readiness, /linkage\.get\('char0Flagship'\)/);
  assert.doesNotMatch(readiness, /command_origin/);
  assert.doesNotMatch(readiness, /len\(command\.get\('rows'\)/);
  const artifactIndex = readiness.indexOf("(evdir / 'strategy-ready.json').write_text(");
  const failureIndex = readiness.indexOf("raise RuntimeError('strategy map did not become ready')");
  assert.ok(artifactIndex >= 0);
  assert.ok(failureIndex > artifactIndex);
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

test('strategy probe writes the default UI overlay receipt before client launch', async () => {
  // Given: 전략 프로브의 시작 구간
  const source = await readFile(PROBE_URL, 'utf8');
  const startup = sliceBetween(
    source,
    'def main():',
    'ready_deadline = time.time() + 20',
  );

  // When/Then: 명시 경로가 없으면 공용 helper를 쓰고 선택 증거가 Popen보다 먼저 기록된다.
  assert.match(startup, /CANONICAL_CLIENT_EXE/);
  assert.match(startup, /PREPARE_STRATEGY_UI_CLIENT/);
  assert.match(startup, /os\.environ\.get\('LOGH_CLIENT_EXE'\)/);
  assert.match(startup, /subprocess\.run\(/);
  assert.match(startup, /client-selection\.json/);
  const receiptIndex = startup.indexOf("(evdir / 'client-selection.json').write_text(");
  const serverIndex = startup.indexOf("server = subprocess.Popen(");
  const clientIndex = source.indexOf("client = subprocess.Popen(");
  assert.ok(receiptIndex >= 0);
  assert.ok(serverIndex > receiptIndex);
  assert.ok(clientIndex > source.indexOf("(evdir / 'client-selection.json').write_text("));
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

test('전략 selection payload의 카드 종류는 +0x274 stride 8 배열만 bounded하게 읽는다', async () => {
  // Given: character payload와 권한 탭 준비 증거를 읽는 Frida/Python 프로브
  const frida = await readFile(FRIDA_URL, 'utf8');
  const probe = await readFile(PROBE_URL, 'utf8');
  const selection = sliceBetween(frida, 'function selectionState() {', 'function runtimeTables(base) {');

  // When/Then: special-ability tail을 card kind로 승격하지 않는다.
  assert.match(frida, /const SELECTION_CARD_KIND_CAP = 8;/);
  assert.match(selection, /const payloadCount = payload\.isNull\(\) \? 0 : readU8\(payload\.add\(0x270\)\);/);
  assert.match(selection, /Math\.min\(payloadCount, SELECTION_CARD_KIND_CAP\)/);
  assert.match(selection, /readU16\(payload\.add\(0x274 \+ index \* 8\)\)/);
  assert.match(selection, /cardKinds,/);
  const obsoleteTailField = ['payloadWord', '26', 'c'].join('');
  const obsoleteTailOffset = ['0x', '26', 'c'].join('');
  const obsoleteSingleKindField = ['payloadWord', '274'].join('');
  // 이 가드는 selection payload의 over-read 부활을 막는 것이므로 selectionState 슬라이스에만
  // 적용한다. 창고 캐시 덤프(warehouseCacheDump)는 카테고리 값 오프셋 +0x26C를 정당하게
  // 쓰는 별개 구조라 전체 파일 검사와 충돌한다(라이브 grade-a 확정).
  for (const source of [selection, probe]) {
    assert.equal(source.includes(obsoleteTailField), false);
    assert.equal(source.includes(obsoleteTailOffset), false);
    assert.equal(source.includes(obsoleteSingleKindField), false);
  }
  assert.match(probe, /'cardKinds': base_selection\.get\('cardKinds'\) or \[\]/);
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
  assert.match(click, /authority_admission = selection_admission_phase\(before_snapshot, after_snapshot\)/);
  assert.match(click, /'selectionAdmission': authority_admission/);
  assert.match(click, /'selectionListBase'/);
  assert.match(click, /'listCount188'/);
  assert.match(click, /'listSelected189'/);
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

test('성계 상세 프로토콜 계측은 네 응답의 OnRecv와 dispatcher를 bounded ring에 남긴다', async () => {
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([',
    'const selectionHitState =',
  );
  for (const code of ['0x031d', '0x031f', '0x0321', '0x0f03']) {
    assert.match(passive, new RegExp(code));
  }
  assert.match(passive, /const SYSTEM_DETAIL_RING_LIMIT = 128;/);
  assert.match(passive, /attachSystemDetailHook\('0x004ae0d0'/);
  assert.match(passive, /attachSystemDetailHook\('0x004ba2b0'/);
  assert.match(passive, /systemDetailProtocolState\.onrecv/);
  assert.match(passive, /systemDetailProtocolState\.dispatch/);
  assert.match(passive, /callerVa/);
  assert.match(passive, /timestamp: Date\.now\(\)/);
  assert.match(passive, /const systemDetailHookCallbacks = new Map\(\);/);
  assert.match(passive, /existingCallbacks\.push\(callbacks\)/);
});

test('성계 상세 스냅샷은 정적·031f·0321 캐시를 안전한 상한으로 읽고 base id 조인을 계산한다', async () => {
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([',
    'const selectionHitState =',
  );

  for (const offset of [
    '0x358', '0x41a368 + 0x40', '0x2eb288', '0x2eb800',
    '0x3facf4', '0x3facf8', '0x3fb2f8', '0x3fb2fc',
    '0x2b6a74', '0x2b6a78', '0x2b7078', '0x2b707c',
    '0x2a58f8', '0x2a58fa',
  ]) {
    assert.match(passive, new RegExp(offset.replaceAll('+', '\\+')));
  }
  assert.match(passive, /const SYSTEM_DETAIL_STATIC_CAP = 350;/);
  assert.match(passive, /const SYSTEM_DETAIL_STATIC_STRIDE = 0x250;/);
  assert.match(passive, /boundedIdTableSnapshot\(base, 0x3facf4, 0x3facf8, 0x180, 4\)/);
  assert.match(passive, /boundedIdTableSnapshot\(base, 0x3fb2f8, 0x3fb2fc, 0x2378, 4\)/);
  assert.match(passive, /boundedIdTableSnapshot\(base, 0x2b6a74, 0x2b6a78, 0x180, 4\)/);
  assert.match(passive, /boundedIdTableSnapshot\(base, 0x2b7078, 0x2b707c, 0x2378, 4\)/);
  assert.match(passive, /attachSystemDetailLookup\('0x004c5470'/);
  assert.match(passive, /attachSystemDetailLookup\('0x004c54d0'/);
  assert.match(passive, /attachSystemDetailHook\('0x0057aa90'/);
  assert.match(passive, /const worldActive = baseAvailable \? readU8\(base\.add\(0x2a58f8\)\) : null;/);
  assert.match(passive, /const strategyFieldImportFlag2a58fa = baseAvailable \? readU8\(base\.add\(0x2a58fa\)\) : null;/);
  assert.match(passive, /strategyFieldImportFlag2a58fa,/);
  assert.doesNotMatch(passive, /institutionActive/);
  assert.match(passive, /function systemDetailJoinFor\(baseId, caches, worldActive, strategyFieldImportFlag2a58fa\)/);
  assert.match(passive, /const membershipJoinComplete = base031fJoinComplete && base0321JoinComplete;/);
  assert.match(passive, /const worldConsumerActive = Number\.isInteger\(worldActive\) && worldActive !== 0;/);
  assert.match(passive, /const strategyFieldImportComplete = \(\s+Number\.isInteger\(strategyFieldImportFlag2a58fa\) && strategyFieldImportFlag2a58fa !== 0\s+\);/);
  assert.match(passive, /const cacheSnapshotsHealthy = \(/);
  assert.match(passive, /caches\.staticBase\.reason === null/);
  for (const cache of ['source031f', 'source0321', 'live031f', 'live0321']) {
    assert.match(passive, new RegExp(`caches\\.${cache}\\.reason === null`));
    assert.match(passive, new RegExp(`caches\\.${cache}\\.truncated === false`));
  }
  assert.match(passive, /const cacheJoinComplete = \(\s+membershipJoinComplete\s+&& worldConsumerActive\s+&& strategyFieldImportComplete\s+&& cacheSnapshotsHealthy\s+\);/);
  assert.match(passive, /membershipJoinComplete,/);
  assert.match(passive, /systemDetailJoinFor\(\s+SYSTEM_DETAIL_EXPECTED_BASE_ID,\s+caches,\s+worldActive,\s+strategyFieldImportFlag2a58fa,/);
  assert.match(passive, /else if \(worldActive === 0\) \{/);
  assert.match(passive, /unit0SpotResolverBaseReason = 'world-cache-inactive';/);
  assert.match(passive, /expectedBaseId: SYSTEM_DETAIL_EXPECTED_BASE_ID/);
  assert.match(passive, /cacheJoinComplete/);
  assert.match(source, /systemDetail: systemDetailState\(base\),/);
});

test('client+0x358은 UI 선택이 아닌 client spot resolver로만 노출한다', async () => {
  // Given: 성계 상세 스냅샷과 마커 증거 생성부
  const source = await readFile(FRIDA_URL, 'utf8');
  const probe = await readFile(PROBE_URL, 'utf8');
  const state = sliceBetween(source, 'function systemDetailState(base) {', 'const selectionHitState =');
  const panel = sliceBetween(
    source,
    "attachSystemDetailHook('0x0057aa90'",
    "attachSystemDetailHook('0x00576d40'",
  );
  const marker = sliceBetween(
    probe,
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  // When/Then: 0x358은 resolver 이름과 join을 쓰고 실제 UI 선택 ID는 panel 인자에만 남긴다.
  assert.match(state, /const clientSpotResolverBase = baseAvailable \? readU32\(base\.add\(0x358\)\) : null/);
  assert.match(state, /clientSpotResolverBaseReason/);
  assert.match(state, /clientSpotResolver: systemDetailJoinFor\(\s+clientSpotResolverBase,\s+caches,\s+worldActive,\s+strategyFieldImportFlag2a58fa,/);
  assert.doesNotMatch(state, /const selectedBaseId = baseAvailable/);
  assert.doesNotMatch(state, /selectedBaseIdReason/);
  assert.doesNotMatch(state, /selected: systemDetailJoinFor/);
  assert.match(panel, /selectedBaseId: argument\.isNull\(\) \? null : readU32\(argument\.add\(8\)\)/);
  assert.match(marker, /'clientSpotResolverBase'/);
  assert.match(marker, /'clientSpotResolverBaseReason'/);
  assert.doesNotMatch(marker, /'selectedBaseId'/);
});

test('성계 상세 계측 블록은 읽기 전용이며 함수 호출이나 강제 경로가 없다', async () => {
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([',
    'const selectionHitState =',
  );

  assert.doesNotMatch(passive, /\.write(?:U8|U16|U32|Pointer|ByteArray)?\s*\(/);
  assert.doesNotMatch(passive, /new NativeFunction\s*\(/);
  assert.doesNotMatch(passive, /retval\.replace\s*\(/);
  assert.doesNotMatch(passive, /force/i);
});

test('성계 상세 선택 인덱스 계측은 embedded list 기준으로 정보 패널 후보만 bounded ring에 남긴다', async () => {
  // Given: 성계 상세 전용 수동 계측 구간
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([',
    'const selectionHitState =',
  );
  const hook = sliceBetween(
    passive,
    'const systemDetailSelectionIndexState =',
    'function systemDetailJoinFor',
  );

  // When/Then: 00576d40의 유효 선택과 정보 패널 후보만 읽기 전용으로 축적한다.
  assert.match(hook, /totalCalls: 0/);
  assert.match(hook, /validCalls: 0/);
  assert.match(hook, /inRangeCalls: 0/);
  assert.match(hook, /selectionChangedCalls: 0/);
  assert.match(hook, /infoPanelCandidateCalls: 0/);
  assert.match(hook, /infoPanelSelectionChangedCalls: 0/);
  assert.match(hook, /attachSystemDetailHook\('0x00576d40'/);
  assert.match(hook, /systemDetailSelectionIndexState\.totalCalls \+= 1/);
  assert.match(hook, /index === -1/);
  assert.match(hook, /index < 0/);
  assert.match(hook, /systemDetailSelectionIndexState\.validCalls \+= 1/);
  assert.match(hook, /const list = safe\(\(\) => ptr\(this\.context\.ecx\), ptr\('0x0'\)\);/);
  assert.match(hook, /const parent = list\.isNull\(\) \? ptr\('0x0'\) : list\.sub\(0x244\);/);
  assert.match(hook, /const panelKind = parent\.isNull\(\) \? null : readS32\(parent\.add\(0x234\)\);/);
  assert.match(hook, /const itemCount = list\.isNull\(\) \? null : readS32\(list\.add\(0x8e4\)\);/);
  assert.match(hook, /const inRange = Number\.isInteger\(itemCount\) && index < itemCount;/);
  assert.match(hook, /if \(inRange\) \{/);
  assert.match(hook, /systemDetailSelectionIndexState\.inRangeCalls \+= 1/);
  assert.match(hook, /panelKind === 5 \|\| panelKind === 0x11/);
  assert.match(hook, /systemDetailSelectionIndexState\.infoPanelCandidateCalls \+= 1/);
  for (const offset of ['0x8e4', '0x8e8', '0x234', '0x238', '0xb2c']) {
    assert.match(hook, new RegExp(offset));
  }
  assert.match(hook, /list: ptrHex\(list\)/);
  assert.match(hook, /parent: ptrHex\(parent\)/);
  assert.match(hook, /selectedBefore: list\.isNull\(\) \? null : readS32\(list\.add\(0x8e8\)\)/);
  assert.match(hook, /panelState: parent\.isNull\(\) \? null : readS32\(parent\.add\(0x238\)\)/);
  assert.match(hook, /infoSelectedIndex: parent\.isNull\(\) \? null : readS32\(parent\.add\(0xb2c\)\)/);
  assert.match(hook, /callerVa: systemDetailCallerVa\(this\.returnAddress\)/);
  assert.match(hook, /timestamp: Date\.now\(\)/);
  assert.match(hook, /entry\.retval =/);
  assert.match(hook, /entry\.selectedAfter = readS32\(list\.add\(0x8e8\)\)/);
  assert.match(hook, /entry\.infoSelectedIndexAfter = readS32\(parent\.add\(0xb2c\)\)/);
  assert.match(hook, /entry\.selectionChanged =/);
  assert.match(hook, /entry\.selectedAfter === entry\.index/);
  assert.match(hook, /entry\.selectedAfter !== entry\.selectedBefore/);
  assert.match(hook, /systemDetailSelectionIndexState\.selectionChangedCalls \+= 1/);
  assert.match(hook, /systemDetailSelectionIndexState\.infoPanelSelectionChangedCalls \+= 1/);
  assert.match(hook, /pushSystemDetailRing\(systemDetailSelectionIndexState\.ring, entry\)/);
  assert.match(passive, /selectionIndex: systemDetailSelectionIndexState/);
  assert.doesNotMatch(hook, /controller\.add\(0x(?:234|238|8e4|8e8|b2c)\)/);
  assert.doesNotMatch(hook, /\.write(?:U8|U16|U32|Pointer|ByteArray)?\s*\(/);
  assert.doesNotMatch(hook, /new NativeFunction\s*\(/);
  assert.doesNotMatch(hook, /retval\.replace\s*\(/);
  assert.doesNotMatch(hook, /force/i);
});

test('C002 직무카드·유닛 admission 계측은 hot path를 오염시키지 않고 상태 전환만 보존한다', async () => {
  // Given: B68b 이후 C002 직무카드·유닛 admission 병목을 추적할 Frida 계측
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SELECTION_ADMISSION_RING_LIMIT = 128;',
    'function systemDetailJoinFor',
  );

  const registry = sliceBetween(
    source,
    'const systemDetailHookCallbacks = new Map();',
    "attachSystemDetailHook('0x004ae0d0'",
  );
  const latch = sliceBetween(
    passive,
    "attachSystemDetailHook('0x00507f20'",
    "attachSystemDetailHook('0x00501e30'",
  );
  const admission = sliceBetween(
    passive,
    "attachSystemDetailHook('0x005015f0'",
    "attachSystemDetailHook('0x004f6680'",
  );

  // When/Then: 검증된 ABI와 cached slot 포인터를 쓰며 상태 전환만 timeline에 남긴다.
  assert.match(passive, /const selectionAdmissionState = \{/);
  assert.match(passive, /counts: \{/);
  assert.match(passive, /last: \{/);
  assert.match(passive, /ring: \[\]/);
  assert.match(passive, /selectionAdmissionState\.ring\.length > SELECTION_ADMISSION_RING_LIMIT/);
  assert.match(passive, /selectionAdmissionState\.ring\.shift\(\)/);
  assert.match(passive, /sequence: 0/);
  assert.match(passive, /const selectionAdmissionRoleCache = \{/);
  assert.match(passive, /function refreshSelectionAdmissionRoleCache\(\)/);
  assert.match(passive, /function selectionAdmissionCachedIdentity\(controller, target\)/);
  assert.match(passive, /selectionRoot: ptrHex\(selectionRoot\)/);
  assert.match(passive, /controllerMatchesSelectionRoot: selectionAdmissionPointersEqual\(controller, selectionRoot\)/);
  assert.match(passive, /targetMatchesSelectionRoot: selectionAdmissionPointersEqual\(target, selectionRoot\)/);
  assert.match(passive, /!leftPointer\.isNull\(\) && !rightPointer\.isNull\(\)/);
  assert.match(passive, /targetRole: cachedTarget \? cachedTarget\.role : null/);
  assert.match(passive, /cachedTarget\.index === selectionAdmissionRoleCache\.listSelected189/);
  for (const role of ['selection-root', 'slot22-', 'slot32-']) {
    assert.match(passive, new RegExp(role));
  }
  assert.doesNotMatch(passive, /selection-primary-|selection-secondary-/);
  assert.doesNotMatch(latch, /for\s*\(|selectionAdmissionTargetRoles|refreshSelectionAdmissionRoleCache/);
  assert.doesNotMatch(admission, /for\s*\(|selectionAdmissionTargetRoles|refreshSelectionAdmissionRoleCache/);
  assert.match(latch, /noteSelectionAdmission\('latch', entry\)/);
  assert.match(latch, /if \(selectionAdmissionObjectChanged/);
  assert.match(admission, /noteSelectionAdmission\('admission', entry\)/);
  assert.match(admission, /entry\.retvalLow8 !== 0/);
  assert.match(admission, /selectionListBefore: selectionAdmissionListState\(\)/);
  assert.match(admission, /entry\.selectionListAfter = selectionAdmissionListState\(\)/);
  assert.match(passive, /pushSelectionAdmissionTimeline\(entry\)/);
  assert.match(passive, /pushSelectionAdmissionEvent2\('event2Enqueue'/);
  assert.match(passive, /pushSelectionAdmissionEvent2\('event2Dequeue'/);
  assert.match(registry, /existingCallbacks\.push\(callbacks\)/);
  assert.doesNotMatch(registry, /return false/);
  for (const address of [
    '0x005024b0', '0x00507f20', '0x00501e30', '0x00501ed0', '0x005015f0',
    '0x004f6680', '0x00506280', '0x004fd7a0', '0x004fd100',
  ]) {
    assert.match(passive, new RegExp(`attachSystemDetailHook\\('${address}'`));
  }
  assert.match(passive, /requestedGate05: safe\(\(\) => args\[0\]\.toInt32\(\) & 0xff\)/);
  assert.match(passive, /const target = safe\(\(\) => ptr\(args\[0\]\), ptr\('0x0'\)\);/);
  assert.match(passive, /const eventKind = safe\(\(\) => args\[0\]\.toInt32\(\)\);/);
  assert.match(passive, /if \(eventKind !== 2\) return;/);
  assert.match(passive, /const target = safe\(\(\) => ptr\(args\[1\]\), ptr\('0x0'\)\);/);
  assert.match(passive, /consume: safe\(\(\) => args\[3\]\.toInt32\(\)\)/);
  assert.match(passive, /callerVa: systemDetailCallerVa\(this\.returnAddress\)/);
  assert.match(passive, /timestamp: Date\.now\(\)/);
  assert.match(passive, /eventQueueCount3f4/);
  assert.match(passive, /eventKeys470/);
  assert.match(passive, /Math\.min\(count, 0x1c\)/);
  assert.match(passive, /entry\.retvalLow8 = safe\(\(\) => retval\.toInt32\(\) & 0xff\)/);
  assert.match(source, /selectionAdmission: selectionAdmissionState/);
  assert.doesNotMatch(passive, /\.write(?:U8|U16|U32|Pointer|ByteArray)?\s*\(/);
  assert.doesNotMatch(passive, /new NativeFunction\s*\(/);
  assert.doesNotMatch(passive, /retval\.replace\s*\(/);
  assert.doesNotMatch(passive, /force/i);
});

test('C002 직무카드·유닛 행 진단은 marker·unit-row·double 기준별 admission 차분을 출력한다', async () => {
  // Given: 자연 성계 마커와 C002 직무카드·유닛 행 클릭 진단기
  const source = await readFile(PROBE_URL, 'utf8');
  const diagnostic = sliceBetween(
    source,
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  // When/Then: 각 fresh baseline에서 writer/latch/event2/admission/producer 차분을 계산한다.
  assert.match(source, /SELECTION_ADMISSION_METRIC_KEYS = \(/);
  for (const field of [
    'selectionAdmissionWriterCalls', 'selectionAdmissionLatchCalls',
    'selectionAdmissionEvent2EnqueueCalls', 'selectionAdmissionEvent2DequeueCalls',
    'selectionAdmissionCalls', 'selectionAdmissionAccepted',
    'selectionAdmissionModeApplyCalls', 'selectionAdmissionLayoutOpenCalls',
    'selectionAdmissionHudModeSetCalls', 'selectionAdmissionHudFrameTransitionCalls',
  ]) {
    assert.match(source, new RegExp(`'${field}'`));
  }
  assert.match(source, /def selection_admission_metrics\(system_detail\):/);
  assert.match(source, /'selectionAdmissionLast': admission\.get\('last'\)/);
  assert.match(source, /'selectionAdmissionListBase': selection_list\.get\('base'\)/);
  assert.match(source, /'selectionAdmissionListCount188': selection_list\.get\('listCount188'\)/);
  assert.match(source, /'selectionAdmissionListSelected189': selection_list\.get\('listSelected189'\)/);
  assert.match(source, /def selection_admission_delta\(current, baseline\):/);
  assert.match(source, /def selection_admission_phase\(before_snapshot, after_snapshot\):/);
  assert.match(source, /entry\.get\('sequence'\) or 0/);
  assert.match(source, /for key in SELECTION_ADMISSION_METRIC_KEYS/);
  for (const detail of ['before_detail', 'single_detail', 'row_before_detail', 'row_detail', 'double_before_detail', 'double_detail']) {
    assert.match(diagnostic, new RegExp(`\\*\\*selection_admission_metrics\\(${detail}\\)`));
  }
  assert.match(diagnostic, /\*\*selection_admission_delta\(single_metrics, before_metrics\)/);
  assert.match(diagnostic, /\*\*selection_admission_delta\(row_metrics, row_before_metrics\)/);
  assert.match(diagnostic, /\*\*selection_admission_delta\(double_metrics, double_before_metrics\)/);
  assert.match(diagnostic, /\*\*selection_admission_delta\(final_metrics, before_metrics\)/);
  assert.match(diagnostic, /'selectionAdmissionLast': \{/);
  for (const phase of ['markerBefore', 'single', 'rowBefore', 'row', 'doubleBefore', 'double', 'final']) {
    assert.match(diagnostic, new RegExp(`'${phase}'`));
  }
});

test('자연 성계 마커 진단은 단일 클릭 뒤 패널 미활성 때만 더블 클릭하고 증거를 남긴다', async () => {
  // Given: readiness와 기존 클릭 스윕이 포함된 전략 프로브
  const source = await readFile(PROBE_URL, 'utf8');

  // When: 성계 마커 진단 블록을 찾는다.
  const diagnostic = sliceBetween(
    source,
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  // Then: 실측 좌표에서 단일 클릭을 먼저 시도하고 패널 호출이 없을 때만 더블 클릭한다.
  assert.match(source, /STRATEGY_SYSTEM_MARKER = \(515, 390\)/);
  assert.ok(source.indexOf("if os.environ.get('LOGH_WAIT_STRATEGY_READY') == '1'") < source.indexOf(diagnostic));
  assert.ok(source.indexOf(diagnostic) < source.indexOf("if os.environ.get('LOGH_STRATEGY_CLICK_SWEEP') == '1'"));
  assert.match(diagnostic, /system_detail_ready_deadline = system_detail_ready_started \+ 30/);
  assert.match(diagnostic, /summary\.get\('protocolAllDispatch'\) is True/);
  assert.match(diagnostic, /summary\.get\('cacheJoinComplete'\) is True/);
  assert.match(diagnostic, /strategy-system-detail-ready\.json/);
  assert.match(diagnostic, /before_snapshot = script\.exports_sync\.snapshot\(\)/);
  assert.doesNotMatch(diagnostic, /before_snapshot = system_detail_ready_snapshot/);
  assert.match(diagnostic, /scale\(STRATEGY_REF, STRATEGY_SYSTEM_MARKER, width, height\)/);
  assert.match(diagnostic, /if single_panel_delta <= 0 and not row_activated:/);
  assert.ok(diagnostic.match(/mouse_click\(ox \+ x, oy \+ y\)/g)?.length === 3);
  assert.match(diagnostic, /mouse_click\(ox \+ x, oy \+ y\)\s+time\.sleep\(0\.15\)\s+mouse_click\(ox \+ x, oy \+ y\)/);
  for (const name of ['before', 'single', 'double']) {
    assert.match(diagnostic, new RegExp(`strategy-system-marker-${name}\\.png`));
  }
  assert.match(diagnostic, /strategy-system-marker-click\.json/);
  assert.match(diagnostic, /'consumerActivated': final_panel_delta > 0/);
  assert.match(diagnostic, /'selectionIndexValidCalls'/);
  assert.match(diagnostic, /'infoPanelCandidateCalls'/);
  assert.match(diagnostic, /'selectionActivated': final_delta\['selectionIndexChangedCalls'\] > 0/);
  assert.match(diagnostic, /'infoPanelSelectionActivated': final_delta\['infoPanelSelectionChangedCalls'\] > 0/);
  assert.match(diagnostic, /'renderSettleSeconds': 1\.5/);
  assert.match(diagnostic, /'renderSettledAt': render_settled_at/);
  const readyArtifactIndex = diagnostic.indexOf("(evdir / 'strategy-system-detail-ready.json').write_text(");
  const preconditionFailureIndex = diagnostic.indexOf("raise RuntimeError('system detail cache did not become ready')");
  const renderSettleIndex = diagnostic.indexOf('time.sleep(1.5)');
  const geometryIndex = diagnostic.indexOf('ox, oy, width, height = client_geometry(hwnd)');
  const foregroundIndex = diagnostic.indexOf('foreground(hwnd)', geometryIndex);
  const beforeSnapshotIndex = diagnostic.indexOf('before_snapshot = script.exports_sync.snapshot()');
  const firstScreenshotIndex = diagnostic.indexOf("screenshot(hwnd, shots / 'strategy-system-marker-before.png')");
  const firstClickIndex = diagnostic.indexOf('mouse_click(ox + x, oy + y)');
  assert.ok(readyArtifactIndex >= 0);
  assert.ok(preconditionFailureIndex > readyArtifactIndex);
  assert.ok(renderSettleIndex > preconditionFailureIndex);
  assert.ok(geometryIndex > renderSettleIndex);
  assert.ok(foregroundIndex > geometryIndex);
  assert.ok(beforeSnapshotIndex > foregroundIndex);
  assert.ok(firstScreenshotIndex > preconditionFailureIndex);
  assert.ok(firstScreenshotIndex > beforeSnapshotIndex);
  assert.ok(firstClickIndex > firstScreenshotIndex);
  assert.doesNotMatch(diagnostic.slice(firstClickIndex), /raise RuntimeError/);
});

test('성계 마커 진단은 origin 0을 전역 좌표로 쓰지 않고 C002 직무카드·유닛 행을 클릭한다', async () => {
  // Given: 성계 마커 뒤 C002 직무카드·유닛 행 진단 블록
  const source = await readFile(PROBE_URL, 'utf8');
  const diagnostic = sliceBetween(
    source,
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  // When/Then: origin 0은 실측 좌하단 행으로 대체하고 정상 origin만 동적 중심에 쓴다.
  assert.match(source, /STRATEGY_C002_UNIT_ROW_MODE1 = \(158, 456\)/);
  assert.match(diagnostic, /if single_panel_delta <= 0 and row_geometry_valid:/);
  assert.match(diagnostic, /\(selection\.get\('listCount188'\) or 0\) >= 1/);
  assert.match(diagnostic, /selection\.get\('hudModeF4'\) == 1/);
  assert.match(diagnostic, /selection_origin\.get\('x'\) == 0/);
  assert.match(diagnostic, /selection_origin\.get\('y'\) == 0/);
  assert.match(diagnostic, /selection_origin\.get\('x'\) != 0 or selection_origin\.get\('y'\) != 0/);
  assert.match(diagnostic, /if row_mode1_zero_origin:/);
  assert.match(diagnostic, /row_reference_point = STRATEGY_C002_UNIT_ROW_MODE1/);
  assert.match(diagnostic, /row_point_source = 'hud-mode1-fixed'/);
  assert.match(diagnostic, /row_point_source = 'dynamic-origin'/);
  assert.match(diagnostic, /row_primary\.get\('rectW2c'\) or 0/);
  assert.match(diagnostic, /row_primary\.get\('rectH30'\) or 0/);
  assert.match(diagnostic, /selection_origin\['x'\] \+ row_primary\['rectX20'\] \+ row_primary\['rectW2c'\] \/\/ 2/);
  assert.match(diagnostic, /selection_origin\['y'\] \+ row_primary\['rectY24'\] \+ row_primary\['rectH30'\] \/\/ 2/);
  assert.match(diagnostic, /strategy-c002-unit-row-before\.png/);
  assert.match(diagnostic, /strategy-c002-unit-row-after\.png/);
  assert.match(diagnostic, /row_before_snapshot = script\.exports_sync\.snapshot\(\)/);
  assert.match(diagnostic, /row_snapshot = script\.exports_sync\.snapshot\(\)/);
  const rowClickBlock = sliceBetween(
    diagnostic,
    'if single_panel_delta <= 0 and row_geometry_valid:',
    'double_clicked_at = None',
  );
  const rowDelta = sliceBetween(rowClickBlock, 'row_delta = {', 'row_panel_activated =');
  const rowGeometryIndex = rowClickBlock.indexOf('row_ox, row_oy, row_width, row_height = client_geometry(hwnd)');
  const rowForegroundIndex = rowClickBlock.indexOf('foreground(hwnd)');
  const rowBeforeSnapshotIndex = rowClickBlock.indexOf('row_before_snapshot = script.exports_sync.snapshot()');
  const rowClickIndex = rowClickBlock.indexOf('mouse_click(row_ox + row_x, row_oy + row_y)');
  assert.ok(rowGeometryIndex >= 0);
  assert.ok(rowForegroundIndex > rowGeometryIndex);
  assert.ok(rowBeforeSnapshotIndex > rowForegroundIndex);
  assert.ok(rowClickIndex > rowBeforeSnapshotIndex);
  assert.match(rowClickBlock, /row_before_metrics = \{/);
  for (const field of [
    'baseLookupTotalCalls', 'institutionLookupTotalCalls', 'panelTotalCalls',
    'selectionIndexValidCalls', 'selectionIndexInRangeCalls', 'selectionIndexChangedCalls',
    'infoPanelCandidateCalls', 'infoPanelSelectionChangedCalls', 'selectionHitCalls',
    'selectionHitAccepted', 'selectionHitRejected',
  ]) {
    assert.match(rowDelta, new RegExp(`row_metrics\\['${field}'\\] - row_before_metrics\\['${field}'\\]`));
  }
  assert.doesNotMatch(rowDelta, /single_metrics/);
  assert.match(diagnostic, /if single_panel_delta <= 0 and not row_activated:/);
  const doubleBlock = sliceBetween(diagnostic, 'double_clicked_at = None', 'final_snapshot =');
  const doubleDelta = sliceBetween(doubleBlock, 'double_delta = {', 'final_metrics =');
  const doubleBeforeSnapshotIndex = doubleBlock.indexOf('double_before_snapshot = script.exports_sync.snapshot()');
  const doubleClickIndex = doubleBlock.indexOf('mouse_click(ox + x, oy + y)');
  assert.ok(doubleBeforeSnapshotIndex >= 0);
  assert.ok(doubleClickIndex > doubleBeforeSnapshotIndex);
  assert.match(doubleBlock, /double_before_metrics = \{/);
  for (const field of [
    'baseLookupTotalCalls', 'institutionLookupTotalCalls', 'panelTotalCalls',
    'selectionIndexValidCalls', 'selectionIndexInRangeCalls', 'selectionIndexChangedCalls',
    'infoPanelCandidateCalls', 'infoPanelSelectionChangedCalls', 'selectionHitCalls',
    'selectionHitAccepted', 'selectionHitRejected',
  ]) {
    assert.match(doubleDelta, new RegExp(`double_metrics\\['${field}'\\] - double_before_metrics\\['${field}'\\]`));
  }
  assert.doesNotMatch(doubleDelta, /single_metrics/);
  assert.match(diagnostic, /row_selection_activated = row_delta\['selectionIndexChangedCalls'\] > 0/);
  assert.match(diagnostic, /row_info_panel_selection_activated = row_delta\['infoPanelSelectionChangedCalls'\] > 0/);
  const rowIndex = diagnostic.indexOf('row_click_attempted = True');
  const doubleIndex = diagnostic.indexOf('fallback_attempted = True');
  assert.ok(rowIndex >= 0);
  assert.ok(doubleIndex > rowIndex);
  for (const field of [
    'selectionHitCalls', 'selectionHitAccepted', 'selectionHitRejected',
    'selectionIndexValidCalls', 'selectionIndexInRangeCalls', 'selectionIndexChangedCalls',
    'infoPanelCandidateCalls', 'infoPanelSelectionChangedCalls',
  ]) {
    assert.match(diagnostic, new RegExp(`'${field}'`));
  }
  for (const field of [
    'rowClickAttempted', 'rowPoint', 'rowPanelActivated', 'rowSelectionActivated',
    'rowInfoPanelSelectionActivated', 'rowActivated', 'rowBeforeCapturedAt',
    'rowClickedAt', 'rowCapturedAt', 'rowBefore', 'rowFromRowBefore', 'rowPointSource',
    'doubleBeforeCapturedAt', 'doubleBefore', 'doubleFromDoubleBefore',
  ]) {
    assert.match(diagnostic, new RegExp(`'${field}'`));
  }
  assert.match(diagnostic, /'row': row_metrics/);
  assert.match(diagnostic, /'rowBefore': row_before_metrics/);
  assert.match(diagnostic, /'baselines': \{/);
  assert.match(diagnostic, /'marker': before_metrics/);
  assert.match(diagnostic, /'row': row_before_metrics/);
  assert.match(diagnostic, /'rowFromRowBefore': row_delta/);
  assert.match(diagnostic, /'doubleBefore': double_before_metrics/);
  assert.match(diagnostic, /'double': double_before_metrics/);
  assert.match(diagnostic, /'doubleFromDoubleBefore': double_delta/);
  assert.match(diagnostic, /'selectionActivated': final_delta\['selectionIndexChangedCalls'\] > 0/);
  assert.match(diagnostic, /'infoPanelSelectionActivated': final_delta\['infoPanelSelectionChangedCalls'\] > 0/);
  assert.doesNotMatch(diagnostic, /'selectionActivated': final_delta\['selectionIndexValidCalls'\] > 0/);
  assert.doesNotMatch(diagnostic, /'rowFromSingle'/);
  assert.doesNotMatch(diagnostic, /'doubleFromSingle'/);
  assert.match(diagnostic, /'row': row_snapshot/);
  assert.doesNotMatch(diagnostic, /new NativeFunction|\.write(?:U8|U16|U32|Pointer|ByteArray)?\s*\(|exports_sync\.(?!snapshot)/);
});

test('성계 상세 출력 역추적은 0305 factory부터 031f·0327 sink까지 수동 trace로 고정한다', async () => {
  // Given: 기존 wire/cache 계측과 callback multiplex가 있는 Frida 스냅샷
  const source = await readFile(FRIDA_URL, 'utf8');
  const passive = sliceBetween(
    source,
    'const SYSTEM_DETAIL_PROTOCOL_CODES = new Set([',
    'const selectionHitState =',
  );
  const dispatcher = sliceBetween(
    passive,
    "attachSystemDetailHook('0x004ba2b0'",
    'function boundedIdTableSnapshot',
  );

  // When/Then: 출력 sink에서 0305 command-card와 SelectDialog producer까지 역으로 연결한다.
  assert.match(passive, /const SYSTEM_OUTPUT_STAGE_NAMES = \[/);
  for (const stage of [
    'commandCard0305', 'factoryGrant', 'factorySelected', 'factoryHandler',
    'selectDialogCtor', 'selectDialogTick',
    'genericListRow70', 'selector', 'refresh031f', 'refresh0327',
    'panelDispatch', 'renderSink',
  ]) {
    assert.match(passive, new RegExp(`'${stage}'`));
  }
  assert.match(passive, /const SYSTEM_OUTPUT_DEPENDENCY_STAGE_NAMES = \[/);
  for (const dependency of ['wire031f', 'cache031f', 'response031f', 'response0327']) {
    assert.match(passive, new RegExp(`'${dependency}'`));
  }
  assert.match(passive, /const SYSTEM_OUTPUT_COMMAND_CATEGORY_CAP = 300;/);
  assert.match(passive, /const SYSTEM_OUTPUT_FACTORY_CAP = 24;/);
  assert.match(passive, /function systemOutputCommandCardData\(rawCategoryCount, readCommandCount, readFactoryId\)/);
  assert.match(passive, /function systemOutputCommandCardSnapshot\(\)/);
  assert.match(passive, /const rawCategoryCount = readU32\(table\.add\(8\)\);/);
  assert.match(passive, /factory2dGranted: factoryIds\.includes\(SYSTEM_OUTPUT_B71_FACTORY_ID\)/);
  assert.match(passive, /if \(after\.reason === null\)/);
  assert.match(passive, /const SYSTEM_OUTPUT_TRACE_RING_LIMIT = \d+;/);
  assert.match(passive, /const SYSTEM_OUTPUT_SINK_RING_LIMIT = \d+;/);
  assert.match(passive, /const SYSTEM_OUTPUT_BACKTRACE_LIMIT = 12;/);
  assert.match(passive, /counts: \{/);
  assert.match(passive, /last: \{/);
  assert.match(passive, /timeline: \[\]/);
  assert.match(passive, /sinkTimeline: \[\]/);
  assert.match(passive, /byStage: \{/);
  assert.match(passive, /function noteSystemOutputStage\(stage, entry\)/);
  assert.match(passive, /systemOutputTraceState\.last\[stage\] =/);
  assert.match(passive, /systemOutputTraceState\.timeline\.length > SYSTEM_OUTPUT_TRACE_RING_LIMIT/);
  assert.match(passive, /systemOutputTraceState\.sinkTimeline\.length > SYSTEM_OUTPUT_SINK_RING_LIMIT/);
  assert.match(passive, /function systemOutputBacktrace\(context\)/);
  assert.match(passive, /Thread\.backtrace\(context, Backtracer\.ACCURATE\)/);
  assert.match(passive, /\.slice\(0, SYSTEM_OUTPUT_BACKTRACE_LIMIT\)/);
  assert.match(passive, /catch \(_error\)/);

  for (const address of [
    '0x004c4a10', '0x004f58c0', '0x00584c90',
    '0x00570eb0', '0x00571870', '0x00577e70', '0x0057bbc0', '0x00577050',
    '0x00576d40', '0x00579fd0', '0x00579e60', '0x0057aa90',
  ]) {
    assert.match(passive, new RegExp(`attachSystemDetailHook\\('${address}'`));
  }
  const unsafeCaseAddress = ['0x004b', 'ad1a'].join('');
  assert.equal(source.includes(unsafeCaseAddress), false);
  assert.match(dispatcher, /if \(code === 0x0305\) \{/);
  assert.match(dispatcher, /boundary: 'dispatcher-entry'/);
  assert.match(dispatcher, /noteSystemOutputTransition\('dispatch0305', commandCardEntry\)/);
  assert.match(dispatcher, /noteSystemOutputStage\('commandCard0305', commandCardEntry\)/);
  assert.equal((passive.match(/noteSystemOutputStage\('commandCard0305'/g) || []).length, 1);
  assert.match(source, /hookNativeCall\('factory', '0x004f93c0', 4\)/);
  assert.match(source, /SYSTEM_OUTPUT_WHITELIST_FACTORY_SET\.has\(factoryId\)/);
  assert.match(source, /noteSystemOutputStage\('factorySelected'/);
  assert.match(source, /factoryId === 0x41[\s\S]*?factory41Selected/);
  assert.equal((passive.match(/attachSystemDetailHook\('0x0057aa90'/g) || []).length, 1);
  assert.equal((passive.match(/attachSystemDetailHook\('0x00576d40'/g) || []).length, 1);
  assert.match(passive, /requestedKind: safe\(\(\) => args\[0\]\.toInt32\(\)\)/);
  assert.match(passive, /dialogKind: readS32\(dialog\.add\(0x28\)\)/);
  assert.match(passive, /dialogController: ptrHex\(readPtr\(dialog\.add\(0x50\)\)\)/);
  assert.match(passive, /requestedRebuild: safe\(\(\) => args\[1\]\.toInt32\(\) & 0xff\)/);
  assert.match(passive, /panelKindBefore: readS32\(parent\.add\(0x234\)\)/);
  assert.match(passive, /panelStateBefore: readS32\(parent\.add\(0x238\)\)/);
  assert.match(passive, /const rowBaseId = safe\(\(\) => args\[1\]\.toInt32\(\)\);/);
  assert.match(passive, /if \(rowBaseId !== SYSTEM_DETAIL_EXPECTED_BASE_ID\) return;/);
  assert.match(passive, /const phase = readS32\(parent\.add\(0x1584\)\);/);
  assert.match(passive, /const baseId = record\.isNull\(\) \? null : readU32\(record\.add\(8\)\);/);
  assert.match(passive, /phase === 0 \? 'refresh031f' : 'refresh0327'/);
  assert.match(passive, /selectedIndex: readS32\(parent\.add\(0xb2c\)\)/);
  assert.match(passive, /selectedRecord: ptrHex\(selectedRecord\)/);
  assert.match(passive, /backtrace: systemOutputBacktrace\(this\.context\)/);
  assert.match(passive, /directDependencies: \{/);
  assert.match(passive, /response031f/);
  assert.match(passive, /response0327/);
  assert.match(passive, /parallelDependency: \{/);
  assert.match(passive, /response0321/);
  assert.match(passive, /response0305/);
  assert.match(passive, /commandCard0305: \{/);
  assert.match(passive, /missingRequiredResponse0327/);
  assert.match(passive, /entry\.sequence > requestEntry\.sequence/);
  assert.match(passive, /responseDispatchTimeline/);
  assert.match(passive, /panelStateMachineWaitsFor0327Ack: false/);
  assert.match(passive, /firstMissingStage/);
  assert.match(passive, /orderedId70Complete/);
  assert.match(passive, /systemOutputTrace: systemOutputTraceSnapshot\(\)/);
  assert.doesNotMatch(passive, /\.write(?:U8|U16|U32|Pointer|ByteArray)?\s*\(/);
  assert.doesNotMatch(passive, /new NativeFunction\s*\(/);
  assert.doesNotMatch(passive, /retval\.replace\s*\(/);
  assert.doesNotMatch(passive, /force/i);

  const decoderSource = sliceBetween(
    passive,
    'function systemOutputCommandCardData(rawCategoryCount, readCommandCount, readFactoryId) {',
    'function systemOutputCommandCardSnapshot() {',
  ).trim();
  const decodeCommandCard = Function(
    'SYSTEM_OUTPUT_COMMAND_CATEGORY_CAP',
    'SYSTEM_OUTPUT_FACTORY_CAP',
    'SYSTEM_OUTPUT_WHITELIST_FACTORIES',
    'SYSTEM_OUTPUT_B71_FACTORY_ID',
    `return (${decoderSource});`,
  )(300, 24, [0x19, 0x2d, 0x43], 0x2d);
  const visitedCategories = [];
  const decoded = decodeCommandCard(
    2,
    (category) => {
      visitedCategories.push(category);
      return category === 15 ? 229 : 1;
    },
    () => 0x2b,
  );
  assert.deepEqual(visitedCategories, [0, 1]);
  assert.deepEqual(decoded.factoryIds, [0x2b]);
  assert.equal(decoded.factory2dGranted, false);
  assert.equal(decoded.reason, null);
  const unreadableOuter = decodeCommandCard(null, () => 1, () => 0x41);
  assert.deepEqual(unreadableOuter.factoryIds, []);
  assert.equal(unreadableOuter.factory2dGranted, false);
  assert.equal(unreadableOuter.reason, 'category-count-unreadable');
  const oversizedOuter = decodeCommandCard(301, () => 1, () => 0x41);
  assert.deepEqual(oversizedOuter.factoryIds, []);
  assert.equal(oversizedOuter.factory2dGranted, false);
  assert.equal(oversizedOuter.reason, 'category-count-exceeds-cap');
  const unreadableRow = decodeCommandCard(2, (category) => (category === 1 ? null : 1), () => 0x41);
  assert.deepEqual(unreadableRow.factoryIds, []);
  assert.equal(unreadableRow.factory2dGranted, false);
  assert.equal(unreadableRow.reason, 'factory-count-unreadable');
  const oversizedRow = decodeCommandCard(2, (category) => (category === 1 ? 25 : 1), () => 0x41);
  assert.deepEqual(oversizedRow.factoryIds, []);
  assert.equal(oversizedRow.factory2dGranted, false);
  assert.equal(oversizedRow.reason, 'factory-count-exceeds-cap');
  const unreadableFactory = decodeCommandCard(1, () => 1, () => null);
  assert.deepEqual(unreadableFactory.factoryIds, []);
  assert.equal(unreadableFactory.factory2dGranted, false);
  assert.equal(unreadableFactory.reason, 'factory-id-unreadable');
});

test('성계 상세 출력 phase는 whole-run 병목과 구간 관측을 분리한다', async () => {
  // Given: 마커 전후 snapshot을 기록하는 Python 진단기
  const source = await readFile(PROBE_URL, 'utf8');
  const metrics = sliceBetween(
    source,
    'def system_output_trace_metrics(system_detail):',
    'def main():',
  );
  const phaseMetrics = sliceBetween(
    source,
    'def system_output_trace_phase(before_snapshot, after_snapshot):',
    'def main():',
  );
  const diagnostic = sliceBetween(
    source,
    "if os.environ.get('LOGH_CLICK_STRATEGY_SYSTEM_MARKER') == '1'",
    "if os.environ.get('LOGH_FORCE_SELECTGRID_BEFORE_SWEEP') == '1'",
  );

  // When/Then: 클릭 인과를 승격하지 않고 관측된 ID/순서와 첫 단절만 보존한다.
  assert.match(source, /SYSTEM_OUTPUT_STAGE_KEYS = \(/);
  assert.match(metrics, /def system_output_trace_delta\(current, baseline\):/);
  assert.match(metrics, /def system_output_trace_phase\(before_snapshot, after_snapshot\):/);
  assert.match(metrics, /'panelDispatchDelta'/);
  assert.match(metrics, /'renderSinkDelta'/);
  assert.match(metrics, /'panelDispatchId70'/);
  assert.match(metrics, /'renderSinkId70'/);
  assert.match(metrics, /'orderedId70Complete'/);
  assert.match(metrics, /'firstMissingStage'/);
  assert.match(metrics, /'missingStages'/);
  assert.match(metrics, /'missingRequiredResponse0327'/);
  assert.match(metrics, /'panelStateMachineWaitsFor0327Ack'/);
  assert.match(metrics, /'factory2dGranted'/);
  assert.match(metrics, /'factoryGrantCalls'/);
  assert.match(metrics, /entry\.get\('sequence'\) or 0/);
  assert.doesNotMatch(metrics, /selectionIndexValidCalls|selectionIndexChangedCalls|clickCausal|clickSuccess/);
  assert.match(phaseMetrics, /'orderedId70Complete': after_metrics\.get\('orderedId70Complete'\) is True/);
  assert.match(phaseMetrics, /'firstMissingStage': after_metrics\.get\('firstMissingStage'\)/);
  assert.match(phaseMetrics, /'missingStages': after_metrics\.get\('missingStages'\) or \[\]/);
  assert.match(phaseMetrics, /'missingRequiredResponse0327': after_metrics\.get\('missingRequiredResponse0327'\) is True/);
  assert.match(phaseMetrics, /'runCorrelation': \{/);
  assert.match(phaseMetrics, /'phaseObservedStages'/);
  assert.match(phaseMetrics, /'phaseTimeline'/);
  assert.match(phaseMetrics, /'phaseFirstUnobservedStage'/);
  assert.doesNotMatch(phaseMetrics, /'firstMissingStage': phase_first_unobserved_stage/);
  assert.match(diagnostic, /'systemOutputTrace': \{/);
  for (const phase of ['singleFromBefore', 'rowFromRowBefore', 'doubleFromDoubleBefore', 'finalFromBefore']) {
    assert.match(diagnostic, new RegExp(`'${phase}'`));
  }
  assert.match(diagnostic, /system_output_trace_phase\(before_snapshot, final_snapshot\)/);

  const fixture = String.raw`
import json
import _strategy_table_probe as probe

def snapshot():
    return {'systemDetail': {'systemOutputTrace': {
        'sequence': 1,
        'timeline': [{'stage': 'commandCard0305', 'sequence': 1}],
        'counts': {'commandCard0305': 1},
        'last': {},
        'correlation': {
            'orderedId70Complete': False,
            'firstMissingStage': 'factoryGrant',
            'missingStages': ['factoryGrant'],
        },
        'commandCard0305': {'runtime': {'factoryIds': [], 'factory2dGranted': False}},
        'missingRequiredResponse0327': True,
        'panelStateMachineWaitsFor0327Ack': False,
    }}}

report = probe.system_output_trace_phase(snapshot(), snapshot())
print(json.dumps({
    'orderedId70Complete': report['orderedId70Complete'],
    'firstMissingStage': report['firstMissingStage'],
    'missingStages': report['missingStages'],
    'missingRequiredResponse0327': report['missingRequiredResponse0327'],
    'phaseObservedStages': report['phaseObservedStages'],
    'phaseFirstUnobservedStage': report['phaseFirstUnobservedStage'],
}))
`;
  const { stdout } = await execFileAsync('py', ['-3', '-c', fixture], { cwd: LIVE_DIR });
  const report = JSON.parse(stdout);
  assert.equal(report.orderedId70Complete, false);
  assert.equal(report.firstMissingStage, 'factoryGrant');
  assert.deepEqual(report.missingStages, ['factoryGrant']);
  assert.equal(report.missingRequiredResponse0327, true);
  assert.deepEqual(report.phaseObservedStages, []);
  assert.equal(report.phaseFirstUnobservedStage, 'commandCard0305');
});
