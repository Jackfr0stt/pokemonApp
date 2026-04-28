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

def normalize_name(s):
    """Collapse internal whitespace runs to single space."""
    return re.sub(r" {2,}", " ", s).strip() if s else s

# Names where the xlsx cell differs from the intended display name.
RR_NAME_CORRECTIONS: dict[str, str] = {
    "Lass Ann":  "Lass Ann & Gentleman Brooks",
    "Trevor":    "Trevor & Edmond",
}

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

RR_LC = 5   # default label column (F)
RR_DC = 6   # default first data column (G)
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


def rr_parse_block(block_rows, n_pokemon, lc=RR_LC, dc=RR_DC, st=RR_ST):
    """Parse team + pokepaste from a single trainer block (list of rows)."""
    species_row = level_row = nature_row = ability_row = item_row = None
    moves_rows = []
    pokepaste = None
    in_moves = False

    for row in block_rows:
        lbl = get(row, lc)
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
            val = get(row, dc)
            if val and val.startswith("http"):
                pokepaste = val
            in_moves = False
        elif lk is None and in_moves:
            # Continuation move/stat row — include if any poke col has data
            if any(get(row, dc + i * st) for i in range(n_pokemon)):
                moves_rows.append(row)
            else:
                in_moves = False
        else:
            in_moves = False

    team = []
    for i in range(n_pokemon):
        col  = dc + i * st
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


def rr_parse_column_group(rows, lc, anchors):
    """Parse all trainer blocks for one label-column group.

    Returns list of (name_row_idx, trainer_dict) so the caller can associate
    partner trainers (names ending in '(Partner)') with their main trainer.
    """
    result = []
    for k, anchor in enumerate(anchors):
        block_end = anchors[k + 1] if k + 1 < len(anchors) else len(rows)
        block = rows[anchor:block_end]

        # Auto-detect first data column: some blocks use lc+1, others lc+2.
        species_row = rows[anchor]
        dc = lc + 1
        for candidate in range(lc + 1, lc + 4):
            if any(get(species_row, candidate + i * RR_ST) for i in range(6)):
                dc = candidate
                break

        n_pokemon = sum(1 for i in range(6) if get(species_row, dc + i * RR_ST))

        # Trainer name: scan back for non-keyword text in label col
        trainer_name = tm_reward = None
        name_row_idx = anchor
        for j in range(anchor - 1, max(anchor - 10, -1), -1):
            lbl = get(rows[j], lc)
            if lbl and lbl.lower() not in ALL_KW:
                trainer_name = RR_NAME_CORRECTIONS.get(normalize_name(lbl), normalize_name(lbl))
                name_row_idx = j
                # TM reward sometimes two cols left of label col
                nxt = rows[j + 1] if j + 1 < len(rows) else []
                tm = get(nxt, lc - 2)
                if tm and tm.lower() not in ALL_KW:
                    tm_reward = tm
                break

        team, pokepaste = rr_parse_block(block, n_pokemon, lc=lc, dc=dc)
        if team:
            result.append((name_row_idx, {
                "id":        slugify(trainer_name or f"trainer-{k}"),
                "name":      trainer_name,
                "tmReward":  tm_reward,
                "pokepaste": pokepaste,
                "team":      team,
            }))

    return result


def rr_parse_battles(wb):
    locations = []

    for sheet_name in wb.sheetnames:
        if sheet_name in RR_SKIP or sheet_name in RR_DATA:
            continue

        rows = rows_of(wb, sheet_name)

        # Find all (row_idx, label_col) pairs where "Pokémon :" appears.
        # Most sheets use only col F (5); sheets like Cinnabar Island have
        # multiple parallel trainer column groups.
        from collections import defaultdict
        anchors_by_col = defaultdict(list)
        for i, row in enumerate(rows):
            for col_idx in range(len(row)):
                lbl = get(row, col_idx)
                if lbl and lbl.lower() in SPECIES_KW:
                    anchors_by_col[col_idx].append(i)

        if not anchors_by_col:
            continue

        # Collect all (name_row, trainer) tuples from every column group
        all_entries = []
        for lc in sorted(anchors_by_col.keys()):
            all_entries.extend(rr_parse_column_group(rows, lc, anchors_by_col[lc]))

        # Separate partner trainers from regular trainers.
        # Partners share the same name_row as the main trainer they support.
        # Build: name_row -> main trainer (for attaching partners)
        main_by_row: dict[int, dict] = {}
        trainers = []
        partners: list[tuple[int, dict]] = []

        for name_row, t in all_entries:
            if t["name"] and "(partner)" in t["name"].lower():
                partners.append((name_row, t))
            else:
                trainers.append(t)
                main_by_row[name_row] = t

        # Attach each partner to the main trainer at the same name row.
        # Fall back to the closest preceding main trainer if no exact match.
        main_rows = sorted(main_by_row.keys())
        for name_row, partner in partners:
            target = main_by_row.get(name_row)
            if target is None and main_rows:
                # nearest preceding row
                candidates = [r for r in main_rows if r <= name_row]
                if candidates:
                    target = main_by_row[max(candidates)]
            if target is not None:
                target["partner"] = {
                    "name":      partner["name"],
                    "pokepaste": partner["pokepaste"],
                    "team":      partner["team"],
                }

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


