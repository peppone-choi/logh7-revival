#!/usr/bin/env python3
"""LOGH VII 상태변화(scene/mode/panel 전환) 함수 invocation brute-force 하네스 (CONTROLLED).

목적: "어느 내부 클라 함수를 직접 호출하면 게임 상태(화면/씬/모드/패널)가 전환되는가"를
후보 리스트 기반으로 1개씩 강제 호출(invoke)해 라이브로 판별한다. **맹목적 전수 호출은 거의
확실히 크래시**하므로, 이 도구는 RE 근거가 있는 후보만 호출하는 **통제된** 버전이다.

⚠️ 이 스크립트는 클라를 spawn 하지 않는다. ui_explorer가 이미 클라를 월드까지 띄워 둔
   상태에서 그 PID에 attach만 한다(스플래시 ~30초·로그인·월드진입은 ui_explorer 책임).
⚠️ 기본은 **1회 1함수 호출**(--index)이라 크래시가 그 후보로 격리된다. --all은 순차로 전부
   호출하지만, 크래시 1건이 세션을 죽이므로 메인 드라이버가 후보 사이에 클라 재기동 +
   스크린샷(before/after)을 책임진다.

------------------------------------------------------------------------------------------------
attach/rebase 규약 (기존 probe들과 동일)
------------------------------------------------------------------------------------------------
- 메인 모듈 = G7MTClient.exe. Ghidra VA는 image-base 0x400000 기준.
- 런타임 = module.base + (VA - 0x400000). JS측 va()와 파이썬 rebase_va()가 동일 식.
- frida 17.x: top-level enumerate_processes 없음 → tasklist 또는 local device로 PID 해석.

------------------------------------------------------------------------------------------------
사용
------------------------------------------------------------------------------------------------
  # 클라 없이 도구만 검증(attach 안 함 — "no client to attach" graceful):
  python -m tools.logh7_state_invoke_probe --dry-run
  python -m tools.logh7_state_invoke_probe --dry-run --index 1

  # 라이브(메인이 ui_explorer로 클라 띄운 뒤): 후보 1개만 호출
  python -m tools.logh7_state_invoke_probe --index 1 --out .omo/ui-explorer/state-invoke.jsonl
  # 전부 순차 호출(위험 — 크래시 시 거기서 중단, 메인이 재기동)
  python -m tools.logh7_state_invoke_probe --all --out .omo/ui-explorer/state-invoke.jsonl

------------------------------------------------------------------------------------------------
크래시 격리 설계
------------------------------------------------------------------------------------------------
1) 기본 1회 1함수(--index). 크래시가 그 후보에 귀속.
2) 각 호출은 JS try/catch로 감싸고, 호출 직후 short liveness probe(읽기 가능한 전역을 읽어봄)로
   clientAliveAfter를 판정. attach 세션 자체가 죽으면 detach 예외 → called=true,
   clientAliveAfter=false 로 기록(=이 후보가 크래시 유발).
3) global-ptr this가 0/null이면 호출 거부(refused). 잘못된 this로 thiscall 하면 즉사하므로.
4) 결과는 후보별 JSON line으로 --out에 append(크래시로 프로세스가 죽어도 직전까지 남음).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

# 콘솔이 cp949여도 한글/em-dash 출력이 깨지지 않도록 stdout/stderr를 UTF-8로 재설정.
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
IMAGE_BASE = 0x400000
CLIENT_MODULE = "G7MTClient.exe"
DEFAULT_CANDIDATES = ROOT / "tools" / "state-invoke-candidates.json"

# frida NativeFunction abi 매핑(x86). 입력 convention → frida abi 문자열.
ABI_MAP = {
    "thiscall": "thiscall",
    "fastcall": "fastcall",
    "stdcall": "stdcall",
    "cdecl": "mscdecl",   # frida x86 cdecl
}


def rebase_va(va: int, module_base: int, image_base: int = IMAGE_BASE) -> int:
    """Ghidra VA(image_base 기준)를 런타임 모듈베이스로 rebase."""
    return module_base + (va - image_base)


# ------------------------------------------------------------------------------------------------
# Frida agent JS — rpc.exports.invoke(spec)로 단일 후보 호출.
#   spec = {va, convention, thisSource:{kind,addr|value}, args:[int...]}
#   반환 = {rebasedVa, abi, thisResolved, thisValue, called, refused, error, retValue,
#           clientAliveAfter, aliveProbe}
# ------------------------------------------------------------------------------------------------
JS = r"""
'use strict';
var mod = Process.enumerateModules()[0];   // 메인 모듈(G7MTClient)
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }

