"""One-off: diff the InstallShield CAB manifest (unshield list) against the install tree.

CAB paths are `<INSTALLDIR>\\<rel>` where INSTALLDIR is a Japanese (Shift-JIS/cp932) folder name
whose multibyte chars may legitimately contain 0x5C ("\\"), so we MUST decode cp932 before
splitting on the path separator -- splitting raw bytes lands inside the prefix and corrupts rel.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKSLASH = chr(92)


def main(cablist: str, install_dir: str, report_out: str) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    install = Path(install_dir)
    inst: dict[str, int] = {}
    for p in install.rglob("*"):
        if p.is_file():
            inst[p.relative_to(install).as_posix().lower()] = p.stat().st_size

    cab: dict[str, int] = {}
    support = 0
    placeholders = 0
    raw = Path(cablist).read_bytes()
    for line in raw.decode("cp932", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        toks = s.split(None, 1)
        if len(toks) != 2 or not toks[0].isdigit():
            continue
        size = int(toks[0])
        path = toks[1]
        if path.startswith("<"):
            support += 1
            if size == 0:
                placeholders += 1
            continue
        if BACKSLASH not in path:  # drops the "2209 files" summary row
            continue
        rest = path.split(BACKSLASH, 1)[1]  # strip the INSTALLDIR prefix (cp932-decoded => real separators)
        rel = rest.replace(BACKSLASH, "/").lower()
        cab[rel] = size

    missing = [{"path": k, "size": v} for k, v in sorted(cab.items()) if k not in inst]
    mismatch = [{"path": k, "cabSize": cab[k], "installSize": inst[k]}
                for k in sorted(cab) if k in inst and inst[k] != cab[k]]
    matched = len(cab) - len(missing) - len(mismatch)
    # install files with no CAB origin (installer-generated / our additions / CD-root copies)
    extras = sorted(k for k in inst if k not in cab)

    report = {
        "cabGameFiles": len(cab),
        "supportEngineEntries": support,
        "placeholders0B": placeholders,
        "installFiles": len(inst),
        "matchedNameAndSize": matched,
        "missingFromInstall": missing,
        "sizeMismatch": mismatch,
        "installExtras": extras,
    }
    Path(report_out).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"cab game files : {len(cab)}   support/engine: {support} (0B placeholders: {placeholders})")
    print(f"install files  : {len(inst)}")
    print(f"matched (name+size): {matched}")
    print(f"MISSING from install: {len(missing)}")
    for m in missing[:80]:
        print(f"   {m['size']:>10}  {m['path']}")
    print(f"SIZE MISMATCH: {len(mismatch)}")
    for m in mismatch[:60]:
        print(f"   cab={m['cabSize']} inst={m['installSize']}  {m['path']}")
    print(f"install-only extras: {len(extras)} (installer-generated / CD-root / ours)")
    print(f"report -> {report_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
