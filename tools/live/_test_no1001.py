import ctypes, time, sys
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab, Image
user32=ctypes.windll.user32
hwnd=int(sys.argv[1]); sd=Path('server/data/agent-drive')
class POINT(ctypes.Structure):
    _fields_=[('x',wintypes.LONG),('y',wintypes.LONG)]
class RECT(ctypes.Structure):
    _fields_=[('l',wintypes.LONG),('t',wintypes.LONG),('r',wintypes.LONG),('b',wintypes.LONG)]
class MI(ctypes.Structure):
    _fields_=[('dx',wintypes.LONG),('dy',wintypes.LONG),('mouseData',wintypes.DWORD),('dwFlags',wintypes.DWORD),('time',wintypes.DWORD),('dwExtraInfo',ctypes.POINTER(ctypes.c_ulong))]
class KI(ctypes.Structure):
    _fields_=[('wVk',wintypes.WORD),('wScan',wintypes.WORD),('dwFlags',wintypes.DWORD),('time',wintypes.DWORD),('dwExtraInfo',ctypes.POINTER(ctypes.c_ulong))]
class HI(ctypes.Structure):
    _fields_=[('uMsg',wintypes.DWORD),('wParamL',wintypes.WORD),('wParamH',wintypes.WORD)]
class IU(ctypes.Union):
    _fields_=[('mi',MI),('ki',KI),('hi',HI)]
class INPUT(ctypes.Structure):
    _fields_=[('type',wintypes.DWORD),('u',IU)]
def geom(hwnd):
    cr=RECT(); user32.GetClientRect(hwnd,ctypes.byref(cr)); pt=POINT(0,0); user32.ClientToScreen(hwnd,ctypes.byref(pt)); return pt.x,pt.y,cr.r-cr.l,cr.b-cr.t
def abs_xy(x,y):
    sx=user32.GetSystemMetrics(0); sy=user32.GetSystemMetrics(1); return int(x*65535/max(sx-1,1)), int(y*65535/max(sy-1,1))
def click(sx,sy):
    ax,ay=abs_xy(sx,sy); i=INPUT(type=0,u=IU(mi=MI(ax,ay,0,0x0001|0x8000,0,None))); user32.SendInput(1,ctypes.byref(i),ctypes.sizeof(INPUT)); time.sleep(0.05)
    d=INPUT(type=0,u=IU(mi=MI(0,0,0,0x0002,0,None))); u=INPUT(type=0,u=IU(mi=MI(0,0,0,0x0004,0,None)))
    user32.SendInput(1,ctypes.byref(d),ctypes.sizeof(INPUT)); time.sleep(0.07); user32.SendInput(1,ctypes.byref(u),ctypes.sizeof(INPUT)); time.sleep(0.2)
def type_u(text):
    for ch in text:
        d=INPUT(type=1,u=IU(ki=KI(0,ord(ch),0x0004,0,None))); u=INPUT(type=1,u=IU(ki=KI(0,ord(ch),0x0004|0x0002,0,None)))
        user32.SendInput(1,ctypes.byref(d),ctypes.sizeof(INPUT)); user32.SendInput(1,ctypes.byref(u),ctypes.sizeof(INPUT)); time.sleep(0.04)
def grab(hwnd):
    wr=RECT(); user32.GetWindowRect(hwnd,ctypes.byref(wr)); return ImageGrab.grab(bbox=(wr.l,wr.t,wr.r,wr.b))
def has_crash():
    found=[]
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(h,_):
        if not user32.IsWindowVisible(h): return True
        n=user32.GetWindowTextLengthW(h)
        if n<=0: return True
        b=ctypes.create_unicode_buffer(n+1); user32.GetWindowTextW(h,b,n+1)
        if 'Runtime' in b.value or 'Visual C' in b.value: found.append(1)
        return True
    user32.EnumWindows(cb,0); return bool(found)