# Hardcoded from "Item, TM, and Move Tutor Locations v4.1 - Radical Red.xlsx" (Drive source of truth).
# The Drive file lists moves in 5 groups without locations; locations are inferred from EI data
# which shares the same Kanto map and tutor NPC layout.
RR_TUTORS_HARDCODED = [
    # Group 1 — weather tutors
    {"move": "Sunny Day",       "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Rain Dance",      "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Snowscape",       "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Sandstorm",       "location": "Cinnabar Island's Pokémon Lab"},
    # Group 2 — Vermilion City's Fanclub
    {"move": "Flame Charge",    "location": "Vermilion City's Fanclub"},
    {"move": "Trailblaze",      "location": "Vermilion City's Fanclub"},
    {"move": "Power-Up Punch",  "location": "Vermilion City's Fanclub"},
    {"move": "Charge Beam",     "location": "Vermilion City's Fanclub"},
    {"move": "Work Up",         "location": "Vermilion City's Fanclub"},
    {"move": "Hone Claws",      "location": "Vermilion City's Fanclub"},
    # Group 3 — Fuchsia City's Eastern Gate
    {"move": "Swords Dance",    "location": "Fuchsia City's Eastern Gate"},
    {"move": "Nasty Plot",      "location": "Fuchsia City's Eastern Gate"},
    {"move": "Bulk Up",         "location": "Fuchsia City's Eastern Gate"},
    {"move": "Calm Mind",       "location": "Fuchsia City's Eastern Gate"},
    {"move": "Meteor Beam",     "location": "Fuchsia City's Eastern Gate"},
    {"move": "Iron Defense",    "location": "Fuchsia City's Eastern Gate"},
    # Group 4 — Saffron City
    {"move": "Drill Run",       "location": "Saffron City - House left of Silph Co."},
    {"move": "Blaze Kick",      "location": "Saffron City - House left of Silph Co."},
    {"move": "Pain Split",      "location": "Saffron City - House left of Silph Co."},
    {"move": "Hex",             "location": "Saffron City - House left of Silph Co."},
    {"move": "Mystical Fire",   "location": "Saffron City - House left of Silph Co."},
    {"move": "Leaf Blade",      "location": "Saffron City - House left of Silph Co."},
    {"move": "Power Gem",       "location": "Saffron City - House left of Silph Co."},
    {"move": "Rock Blast",      "location": "Saffron City - House left of Silph Co."},
    {"move": "Pin Missile",     "location": "Saffron City - House left of Silph Co."},
    {"move": "Icicle Spear",    "location": "Saffron City - House left of Silph Co."},
    {"move": "Tail Slap",       "location": "Saffron City - House left of Silph Co."},
    {"move": "Body Slam",       "location": "Saffron City - House left of Silph Co."},
    {"move": "Foul Play",       "location": "Saffron City - House left of Silph Co."},
    {"move": "Alluring Voice",  "location": "Saffron City - House left of Silph Co."},
    {"move": "Focus Punch",     "location": "Saffron City - House left of Silph Co."},
    {"move": "Psychic Fangs",   "location": "Saffron City - House left of Silph Co."},
    # Group 5 — Cinnabar Island's Pokémon Lab (late-game)
    {"move": "Power Whip",      "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Bug Buzz",        "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Phantom Force",   "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Flare Blitz",     "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Stored Power",    "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Tailwind",        "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Megahorn",        "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Stealth Rock",    "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Spikes",          "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Toxic Spikes",    "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Solar Beam",      "location": "Cinnabar Island's Pokémon Lab"},
    {"move": "Solar Blade",     "location": "Cinnabar Island's Pokémon Lab"},
]


def rr_parse_tutors(wb):
    return RR_TUTORS_HARDCODED


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


