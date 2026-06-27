// Frida 스크립트: C002 brute-force 명령 강제 발신
// 자동 실행 (load 시 바로 실행)

var MODULE_NAME = 'G7MTClient.exe';
var mod = Process.findModuleByName(MODULE_NAME);
var BASE = mod ? mod.base : null;
if (!BASE) {
    console.error('[C002-BRUTE] G7MTClient.exe module not found');
} else {
    console.log('[C002-BRUTE] BASE = ' + BASE);

    // --- 주소 계산 ---
    var FUN_004fc4a0_VA = BASE.add(0x004fc4a0 - 0x400000);
    var FUN_004f93c0_VA = BASE.add(0x004f93c0 - 0x400000);
    var FUN_005737d0_VA = BASE.add(0x005737d0 - 0x400000);
    var FUN_0050d230_VA = BASE.add(0x0050d230 - 0x400000);
    var FUN_004fd7a0_VA = BASE.add(0x004fd7a0 - 0x400000);
    var FUN_004f68f0_VA = BASE.add(0x004f68f0 - 0x400000);
    var FUN_004fc470_VA = BASE.add(0x004fc470 - 0x400000);

    // --- NativeFunction 선언 ---
    var FUN_004fc470 = new NativeFunction(FUN_004fc470_VA, 'char', ['pointer'], 'fastcall');
    var FUN_004f68f0 = new NativeFunction(FUN_004f68f0_VA, 'void', ['pointer'], 'fastcall');
    var FUN_004fc4a0  = new NativeFunction(FUN_004fc4a0_VA,  'char', ['pointer'], 'fastcall');
    var FUN_004f93c0  = new NativeFunction(FUN_004f93c0_VA,  'void', ['pointer'], 'fastcall');
    var FUN_005737d0  = new NativeFunction(FUN_005737d0_VA,  'void', ['pointer'], 'fastcall');
    var FUN_0050d230  = new NativeFunction(FUN_0050d230_VA,  'void', ['pointer'], 'fastcall');
    var FUN_004fd7a0  = new NativeFunction(FUN_004fd7a0_VA,  'void', ['pointer', 'int'], 'fastcall');

    // --- 전역 상태 포인터 ---
    var mainStatePtr = Memory.readPointer(BASE.add(0x007ccffc - 0x400000));
    console.log('[C002-BRUTE] mainStatePtr = ' + mainStatePtr);

    var gStrategyClientPtr = Memory.readPointer(BASE.add(0x007cd04c - 0x400000));
    console.log('[C002-BRUTE] gStrategyClientPtr = ' + gStrategyClientPtr);

    var activeScenePtr = Memory.readPointer(BASE.add(0x02215e2c - 0x400000));
    console.log('[C002-BRUTE] activeScenePtr = ' + activeScenePtr);

    // --- 추가 상태 읽기 ---
    var sceneState4 = 0;
    var catGateF4 = 0;
    var cmdRowCount = 0;
    var sel = 0;
    var arg270 = 0;
    var mainState8 = 0;

    try {
        sceneState4 = Memory.readU32(gStrategyClientPtr.add(4));
        catGateF4 = Memory.readU32(gStrategyClientPtr.add(0xf4));
        cmdRowCount = Memory.readU32(gStrategyClientPtr.add(0x480));
        sel = Memory.readU32(gStrategyClientPtr.add(0x624));
        mainState8 = Memory.readPointer(mainStatePtr.add(8));
        arg270 = Memory.readU8(mainStatePtr.add(0x270));
    } catch (e) {
        console.log('[C002-BRUTE] state read error: ' + e.message);
    }

    console.log('[C002-BRUTE] sceneState4=' + sceneState4 + ' catGateF4=' + catGateF4 + ' cmdRowCount=' + cmdRowCount + ' sel=' + sel);
    console.log('[C002-BRUTE] mainState8=' + mainState8 + ' arg270=' + arg270);

    // --- 시도 기록 ---
    var attempts = [];
    function recordAttempt(name, args, result, note) {
        var entry = {
            name: name,
            args: args,
            result: result,
            note: note
        };
        attempts.push(entry);
        console.log('[C002-BRUTE] ATTEMPT: ' + name + ' => ' + result + ' | ' + note);
    }

    // --- Brute-force 시퀀스 ---
    console.log('[C002-BRUTE] === Brute-force start ===');

    // [시도 1] FUN_004fc470 (gate) -> true면 FUN_004fc4a0
    try {
        var gateResult = FUN_004fc470(gStrategyClientPtr);
        recordAttempt('FUN_004fc470', { ecx: gStrategyClientPtr.toString() }, gateResult.toString(), 'gate check');
        console.log('[C002-BRUTE] FUN_004fc470 gate = ' + gateResult);

        if (gateResult !== 0) {
            var r = FUN_004fc4a0(gStrategyClientPtr);
            recordAttempt('FUN_004fc4a0', { ecx: gStrategyClientPtr.toString() }, r.toString(), 'after gate pass');
            console.log('[C002-BRUTE] FUN_004fc4a0 = ' + r);
        }
    } catch (e) {
        recordAttempt('FUN_004fc470/004fc4a0', {}, 'exception', e.message);
        console.error('[C002-BRUTE] exception: ' + e.message);
    }

    // [시도 2] FUN_004f68f0 (panel fill)
    try {
        var panelData = Memory.readPointer(mainStatePtr.add(8));
        FUN_004f68f0(panelData);
        recordAttempt('FUN_004f68f0', { ecx: panelData.toString() }, 'void', 'panel fill');
        console.log('[C002-BRUTE] FUN_004f68f0 done');
    } catch (e) {
        recordAttempt('FUN_004f68f0', {}, 'exception', e.message);
        console.error('[C002-BRUTE] FUN_004f68f0 exception: ' + e.message);
    }

    // [시도 3] FUN_004f93c0
    try {
        FUN_004f93c0(gStrategyClientPtr);
        recordAttempt('FUN_004f93c0', { ecx: gStrategyClientPtr.toString() }, 'void', 'C002 related');
        console.log('[C002-BRUTE] FUN_004f93c0 done');
    } catch (e) {
        recordAttempt('FUN_004f93c0', {}, 'exception', e.message);
        console.error('[C002-BRUTE] FUN_004f93c0 exception: ' + e.message);
    }

    // [시도 4] FUN_005737d0 (widget create)
    try {
        FUN_005737d0(activeScenePtr);
        recordAttempt('FUN_005737d0', { ecx: activeScenePtr.toString() }, 'void', 'widget create');
        console.log('[C002-BRUTE] FUN_005737d0 done');
    } catch (e) {
        recordAttempt('FUN_005737d0', {}, 'exception', e.message);
        console.error('[C002-BRUTE] FUN_005737d0 exception: ' + e.message);
    }

    // [시도 5] FUN_0050d230 (mode0 consume)
    try {
        FUN_0050d230(activeScenePtr);
        recordAttempt('FUN_0050d230', { ecx: activeScenePtr.toString() }, 'void', 'mode0 consume');
        console.log('[C002-BRUTE] FUN_0050d230 done');
    } catch (e) {
        recordAttempt('FUN_0050d230', {}, 'exception', e.message);
        console.error('[C002-BRUTE] FUN_0050d230 exception: ' + e.message);
    }

    // [시도 6] FUN_004fd7a0 (mode activate) + FUN_004fc4a0
    try {
        FUN_004fd7a0(gStrategyClientPtr, 0);
        recordAttempt('FUN_004fd7a0', { ecx: gStrategyClientPtr.toString(), arg0: 0 }, 'void', 'mode activate');
        console.log('[C002-BRUTE] FUN_004fd7a0(0) done');

        var r2 = FUN_004fc4a0(gStrategyClientPtr);
        recordAttempt('FUN_004fc4a0_retry', { ecx: gStrategyClientPtr.toString() }, r2.toString(), 'after mode activate');
        console.log('[C002-BRUTE] FUN_004fc4a0 retry = ' + r2);
    } catch (e) {
        recordAttempt('FUN_004fd7a0/004fc4a0_retry', {}, 'exception', e.message);
        console.error('[C002-BRUTE] mode activate exception: ' + e.message);
    }

    // [시도 7] activeScene + 0x126718 = 1 강제
    try {
        var mode0Flag = activeScenePtr.add(0x126718);
        var oldVal = Memory.readU8(mode0Flag);
        Memory.writeU8(mode0Flag, 1);
        recordAttempt('mode0_flag_write', { addr: mode0Flag.toString(), old: oldVal, new: 1 }, 'ok', 'force mode0');
        console.log('[C002-BRUTE] mode0 flag 0x126718 = 1 (was ' + oldVal + ')');

        FUN_0050d230(activeScenePtr);
        recordAttempt('FUN_0050d230_after_mode0', { ecx: activeScenePtr.toString() }, 'void', 'mode0 consume after flag');
        console.log('[C002-BRUTE] FUN_0050d230 after mode0 flag done');
    } catch (e) {
        recordAttempt('mode0_flag', {}, 'exception', e.message);
        console.error('[C002-BRUTE] mode0 flag exception: ' + e.message);
    }

    console.log('[C002-BRUTE] === Brute-force done ===');
    console.log('[C002-BRUTE] RESULT: base=' + BASE + ' mainState=' + mainStatePtr + ' gStrategyClient=' + gStrategyClientPtr + ' activeScene=' + activeScenePtr);
    console.log('[C002-BRUTE] STATE: sceneState4=' + sceneState4 + ' catGateF4=' + catGateF4 + ' cmdRowCount=' + cmdRowCount + ' sel=' + sel + ' arg270=' + arg270);
}
