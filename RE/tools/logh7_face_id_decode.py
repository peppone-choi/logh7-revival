"""LOGH VII in-game face-value codec (reverse-engineered from G7MTClient).

The character record's face field (0x0323 record @0xf4) is NOT the official
gineiden chara/NNN gallery number. It is a COMPOSITE DIGIT ENCODING that the
client decomposes (FUN_00592c30) into an atlas selector + a per-atlas local
index, then loads that atlas's region (FUN_005924c0).

Decompiled decomposition (param_2 = face value n, digits read by position):
  iVar6 (local index) = n % 1000
  M  = n / 1000000          (millions group: 0 => officer atlas, 1 => general atlas)
  d5 = (n % 1000000)/100000 (selects faction column)
  d4 = (n %  100000)/10000  (selects sex / o-bucket)
  d3 = (n %   10000)/1000   (0 => real atlas, nonzero => 'o' overflow bucket)

Atlas selector (switch in FUN_005924c0): 0=oem 1=oam 2=o 3=gem 4=gef 5=gam 6=gaf
Per-atlas loader caps (param_3 bound): oem<=199 oam<=95 o<=99 gem<=99 gef<=31 gam<=99 gaf<=31

Atlas => (faction, sex, rank):
  oem empire/male/officer   oam alliance/male/officer   o misc(unknown)
  gem empire/male/general   gef empire/female/general
  gam alliance/male/general gaf alliance/female/general

VALIDATION: Yang Wen-li art = tcf.hed region 274 (NCC 0.92 vs official chara/206),
which resolves in the oam atlas; encode('oam', 79) == 100079 and
decode(100079) == ('oam', 79). The digit scheme round-trips for all 7 atlases.

OPEN ITEM: the exact per-atlas local-index -> region byte mapping still needs the
.tcf virtual-concat order pinned down (tcf.hed "fits-any-atlas" decode over-counts
vs the loader caps). Atlas SELECTION is fully solved (faction/sex/rank correct);
fine index calibration is a follow-up (render a few encoded values through the
real client via tools/logh7_ui_explorer.py to lock the per-atlas index base).
"""
from __future__ import annotations

# atlas selector -> metadata
ATLAS = {
    "oem": dict(sel=0, faction="empire",   sex="male",   rank="officer", cap=199),
    "oam": dict(sel=1, faction="alliance", sex="male",   rank="officer", cap=95),
    "o":   dict(sel=2, faction=None,       sex=None,     rank="misc",    cap=99),
    "gem": dict(sel=3, faction="empire",   sex="male",   rank="general", cap=99),
    "gef": dict(sel=4, faction="empire",   sex="female", rank="general", cap=31),
    "gam": dict(sel=5, faction="alliance", sex="male",   rank="general", cap=99),
    "gaf": dict(sel=6, faction="alliance", sex="female", rank="general", cap=31),
}

# face_value = ATLAS_BASE[atlas] + local_index   (for the clean, non-overflow path)
ATLAS_BASE = {
    "oem": 0,
    "oam": 100000,   # d5=1
    "o":    10000,   # d4=1
    "gem": 1000000,  # M=1
    "gef": 1010000,  # M=1,d4=1
    "gam": 1100000,  # M=1,d5=1
    "gaf": 1110000,  # M=1,d5=1,d4=1
}


def encode(atlas: str, index: int) -> int:
    """Build the in-game face value for (atlas, local_index)."""
    if atlas not in ATLAS:
        raise ValueError(f"unknown atlas {atlas!r}")
    cap = ATLAS[atlas]["cap"]
    if not (0 <= index <= cap):
        raise ValueError(f"index {index} out of range for {atlas} (0..{cap})")
    return ATLAS_BASE[atlas] + index


def decode(n: int) -> tuple[str, int]:
    """Decompose a face value into (atlas, local_index). Raises on invalid."""
    idx = n % 1000
    M = n // 1000000
    d5 = (n % 1000000) // 100000
    d4 = (n % 100000) // 10000
    d3 = (n % 10000) // 1000
    if d3 != 0:
        # 'o' overflow bucket: client routes to atlas o with an index offset
        offset = {(0, 1, 1): 10, (0, 2, 0): 20, (1, 0, 0): 40,
                  (1, 0, 1): 50, (1, 1, 0): 60, (1, 1, 1): 70}.get((M, d5, d4))
        if offset is None:
            raise ValueError(f"face {n}: unrecognized overflow pattern")
        return ("o", idx + offset)
    table = {(0, 0, 0): "oem", (0, 1, 0): "oam", (0, 0, 1): "o",
             (1, 0, 0): "gem", (1, 0, 1): "gef", (1, 1, 0): "gam", (1, 1, 1): "gaf"}
    atlas = table.get((M, d5, d4))
    if atlas is None:
        raise ValueError(f"face {n}: no atlas for (M={M},d5={d5},d4={d4})")
    return (atlas, idx)


def face_meta(n: int) -> dict:
    """Full descriptor for a face value: atlas + faction/sex/rank + index."""
    atlas, idx = decode(n)
    m = ATLAS[atlas]
    return dict(face=n, atlas=atlas, index=idx,
                faction=m["faction"], sex=m["sex"], rank=m["rank"])


if __name__ == "__main__":
    import sys, json
    # self-test
    for a in ATLAS:
        v = encode(a, 0)
        assert decode(v) == (a, 0), (a, v, decode(v))
    assert encode("oam", 79) == 100079 and decode(100079) == ("oam", 79)
    print("self-test OK (7 atlases round-trip; Yang anchor oam/79 == face 100079)")
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            print(arg, "->", json.dumps(face_meta(int(arg)), ensure_ascii=False))