# Move types not present in the RR TM list — used to fill EI TM types.
EI_MOVE_TYPE_EXTRAS: dict[str, str] = {
    # EI-specific or moves absent from RR TM list
    'focus punch':'fighting', 'calm mind':'psychic', 'snowscape':'ice',
    'bulk up':'fighting', 'sunny day':'fire', 'solar beam':'grass',
    'iron tail':'steel', 'solar blade':'grass', 'sandstorm':'rock',
    'dragon dance':'dragon', 'drain kiss':'fairy', 'meteor beam':'rock',
    'power-up punch':'fighting', 'charge beam':'electric', 'silver wind':'bug',
    'rock polish':'rock', 'psyshock':'psychic', 'swords dance':'normal',
    'stealth rock':'rock', 'flame charge':'fire', 'trailblaze':'grass',
    'substitute':'normal', 'acrobatics':'flying', 'smack down':'rock',
    'work up':'normal', 'bug bite':'bug', 'drill run':'ground',
    'blaze kick':'fire', 'pain split':'normal', 'hex':'ghost',
    'mystical fire':'fire', 'leaf blade':'grass', 'power gem':'rock',
    'rock blast':'rock', 'pin missile':'bug', 'icicle spear':'ice',
    'tail slap':'normal', 'arm thrust':'fighting', 'foul play':'dark',
    'iron defense':'steel', 'nasty plot':'dark', 'power whip':'grass',
    'bug buzz':'bug', 'phantom force':'ghost', 'flare blitz':'fire',
    'stored power':'psychic', 'tailwind':'flying', 'megahorn':'bug',
    'moonblast':'fairy', 'body slam':'normal', 'play rough':'fairy',
    'water pulse':'water', 'dark hole':'dark', 'heavy slam':'steel',
    'gravity':'psychic', 'alluring voice':'fairy', 'fire fang':'fire',
    'ice fang':'ice', 'thunder fang':'electric', 'psychic fangs':'psychic',
    'poison fang':'poison', 'spikes':'ground', 'steel beam':'steel',
    'draco barrage':'dragon', 'misty explosion':'fairy',
    # Moves in both games
    'air slash':'flying', 'aura sphere':'fighting', 'close combat':'fighting',
    'draco meteor':'dragon', 'earth power':'ground', 'fire punch':'fire',
    'gunk shot':'poison', 'heat wave':'fire', 'high horsepower':'ground',
    'hurricane':'flying', 'hydro pump':'water', 'ice punch':'ice',
    'iron head':'steel', 'knock off':'dark', 'liquidation':'water',
    'psychic noise':'psychic', 'seed bomb':'grass', 'stomping tantrum':'ground',
    'supercell slam':'electric', 'temper flare':'fire', 'thunder punch':'electric',
    'vacuum wave':'fighting', 'weather ball':'normal', 'zen headbutt':'psychic',
}

# ─── Emerald Imperium ─────────────────────────────────────────────────────────

EI_SKIP = {
    "Navigation", "Front Page", "Double Battle Guide", "Types",
    # "Gyms Only" / "Horizon" sheets use a different layout (species inline on Pokemon: row)
    # and duplicate data from the badge sheets — skip them.
    "Hoenn Gyms Only", "Sinnoh Gyms Only",
    "Hoenn Gym Leaders Only (Horizon", "Sinnoh Gym Leaders Only (Horizo",
}

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

            # Species: per-slot backward scan from anchor.
            # Offset is inconsistent across sheets (anchor-3 is common but
            # Hot House 7-badge uses anchor-1, and some blocks spread species
            # across multiple rows for different slots).
            species_per_slot: dict[int, str] = {}
            for back in range(1, 8):
                candidate_idx = anchor - back
                if candidate_idx < 0:
                    break
                candidate = rows[candidate_idx]
                for i in range(6):
                    if i not in species_per_slot:
                        sp = get(candidate, EI_DC + 3 + i * EI_ST)
                        if sp:
                            species_per_slot[i] = sp

            n_pokemon = max(species_per_slot.keys()) + 1 if species_per_slot else 0

            if n_pokemon == 0:
                # Fallback: count from level row inside block
                for row in block:
                    lbl = get(row, EI_LC)
                    if lbl and lbl.lower().strip() in EI_LEVEL_KW:
                        for i in range(6):
                            if get(row, EI_DC + i * EI_ST):
                                n_pokemon = i + 1

            # Detect speed-stat comparison blocks: pseudo-blocks with no trainer name
            # where the spreadsheet lists "Speed Stat: N" as species in some slots.
            # These appear right after real trainer blocks and must be skipped.
            is_speed_stat_block = any(
                re.match(r"^speed stat:", sp, re.IGNORECASE)
                for sp in species_per_slot.values()
            )

            team, pokepaste = ei_parse_block(block, n_pokemon)

            # Attach species names from per-slot map
            for i, mon in enumerate(team):
                sp = species_per_slot.get(i, "")
                sp = re.sub(r"\(Lead[^)]*\)", "", sp).strip().strip("\n").strip()
                lines = [l.strip() for l in sp.split("\n") if l.strip()]
                candidate = lines[0] if lines else (sp or None)
                # Discard cells that are stat annotations, not species names
                if candidate and re.match(r"^speed stat:", candidate, re.IGNORECASE):
                    candidate = None
                mon["species"] = candidate

            # Trainer name: look back up to 7 rows for col-C text that isn't a keyword
            # or a parsing artifact ("The level cap...", "- Move", species names)
            trainer_name = None
            for j in range(anchor - 1, max(anchor - 8, -1), -1):
                lbl = get(rows[j], EI_DC)   # col C = index 2
                lbl_lc = lbl.lower().strip() if lbl else None
                if not lbl_lc:
                    continue
                if lbl_lc in EI_ALL_KW:
                    continue
                if lbl_lc.startswith("the level cap"):
                    continue
                if lbl_lc.startswith("-"):
                    continue
                trainer_name = lbl
                break

            # Skip speed-stat comparison blocks (they have no trainer name and are
            # just reference tables embedded in the sheet, not actual fights).
            if is_speed_stat_block and not trainer_name:
                continue

            # Skip blocks where all species resolved to None (junk section)
            if team and not any(m.get("species") for m in team):
                continue

            if trainer_name:
                # Block has an explicit trainer name — always a distinct fight.
                # (Same-name repetitions in Hot House = different badge-level encounters.)
                if pending_trainer and pending_trainer["team"]:
                    trainers.append(pending_trainer)
                pending_trainer = {
                    "id":       slugify(trainer_name),
                    "name":     trainer_name,
                    "pokepaste": pokepaste,
                    "team":     team,
                }
            else:
                # No name found — continuation block of the current trainer
                # (e.g. a trainer whose Pokémon are split across two anchor rows).
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


