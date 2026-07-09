import ctypes, time, json
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
TH32CS_SNAPPROCESS = 0x2

class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)), ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD), ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD),
        ("szExeFile", wintypes.WCHAR * 260),
    ]

class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]
class RECT(ctypes.Structure):
    _fields_ = [("l", wintypes.LONG), ("t", wintypes.LONG), ("r", wintypes.LONG), ("b", wintypes.LONG)]
class MI(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class KI(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class HI(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]
class IU(ctypes.Union):
    _fields_ = [("mi", MI), ("ki", KI), ("hi", HI)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", IU)]

def g7_pids():
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    pe = PROCESSENTRY32W(); pe.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    pids = set()
    if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
        while True:
            if "g7mtclient" in pe.szExeFile.lower():
                pids.add(pe.th32ProcessID)
            if not kernel32.Process32NextW(snap, ctypes.byref(pe)):
                break
    kernel32.CloseHandle(snap)
    return pids

def find_hwnd():
    pids = g7_pids()
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.GetWindowTextLengthW(hwnd) <= 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids:
            found.append(hwnd)
        return True
    user32.EnumWindows(cb, 0)
    if not found:
        raise RuntimeError(f"no hwnd pids={pids}")
    best, ba = None, -1
    for h in found:
        wr = RECT(); user32.GetWindowRect(h, ctypes.byref(wr))
        a = max(0, wr.r - wr.l) * max(0, wr.b - wr.t)
        if a > ba:
            ba, best = a, h
    return best

def geom(hwnd):
    cr = RECT(); user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0, 0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.r - cr.l, cr.b - cr.t

def abs_xy(x, y):
    sx = user32.GetSystemMetrics(0); sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))

def click(sx, sy):
    for dx, dy in ((-2, -1), (0, 0)):
        ax, ay = abs_xy(sx + dx, sy + dy)
        i = INPUT(type=0, u=IU(mi=MI(ax, ay, 0, 0x0001 | 0x8000, 0, None)))
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INPUT)); time.sleep(0.02)
    d = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0002, 0, None)))
    u = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0004, 0, None)))
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT)); time.sleep(0.05)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.1)

def post_click(hwnd, cx, cy):
    lp = (cy << 16) | (cx & 0xFFFF)
    user32.PostMessageW(hwnd, 0x0201, 0x0001, lp); time.sleep(0.04)
    user32.PostMessageW(hwnd, 0x0202, 0, lp); time.sleep(0.08)

def dual(hwnd, ox, oy, cx, cy, label):
    print(f"  click {label} ({cx},{cy})")
    user32.SetForegroundWindow(hwnd); time.sleep(0.05)
    click(ox + cx, oy + cy)
    post_click(hwnd, cx, cy)

def type_u(text):
    for ch in text:
        d = INPUT(type=1, u=IU(ki=KI(0, ord(ch), 0x0004, 0, None)))
        u = INPUT(type=1, u=IU(ki=KI(0, ord(ch), 0x0004 | 0x0002, 0, None)))
        user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.035)

def shot(hwnd, path):
    wr = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path); print("shot", path.name, img.size); return img

def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])

def crashes():
    out = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n <= 0:
            return True
        b = ctypes.create_unicode_buffer(n + 1); user32.GetWindowTextW(hwnd, b, n + 1)
        if "Runtime" in b.value or "Visual C" in b.value:
            out.append(b.value)
        return True
    user32.EnumWindows(cb, 0)
    return out

sd = Path("server/data/agent-drive")
hwnd = find_hwnd()
print("hwnd", hex(hwnd), "pids", g7_pids())
user32.ShowWindow(hwnd, 9); user32.SetForegroundWindow(hwnd); time.sleep(0.4)
ox, oy, cw, ch = geom(hwnd)
print("geom", ox, oy, cw, ch)
shot(hwnd, sd / "s01-login.png")

LOGIN_REF = (644, 484)
for label, pt, text in [("ID", (374, 290), "inei00"), ("PW", (376, 318), "dummy")]:
    cx, cy = scale(LOGIN_REF, pt, cw, ch)
    dual(hwnd, ox, oy, cx, cy, label)
    for _ in range(14):
        type_u("\b")
    type_u(text); time.sleep(0.1)
cx, cy = scale(LOGIN_REF, (352, 347), cw, ch)
dual(hwnd, ox, oy, cx, cy, "LOGIN")
time.sleep(3.5)

hwnd = find_hwnd()
user32.SetForegroundWindow(hwnd); time.sleep(0.2)
ox, oy, cw, ch = geom(hwnd)
print("post", ox, oy, cw, ch)
shot(hwnd, sd / "s02-after.png")
print("crashes", crashes())

if cw >= 1000:
    dual(hwnd, ox, oy, 90, 212, "CREATE")
    time.sleep(1.5)
    hwnd = find_hwnd(); ox, oy, cw, ch = geom(hwnd)
    shot(hwnd, sd / "s03-create.png")
    print("crashes2", crashes())
    dual(hwnd, ox, oy, 515, 310, "FACE1")
    time.sleep(0.6)
    shot(hwnd, sd / "s04-face.png")
    dual(hwnd, ox, oy, 655, 585, "OK")
    time.sleep(1.2)
    shot(hwnd, sd / "s05-ok.png")
    # alt OK tries if needed
    for i, pt in enumerate([(640, 580), (670, 590), (655, 600), (515, 310)]):
        dual(hwnd, ox, oy, pt[0], pt[1], f"alt{i}")
        time.sleep(0.8)
        shot(hwnd, sd / f"s06-alt{i}.png")
    print("crashes3", crashes())
else:
    print("not lobby size")

tp = Path("server/data/live-manual-trace.jsonl")
if tp.exists():
    lines = tp.read_text(encoding="utf-8", errors="ignore").strip().splitlines()
    print("trace lines", len(lines))
    for ln in lines[-25:]:
        try:
            o = json.loads(ln)
            ev = o.get("event") or o.get("msg") or ""
            print(json.dumps({k: o.get(k) for k in ("ts","event","code","conn","direction","bytes","note","replyId","error") if k in o}, ensure_ascii=False)[:280])
        except Exception:
            print(ln[:280])
else:
    print("no trace file")
