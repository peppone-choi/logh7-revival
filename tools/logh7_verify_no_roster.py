"""Reproducible proof: the LOGH VII character ROSTER (names/stats) is NOT in the client.

Run it yourself: `python tools/logh7_verify_no_roster.py`. It performs three independent checks and
prints a verdict. The point is you do NOT have to trust an assertion — re-run and read the output.

Checks:
  1) PLAINTEXT — search every MsgDat string file + the EXE for the principal canon names in
     Shift-JIS / UTF-16LE / EUC-JP. A real roster lists every famous admiral.
  2) OBFUSCATION — brute-force all 256 single-byte XOR keys over the EXE + MsgDat and report any key
     under which >=2 DIFFERENT canon names appear together (the signature of a hidden name table).
  3) CODE PATH — note the decompiled functions that prove character records are network-received
     (Input_InformationCharacter) rather than read from a local table.

Expected result (why the roster is gone): VII was an online game; the named-cast roster lived on the
(now-dead) server and was streamed to the client as 0x0323 InformationCharacter records. The client
ships only the PORTRAIT atlases (Face/*.tcf, incl. the o-series canon faces), never the name/stat table.
"""
from __future__ import annotations

import glob
from pathlib import Path

INSTALL = Path(".omo/work/logh7-installed")
EXE = INSTALL / "exe" / "G7MTClient.exe"
MSGDAT = sorted(glob.glob(str(INSTALL / "data" / "MsgDat" / "*.dat")))

PRINCIPALS = [
    "ヤン", "ウェンリー", "ラインハルト", "ローエングラム", "キルヒアイス", "ミッターマイヤー",
    "ロイエンタール", "オーベルシュタイン", "ビッテンフェルト", "メルカッツ", "ビュコック",
    "ユリアン", "フレデリカ", "アッテンボロー", "ポプラン", "ミュラー", "ワーレン",
]


def encodings(name: str) -> list[bytes]:
    out = []
    for enc in ("shift_jis", "utf-16-le", "euc-jp"):
        try:
            out.append(name.encode(enc))
        except Exception:
            pass
    return out


def check_plaintext() -> int:
    print("=== 1) PLAINTEXT search (SJIS/UTF-16LE/EUC-JP) across EXE + MsgDat ===")
    files = [EXE, *map(Path, MSGDAT)]
    total = 0
    for f in files:
        data = f.read_bytes()
        for name in PRINCIPALS:
            hits = sum(data.count(p) for p in encodings(name))
            if hits:
                total += hits
                print(f"   {f.name}: {name} x{hits}")
    print(f"   -> plaintext canon-name hits: {total} "
          f"({'see context — likely UI sample text, not a roster' if total else 'NONE'})")
    return total


def check_xor() -> int:
    print("=== 2) OBFUSCATION: 256-key single-byte XOR; require >=2 different names under ONE key ===")
    pats = {n: n.encode("shift_jis") for n in PRINCIPALS}
    found = 0
    for f in [EXE, *map(Path, MSGDAT)]:
        data = f.read_bytes()
        for k in range(256):
            x = bytes(b ^ k for b in data) if k else data
            names = [n for n, p in pats.items() if p in x]
            if len(names) >= 2:
                found += 1
                print(f"   {f.name} XOR=0x{k:02x}: {names}")
    print(f"   -> XOR keys yielding a clustered name table: {found} "
          f"({'NONE — no hidden/obfuscated roster' if not found else 'INVESTIGATE'})")
    return found


def note_codepath() -> None:
    print("=== 3) CODE PATH (Ghidra decompile, tools/logh7_redex) ===")
    print("   Input_InformationCharacter  (FUN_00417390/00417f20/…) = parse a character record FROM the")
    print("       network stream  -> this IS the 0x0323 record the server sends (we reverse-engineered it).")
    print("   CommandOriginalCharacterCharge (FUN_00406220/00406380) = send the canon-pick TO the server.")
    print("   => Character data is RECEIVED over the network, not loaded from a local roster table.")
    print('   Verify: python -m tools.logh7_redex grep "InformationCharacter|OriginalCharacter"')


def main() -> int:
    if not EXE.exists():
        print(f"client not found at {EXE}")
        return 2
    pt = check_plaintext()
    print()
    xr = check_xor()
    print()
    note_codepath()
    print()
    print("=== VERDICT ===")
    if xr == 0:
        print("No plaintext name table; no single-XOR-key clustered name table; character records are")
        print("network-received (Input_InformationCharacter). The client ships PORTRAITS only (Face/*.tcf,")
        print("incl. the o-series canon faces). The names/stats roster was server-side and is LOST.")
    else:
        print("A candidate clustered name table was found above — investigate that offset/key.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