def ei_parse_caps_and_codes(wb):
    """Parse level caps and cheat codes from the Front Page sheet of the EI battles xlsx.

    Both are packed into single cells as multi-line strings.
    Level cap lines: "Pre-Roxanne - Level 15"
    Code lines: alternating code-name / description pairs.
    """
    level_caps = []
    codes = []

    for row in wb["Front Page"].iter_rows(values_only=True):
        for cell_val in row:
            if not cell_val:
                continue
            text = str(cell_val)
            lines = [l.strip() for l in text.split("\n")]
            if not lines:
                continue

            if lines[0].lower().startswith("level cap"):
                for line in lines[1:]:
                    if not line:
                        continue
                    m = re.match(r"^(.+?)\s*-\s*Level\s*(\d+)\s*$", line, re.IGNORECASE)
                    if m:
                        level_caps.append({
                            "trigger": m.group(1).strip(),
                            "level":   int(m.group(2)),
                        })

            elif lines[0].lower().startswith("code"):
                i = 1
                while i < len(lines):
                    code_name = lines[i].strip()
                    desc = lines[i + 1].strip() if i + 1 < len(lines) else ""
                    if code_name:
                        codes.append({"code": code_name, "description": desc})
                    i += 2

    return level_caps, codes


# ─── Emerald Imperium item data ───────────────────────────────────────────────

# Hardcoded from "Item (TMs, Mega Stones, etc) and Useful NPC Locations - Emerald Emperium.xlsx"
# (Drive source of truth). The local xlsx uses an outdated column layout; this list is used as
# fallback so ETL re-runs never zero out EI TMs.
def _mt(name: str, move_type: dict) -> str | None:
    return move_type.get(name.lower())

