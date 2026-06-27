#!/usr/bin/env python3
"""기지 오버레이(panelKind=5) positive-control — 행성 내 장소 진입을 라이브 증명한다.

근거(ExplorerPanels/ExplorerConsume 교차검증): 기지 데이터(0x031d/0x031f/0x0321)는 world-init
FUN_004c4c50이 패널 슬롯(clientBase+0x31e160+(panelId-1000)*0x234, id 1000~1249)에 이미 설치한다(mapnav
라이브 도착 확인). panelKind setter는 FUN_00577e70(__thiscall ecx=panel, int panelKind, char refresh)
뿐이고, panelKind=5(기지)는 런타임 계산값이라 정적 트리거가 단절돼 있다(C002 입력 레이어: 클릭→setter
변환 미도달). 이 watcher는 FUN_00577e70 onEnter에서 panelKind!=5인 자연 호출 1건의 인자를
panelKind=5/refresh=1로 변조한다(cold-call이 아니라 자연 호출 흐름 변조라 D3D 씬 손상 위험이 작다).
→ switch case5 → FUN_0057bbc0(기지 init) → FUN_00579e60 case5 → FUN_0057aa90 렌더. 변조 후 좌하단
HUD가 기지 패널(group 0x5f + 경제값)로 바뀌면 데이터·렌더 파이프 전체가 crash-free임을 증명하고,
남은 블로커는 자연 입력 트리거(클릭→panelKind=5)뿐임이 확정된다.

함수경계(onEnter/onLeave) 훅만 쓴다(중간/콜사이트 훅은 과거 트램펄린 오염으로 클라를 깨뜨림).

Run: python tools/logh7_base_overlay_pc.py --session .omo/ui-explorer/<id> --seconds 30
"""
from __future__ import annotations
import argparse
import importlib
import json
import sys
from pathlib import Path

JS = r"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
let seq = 0, forced = 0;
function abs(va) { return moduleBase.add(ptr(va).sub(IMAGE_BASE)); }
function safe(fn, fb) { try { return fn(); } catch (_) { return fb; } }
function hex(v) { return safe(() => { const p = ptr(v); return p.isNull() ? null : p.toString(); }, String(v)); }
function emit(tag, p) { if (seq >= 20000) return; seq += 1; send({ tag, seq, t: Date.now(), ...(p || {}) }); }
function install(va, name, cb) {
  try { Interceptor.attach(abs(va), cb); emit('hook-installed', { name, va }); }
  catch (e) { emit('hook-failed', { name, va, error: String(e) }); }
}

// FUN_00577e70(__thiscall ecx=panel, int panelKind /*arg0*/, char refresh /*arg1*/)
install('0x00577e70', 'panelKindSetter-577e70', {
  onEnter(args) {
    const panel = this.context.ecx;
    const pk = safe(() => args[0].toInt32(), null);
    const rf = safe(() => args[1].toInt32(), null);
    emit('577e70-enter', { panel: hex(panel), panelKind: pk, refresh: rf, forced });
    if (forced === 0 && pk !== 5) {
      safe(() => { args[0] = ptr(5); args[1] = ptr(1); }, null);
      forced = 1;
      emit('forced-panelkind-5', { panel: hex(panel), origPanelKind: pk, origRefresh: rf });
    }
  },
  onLeave(ret) {
    if (forced === 1) { forced = 2; emit('577e70-leave-after-force', { ret: safe(() => ret.toInt32(), null) }); }
  },
});

emit('ready', { moduleBase: hex(moduleBase) });
"""


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--session", default=".omo/ui-explorer/base-overlay")
    ap.add_argument("--pid", type=int)
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    pid = args.pid
    if pid is None:
        sj = Path(args.session) / "session.json"
        info = json.loads(sj.read_text(encoding="utf-8"))
        pid = info.get("clientPid")
    if not pid:
        print(json.dumps({"error": "no client pid"}), file=sys.stderr)
        return 2

    frida = importlib.import_module("frida")
    events = []

    def on_message(message, data):
        if message.get("type") == "send":
            events.append(message["payload"])
        else:
            events.append({"fridaError": message})

    session = frida.attach(pid)
    script = session.create_script(JS)
    script.on("message", on_message)
    script.load()
    import time
    time.sleep(args.seconds)
    try:
        script.unload()
    except Exception:
        pass

    out = Path(args.out) if args.out else (Path(args.session) / "base_overlay_pc.json")
    out.write_text(json.dumps({"pid": pid, "events": events}, ensure_ascii=False, indent=1), encoding="utf-8")
    tags = {}
    for e in events:
        tags[e.get("tag")] = tags.get(e.get("tag"), 0) + 1
    forced = [e for e in events if e.get("tag") == "forced-panelkind-5"]
    print(json.dumps({
        "pid": pid, "events": len(events), "tags": tags,
        "forcedPanelKind5": len(forced),
        "sampleForced": forced[0] if forced else None,
        "out": str(out),
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
