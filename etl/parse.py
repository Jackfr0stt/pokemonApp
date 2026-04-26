#!/usr/bin/env python3
"""ETL: Parse Pokémon ROM hack spreadsheets → JSON data bundles."""

import json
import re
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import openpyxl

ROOT = Path(__file__).parent.parent
OUT_DIR = ROOT / "lib" / "data"

# ─── Helpers ──────────────────────────────────────────────────────────────────

def cell(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None

def rows_of(wb, sheet_name):
    ws = wb[sheet_name]
    return [[cell(c.value) for c in row] for row in ws.iter_rows()]

def slugify(s):
    s = re.sub(r"[''']", "", s or "")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    return s.strip("-")

def try_int(v):
    if v is None:
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None

def get(row, col):
    return row[col] if row and len(row) > col else None


# ─── Radical Red ─────────────────────────────────────────────────────────────

RR_SKIP = {"Color Idea", "Extra Info Test", "Dumbass Creator", "Sheet36"}
RR_DATA = {"Level Caps & Codes", "TM&HM Locations", "Move Tutor Locations", "Mega Stones"}

RR_LC = 5   # label column
RR_DC = 6   # first data column
RR_ST = 6   # column stride per Pokémon

SPECIES_KW  = {"pokémon :", "pokemon :", "pokémon:", "pokemon:"}
LEVEL_KW    = {"level :", "level:"}
NATURE_KW   = {"nature:"}
ABILITY_KW  = {"ability :", "ability:"}
ITEM_KW     = {"item :", "item:"}
MOVES_KW    = {"moves :", "moves:"}
PASTE_KW    = {"poképaste :", "pokepaste :", "poke paste :", "poképaste:", "pokepaste:", "poke paste:"}
TYPES_KW    = {"types:"}
ALL_KW      = SPECIES_KW | LEVEL_KW | NATURE_KW | ABILITY_KW | ITEM_KW | MOVES_KW | PASTE_KW | TYPES_KW


def rr_parse_block(block_rows, n_pokemon):
    """Parse team + pokepaste from a single trainer block (list of rows)."""
    species_row = level_row = nature_row = ability_row = item_row = None
    moves_rows = []
    pokepaste = None
    in_moves = False

    for row in block_rows:
        lbl = get(row, RR_LC)
        lk = lbl.lower() if lbl else None

        if lk in SPECIES_KW:
            species_row = row; in_moves = False
        elif lk in LEVEL_KW:
            level_row = row; in_moves = False
        elif lk in NATURE_KW:
            nature_row = row; in_moves = False
        elif lk in ABILITY_KW:
            ability_row = row; in_moves = False
        elif lk in ITEM_KW:
            item_row = row; in_moves = False
        elif lk in MOVES_KW:
            moves_rows = [row]; in_moves = True
        elif lk in PASTE_KW:
            val = get(row, RR_DC)
            if val and val.startswith("http"):
                pokepaste = val
            in_moves = False
        elif lk is None and in_moves:
            # Continuation move/stat row — include if any poke col has data
            if any(get(row, RR_DC + i * RR_ST) for i in range(n_pokemon)):
                moves_rows.append(row)
            else:
                in_moves = False
        else:
            in_moves = False

    team = []
    for i in range(n_pokemon):
        col  = RR_DC + i * RR_ST
        sc   = col + 2  # stat label
        bc   = col + 3  # base stat
        ic   = col + 4  # IVs
        ec   = col + 5  # EVs

        species_raw = get(species_row, col)
        if not species_raw:
            continue

        # Remove "(Lead Slot X)" / "(Lead)" annotations that appear in double-battle cells
        species_raw = re.sub(r"\(Lead[^)]*\)", "", species_raw).strip().strip("\n").strip()
        # If cell had multiple lines, take the non-annotation line
        lines = [l.strip() for l in species_raw.split("\n") if l.strip()]
        species_raw = lines[0] if lines else species_raw

        species = re.sub(r"\s*-\s*[MF]\s*$", "", species_raw).strip()

        level_raw = get(level_row, col)
        try:
            level = int(float(level_raw)) if level_raw else None
        except (ValueError, TypeError):
            level = level_raw

        nature  = get(nature_row, col)
        ability = get(ability_row, col)
        item    = get(item_row, col)

        # Stat sources (hp→atk→def from label rows, spa→spd→spe from moves rows)
        stat_sources = [
            (nature_row,  "hp"),
            (ability_row, "atk"),
            (item_row,    "def"),
        ]
        for j, mrow in enumerate(moves_rows):
            stat_sources.append((mrow, ["spa", "spd", "spe"][j] if j < 3 else None))

        stats = {}; ivs = {}; evs = {}; speed_stat = None
        for src_row, stat_key in stat_sources:
            lbl_raw = get(src_row, sc)
            if lbl_raw and "speed stat" in lbl_raw.lower():
                speed_stat = try_int(get(src_row, ic))
                break
            if stat_key:
                stats[stat_key] = try_int(get(src_row, bc))
                ivs[stat_key]   = try_int(get(src_row, ic))
                evs[stat_key]   = try_int(get(src_row, ec))

        moves = [mv for mrow in moves_rows if (mv := get(mrow, col))]

        team.append({
            "species":   species,
            "level":     level,
            "nature":    nature,
            "ability":   ability,
            "item":      item,
            "moves":     moves,
            "stats":     stats,
            "ivs":       ivs,
            "evs":       evs,
            "speedStat": speed_stat,
        })

    return team, pokepaste


def rr_parse_battles(wb):
    locations = []

    for sheet_name in wb.sheetnames:
        if sheet_name in RR_SKIP or sheet_name in RR_DATA:
            continue

        rows = rows_of(wb, sheet_name)

        # Find all "Pokémon :" anchor rows
        anchors = [
            i for i, row in enumerate(rows)
            if (lbl := get(row, RR_LC)) and lbl.lower() in SPECIES_KW
        ]
        if not anchors:
            continue

        trainers = []
        for k, anchor in enumerate(anchors):
            block_end = anchors[k + 1] if k + 1 < len(anchors) else len(rows)
            block = rows[anchor:block_end]

            species_row = rows[anchor]
            n_pokemon = sum(
                1 for i in range(6)
                if get(species_row, RR_DC + i * RR_ST)
            )

            # Trainer name: scan back for non-keyword text in label col
            trainer_name = tm_reward = None
            for j in range(anchor - 1, max(anchor - 10, -1), -1):
                lbl = get(rows[j], RR_LC)
                if lbl and lbl.lower() not in ALL_KW:
                    trainer_name = lbl
                    # TM reward is sometimes in col D (index 3) one row after trainer name
                    nxt = rows[j + 1] if j + 1 < len(rows) else []
                    tm = get(nxt, 3)
                    if tm and tm.lower() not in ALL_KW:
                        tm_reward = tm
                    break

            team, pokepaste = rr_parse_block(block, n_pokemon)
            if team:
                trainers.append({
                    "id":       slugify(trainer_name or f"trainer-{k}"),
                    "name":     trainer_name,
                    "tmReward": tm_reward,
                    "pokepaste": pokepaste,
                    "team":     team,
                })

        if trainers:
            locations.append({
                "id":       slugify(sheet_name),
                "name":     sheet_name,
                "trainers": trainers,
            })

    return locations


def rr_parse_tms(wb):
    rows = rows_of(wb, "TM&HM Locations")
    tms = []
    for row in rows[1:]:  # skip header
        name = get(row, 1)
        if not name or not re.match(r"^(HM|TM)\d+", name):
            continue
        parts = name.split(" - ", 1)
        tms.append({
            "id":       slugify(parts[0]),
            "code":     parts[0].strip(),
            "move":     parts[1].strip() if len(parts) > 1 else None,
            "type":     get(row, 2),
            "location": get(row, 4),
        })
    return tms


def rr_parse_tutors(wb):
    rows = rows_of(wb, "Move Tutor Locations")
    tutors = []
    for row in rows:
        name = get(row, 1)
        if not name or name.lower() in ("move", "move tutor"):
            continue
        tutors.append({
            "move":     name,
            "location": get(row, 3) or get(row, 4),
        })
    return tutors


def rr_parse_mega(wb):
    rows = rows_of(wb, "Mega Stones")
    megas = []
    for row in rows:
        stone = get(row, 1)
        if not stone or stone.lower() in ("mega stone", "stone"):
            continue
        megas.append({
            "stone":    stone,
            "location": get(row, 2) or get(row, 3) or get(row, 4),
        })
    return megas


def rr_parse_caps_and_codes(wb):
    """Parse the Level Caps & Codes sheet (data crammed into single cells)."""
    rows = rows_of(wb, "Level Caps & Codes")
    level_caps = []
    codes = []

    for row in rows:
        for cell_val in row:
            if not cell_val:
                continue
            lines = cell_val.split("\n")
            if not lines:
                continue

            if lines[0].strip().lower().startswith("level cap"):
                for line in lines[1:]:
                    line = line.strip()
                    if not line:
                        continue
                    # "After obtaining the first Gym Badge: Lv. 22"
                    m = re.search(r"lv\.?\s*(\d+)", line, re.IGNORECASE)
                    if m:
                        level_caps.append({
                            "trigger": re.sub(r":\s*lv\.?\s*\d+", "", line, flags=re.IGNORECASE).strip(),
                            "level":   int(m.group(1)),
                        })

            elif lines[0].strip().lower().startswith("code"):
                i = 1
                while i < len(lines):
                    code_name = lines[i].strip()
                    desc = lines[i + 1].strip() if i + 1 < len(lines) else ""
                    if code_name:
                        codes.append({"code": code_name, "description": desc})
                    i += 2

    return level_caps, codes


# ─── Emerald Imperium ─────────────────────────────────────────────────────────

EI_SKIP = {"Navigation", "Front Page", "Double Battle Guide", "Types"}

EI_LC = 1   # label column  (B)
EI_DC = 2   # first data column (C)
EI_ST = 5   # stride per Pokémon
EI_SC = 2   # stat offset from data col (C → E = +2, i.e. col 4 for poke 1)

EI_SPECIES_KW = {"pokemon:", "pokemon :"}
EI_LEVEL_KW   = {"level:", "level :"}
EI_NATURE_KW  = {"nature:"}
EI_ABILITY_KW = {"ability:"}
EI_ITEM_KW    = {"item:"}
EI_MOVES_KW   = {"moves:", "move:"}
EI_PASTE_KW   = {"poke paste:", "pokepaste:", "poképaste:"}
EI_ALL_KW     = (EI_SPECIES_KW | EI_LEVEL_KW | EI_NATURE_KW | EI_ABILITY_KW |
                 EI_ITEM_KW | EI_MOVES_KW | EI_PASTE_KW | {"types:"})


def ei_parse_stat(raw):
    """Parse 'HP: 80' → ('hp', 80).  Returns (None, None) on failure."""
    if not raw:
        return None, None
    # Speed Stat: 25  or  Speed Stat: 11-14
    m = re.match(r"speed stat:\s*([\d\-]+)", raw, re.IGNORECASE)
    if m:
        val_str = m.group(1).split("-")[0]  # take lower bound of range
        return "speedStat", try_int(val_str)
    # Snow Up: 46  (speed in snow — store as auxSpeed)
    m = re.match(r"snow up:\s*(\d+)", raw, re.IGNORECASE)
    if m:
        return "snowSpeed", try_int(m.group(1))
    # Normal stat: "HP: 80", "Atk: 85", "SpA: 65"
    m = re.match(r"([\w]+):\s*([+\-]?\d+)", raw)
    if m:
        key = m.group(1).lower()
        key = {"spa": "spa", "spd": "spd", "spe": "spe",
               "hp": "hp", "atk": "atk", "def": "def"}.get(key, key)
        return key, try_int(m.group(2))
    return None, None


def ei_parse_block(block_rows, n_pokemon):
    """Parse team from an EI trainer block."""
    level_row = nature_row = ability_row = item_row = None
    moves_rows = []
    pokepaste = None
    in_moves = False

    for row in block_rows:
        lbl = get(row, EI_LC)
        lk = lbl.lower().strip() if lbl else None

        if lk in EI_LEVEL_KW:
            level_row = row; in_moves = False
        elif lk in EI_NATURE_KW:
            nature_row = row; in_moves = False
        elif lk in EI_ABILITY_KW:
            ability_row = row; in_moves = False
        elif lk in EI_ITEM_KW:
            item_row = row; in_moves = False
        elif lk in EI_MOVES_KW:
            moves_rows = [row]; in_moves = True
        elif lk in EI_PASTE_KW:
            # Pokepaste URL may be on col 2 or embedded in the label
            val = get(row, 2)
            if val and val.startswith("http"):
                pokepaste = val
            # Also check if URL is part of the label cell itself
            if not pokepaste and lbl:
                m = re.search(r"https?://\S+", lbl)
                if m:
                    pokepaste = m.group(0)
            in_moves = False
        elif lk is None and in_moves:
            has_move = any(get(row, EI_DC + i * EI_ST) for i in range(n_pokemon))
            # Also keep rows that only have a stat or speed-stat value (no move text)
            has_stat = any(
                get(row, EI_DC + 2 + i * EI_ST) or get(row, EI_DC + 3 + i * EI_ST)
                for i in range(n_pokemon)
            )
            if has_move or has_stat:
                moves_rows.append(row)
            else:
                in_moves = False
        elif lk and lk not in EI_ALL_KW:
            in_moves = False

    team = []
    for i in range(n_pokemon):
        col     = EI_DC + i * EI_ST   # value col  (C, H, M, ...)
        stat_c  = col + 2              # stat label col (E, J, O, ...)
        ivs_c   = col + 3              # IVs col
        evs_c   = col + 4              # EVs col

        # Species comes from the row 3 lines before "Pokemon:" (stored in block_rows[0])
        # We'll read it from the species_row passed separately — handled in caller

        level_raw = get(level_row, col)
        try:
            level = int(float(level_raw)) if level_raw and re.match(r"[\d.]+", level_raw) else level_raw
        except (ValueError, TypeError):
            level = level_raw

        nature  = get(nature_row, col)
        ability = get(ability_row, col)
        item    = get(item_row, col)

        # Collect all stat cells from level through last moves row
        stat_rows = [r for r in [nature_row, ability_row, item_row] + moves_rows if r]

        stats = {}; ivs = {}; evs = {}; speed_stat = None

        for src in stat_rows:
            raw_stat  = get(src, stat_c)
            raw_ivs   = get(src, ivs_c)
            raw_evs   = get(src, evs_c)

            # EI stat label contains value: "HP: 80"
            stat_key, stat_val = ei_parse_stat(raw_stat)
            if stat_key == "speedStat":
                speed_stat = stat_val
            elif stat_key and stat_key not in ("snowSpeed",):
                stats[stat_key] = stat_val
                ivs[stat_key]   = try_int(raw_ivs)
                evs[stat_key]   = try_int(raw_evs)

            # Also check if speed stat is embedded in the IVs col
            if raw_ivs:
                sk, sv = ei_parse_stat(raw_ivs)
                if sk == "speedStat":
                    speed_stat = sv

        # Strip "- " prefix from moves
        moves = []
        for mrow in moves_rows:
            mv = get(mrow, col)
            if mv:
                moves.append(re.sub(r"^-\s*", "", mv).strip())

        team.append({
            "level":     level,
            "nature":    nature,
            "ability":   ability,
            "item":      item,
            "moves":     moves,
            "stats":     stats,
            "ivs":       ivs,
            "evs":       evs,
            "speedStat": speed_stat,
        })

    return team, pokepaste


def ei_parse_battles(wb):
    locations = []

    for sheet_name in wb.sheetnames:
        if sheet_name in EI_SKIP:
            continue

        rows = rows_of(wb, sheet_name)

        # Find all "Pokemon:" anchor rows (label col = B = index 1)
        anchors = [
            i for i, row in enumerate(rows)
            if (lbl := get(row, EI_LC)) and lbl.lower().strip() in EI_SPECIES_KW
        ]
        if not anchors:
            continue

        trainers = []
        pending_trainer = None  # current trainer that may have multiple blocks

        for k, anchor in enumerate(anchors):
            block_end = anchors[k + 1] if k + 1 < len(anchors) else len(rows)
            block = rows[anchor:block_end]

            # Species: 3 rows before "Pokemon:" anchor
            species_row_idx = anchor - 3
            species_row = rows[species_row_idx] if species_row_idx >= 0 else None

            # Count pokemon from species row (col stride 5, species at col 5,10,15...)
            n_pokemon = 0
            if species_row:
                for i in range(6):
                    sp_col = EI_DC + 3 + i * EI_ST   # cols 5,10,15...
                    if get(species_row, sp_col):
                        n_pokemon = i + 1

            if n_pokemon == 0:
                # Fallback: count from level row inside block
                for row in block:
                    lbl = get(row, EI_LC)
                    if lbl and lbl.lower().strip() in EI_LEVEL_KW:
                        for i in range(6):
                            if get(row, EI_DC + i * EI_ST):
                                n_pokemon = i + 1

            team, pokepaste = ei_parse_block(block, n_pokemon)

            # Attach species names from species_row
            if species_row:
                for i, mon in enumerate(team):
                    sp_col = EI_DC + 3 + i * EI_ST
                    sp = get(species_row, sp_col) or ""
                    sp = re.sub(r"\(Lead[^)]*\)", "", sp).strip().strip("\n").strip()
                    lines = [l.strip() for l in sp.split("\n") if l.strip()]
                    mon["species"] = lines[0] if lines else (sp or None)

            # Trainer name: look back up to 7 rows for col-C text that isn't a keyword
            trainer_name = None
            for j in range(anchor - 1, max(anchor - 8, -1), -1):
                lbl = get(rows[j], EI_DC)   # col C = index 2
                if lbl and lbl.lower().strip() not in EI_ALL_KW:
                    trainer_name = lbl
                    break

            if trainer_name and trainer_name != (pending_trainer or {}).get("name"):
                # New trainer
                if pending_trainer and pending_trainer["team"]:
                    trainers.append(pending_trainer)
                pending_trainer = {
                    "id":       slugify(trainer_name),
                    "name":     trainer_name,
                    "pokepaste": pokepaste,
                    "team":     team,
                }
            else:
                # Continuation block — same trainer
                if pending_trainer is None:
                    pending_trainer = {
                        "id":   f"trainer-{k}",
                        "name": None,
                        "pokepaste": pokepaste,
                        "team": team,
                    }
                else:
                    pending_trainer["team"].extend(team)
                    if not pending_trainer["pokepaste"] and pokepaste:
                        pending_trainer["pokepaste"] = pokepaste

        if pending_trainer and pending_trainer["team"]:
            trainers.append(pending_trainer)

        if trainers:
            locations.append({
                "id":       slugify(sheet_name),
                "name":     sheet_name,
                "trainers": trainers,
            })

    return locations


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    rr_path = ROOT / "Radical Red 4.1 Docs Normal Mode.xlsx"
    ei_path = ROOT / "Emerald Emperium - Boss Battles.xlsx"

    print("Loading workbooks...")
    rr_wb = openpyxl.load_workbook(rr_path, data_only=True)
    ei_wb = openpyxl.load_workbook(ei_path, data_only=True)

    print("Parsing Radical Red...")
    rr_tms        = rr_parse_tms(rr_wb)
    rr_tutors     = rr_parse_tutors(rr_wb)
    rr_mega       = rr_parse_mega(rr_wb)
    rr_caps, rr_codes = rr_parse_caps_and_codes(rr_wb)
    rr_locations  = rr_parse_battles(rr_wb)

    rr_out = {
        "game":      "radical-red-4.1",
        "locations": rr_locations,
        "tms":       rr_tms,
        "tutors":    rr_tutors,
        "megaStones": rr_mega,
        "levelCaps": rr_caps,
        "codes":     rr_codes,
    }

    print("Parsing Emerald Imperium...")
    ei_locations = ei_parse_battles(ei_wb)

    ei_out = {
        "game":      "emerald-imperium",
        "locations": ei_locations,
        "tms":       [],
        "levelCaps": [],
        "codes":     [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "radical-red.json").write_text(json.dumps(rr_out, indent=2, ensure_ascii=False))
    (OUT_DIR / "emerald-imperium.json").write_text(json.dumps(ei_out, indent=2, ensure_ascii=False))

    # Stats
    rr_trainers = sum(len(loc["trainers"]) for loc in rr_locations)
    rr_mons     = sum(len(t["team"]) for loc in rr_locations for t in loc["trainers"])
    ei_trainers = sum(len(loc["trainers"]) for loc in ei_locations)
    ei_mons     = sum(len(t["team"]) for loc in ei_locations for t in loc["trainers"])

    print(f"\nRadical Red:      {len(rr_locations)} locations, {rr_trainers} trainers, {rr_mons} Pokémon")
    print(f"                  {len(rr_tms)} TMs/HMs, {len(rr_tutors)} tutors, {len(rr_mega)} mega stones")
    print(f"                  {len(rr_caps)} level caps, {len(rr_codes)} codes")
    print(f"Emerald Imperium: {len(ei_locations)} locations, {ei_trainers} trainers, {ei_mons} Pokémon")
    print(f"\nOutput: {OUT_DIR}/")


if __name__ == "__main__":
    main()