_EI_TM_RAW = [
    # kind, num, move, location
    ("TM","001","Focus Punch","Jagged Pass, from Maylene after defeating her"),
    ("TM","002","Dragon Claw","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","003","Flip Turn","Slateport City, from the Aqua grunt nearest the entrance inside"),
    ("TM","004","Calm Mind","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","005","Roar","Route 114, from the man next to his Poochyena"),
    ("TM","006","Toxic","Mauville City's Game Corner"),
    ("TM","007","Snowscape","Route 114, on the cliffs past a smashable rock"),
    ("TM","008","Bulk Up","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","009","Bullet Seed","Route 103, West of the Trick House and past the trees that need to be Cut"),
    ("TM","010","Hidden Power","Route 117, from the Ninja Kid hidden below the flower field"),
    ("TM","011","Sunny Day","Route 124, on the ground, requires Surf"),
    ("TM","012","Taunt","Mauville City's Game Corner"),
    ("TM","013","Ice Beam","Lavaridge Town's outdoor Mart worker"),
    ("TM","014","Blizzard","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","015","Electroweb","Dewford Town's outdoor Mart workers"),
    ("TM","016","Light Screen","Mauville City's Game Corner"),
    ("TM","017","Protect","Mauville City's Game Corner"),
    ("TM","018","Rain Dance","Route 121, on the ground South of the entrance to the Safari Zone"),
    ("TM","019","Giga Drain","Mauville City's Game Corner"),
    ("TM","020","Hyper Voice","Lavaridge Town's outdoor Mart worker"),
    ("TM","021","Icy Wind","Route 116, from Candice after defeating her"),
    ("TM","022","Solar Beam","Trick House, reward for completing second puzzle"),
    ("TM","023","Iron Tail","Meteor Falls, on the ground near the Southern exit"),
    ("TM","024","Thunderbolt","Lavaridge Town's outdoor Mart worker"),
    ("TM","025","Thunder","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","026","Earthquake","Fortree City, from creator Xavier after defeating him"),
    ("TM","027","Return","Petalburg City, from Norman after defeating him"),
    ("TM","028","Dig","Fallarbor Town, from kid brother of the Fossil Maniac"),
    ("TM","029","Psychic","Route 117, from Fantina after defeating her in the flower field"),
    ("TM","030","Shadow Ball","Route 117, from Fantina after defeating her in the flower field"),
    ("TM","031","Brick Break","Route 117, from Fantina after defeating her in the flower field"),
    ("TM","032","Solar Blade","Trick House, reward for completing second puzzle"),
    ("TM","033","Reflect","Mauville City's Game Corner"),
    ("TM","034","Teleport","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","035","Flamethrower","Lavaridge Town's outdoor Mart worker"),
    ("TM","036","Sludge Bomb","Lavaridge Town's outdoor Mart worker"),
    ("TM","037","Sandstorm","Route 111, on the ground near the Southern entrance to the desert"),
    ("TM","038","Fire Blast","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","039","Rock Tomb","Dewford Town's outdoor Mart workers"),
    ("TM","040","Aerial Ace","Dewford Town's outdoor Mart workers"),
    ("TM","041","Dragon Dance","Fortree City, from creator Justin after defeating him"),
    ("TM","042","Facade","Petalburg City, from Norman after defeating him"),
    ("TM","043","Defog","Route 111, from the kid staring at a tree past Fiery Path"),
    ("TM","044","Rest","Mauville City's Game Corner"),
    ("TM","045","Drain Kiss","Verdanturf Town, in the lobby of the Battle Tent"),
    ("TM","046","Thief","Slateport City, in the lobby of the Battle Tent"),
    ("TM","047","Steel Wing","Granite Cave, from Steven after delivering the letter to him"),
    ("TM","048","Meteor Beam","Petalburg City, from Wally's dad after defeating Norman"),
    ("TM","049","Leech Life","Mauville City's Game Corner"),
    ("TM","050","Overheat","Lavaridge Town, from Flannery after defeating her"),
    ("TM","051","Roost","Route 111, from Dawn after defeating her"),
    ("TM","052","Focus Blast","Jagged Pass, from Maylene after defeating her"),
    ("TM","053","Energy Ball","Lavaridge Town's outdoor Mart worker"),
    ("TM","054","Grassy Glide","Trick House, reward for completing second puzzle"),
    ("TM","055","Expanding Force","Mossdeep City, from Tate and Liza after defeating them"),
    ("TM","056","Power-Up Punch","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","057","Charge Beam","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","058","Rising Voltage","Evergrande City, from Volkner after defeating him"),
    ("TM","059","Dragon Pulse","Petalburg City, from Wally's dad after defeating Norman"),
    ("TM","060","Drain Punch","Jagged Pass, from Maylene after defeating her"),
    ("TM","061","Will-O-Wisp","Lavaridge Town, from Flannery after defeating her"),
    ("TM","062","Silver Wind","Mauville City's Game Corner"),
    ("TM","063","Venoshock","Mauville City's Game Corner"),
    ("TM","064","Explosion","Mauville City's Game Corner"),
    ("TM","065","Shadow Claw","Mauville City's Game Corner"),
    ("TM","066","Dazzling Gleam","Mauville City's Game Corner"),
    ("TM","067","Poltergeist","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","068","Dual Chop","Petalburg City, from Wally's dad after defeating Norman"),
    ("TM","069","Rock Polish","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","070","Triple Axel","Shoal Cave, on the ground in the Ice Room"),
    ("TM","071","Stone Edge","Route 125, from Roark after defeating him"),
    ("TM","072","Psyshock","Mauville City's Game Corner"),
    ("TM","073","Thunder Wave","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","074","Gyro Ball","Mauville City's Game Corner"),
    ("TM","075","Swords Dance","Petalburg City, from Norman after defeating him"),
    ("TM","076","Stealth Rock","Route 120, from Byron after defeating him"),
    ("TM","077","Flame Charge","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","078","Low Sweep","Dewford Gym, from Brawly after defeating him"),
    ("TM","079","Dark Pulse","Lavaridge Town's outdoor Mart worker"),
    ("TM","080","Rock Slide","Mauville City's Game Corner"),
    ("TM","081","X-Scissor","Route 113, Northeast of the Twins"),
    ("TM","082","Sleep Talk","Mauville City's Game Corner"),
    ("TM","083","Scald","Route 111, from Dawn after defeating her"),
    ("TM","084","Poison Jab","Mauville City's Game Corner"),
    ("TM","085","Future Sight","Petalburg City, from Wally's dad after defeating Norman"),
    ("TM","086","Grass Knot","Trick House, reward for completing second puzzle"),
    ("TM","087","Low Kick","Dewford Town's outdoor Mart workers"),
    ("TM","088","Pluck","Dewford Town's outdoor Mart workers"),
    ("TM","089","U-Turn","Petalburg Woods, from Gardenia after defeating her"),
    ("TM","090","Substitute","Fortree City, from creator iriv24 after defeating him"),
    ("TM","091","Flash Cannon","Route 111, from Dawn after defeating her"),
    ("TM","092","Volt Switch","Mauville City's gym, from Wattson after defeating him"),
    ("TM","093","Dragon Tail","Mauville City's Game Corner"),
    ("TM","094","Trailblaze","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","095","Acrobatics","Fortree City, from Winona after defeating her"),
    ("TM","096","Bulldoze","Rustboro gym, from Roxanne after defeating her"),
    ("TM","097","Snarl","Dewford Town's outdoor Mart workers"),
    ("TM","098","Work Up","Verdanturf Town, from Ursula after defeating her in a \"dance battle\""),
    ("TM","099","Wild Charge","New Mauville, on the ground"),
    ("TM","100","Dual Wingbeat","Petalburg City, from Wally's dad after defeating Norman"),
    ("TM","101","Superpower","New Mauville, on the ground"),
    ("TM","102","Scorching Sands","Mauville City's Game Corner"),
    ("TM","103","Smack Down","Dewford Town's outdoor Mart workers"),
    ("TM","104","Heat Crash","Lavaridge Town, from Flannery after defeating her"),
    ("TM","105","Body Press","Jagged Pass, from Maylene after defeating her"),
    ("TM","106","Trick Room","Mossdeep City, from Tate and Liza after defeating them"),
    ("TM","107","Brave Bird","Fortree City, from Winona after defeating her"),
    ("TM","108","Ice Spinner","Mauville City's Game Corner"),
    ("TM","109","Bug Bite","Route 104, from the man close to the northern exit of Petalburg Woods"),
    ("TM","110","Stomping Tantrum","Route 104, past the tree that needs Cut North of the Woods"),
    ("TM","111","Fire Punch","Route 110, from Rival after defeating them"),
    ("TM","112","Ice Punch","Route 110, from Rival after defeating them"),
    ("TM","113","Thunder Punch","Route 110, from Rival after defeating them"),
    ("TM","114","Fire Fang","Route 110, from Rival after defeating them"),
    ("TM","115","Ice Fang","Route 110, from Rival after defeating them"),
    ("TM","116","Thunder Fang","Route 110, from Rival after defeating them"),
    ("TM","117","Psychic Fangs","Route 110, from Rival after defeating them"),
    ("TM","118","Poison Fang","Route 110, from Rival after defeating them"),
    ("TM","119","Iron Head","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","120","Liquidation","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","121","Hydro Pump","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","122","Drill Run","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","123","Blaze Kick","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","124","Pain Split","Route 120, central part of the route, requires Surf"),
    ("TM","125","Zen Headbutt","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","126","Weather Ball","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","127","Air Slash","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","128","Hex","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","129","Mystical Fire","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","130","Seed Bomb","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","131","Leaf Blade","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","132","Knock Off","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","133","Power Gem","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","134","Rock Blast","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","135","Pin Missile","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","136","Icicle Spear","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","137","Tail Slap","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","138","Arm Thrust","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","139","Foul Play","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","140","Iron Defense","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","141","Nasty Plot","Petalburg City, from Norman after defeating him"),
    ("TM","142","Earth Power","Jagged Pass, on the ground along the East side"),
    ("TM","143","Aura Sphere","Jagged Pass, from Maylene after defeating her"),
    ("TM","144","Heat Wave","Lavaridge Town, from Flannery after defeating her"),
    ("TM","145","Hurricane","Fortree City, from Winona after defeating her"),
    ("TM","146","Power Whip","Trick House, reward for completing second puzzle"),
    ("TM","147","High Horsepower","Route 120, from Byron after defeating him"),
    ("TM","148","Bug Buzz","Trick House, reward for completing second puzzle"),
    ("TM","149","Phantom Force","Route 115, on the ground, requires Surf"),
    ("TM","150","Flare Blitz","Lavaridge Town, from Flannery after defeating her"),
    ("TM","151","Stored Power","Fortree City, from the old woman after completing her puzzle"),
    ("TM","152","Gunk Shot","Trick House, reward for completing first puzzle"),
    ("TM","153","Tailwind","Fortree City, from Winona after defeating her"),
    ("TM","154","Megahorn","Trick House, reward for completing second puzzle"),
    ("TM","155","Draco Meteor","Evergrande City, from Dawn after defeating her and Rival"),
    ("TM","156","Close Combat","Mauville City, from Wattson after shutting down the generator in New Mauville"),
    ("TM","157","Moonblast","Sootopolis City, from Juan after defeating him"),
    ("TM","158","Body Slam","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","159","Play Rough","Fallarbor Town, from the former Move Tutor after defeating Flannery"),
    ("TM","160","Water Pulse","Route 118, on the ground, past two trainers"),
    ("TM","161","Dark Hole","Post game Meteor Falls, Steven's Room on the ground"),
    ("TM","162","Sludge Wave","Mt. Pyre, outside on a rocky ledge"),
    ("TM","163","Supercell Slam","Evergrande City, from Volkner after defeating him"),
    ("TM","164","Temper Flare","Fiery Path, on the ground in the northwest corner, requires Strength"),
    ("TM","165","Scale Shot","Victory Road, floor B2F on the ground, must fight Expert to reach"),
    ("TM","166","Psychic Noise","Granite Cave, floor B2F on the ground, requires Mach Bike"),
    ("TM","167","Alluring Voice","Rusturf Tunnel, on the ground near the Verdanturf Town entrance"),
    ("TM","168","Vacuum Wave","Route 110, on the ground below Cycling Road"),
    ("TM","169","Spikes","Mauville City's Game Corner"),
    ("TM","170","Steel Beam","Post game Mart at the Battle Frontier"),
    ("TM","171","Draco Barrage","Post game Mart at the Battle Frontier"),
    ("TM","172","Heavy Slam","Route 125, from Roark after defeating him"),
    ("TM","173","Gravity","Mauville City's Game Corner"),
    ("TM","174","Misty Explosion","Sootopolis City, from Juan after defeating him; Post game Mart at the Battle Frontier"),
    # HMs
    ("HM","01","Cut","Rustboro City, from the man in the house next to the Poke Center after defeating Roxanne"),
    ("HM","02","Fly","Route 110, from your Rival after defeating them"),
    ("HM","03","Surf","Route 111, very south past the 3 boss battles"),
    ("HM","04","Strength","Rusturf Tunnel, after smashing the rock separating the couple"),
    ("HM","05","Flash","Granite Cave, from a hiker at the entrance"),
    ("HM","06","Rock Smash","Mauville City, from the Rock Smash Dude in his house"),
    ("HM","07","Waterfall","Sootopolis City, from Wallace in front of the Gym"),
    ("HM","08","Dive","Mossdeep City in Steven's House after you beat Tate and Liza"),
]

