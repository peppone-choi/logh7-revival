import ctypes, time, sys
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab
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
    ax,ay=abs_xy(sx,sy)
    i=INPUT(type=0,u=IU(mi=MI(ax,ay,0,0x0001|0x8000,0,None))); user32.SendInput(1,ctypes.byref(i),ctypes.sizeof(INPUT)); time.sleep(0.03)
    d=INPUT(type=0,u=IU(mi=MI(0,0,0,0x0002,0,None))); u=INPUT(type=0,u=IU(mi=MI(0,0,0,0x0004,0,None)))
    user32.SendInput(1,ctypes.byref(d),ctypes.sizeof(INPUT)); time.sleep(0.05); user32.SendInput(1,ctypes.byref(u),ctypes.sizeof(INPUT)); time.sleep(0.12)
def type_u(text):
    for ch in text:
        d=INPUT(type=1,u=IU(ki=KI(0,ord(ch),0x0004,0,None))); u=INPUT(type=1,u=IU(ki=KI(0,ord(ch),0x0004|0x0002,0,None)))
        user32.SendInput(1,ctypes.byref(d),ctypes.sizeof(INPUT)); user32.SendInput(1,ctypes.byref(u),ctypes.sizeof(INPUT)); time.sleep(0.035)
def grab(hwnd):
    wr=RECT(); user32.GetWindowRect(hwnd,ctypes.byref(wr)); return ImageGrab.grab(bbox=(wr.l,wr.t,wr.r,wr.b))
def scale(ref,pt,cw,ch):
    return int(pt[0]*cw/ref[0]), int(pt[1]*ch/ref[1])
def face_score(img):
    w,h=img.size; n=0; skin=0
    for y in range(int(h*0.28), int(h*0.72), 2):
        for x in range(int(w*0.42), int(w*0.60), 2):
            r,g,b=img.getpixel((x,y))[:3]; n+=1
            if r>140 and 100<g<190 and 80<b<160 and r>b: skin+=1
    return skin/max(n,1)
def menu_blue(img):
    w,h=img.size; n=0; hit=0
    for y in range(int(h*0.15), int(h*0.85), 4):
        for x in range(int(w*0.05), int(w*0.25), 4):
            r,g,b=img.getpixel((x,y))[:3]; n+=1
            if b>120 and r<80 and 40<g<180: hit+=1
    return hit/max(n,1)
def mid_avg(img):
    m=img.crop((350,180,900,600)); return sum(sum(p[:3]) for p in m.getdata())/(m.width*m.height*3)
def count_codes():
    p=Path('server/data/live-manual-trace.jsonl')
    if not p.exists(): return {}
    from collections import Counter
    c=Counter()
    for ln in p.read_text(encoding='utf-8',errors='ignore').splitlines():
        if 'requestInnerCodeHex' in ln:
            import re
            m=re.search(r'requestInnerCodeHex":"([^"]+)"', ln)
            if m: c['req:'+m.group(1)]+=1
        if 'innerCodeHex' in ln and '0030-decoded' in ln:
            import re
            m=re.search(r'innerCodeHex":"([^"]+)"', ln)
            if m: c['c2s:'+m.group(1)]+=1
    return dict(c)

user32.ShowWindow(hwnd,9); user32.SetForegroundWindow(hwnd); time.sleep(0.4)
ox,oy,cw,ch=geom(hwnd)
LOGIN_REF=(644,484)
for pt,text in [((374,290),'inei00'),((376,318),'dummy')]:
    cx,cy=scale(LOGIN_REF,pt,cw,ch); user32.SetForegroundWindow(hwnd); click(ox+cx,oy+cy)
    for _ in range(12): type_u(chr(8))
    type_u(text); time.sleep(0.1)
cx,cy=scale(LOGIN_REF,(352,347),cw,ch); click(ox+cx,oy+cy)
for i in range(28):
    time.sleep(0.5)
    ox,oy,cw,ch=geom(hwnd); img=grab(hwnd)
    if cw>=1000 and menu_blue(img)>0.02: break
time.sleep(3)
ox,oy,cw,ch=geom(hwnd)
print('codes after settle', count_codes())

# Path A: left create -> origin -> ok (known)
click(ox+160,oy+175); time.sleep(1.5)
print('A origin', face_score(grab(hwnd)))
if face_score(grab(hwnd))>0.008:
    click(ox+515,oy+310); time.sleep(0.5)
    click(ox+655,oy+585); time.sleep(1.8)
    img=grab(hwnd); img.save(sd/'tA-after-origin.png')
    print('A after origin avg', mid_avg(img), 'codes', count_codes())
    # historical top-card + form field coords
    for i,pt in enumerate([(650,315),(600,300),(700,350),(512,400),(780,300),(780,340),(820,700),(560,450)]):
        user32.SetForegroundWindow(hwnd); click(ox+pt[0],oy+pt[1]); time.sleep(0.3)
        # type name if field
        if i in (4,5):
            type_u('TestPilot')
        time.sleep(0.5)
        img=grab(hwnd); img.save(sd/f'tA-click{i}-{pt[0]}-{pt[1]}.png')
        print(f'A click{i} {pt} avg={mid_avg(img):.1f} face={face_score(img):.3f} codes={count_codes()}')
    # enter
    d=INPUT(type=1,u=IU(ki=KI(0x0D,0,0,0,None))); u=INPUT(type=1,u=IU(ki=KI(0x0D,0,2,0,None)))
    user32.SendInput(1,ctypes.byref(d),ctypes.sizeof(INPUT)); time.sleep(0.05)
    user32.SendInput(1,ctypes.byref(u),ctypes.sizeof(INPUT)); time.sleep(1.0)
    grab(hwnd).save(sd/'tA-final.png')
    print('A final codes', count_codes())

print('done')
for ln in Path('server/data/live-manual-trace.jsonl').read_text(encoding='utf-8',errors='ignore').strip().splitlines()[-15:]:
    print(ln[:300])