// liveness: 모듈 베이스 첫 워드(MZ 헤더 'MZ'=0x5a4d)를 읽어본다. 세션이 살아있고 메모리가
// 정상이면 읽힌다. 크래시로 매핑이 망가지면 throw → alive=false.
function aliveProbe(){
  try {
    var w = mod.base.readU16();   // 0x5a4d ('MZ') 기대
    return { ok: true, mz: '0x'+w.toString(16) };
  } catch(e){ return { ok:false, err:String(e) }; }
}

// thisSource 해석. global-ptr는 addr에 들어있는 포인터를 런타임에 읽음(역참조 1회).
function resolveThis(ts){
  if(!ts || ts.kind === 'none') return { has:false, value:null };
  if(ts.kind === 'literal'){
    var p = ptr(ts.value);
    return { has:true, value:p, isNull: p.isNull() };
  }
  if(ts.kind === 'global-ptr'){
    var slot = va(ts.addr);
    var raw = slot.readU32();          // 전역에 저장된 포인터 값
    var p = ptr(raw >>> 0);
    return { has:true, value:p, isNull:(raw>>>0)===0, slot: slot.toString(), raw:'0x'+(raw>>>0).toString(16) };
  }
  return { has:false, value:null, err:'unknown thisSource.kind '+ts.kind };
}