def _build_ei_tms(move_type: dict) -> list:
    result = []
    for kind, num, move, loc in _EI_TM_RAW:
        code = f"{kind}{num}"
        result.append({
            "id":       f"ei-{code.lower()}",
            "code":     code,
            "move":     move,
            "type":     move_type.get(move.lower()),
            "location": loc,
        })
    return result

EI_TMS_HARDCODED = _build_ei_tms({**EI_MOVE_TYPE_EXTRAS,
    'rain dance':'water','sunny day':'fire','snowscape':'ice','sandstorm':'rock',
    'cut':'normal','fly':'flying','surf':'water','strength':'normal','flash':'normal',
    'rock smash':'fighting','waterfall':'water','dive':'water',
    'dragon claw':'dragon','flip turn':'water','roar':'normal','toxic':'poison',
    'ice beam':'ice','blizzard':'ice','electroweb':'electric','light screen':'psychic',
    'protect':'normal','giga drain':'grass','hyper voice':'normal','icy wind':'ice',
    'thunderbolt':'electric','thunder':'electric','earthquake':'ground','return':'normal',
    'dig':'ground','psychic':'psychic','shadow ball':'ghost','brick break':'fighting',
    'reflect':'psychic','teleport':'psychic','flamethrower':'fire','sludge bomb':'poison',
    'fire blast':'fire','rock tomb':'rock','low kick':'fighting','facade':'normal',
    'defog':'flying','rest':'normal','thief':'dark','steel wing':'steel',
    'leech life':'bug','overheat':'fire','roost':'flying','focus blast':'fighting',
    'energy ball':'grass','grassy glide':'grass','expanding force':'psychic',
    'stone edge':'rock','thunder wave':'electric','gyro ball':'steel',
    'dark pulse':'dark','rock slide':'rock','x-scissor':'bug','sleep talk':'normal',
    'scald':'water','poison jab':'poison','future sight':'psychic','grass knot':'grass',
    'aerial ace':'flying','pluck':'flying','u-turn':'bug','flash cannon':'steel',
    'volt switch':'electric','dragon tail':'dragon','wild charge':'electric',
    'dual wingbeat':'flying','superpower':'fighting','scorching sands':'ground',
    'trick room':'psychic','brave bird':'flying','ice spinner':'ice',
    'triple axel':'ice','scale shot':'dragon','bulldoze':'ground',
    'dual chop':'dragon','low sweep':'fighting','poltergeist':'ghost',
    'rising voltage':'electric','dragon pulse':'dragon','drain punch':'fighting',
    'will-o-wisp':'fire','venoshock':'poison','explosion':'normal',
    'shadow claw':'ghost','bullet seed':'grass','hidden power':'normal',
    'taunt':'dark','heat crash':'fire','water pulse':'water','snarl':'dark',
})


