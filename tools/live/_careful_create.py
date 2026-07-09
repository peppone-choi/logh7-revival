import ctypes, time, sys
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab, Image

user32 = ctypes.windll.user32
hwnd = int(sys.argv[1])
sd = Path("server/data/agent-drive")

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

def geom(hwnd):
    cr = RECT(); user32.GetClientRect(hwnd, ctypes.byref(cr))
    pt = POINT(0, 0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, cr.r - cr.l, cr.b - cr.t

def abs_xy(x, y):
    sx = user32.GetSystemMetrics(0); sy = user32.GetSystemMetrics(1)
    return int(x * 65535 / max(sx - 1, 1)), int(y * 65535 / max(sy - 1, 1))

def click(sx, sy):
    ax, ay = abs_xy(sx, sy)
    i = INPUT(type=0, u=IU(mi=MI(ax, ay, 0, 0x0001 | 0x8000, 0, None)))
    user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INPUT)); time.sleep(0.05)
    d = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0002, 0, None)))
    u = INPUT(type=0, u=IU(mi=MI(0, 0, 0, 0x0004, 0, None)))
    user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT)); time.sleep(0.07)
    user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.2)

def type_u(text):
    for ch in text:
        d = INPUT(type=1, u=IU(ki=KI(0, ord(ch), 0x0004, 0, None)))
        u = INPUT(type=1, u=IU(ki=KI(0, ord(ch), 0x0004 | 0x0002, 0, None)))
        user32.SendInput(1, ctypes.byref(d), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(u), ctypes.sizeof(INPUT)); time.sleep(0.04)

def grab(hwnd):
    wr = RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    return ImageGrab.grab(bbox=(wr.l, wr.t, wr.r, wr.b))

def shot(hwnd, name):
    img = grab(hwnd)
    p = sd / name
    img.save(p)
    print("shot", name, img.size)
    return img

def scale(ref, pt, cw, ch):
    return int(pt[0] * cw / ref[0]), int(pt[1] * ch / ref[1])

def has_crash():
    found = []
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(h, _):
        if not user32.IsWindowVisible(h):
            return True
        n = user32.GetWindowTextLengthW(h)
        if n <= 0:
            return True
        b = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(h, b, n + 1)
        if "Runtime" in b.value or "Visual C" in b.value:
            found.append(1)
        return True
    user32.EnumWindows(cb, 0)
    return bool(found)

def blue_menu_score(img: Image.Image) -> float:
    # left menu strip blue density
    w, h = img.size
    # client-ish left area; window may have titlebar ~30px
    x0, x1 = int(w * 0.05), int(w * 0.22)
    y0, y1 = int(h * 0.15), int(h * 0.85)
    n = 0; blue = 0
    step = 3
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            r, g, b = img.getpixel((x, y))[:3]
            n += 1
            if b > 140 and r < 100 and 50 < g < 170:
                blue += 1
    return blue / max(n, 1)

def face_score(img: Image.Image) -> float:
    w, h = img.size
    # origin faces roughly center-left of main panel
    x0, x1 = int(w * 0.45), int(w * 0.58)
    y0, y1 = int(h * 0.30), int(h * 0.70)
    n = 0; skin = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            r, g, b = img.getpixel((x, y))[:3]
            n += 1
            if r > 140 and 100 < g < 190 and 80 < b < 160 and r > b:
                skin += 1
    return skin / max(n, 1)

# --- login ---
user32.ShowWindow(hwnd, 9); user32.SetForegroundWindow(hwnd); time.sleep(0.5)
ox, oy, cw, ch = geom(hwnd)
print("login", ox, oy, cw, ch)
shot(hwnd, "c01-login.png")
LOGIN_REF = (644, 484)
for label, pt, text in [("ID", (374, 290), "inei00"), ("PW", (376, 318), "dummy")]:
    cx, cy = scale(LOGIN_REF, pt, cw, ch)
    user32.SetForegroundWindow(hwnd)
    click(ox + cx, oy + cy)
    for _ in range(12):
        type_u(chr(8))
    type_u(text)
cx, cy = scale(LOGIN_REF, (352, 347), cw, ch)
user32.SetForegroundWindow(hwnd)
click(ox + cx, oy + cy)

# wait for painted lobby (blue menu)
lobby_ok = False
for i in range(40):
    time.sleep(0.5)
    if not user32.IsWindow(hwnd) or has_crash():
        print("lost/crash during wait", i); break
    ox, oy, cw, ch = geom(hwnd)
    img = grab(hwnd)
    score = blue_menu_score(img)
    print(f"wait{i} {cw}x{ch} blue={score:.3f}")
    if cw >= 1000 and score > 0.05:
        img.save(sd / "c02-lobby-ready.png")
        print("lobby ready")
        lobby_ok = True
        break

if not lobby_ok:
    shot(hwnd, "c02-lobby-fail.png")
    print("FAIL no lobby paint"); sys.exit(2)

# if empty roster dialog (bright panel mid), click OK near dialog bottom-right
img = grab(hwnd)
# detect dialog: mid region brightness higher than dark panel
mid = img.crop((int(img.width*0.35), int(img.height*0.35), int(img.width*0.75), int(img.height*0.65)))
avg = sum(sum(p[:3]) for p in mid.getdata()) / (mid.width * mid.height * 3)
print("mid_avg", avg)
if avg > 40:
    # dialog OK candidates from lobby-now ~ center bottom of dialog
    for pt in [(700, 430), (680, 420), (720, 440), (650, 430)]:
        print("dismiss try", pt)
        user32.SetForegroundWindow(hwnd)
        click(ox + pt[0], oy + pt[1])
        time.sleep(0.6)
        img2 = grab(hwnd)
        avg2 = sum(sum(p[:3]) for p in img2.crop((int(img2.width*0.35), int(img2.height*0.35), int(img2.width*0.75), int(img2.height*0.65))).getdata()) / (img2.width * img2.height * 0.4 * 0.3 * 3)
        # simpler: face_score or blue
        print("  after mid_blue", blue_menu_score(img2), "face", face_score(img2))
        if blue_menu_score(img2) > 0.05:
            img2.save(sd / "c03-dismissed.png")
            break

shot(hwnd, "c03-pre-create.png")
print("crash", has_crash())

# open create - 2nd menu button. Try a few Y positions carefully, one at a time with visual check
# menu roughly: top button ~ y 150, second ~ 200
candidates = [(100, 200), (100, 210), (100, 220), (90, 212), (110, 205), (95, 190)]
for i, (cx, cy) in enumerate(candidates):
    if has_crash():
        print("crash before create"); break
    user32.SetForegroundWindow(hwnd)
    click(ox + cx, oy + cy)
    time.sleep(1.2)
    img = grab(hwnd)
    fs = face_score(img)
    bs = blue_menu_score(img)
    name = f"c04-create-try{i}.png"
    img.save(sd / name)
    print(f"create try{i} ({cx},{cy}) face={fs:.4f} blue={bs:.3f} crash={has_crash()}")
    if fs > 0.01:
        print("ORIGIN UI DETECTED")
        # select top face and OK
        user32.SetForegroundWindow(hwnd)
        click(ox + 515, oy + 310)
        time.sleep(0.7)
        shot(hwnd, "c05-face.png")
        user32.SetForegroundWindow(hwnd)
        click(ox + 655, oy + 585)
        time.sleep(1.5)
        shot(hwnd, "c06-after-ok.png")
        print("after ok face", face_score(grab(hwnd)), "crash", has_crash())
        break
else:
    print("no origin UI from menu candidates")

print("final crash", has_crash())
