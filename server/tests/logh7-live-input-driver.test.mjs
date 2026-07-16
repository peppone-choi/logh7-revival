import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const DRIVER_URL = new URL('../../tools/live/logh7_agent_drive.py', import.meta.url);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `invalid source slice: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

test('foreground Win32 calls declare pointer-safe ctypes ABI', async () => {
  const source = await readFile(DRIVER_URL, 'utf8');

  assert.match(source, /user32\.GetForegroundWindow\.argtypes = \[\]/);
  assert.match(source, /user32\.GetForegroundWindow\.restype = wintypes\.HWND/);
  assert.match(source, /kernel32\.GetCurrentThreadId\.argtypes = \[\]/);
  assert.match(source, /kernel32\.GetCurrentThreadId\.restype = wintypes\.DWORD/);
  assert.match(
    source,
    /user32\.GetWindowThreadProcessId\.argtypes = \[wintypes\.HWND, ctypes\.POINTER\(wintypes\.DWORD\)\]/,
  );
  assert.match(source, /user32\.GetWindowThreadProcessId\.restype = wintypes\.DWORD/);
  assert.match(
    source,
    /user32\.AttachThreadInput\.argtypes = \[wintypes\.DWORD, wintypes\.DWORD, wintypes\.BOOL\]/,
  );
  assert.match(source, /user32\.AttachThreadInput\.restype = wintypes\.BOOL/);
  assert.match(source, /user32\.SetForegroundWindow\.argtypes = \[wintypes\.HWND\]/);
  assert.match(source, /user32\.SetForegroundWindow\.restype = wintypes\.BOOL/);
  assert.match(source, /user32\.ShowWindow\.argtypes = \[wintypes\.HWND, ctypes\.c_int\]/);
  assert.match(source, /user32\.ShowWindow\.restype = wintypes\.BOOL/);
  assert.match(source, /user32\.IsWindowVisible\.argtypes = \[wintypes\.HWND\]/);
  assert.match(source, /user32\.IsWindowVisible\.restype = wintypes\.BOOL/);
  assert.match(source, /user32\.GetWindowTextLengthW\.argtypes = \[wintypes\.HWND\]/);
  assert.match(source, /user32\.GetWindowTextLengthW\.restype = ctypes\.c_int/);
  assert.match(
    source,
    /user32\.GetClientRect\.argtypes = \[wintypes\.HWND, ctypes\.POINTER\(RECT\)\]/,
  );
  assert.match(source, /user32\.GetClientRect\.restype = wintypes\.BOOL/);
  assert.match(
    source,
    /user32\.GetWindowRect\.argtypes = \[wintypes\.HWND, ctypes\.POINTER\(RECT\)\]/,
  );
  assert.match(source, /user32\.GetWindowRect\.restype = wintypes\.BOOL/);
  assert.match(
    source,
    /user32\.ClientToScreen\.argtypes = \[wintypes\.HWND, ctypes\.POINTER\(POINT\)\]/,
  );
  assert.match(source, /user32\.ClientToScreen\.restype = wintypes\.BOOL/);
});

test('foreground attaches, detaches, and continues only after activation succeeds', async () => {
  const source = await readFile(DRIVER_URL, 'utf8');
  const foreground = sliceBetween(source, 'def foreground(', 'def abs_coords(');

  const getForegroundIndex = foreground.indexOf('GetForegroundWindow(');
  const currentThreadIndex = foreground.indexOf('GetCurrentThreadId(');
  const foregroundThreadIndex = foreground.indexOf('GetWindowThreadProcessId(');
  const attachIndex = foreground.search(/AttachThreadInput\([^\n]+, True\)/);
  const tryIndex = foreground.indexOf('try:');
  const setForegroundIndex = foreground.indexOf('activated = bool(user32.SetForegroundWindow(hwnd))');
  const finallyIndex = foreground.indexOf('finally:');
  const detachIndex = foreground.search(/AttachThreadInput\([^\n]+, False\)/);
  // 활성화가 끝내 실패하면 timeout 재시도 루프가 deadline 에서 예외를 던진다(fail-closed).
  const failClosedIndex = foreground.search(/raise ForegroundActivationError\(hwnd\)/);
  const settleIndex = foreground.indexOf('time.sleep(0.25)');

  assert.ok(getForegroundIndex >= 0);
  assert.ok(currentThreadIndex > getForegroundIndex);
  assert.ok(foregroundThreadIndex > currentThreadIndex);
  assert.ok(attachIndex > foregroundThreadIndex);
  assert.ok(tryIndex > attachIndex);
  assert.ok(setForegroundIndex > tryIndex);
  assert.ok(finallyIndex > setForegroundIndex);
  assert.ok(detachIndex > finallyIndex);
  // attach/detach 규율이 끝난 뒤에만 정착 대기(settle)와 fail-closed 예외가 온다.
  assert.ok(settleIndex > detachIndex);
  assert.ok(failClosedIndex > detachIndex);
});

test('foreground fails closed when Windows rejects activation', async () => {
  const source = await readFile(DRIVER_URL, 'utf8');
  const foreground = sliceBetween(source, 'def foreground(', 'def abs_coords(');

  assert.match(source, /class ForegroundActivationError\(RuntimeError\):/);
  // 활성화가 성공하지 못한 채 deadline 을 넘기면 조용히 진행하지 않고 예외를 던진다.
  assert.match(
    foreground,
    /if time\.monotonic\(\) >= deadline:\s+raise ForegroundActivationError\(hwnd\)/,
  );
});

test('foreground dismisses only a verified notification toast before retrying activation', async () => {
  const source = await readFile(DRIVER_URL, 'utf8');
  const foreground = sliceBetween(source, 'def foreground(', 'GA_ROOT = 2');

  const getForegroundIndex = foreground.indexOf('foreground_hwnd = user32.GetForegroundWindow()');
  const describeIndex = foreground.indexOf('foreground_info = describe_window(foreground_hwnd)');
  const toastCheckIndex = foreground.indexOf('if is_notification_toast(foreground_info):');
  const dismissIndex = foreground.indexOf(
    "toast_result = dismiss_toast(foreground_info, reason='전경 활성화 차단')",
  );
  const goneCheckIndex = foreground.indexOf("if toast_result.get('gone'):", dismissIndex);
  const continueIndex = foreground.indexOf('\n                continue', goneCheckIndex);
  const activationIndex = foreground.indexOf('activated = bool(user32.SetForegroundWindow(hwnd))');

  assert.ok(getForegroundIndex >= 0);
  assert.ok(describeIndex > getForegroundIndex);
  assert.ok(toastCheckIndex > describeIndex);
  assert.ok(dismissIndex > toastCheckIndex);
  assert.ok(goneCheckIndex > dismissIndex);
  assert.ok(continueIndex > goneCheckIndex);
  assert.ok(activationIndex > continueIndex);
});

test('UIA toast dismissal decodes PowerShell output as UTF-8', async () => {
  const source = await readFile(DRIVER_URL, 'utf8');
  const dismissToast = sliceBetween(source, 'def dismiss_toast(', 'def click_guarded(');

  assert.match(
    dismissToast,
    /capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25/,
  );
});