def ei_item_parse_tms(wb, rr_move_type: dict[str, str] | None = None):
    """Parse TMs & HMs from the EI item xlsx.

    The local xlsx uses an old column format that no longer matches the Drive
    source of truth (174 Hoenn-based TMs + 8 HMs).  We detect if the sheet
    returned useful data; if not, we return the Drive-sourced hardcoded list.
    """
    move_type = {**(rr_move_type or {}), **EI_MOVE_TYPE_EXTRAS}
    rows = rows_of(wb, "TMs & HMs")
    tms = []
    for row in rows:
        label = get(row, 0)
        if not label:
            continue
        # Drive format: "TM001 - Focus Punch" / "HM01 - Cut"
        m = re.match(r"^(TM|HM)(\d+)\s*-\s*(.+)$", label, re.IGNORECASE)
        if m:
            kind, num, move = m.group(1).upper(), m.group(2).zfill(2), m.group(3).strip()
            loc = (get(row, 1) or "").replace("\n", " ").strip() or None
            code = f"{kind}{num}"
            tms.append({
                "id":       f"ei-{code.lower()}",
                "code":     code,
                "move":     move,
                "type":     move_type.get(move.lower()),
                "location": loc,
            })
    if tms:
        return tms
    # Local xlsx is outdated — fall back to Drive-sourced hardcoded list.
    print("  [ei_item_parse_tms] local xlsx format mismatch; using hardcoded Drive data")
    return EI_TMS_HARDCODED


