"""logh7_ship_stats -- build a REAL, evidence-cited combat-stat catalog for EVERY LOGH VII ship type.

ABSOLUTE RULE (user-emphasized): NEVER guess a number. Every value comes from the gin7 manual
(content/manual/ship-units.json `stats`, the canonical VII 別表 艦艇ユニット) or is a DOCUMENTED transform
of a real manual number. Unknown / OCR-corrupt => null + an explicit note. No archetype invention, no tier
multipliers. The previously-shipped archetype-guess version was explicitly rejected and is removed.

--------------------------------------------------------------------------------------------------------
AUTHORITATIVE WIRE TARGET (what the client actually parses for static per-hull stats)
--------------------------------------------------------------------------------------------------------
Ghidra G7MTClient (index .omo/ghidra/export/G7MTClient/):
  - ResponseStaticInformationUnitShip = code 0x30b. Dispatch struct buffer 0x6d64 = 28004 B
    = 4 (count+pad header) + 200 (MAXCOUNT, "information_size over than 200" 0x00762f00) x 140 (struct stride).
    name_size <= 13 ("name_size is over than 13" 0x00762ea8) -> each record carries a <=13-char ship name.
  - The static dump (Output_ResponseStaticInformationUnitShip, field-name strings 0x760984..0x760b2c) names
    the per-hull fields the client stores. They map 1:1 onto the manual `stats` labels:
        armor_front=  (0x760a80)  <- 装甲 前
        armor_side=   (0x760a68)  <- 装甲 側
        armor_back=   (0x760a74)  <- 装甲 後
        shield=       (0x760a60)  <- シールド防護値
        shield_capacity= (0x760a4c)<- シールド容量
        beam_power=   (0x760a38)  <- ビーム兵装 破壊力
        gun_power=    (0x760a1c)  <- ガン兵装 破壊力
        missile_power=(0x760a1c)  <- ミサイル兵装 破壊力
        antiaircraft_power= (0x7609bc) <- 対空兵装 破壊力
        speed=        (0x760a98)  <- 最高速度
        crew=         (0x760afc)  <- 必要乗組員
        term=         (0x760b10)  <- 工期 (build time)
        repair=       (0x760984)  <- 修理消費物資
        resource_loadage= (0x76098c) <- 物資搭載量 (supply capacity)
        fighter_num=  (0x7609a0)  <- 戦闘艇搭載数
  The live tactical record 0x33b (docs/logh7-proto-tactics-data.md) carries per-INSTANCE battle state
  (morale/confusion/character/position) and the fill arrays 0x341/0x343 carry live shield/beam charge —
  NONE of them carry the static scalars. So the static numbers MUST come from 0x30b / the manual. We source
  them from the manual (the only place the real numbers survive; we cannot dump 0x30b without a live server).

--------------------------------------------------------------------------------------------------------
EXTRACTION POLICY (no guessing)
--------------------------------------------------------------------------------------------------------
The manual `stats` text is OCR with the per-variant rows interleaved into one block per base ship. We extract
ONLY the value(s) immediately following each labelled field, keep the EXACT source substring, and tag a
confidence. Empire entries are one base ship per block (cleanest). Alliance blocks fold several variant rows
into one block, so we take the FIRST value after each label (= the base/旗艦 row) and lower confidence.

Per field we record: {value, raw (source substring), confidence, note}. A value is emitted ONLY when a real
token is parsed; otherwise value=null with a note. Known OCR corruptions (e.g. a "5,600" under ビーム破壊力 that
is really a speed bleed, or armor "390" that is a mis-merge) are detected by a documented sanity band and set
to null+note rather than guessed.

Variations (戦艦Ⅲ..Ⅷ, etc.) whose manual text says "see base type" INHERIT the base ship's REAL parsed
numbers (resolved by code family SS75->戦艦 / PK86->高速戦艦 / SK80->巡航艦 / Z82->駆逐艦 / FR88->戦闘艇母艦 / ...).
The variant description's delta (e.g. "複合装甲を増設し防御力増加") is recorded as a LABELED modifier string only;
we never invent a numeric delta.

--------------------------------------------------------------------------------------------------------
DOCUMENTED TRANSFORM: real manual numbers -> server combat pools (for logh7-combat-engine)
--------------------------------------------------------------------------------------------------------
The combat engine (src/server/logh7-combat-engine.mjs) renders three on-wire pools the client derives as
current = max - cumulativeDamage (NotifyAttackedShip 0x426): armor (entity+0x8d4), zanki/残機 (entity+0x8d8),
shield (shipClass+0x288). The manual gives per-hull REAL numbers; we map them with ONE documented, reversible
transform (no per-ship fudge):

  maxArmor  = (armor_front + armor_side + armor_back)            # sum of the three real 装甲 facings
  maxShield = shield_capacity                                    # the real シールド容量 (防護値 is the per-hit absorb, kept separately)
  maxZanki  = unit_count                                         # ユニット数 = ships per stack/残機 pool (the manual's own count)
  beamPower = max(beam_power, gun_power, missile_power)          # the ship's strongest real 破壊力 weapon
  defense   = shield (防護値)                                     # the real per-hit shield 防護値 = damage mitigated per hit
  morale    = 100                                                # not a hull stat; battle-start default (live morale comes from 0x33b)

Every pool therefore traces to a real manual number (or is null when the source is null). The transform is
documented in content/ship-stats.json `_derivation` and here so the server is faithful and tunable.

Usage:  python -m tools.logh7_ship_stats [--print]
Outputs:
  content/ship-stats-raw.json  -- exact manual numbers + source substring + confidence, per base + variant.
  content/ship-stats.json      -- {key,name,side,shipClass,pools,_raw,_derivation} consumed by combat engine.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Final, Optional

SRC: Final[Path] = Path("content/manual/ship-units.json")
OUT_RAW: Final[Path] = Path("content/ship-stats-raw.json")
OUT: Final[Path] = Path("content/ship-stats.json")

# Code-family -> coarse ship class (for the engine's shipClassStats archetype fallback + variant inheritance).
# Derived from the manual's own type codes (SS75型標準戦艦 etc.). NO stats attached here — class is a label only.
FAMILY_CLASS: Final[dict] = {
    "SS75": "battleship", "787": "battleship",
    "PK86": "fast_battleship",
    "SK80": "cruiser", "795": "cruiser",
    "794": "strike_cruiser",
    "Z82": "destroyer", "796": "destroyer", "K86": "corvette",
    "FR88": "carrier", "TR88": "torpedo_carrier",
    "A76": "repair", "793": "repair",
    "A74": "transport", "792": "transport",
    "A72": "trooper", "788": "trooper",
    "A78": "lander", "786": "lander",
}

# Name keyword -> class (used when no type code present, e.g. the alliance combined entries / civilian).
NAME_CLASS: Final[list] = [
    ("高速戦艦", "fast_battleship"),
    ("打撃巡航艦", "strike_cruiser"),
    ("偵察巡航艦", "scout_cruiser"),
    ("巡航艦", "cruiser"),
    ("高速艇", "corvette"),
    ("戦艦", "battleship"),
    ("雷撃艇母艦", "torpedo_carrier"),
    ("戦闘艇母艦", "carrier"),
    ("母艦", "carrier"),
    ("駆逐艦", "destroyer"),
    ("工作艦", "repair"),
    ("兵員輸送艦", "trooper"),
    ("輸送艦", "transport"),
    ("揚陸艦", "lander"),
    ("民間", "civilian"),
    ("商船", "civilian"),
]

ROMAN: Final[tuple] = ("Ⅷ", "Ⅶ", "Ⅵ", "Ⅴ", "Ⅳ", "Ⅲ", "Ⅱ", "Ⅰ")

# Documented sanity bands for the manual's REAL value ranges (used ONLY to reject OCR bleed-through, never to
# invent a value). Source: inspection of every base-ship block in content/manual/ship-units.json.
#   armor facing: small two/three-digit (8..60 in the manual); >300 => speed/shield bleed -> reject.
#   shield 防護値: ~20..70.  shield 容量: hundreds..tens-of-thousands.
#   weapon 破壊力: ~10..200 (gun close-range up to ~150).  speed: thousands..tens-of-thousands.
ARMOR_MAX: Final[int] = 200          # any 装甲 facing > this is an OCR bleed (real facings are <=60).
SHIELD_GUARD_MIN, SHIELD_GUARD_MAX = 1, 200   # 防護値 band.
WEAPON_MAX: Final[int] = 400          # 破壊力 band (reject 4-digit speed bleed).


def _nums(s: str) -> list[int]:
    """All integer tokens (comma-grouped) in s, in order."""
    out = []
    for tok in re.findall(r"\d[\d,]*", s):
        try:
            out.append(int(tok.replace(",", "")))
        except ValueError:
            pass
    return out


# The set of field LABELS the manual block uses. A fragment after one label runs until the NEXT label
# start (or sentence end). We cut ONLY on a label that begins a new "頭:" segment — never on a substring
# (the old code cut on any "兵装" occurrence, truncating "防護値/容量: 70 / 20,000" before the 20,000).
NEXT_LABEL: Final[str] = (
    r"(?:工期|必要乗組員|ユニット数|索敵範囲|装甲\s*\(|シールド|ビーム兵装|ガン兵装|"
    r"ミサイル兵装|対空兵装|最高速度|戦闘艇|物資搭載量|修理消費)"
)


def _seg_after(stats: str, label_pat: str) -> Optional[str]:
    """Return the fragment after a labelled field, up to the NEXT field label or a sentence boundary."""
    m = re.search(label_pat, stats)
    if not m:
        return None
    rest = stats[m.end():]
    cut = re.search(r"[。.]|" + NEXT_LABEL, rest)
    frag = rest[: cut.start()] if cut else rest
    return frag.strip(" :：/")


def field(value, raw, conf, note=None) -> dict:
    return {"value": value, "raw": raw, "confidence": conf, "note": note}


# A clean per-facing 装甲 triple in the manual reads like "28 16 / 8", "32/16/8", "8/4/2" — three small
# ints, optionally slash/space separated. Used as a fallback when the first 装甲 fragment is OCR-corrupt
# (e.g. SS75's "390 / -" primary line, with the real "28 36 34 / 17 22 20 / 30 9 14" later in the block).
ARMOR_TRIPLE: Final = re.compile(r"(\d{1,3})\s*[/\s]\s*(\d{1,3})\s*[/\s]\s*(\d{1,3})")


def parse_armor(stats: str, conf_base: str) -> dict:
    """装甲(前/側/後). Prefer the labelled fragment's first 3 small ints; if corrupt, fall back to the first
    clean small-int triple anywhere in the labelled block. Reject any facing > ARMOR_MAX (OCR bleed)."""
    frag = _seg_after(stats, r"装甲\s*\([^)]*\)\s*[:：]?")
    if frag is None:
        return field(None, None, "none", "no 装甲 label parsed")
    nums = [n for n in _nums(frag) if n <= ARMOR_MAX]
    if len(nums) >= 3:
        return field({"front": nums[0], "side": nums[1], "back": nums[2]}, frag[:60], conf_base)
    # fallback: first clean small triple in the fragment (handles the "390/-" corrupt primary line).
    for mt in ARMOR_TRIPLE.finditer(frag):
        f, s, b = (int(mt.group(i)) for i in (1, 2, 3))
        if all(x <= ARMOR_MAX for x in (f, s, b)):
            return field({"front": f, "side": s, "back": b}, mt.group(0),
                         "low", "装甲 recovered from a later clean triple (primary line OCR-corrupt)")
    if len(nums) >= 1:
        return field({"front": nums[0], "side": None, "back": None}, frag[:60], "low",
                     "only one clean 装甲 facing recovered (others lost/corrupt in OCR)")
    return field(None, frag[:60], "none", "装甲 numbers corrupt/absent in OCR fragment")


def parse_first(stats: str, label_pat: str, conf: str, lo: int, hi: int, note_label: str) -> dict:
    frag = _seg_after(stats, label_pat)
    if frag is None:
        return field(None, None, "none", f"no {note_label} label")
    for n in _nums(frag):
        if lo <= n <= hi:
            return field(n, frag[:40], conf)
    return field(None, frag[:40], "none", f"{note_label}: no in-band value (OCR corrupt)")


def parse_base_ship(name: str, stats: str, unit_count, conf_base: str) -> dict:
    """Extract the REAL manual numbers for a base ship. Each field carries {value, raw, confidence, note}."""
    armor = parse_armor(stats, conf_base)
    # シールド 防護値/容量: A / B  -> POSITIONAL: A=防護値 (per-hit absorb), B=容量 (pool). Both scales occur
    # (empire 容量 = 20,000; alliance 容量 = 30/22/25 — small). The manual's column order is fixed, so we read
    # the first two ints in order rather than band-splitting (band-splitting wrongly dropped alliance 容量).
    shield_frag = _seg_after(stats, r"シールド[^:：]*?[:：]")
    guard = cap = None
    if shield_frag:
        sn = _nums(shield_frag)
        if len(sn) >= 1 and SHIELD_GUARD_MIN <= sn[0] <= SHIELD_GUARD_MAX:
            guard = sn[0]
        if len(sn) >= 2:
            cap = sn[1]
    sraw = shield_frag[:40] if shield_frag else None
    shield_guard = field(guard, sraw, conf_base if guard is not None else "none",
                         None if guard is not None else "no シールド防護値 (unarmored/'-' or OCR-lost)")
    shield_cap = field(cap, sraw, conf_base if cap is not None else "none",
                       None if cap is not None else "no シールド容量 (defenseless or OCR-lost)")
    # Weapon 破壊力 labels: the manual writes "ビーム兵装 破壊力:", "ビーム兵装:", or "ビーム破壊力:" — accept the
    # 兵装 label with-or-without the 破壊力 word, then take the first in-band int (consumption "/N" is ignored
    # by the band: ガン 104/1 -> 104, never 1, because we read the FIRST token).
    beam = parse_first(stats, r"ビーム[^:：。]*?[:：]", conf_base, 1, WEAPON_MAX, "ビーム破壊力")
    gun = parse_first(stats, r"ガン[^:：。]*?[:：]", conf_base, 1, WEAPON_MAX, "ガン破壊力")
    missile = parse_first(stats, r"ミサイル[^:：。]*?[:：]", conf_base, 1, WEAPON_MAX, "ミサイル破壊力")
    aa = parse_first(stats, r"対空[^:：。]*?[:：]", conf_base, 1, WEAPON_MAX, "対空破壊力")
    speed = parse_first(stats, r"最高速度[^:：]*[:：]", conf_base, 1000, 60000, "最高速度")
    crew = parse_first(stats, r"必要乗組員[^:：]*[:：]", "low", 1, 5000, "必要乗組員")
    term = parse_first(stats, r"工期[:：]", conf_base, 1, 1000, "工期")
    repair = parse_first(stats, r"修理消費物資[^:：]*[:：]", conf_base, 1, 5000, "修理消費物資")
    supply = parse_first(stats, r"物資搭載量[:：]", conf_base, 1, 100000, "物資搭載量")
    fighters = parse_first(stats, r"戦闘艇[^:：]*?搭載数[:：]", "low", 1, 200, "戦闘艇搭載数")
    uc = None
    if unit_count and str(unit_count).strip().isdigit():
        uc = int(str(unit_count).strip())
    return {
        "armor": armor,
        "shield_guard": shield_guard,         # 防護値 (per-hit absorb)
        "shield_capacity": shield_cap,        # 容量
        "beam_power": beam,
        "gun_power": gun,
        "missile_power": missile,
        "antiaircraft_power": aa,
        "speed": speed,
        "crew": crew,
        "build_term": term,
        "repair_cost": repair,
        "supply_capacity": supply,
        "fighter_num": fighters,
        "unit_count": field(uc, str(unit_count) if unit_count else None,
                            conf_base if uc is not None else "none"),
    }


def family_of(name: str) -> Optional[str]:
    m = re.search(r"\b([A-Z]{1,3}\d{2,3}|7\d{2}|78\d|79\d)型?", name)
    if m:
        code = m.group(1)
        for fam in FAMILY_CLASS:
            if code.startswith(fam) or fam.startswith(code[:3]):
                return fam
    return None


def class_of(name: str) -> str:
    fam = family_of(name)
    if fam and fam in FAMILY_CLASS:
        return FAMILY_CLASS[fam]
    for kw, cls in NAME_CLASS:
        if kw in name:
            return cls
    return "cruiser"


def variant_code_family(name: str) -> Optional[str]:
    """Resolve a variant entry to its base code family (SS75a->SS75) for inheritance."""
    m = re.search(r"([A-Z]{1,3}\d{2,3})[a-z]?型", name)
    if m:
        base = m.group(1)
        return base if base in FAMILY_CLASS else base
    return None


def slug(name: str) -> str:
    code = re.search(r"([A-Z]{1,3}\d{2,3}[a-z]?)型", name)
    if code:
        return code.group(1)
    base = re.split(r"[(（—]", name)[0].strip()
    return base[:24] or name[:24]


def tier_of(name: str) -> Optional[str]:
    for t in ROMAN:
        if t in name:
            return t
    return None


def num_or_none(f: dict):
    return f.get("value") if isinstance(f, dict) else None


def transform_pools(raw: dict) -> dict:
    """DOCUMENTED transform: real manual numbers -> server combat pools. Pools are null when sources are."""
    a = raw["armor"]["value"] if isinstance(raw["armor"], dict) else None
    if isinstance(a, dict):
        facings = [a.get("front"), a.get("side"), a.get("back")]
        present = [x for x in facings if isinstance(x, int)]
        max_armor = sum(present) if present else None
    else:
        max_armor = None
    shield_cap = num_or_none(raw["shield_capacity"])
    shield_guard = num_or_none(raw["shield_guard"])
    beam = num_or_none(raw["beam_power"])
    gun = num_or_none(raw["gun_power"])
    missile = num_or_none(raw["missile_power"])
    weapons = [x for x in (beam, gun, missile) if isinstance(x, int)]
    beam_power = max(weapons) if weapons else None
    unit_count = num_or_none(raw["unit_count"])
    return {
        "maxArmor": max_armor,                              # sum of real 装甲 facings
        "maxZanki": unit_count,                             # ユニット数 (ships per stack)
        "maxShield": shield_cap,                            # real シールド容量
        "beamPower": beam_power,                            # strongest real 破壊力
        "defense": shield_guard,                            # real シールド防護値 (per-hit mitigation)
        "morale": 100,                                      # battle-start default (live morale via 0x33b)
    }


DERIVATION: Final[dict] = {
    "wire_target": "ResponseStaticInformationUnitShip 0x30b (28004 B = 4 + 200x140); fields per static dump "
                   "0x760984..0x760b2c (armor_front/side/back, shield, shield_capacity, beam_power, gun_power, "
                   "missile_power, antiaircraft_power, speed, crew, term, repair, resource_loadage, fighter_num).",
    "transform": {
        "maxArmor": "armor_front + armor_side + armor_back (sum of the three real 装甲 facings)",
        "maxZanki": "unit_count (ユニット数 = ships per stack / 残機 pool)",
        "maxShield": "shield_capacity (real シールド容量)",
        "beamPower": "max(beam_power, gun_power, missile_power) (ship's strongest real 破壊力)",
        "defense": "shield_guard (real シールド防護値 = per-hit mitigation)",
        "morale": "100 (battle-start default; live morale comes from 0x33b, not a static hull stat)",
    },
    "rule": "Every pool traces to a REAL manual number or is null when its source is null/OCR-corrupt. "
            "No archetype invention, no tier multipliers.",
}


def build():
    d = json.loads(SRC.read_text(encoding="utf-8"))
    raw_records: list[dict] = []
    base_by_family: dict[str, dict] = {}
    seen: set[str] = set()

    # PASS 1: parse every BASE ship (has a `stats` block).
    for side in ("empire", "alliance"):
        for entry in d.get(side, []):
            name = entry.get("name_ja", "").strip()
            if not name or name.startswith("["):
                continue
            stats = entry.get("stats", "") or ""
            if not stats:
                continue
            base_name = re.split(r"—|バリエーション", name)[0].strip()
            conf_base = "med" if side == "empire" else "low"  # alliance blocks fold variants -> lower conf
            raw = parse_base_ship(base_name, stats, entry.get("unit_count"), conf_base)
            fam = family_of(base_name)
            cls = class_of(base_name)
            rec = {
                "key": slug(base_name),
                "name": base_name,
                "side": side,
                "shipClass": cls,
                "family": fam,
                "is_base": True,
                "raw": raw,
                "desc": entry.get("desc", ""),
            }
            raw_records.append(rec)
            if fam:
                base_by_family[fam] = rec

    # PASS 2: variant-only entries (no stats) inherit the base family's REAL numbers; desc kept as modifier.
    for side in ("empire", "alliance"):
        for entry in d.get(side, []):
            name = entry.get("name_ja", "").strip()
            if not name or name.startswith("["):
                continue
            if entry.get("stats"):
                continue  # base ships already handled
            fam = variant_code_family(name) or family_of(name)
            base = base_by_family.get(fam) if fam else None
            cls = base["shipClass"] if base else class_of(name)
            rec = {
                "key": slug(name),
                "name": name,
                "side": side,
                "shipClass": cls,
                "family": fam,
                "is_base": False,
                "inherits_from": base["key"] if base else None,
                "raw": base["raw"] if base else None,
                "variant_modifier": entry.get("desc", ""),  # LABELED textual delta only — never a numeric guess
                "tier": tier_of(name),
            }
            raw_records.append(rec)

    # de-dup keys
    for rec in raw_records:
        k = rec["key"]
        if k in seen:
            rec["key"] = f"{k}/{rec['side'][0]}"
        seen.add(rec["key"])

    # build the pool catalog
    ships: list[dict] = []
    for rec in raw_records:
        raw = rec.get("raw")
        pools = transform_pools(raw) if raw else {
            "maxArmor": None, "maxZanki": None, "maxShield": None,
            "beamPower": None, "defense": None, "morale": 100,
        }
        ships.append({
            "key": rec["key"],
            "name": rec["name"],
            "side": rec["side"],
            "shipClass": rec["shipClass"],
            "pools": pools,
            "_inherits_from": rec.get("inherits_from"),
            "_variant_modifier": rec.get("variant_modifier") or None,
            "_raw": raw,
            "_derivation": "see content/ship-stats.json _derivation" ,
        })
    return raw_records, ships


def main() -> None:
    raw_records, ships = build()
    OUT_RAW.write_text(json.dumps({
        "_source": "content/manual/ship-units.json (gin7 manual 別表 艦艇ユニット) — REAL numbers only, "
                   "each field {value, raw source substring, confidence, note}; null when OCR-corrupt/absent.",
        "_wire_target": DERIVATION["wire_target"],
        "count": len(raw_records),
        "ships": raw_records,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT.write_text(json.dumps({
        "_source": "tools/logh7_ship_stats.py from content/manual/ship-units.json (gin7 manual 艦艇ユニット). "
                   "REAL manual numbers + ONE documented transform to server pools. Null pools = source null.",
        "_derivation": DERIVATION,
        "count": len(ships),
        "ships": ships,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    n_pools = sum(1 for s in ships if s["pools"]["maxArmor"] is not None)
    print(f"wrote {OUT_RAW} and {OUT} ({len(ships)} ship types; {n_pools} with a real maxArmor)")
    if "--print" in sys.argv:
        for s in ships:
            p = s["pools"]
            def fz(v):
                return "  null" if v is None else f"{v:6d}"
            print(f"  {s['side'][0]} {s['key']:10s} {s['shipClass']:16s} "
                  f"armor={fz(p['maxArmor'])} shield={fz(p['maxShield'])} beam={fz(p['beamPower'])} "
                  f"def={fz(p['defense'])} zanki={fz(p['maxZanki'])}  {s['name'][:26]}")


if __name__ == "__main__":
    main()
