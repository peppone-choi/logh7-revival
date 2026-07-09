import frida, time, sys, ctypes
from ctypes import wintypes
from pathlib import Path
sys.path.insert(0, r"E:\logh7-revival\tools\live")
from logh7_agent_drive import find_client_hwnd, foreground, client_geometry, screenshot

user32 = ctypes.windll.user32
hwnd = find_client_hwnd()
pid = wintypes.DWORD()
user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
print("pid", pid.value)
foreground(hwnd)
ox,oy,cw,ch = client_geometry(hwnd)
print("geom", cw, ch)

# Script: call FUN_00593cf0(0) and FUN_00593d90 / FUN_005946d0
# Also try reading scene state at 0x02215e2c
SCRIPT = r"""
'use strict';
const prep = new NativeFunction(ptr('0x00593cf0'), 'void', ['int']);
const sel = new NativeFunction(ptr('0x00593d90'), 'int', []);
const render = new NativeFunction(ptr('0x005946d0'), 'void', []);
// scene object pointer candidate
function readScene() {
  try {
    const p = ptr('0x02215e2c').readPointer();
    const st = p.add(4).readU32();
    return {p: p.toString(), state: st};
  } catch (e) {
    return {err: String(e)};
  }
}
rpc.exports = {
  scene() { return readScene(); },
  forcePicker() {
    const before = readScene();
    try { prep(0); } catch (e) { return {before, prepErr: String(e)}; }
    let selR = null;
    try { selR = sel(); } catch (e) { return {before, prepOk: true, selErr: String(e)}; }
    try { render(); } catch (e) { return {before, prepOk: true, selR, renderErr: String(e)}; }
    const after = readScene();
    return {before, prepOk: true, selR, renderOk: true, after};
  }
};
"""

session = frida.attach(pid.value)
script = session.create_script(SCRIPT)
script.load()
print("scene", script.exports_sync.scene())
print("force", script.exports_sync.force_picker())
time.sleep(1.0)
screenshot(hwnd, Path(r"E:\logh7-revival\server\data\agent-drive\fsm-probe3\03-force-picker.png"))
print("scene2", script.exports_sync.scene())
session.detach()
print("done")