# Hardcoded from "Item (TMs, Mega Stones, etc) and Useful NPC Locations - Emerald Emperium.xlsx".
# EI converted traditional tutor moves to TMs (TM109–TM174); only service NPCs remain.
EI_TUTORS_HARDCODED = [
    {"move": "Move Relearner", "location": "Dewford Town, house directly north of Mr. Briney's dock"},
    {"move": "Move Deleter",   "location": "Slateport City, house in the northwest part of the city"},
    {"move": "Egg Move Tutor", "location": "Lilycove City, house directly east of the department store"},
]


def ei_item_parse_tutors(wb):
    return EI_TUTORS_HARDCODED


def ei_item_parse_mega(wb):
    rows = rows_of(wb, "Mega Stones")
    megas = []
    pending_left = pending_right = None
    for row in rows:
        left_stone  = get(row, 5)   # col F — stone name (left panel)
        right_stone = get(row, 22)  # col W — stone name (right panel)
        left_loc    = get(row, 4)   # col E — location (left panel)
        right_loc   = get(row, 21)  # col V — location (right panel)

        if left_stone or right_stone:
            pending_left  = left_stone
            pending_right = right_stone
        elif (left_loc or right_loc) and (pending_left or pending_right):
            if pending_left:
                megas.append({
                    "stone":    pending_left,
                    "location": (left_loc or "").replace("\n", " ").strip() or None,
                })
            if pending_right:
                megas.append({
                    "stone":    pending_right,
                    "location": (right_loc or "").replace("\n", " ").strip() or None,
                })
            pending_left = pending_right = None
    return megas


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    rr_path      = ROOT / "Radical Red 4.1 Docs Normal Mode.xlsx"
    ei_path      = ROOT / "Emerald Emperium - Boss Battles.xlsx"
    ei_item_path = ROOT / "Item (TMs, Mega Stones, etc) and Useful NPC Locations - Emerald Emperium.xlsx"

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

    print("Parsing Emerald Imperium battles...")
    ei_locations = ei_parse_battles(ei_wb)
    ei_caps, ei_codes = ei_parse_caps_and_codes(ei_wb)

    ei_tms = ei_tutors = ei_mega = []
    if ei_item_path.exists():
        print("Parsing Emerald Imperium items...")
        ei_item_wb = openpyxl.load_workbook(ei_item_path, data_only=True)
        rr_move_type = {t["move"].lower(): t["type"].lower() for t in rr_tms if t["move"] and t["type"]}
        ei_tms    = ei_item_parse_tms(ei_item_wb, rr_move_type)
        ei_tutors = ei_item_parse_tutors(ei_item_wb)
        ei_mega   = ei_item_parse_mega(ei_item_wb)
    else:
        print(f"Warning: {ei_item_path.name} not found — EI TMs/tutors/megas will be empty")

    ei_out = {
        "game":       "emerald-imperium",
        "locations":  ei_locations,
        "tms":        ei_tms,
        "tutors":     ei_tutors,
        "megaStones": ei_mega,
        "levelCaps":  ei_caps,
        "codes":      ei_codes,
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
    print(f"                  {len(ei_tms)} TMs/HMs, {len(ei_tutors)} tutors, {len(ei_mega)} mega stones")
    print(f"                  {len(ei_caps)} level caps, {len(ei_codes)} codes")
    print(f"\nOutput: {OUT_DIR}/")


if __name__ == "__main__":
    main()