rpc.exports = {
  // attach 직후 환경 스냅(메인이 base 확인용).
  info: function(){
    return { modName: mod.name, modBase: mod.base.toString(), image: IMAGE.toString() };
  },
  // 단일 후보 호출. dry=true면 NativeFunction만 만들고 호출은 생략(무엇을 호출할지 보고).
  invoke: function(spec, dry){
    var out = {
      rebasedVa:null, abi:null, called:false, refused:false, dry:!!dry,
      error:null, thisResolved:false, thisValue:null, retValue:null,
      clientAliveBefore:null, clientAliveAfter:null
    };
    try {
      var fnPtr = va(spec.va);
      out.rebasedVa = fnPtr.toString();

      var abi = ({thiscall:'thiscall', fastcall:'fastcall', stdcall:'stdcall', cdecl:'mscdecl'})[spec.convention];
      if(!abi){ out.error = 'unknown convention '+spec.convention; return out; }
      out.abi = abi;

      // this 해석
      var tinfo = resolveThis(spec.thisSource);
      out.thisResolved = tinfo.has;
      if(tinfo.has){
        out.thisValue = tinfo.value ? tinfo.value.toString() : null;
        out.thisRaw = tinfo.raw || null;
        out.thisSlot = tinfo.slot || null;
        // global-ptr/literal this가 null이면 호출 거부(잘못된 this thiscall=즉사).
        if(tinfo.isNull){
          out.refused = true;
          out.error = 'thisSource resolved to null/0 — refusing to call (would crash)';
          return out;
        }
      }

      // 인자 타입: this(있으면) + 정수 args 전부 'pointer'(=uint32, frida가 reg/stack 배치).
      var argTypes = [];
      var callArgs = [];
      if(tinfo.has){ argTypes.push('pointer'); callArgs.push(tinfo.value); }
      var ints = spec.args || [];
      for(var i=0;i<ints.length;i++){ argTypes.push('pointer'); callArgs.push(ptr(ints[i]>>>0)); }

      var nf = new NativeFunction(fnPtr, 'pointer', argTypes, { abi: abi });

      out.clientAliveBefore = aliveProbe();
      if(dry){
        out.note = 'dry-run: NativeFunction built, NOT invoked';
        return out;
      }

      // ★실제 호출★ — 네이티브 크래시는 try/catch로 잡으려 시도(SEH는 못 잡을 수 있음;
      //   그 경우 세션이 죽어 파이썬측 detach 예외로 잡힘 → clientAliveAfter=false 기록).
      try {
        var r = nf.apply(null, callArgs);
        out.called = true;
        out.retValue = r ? r.toString() : null;
      } catch(ce){
        out.called = true;       // 호출은 시도됨
        out.error = 'native call threw: '+String(ce);
      }
      out.clientAliveAfter = aliveProbe();
      return out;
    } catch(e){
      out.error = String(e);
      try { out.clientAliveAfter = aliveProbe(); } catch(_){}
      return out;
    }
  }
};
"""


# ------------------------------------------------------------------------------------------------
# 후보 로딩/검증
# ------------------------------------------------------------------------------------------------
def load_candidates(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    cands = data.get("candidates", [])
    if not isinstance(cands, list) or not cands:
        raise SystemExit(f"후보 파일에 candidates 배열이 없습니다: {path}")
    # 최소 스키마 검증
    for i, c in enumerate(cands):
        for k in ("va", "label", "convention", "thisSource", "args"):
            if k not in c:
                raise SystemExit(f"candidate[{i}] 필수 키 누락: {k}")
        if c["convention"] not in ABI_MAP:
            raise SystemExit(f"candidate[{i}] convention 미지원: {c['convention']}")
        ts = c["thisSource"]
        if ts.get("kind") not in ("global-ptr", "literal", "none"):
            raise SystemExit(f"candidate[{i}] thisSource.kind 미지원: {ts.get('kind')}")
        if ts.get("kind") == "global-ptr" and "addr" not in ts:
            raise SystemExit(f"candidate[{i}] global-ptr인데 addr 없음")
        if ts.get("kind") == "literal" and "value" not in ts:
            raise SystemExit(f"candidate[{i}] literal인데 value 없음")
        try:
            int(str(c["va"]), 16) if isinstance(c["va"], str) else int(c["va"])
        except Exception:
            raise SystemExit(f"candidate[{i}] va 파싱 불가: {c['va']}")
    return cands


def _norm_args(c: dict) -> dict:
    """JS로 넘기기 전 정수 인자를 int로 정규화(16진 문자열 허용)."""
    spec = dict(c)
    norm = []
    for a in c.get("args", []):
        norm.append(int(str(a), 16) if isinstance(a, str) and str(a).lower().startswith("0x") else int(a))
    spec["args"] = norm
    return spec


# ------------------------------------------------------------------------------------------------
# PID 해석
# ------------------------------------------------------------------------------------------------
def find_pid_tasklist() -> int | None:
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        for line in out.splitlines():
            if "G7MTClient" in line:
                return int(line.split(",")[1].strip().strip('"'))
    except Exception:
        pass
    return None


# ------------------------------------------------------------------------------------------------
# dry-run (클라 불필요)
# ------------------------------------------------------------------------------------------------
def dry_run(cands: list[dict], index: int | None, do_all: bool) -> int:
    """클라 없이: 무엇을 어떻게 호출할지 + rebase 미리보기. attach 시도 안 함."""
    sel = _select(cands, index, do_all)
    # frida import 가능 여부만(없어도 dry는 진행하되 경고).
    try:
        import frida  # noqa: F401
        frida_ok = True
    except Exception as e:
        frida_ok = False
        print(f"[dry-run] WARN: frida import 실패({e}) — 라이브 호출은 불가, dry 계획만 출력.")

    # PID 탐지(없으면 graceful 안내).
    pid = find_pid_tasklist()
    print(f"[dry-run] frida_import={frida_ok} client_pid={pid if pid else 'NONE (no client to attach — OK for dry-run)'}")
    print(f"[dry-run] candidates_file 후보 {len(cands)}개, 선택 {len(sel)}개")

    # 가상의 런타임 베이스로 rebase 미리보기.
    fake_base = 0x00C70000
    for idx, c in sel:
        va = int(str(c["va"]), 16) if isinstance(c["va"], str) else int(c["va"])
        reb = rebase_va(va, fake_base)
        ts = c["thisSource"]
        abi = ABI_MAP[c["convention"]]
        this_desc = (
            f"global-ptr@{ts['addr']} (런타임에 역참조)" if ts["kind"] == "global-ptr"
            else f"literal {ts.get('value')}" if ts["kind"] == "literal"
            else "none"
        )
        nargs = _norm_args(c)["args"]
        flag = " [UNCERTAIN]" if c.get("uncertain") else ""
        print(f"  - [#{idx}] WOULD CALL {c['va']} (rebased@fakeBase={hex(reb)}) abi={abi} "
              f"this={this_desc} args={nargs}{flag}")
        print(f"        label: {c['label']}")
    print("[dry-run] OK — 실제 호출/attach는 하지 않았습니다.")
    return 0


def _select(cands: list[dict], index: int | None, do_all: bool):
    if do_all:
        return list(enumerate(cands))
    if index is None:
        index = 0
    if index < 0 or index >= len(cands):
        raise SystemExit(f"--index {index} 범위 밖 (0..{len(cands)-1})")
    return [(index, cands[index])]


# ------------------------------------------------------------------------------------------------
# 라이브 호출
# ------------------------------------------------------------------------------------------------
def live_invoke(cands: list[dict], index: int | None, do_all: bool, pid: int | None,
                out: Path, settle: float) -> int:
    import frida

    pid = pid or find_pid_tasklist()
    if not pid:
        print(json.dumps({"error": "no G7MTClient pid — ui_explorer로 클라를 먼저 월드까지 띄울 것."}))
        return 1

    sel = _select(cands, index, do_all)
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"[attach] pid={pid} module={CLIENT_MODULE}")
    session = frida.attach(pid)
    script = session.create_script(JS)
    msgs: list = []
    script.on("message", lambda m, d: msgs.append(m))
    script.load()
    rpc = script.exports_sync
    info = rpc.info()
    print(f"[ready] base={info.get('modBase')} mod={info.get('modName')}")

    rc = 0
    for idx, c in sel:
        spec = _norm_args(c)
        rec = {"index": idx, "va": c["va"], "label": c["label"],
               "convention": c["convention"], "args": spec["args"], "uncertain": bool(c.get("uncertain"))}
        try:
            time.sleep(settle)
            res = rpc.invoke(spec, False)  # dry=False → 실제 호출
            rec.update({
                "rebasedVa": res.get("rebasedVa"),
                "abi": res.get("abi"),
                "thisResolved": res.get("thisResolved"),
                "thisValue": res.get("thisValue"),
                "thisRaw": res.get("thisRaw"),
                "called": bool(res.get("called")),
                "refused": bool(res.get("refused")),
                "error": res.get("error"),
                "retValue": res.get("retValue"),
                "clientAliveAfter": bool((res.get("clientAliveAfter") or {}).get("ok")) if res.get("clientAliveAfter") else None,
            })
        except Exception as e:
            # rpc 호출 자체가 깨짐 = 십중팔구 후보가 클라를 죽임 → 격리 기록.
            rec.update({"called": True, "refused": False, "error": f"rpc/session died: {e}",
                        "clientAliveAfter": False})
            _append(out, rec)
            print(f"  [#{idx}] CRASH-SUSPECT {c['va']}: {e}")
            rc = 2
            break  # 세션 죽음 — 더 진행 불가(메인이 재기동)
        _append(out, rec)
        status = ("REFUSED" if rec["refused"] else
                  ("CALLED alive=" + str(rec["clientAliveAfter"])) if rec["called"] else "NOT-CALLED")
        print(f"  [#{idx}] {c['va']} {status} err={rec['error']}")
        if rec["called"] and rec["clientAliveAfter"] is False:
            print(f"  [#{idx}] → 이 후보 호출 후 클라 비활성(크래시 의심). 중단.")
            rc = 2
            break

    try:
        script.unload()
    except Exception:
        pass
    try:
        session.detach()
    except Exception:
        pass
    print(f"[done] results -> {out}")
    return rc


def _append(out: Path, rec: dict) -> None:
    with out.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES,
                   help="후보 JSON 경로(기본 tools/state-invoke-candidates.json)")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--index", type=int, default=None, help="호출할 후보 인덱스(기본 0). 1회 1함수=크래시 격리.")
    g.add_argument("--all", action="store_true", help="모든 후보 순차 호출(위험; 크래시 시 중단).")
    p.add_argument("--pid", type=int, default=None, help="attach할 G7MTClient PID(미지정 시 tasklist 탐지).")
    p.add_argument("--out", type=Path, default=ROOT / ".omo/ui-explorer/state-invoke.jsonl",
                   help="후보별 결과 JSONL append 경로.")
    p.add_argument("--settle", type=float, default=0.3, help="호출 전 대기(초).")
    p.add_argument("--dry-run", action="store_true",
                   help="클라 없이 무엇을 호출할지만 출력(attach/호출 안 함).")
    args = p.parse_args(argv)

    cands = load_candidates(args.candidates)

    if args.dry_run:
        return dry_run(cands, args.index, args.all)

    return live_invoke(cands, args.index, args.all, args.pid, args.out, args.settle)


if __name__ == "__main__":
    raise SystemExit(main())