def menu_blue(img):
    # count pixels matching lobby menu blue (15,76,143)-ish
    w,h=img.size; n=0; hit=0
    for y in range(int(h*0.15), int(h*0.85), 4):
        for x in range(int(w*0.05), int(w*0.25), 4):
            r,g,b=img.getpixel((x,y))[:3]; n+=1
            if b>120 and r<80 and 40<g<180: hit+=1
    return hit/max(n,1)
def face_score(img):
    w,h=img.size; n=0; skin=0
    for y in range(int(h*0.30), int(h*0.70), 2):
        for x in range(int(w*0.45), int(w*0.58), 2):
            r,g,b=img.getpixel((x,y))[:3]; n+=1
            if r>140 and 100<g<190 and 80<b<160 and r>b: skin+=1
    return skin/max(n,1)
def scale(ref,pt,cw,ch):
    return int(pt[0]*cw/ref[0]), int(pt[1]*ch/ref[1])

user32.ShowWindow(hwnd,9); user32.SetForegroundWindow(hwnd); time.sleep(0.4)
ox,oy,cw,ch=geom(hwnd); print('login',cw,ch)
grab(hwnd).save(sd/'d01-login.png')
LOGIN_REF=(644,484)
for pt,text in [((374,290),'inei00'),((376,318),'dummy')]:
    cx,cy=scale(LOGIN_REF,pt,cw,ch); user32.SetForegroundWindow(hwnd); click(ox+cx,oy+cy)
    for _ in range(12): type_u(chr(8)); type_u(text)
cx,cy=scale(LOGIN_REF,(352,347),cw,ch); user32.SetForegroundWindow(hwnd); click(ox+cx,oy+cy)

lobby=False
for i in range(30):
    time.sleep(0.5)
    if has_crash():
        print('crash wait',i); grab(hwnd).save(sd/'d02-crash.png'); sys.exit(2)
    if not user32.IsWindow(hwnd):
        print('hwnd dead'); sys.exit(3)
    ox,oy,cw,ch=geom(hwnd); img=grab(hwnd); sc=menu_blue(img)
    print(f'wait{i} {cw}x{ch} blue={sc:.3f}')
    if cw>=1000 and sc>0.02:
        img.save(sd/'d02-lobby.png'); print('lobby ok'); lobby=True; break
if not lobby:
    grab(hwnd).save(sd/'d02-fail.png'); print('no lobby'); sys.exit(4)

# sit 3s stability check (no 1001 push experiment)
for i in range(6):
    time.sleep(0.5)
    if has_crash():
        print('crash sitting',i); grab(hwnd).save(sd/'d03-sit-crash.png'); sys.exit(5)
print('stable after sit')
grab(hwnd).save(sd/'d03-stable.png')

# create menu
ox,oy,cw,ch=geom(hwnd)
for i,(cx,cy) in enumerate([(90,212),(100,200),(100,220),(110,210)]):
    if has_crash(): break
    user32.SetForegroundWindow(hwnd); click(ox+cx,oy+cy); time.sleep(1.3)
    img=grab(hwnd); fs=face_score(img); sc=menu_blue(img)
    img.save(sd/f'd04-try{i}.png')
    print(f'try{i} ({cx},{cy}) face={fs:.4f} blue={sc:.3f} crash={has_crash()}')
    if fs>0.008:
        print('ORIGIN'); user32.SetForegroundWindow(hwnd); click(ox+515,oy+310); time.sleep(0.8)
        grab(hwnd).save(sd/'d05-face.png')
        user32.SetForegroundWindow(hwnd); click(ox+655,oy+585); time.sleep(1.5)
        img2=grab(hwnd); img2.save(sd/'d06-ok.png')
        print('after ok face', face_score(img2), 'crash', has_crash())
        break
else:
    print('no origin')
print('done crash', has_crash())
# trace tail
from pathlib import Path
tp=Path('server/data/live-manual-trace.jsonl')
if tp.exists():
    for ln in tp.read_text(encoding='utf-8',errors='ignore').strip().splitlines()[-20:]:
        print(ln[:280])
