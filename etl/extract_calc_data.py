#!/usr/bin/env python3
"""
Extract move + species override data from hzla/Dynamic-Calc-Decomps backup JS files.
Produces:
  lib/calc/radical-red-overrides.json
  lib/calc/emerald-imperium-overrides.json
"""

import json, re, urllib.request
from pathlib import Path

ROOT    = Path(__file__).parent.parent
OUT_DIR = ROOT / "lib" / "calc"
OUT_DIR.mkdir(parents=True, exist_ok=True)

RAW = "https://raw.githubusercontent.com/hzla/Dynamic-Calc-Decomps/decomp/backups"

FILES = {
    "radical-red":      f"{RAW}/radrednm.js",
    "emerald-imperium": f"{RAW}/imp_1-3.js",
}

# ─── JS → JSON parser ─────────────────────────────────────────────────────────

def extract_js_var(src: str, var_name: str) -> str | None:
    """Extract the JS object literal assigned to var_name."""
    pattern = re.compile(rf'\b{re.escape(var_name)}\s*=\s*(\{{)', re.DOTALL)
    m = pattern.search(src)
    if not m:
        return None
    start = m.start(1)
    depth = 0
    for i, ch in enumerate(src[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return None

def js_to_json(s: str) -> str:
    """Best-effort JS object → JSON conversion."""
    # Remove single-line comments
    s = re.sub(r'//[^\n]*', '', s)
    # Remove block comments
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.DOTALL)
    # Remove trailing commas before } or ]
    s = re.sub(r',\s*([}\]])', r'\1', s)
    # Quote unquoted keys (word chars followed by colon)
    s = re.sub(r'(?<!["\w])([A-Za-z_$][A-Za-z0-9_$]*)\s*:', r'"\1":', s)
    # Convert single-quoted strings to double-quoted (simple cases)
    s = re.sub(r"'([^'\\]*)'", r'"\1"', s)
    # JS true/false/null are already valid JSON
    return s

def parse_js_object(src: str, var_name: str) -> dict | None:
    raw = extract_js_var(src, var_name)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = js_to_json(raw)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"  ⚠ Failed to parse '{var_name}': {e}")
            return None

# ─── Data extraction ──────────────────────────────────────────────────────────

STAT_KEY_MAP = {
    "hp": "hp", "at": "atk", "atk": "atk",
    "df": "def", "def": "def", "sa": "spa", "spa": "spa",
    "sd": "spd", "spd": "spd", "sp": "spe", "spe": "spe",
}

TYPE_NORMALIZE = {
    "typeless": "Normal",
}

def normalize_type(t: str) -> str:
    return TYPE_NORMALIZE.get(t.lower(), t)


def extract_move_overrides(backup_moves: dict) -> dict:
    """
    Extract move properties relevant to @smogon/calc overrides.
    Returns: { moveName: { basePower, type, flags... } }
    """
    out = {}
    for name, data in backup_moves.items():
        if not isinstance(data, dict) or name == "-":
            continue
        entry: dict = {}
        if "bp" in data:
            entry["basePower"] = int(data["bp"])
        if "type" in data:
            entry["type"] = normalize_type(str(data["type"]))
        # Priority
        if "priority" in data:
            entry["priority"] = int(data["priority"])
        # Multihit
        if "multihit" in data:
            entry["multihit"] = data["multihit"]
        # Flags — keep a curated subset useful for the calc
        flags = data.get("flags", {}) or {}
        if flags.get("makesContact"):
            entry["flags"] = entry.get("flags", {})
            entry["flags"]["contact"] = True
        if name:
            out[name] = entry
    return out


def extract_species_overrides(poks: dict) -> dict:
    """
    Extract species stat/type overrides.
    Returns: { speciesName: { baseStats: {...}, types: [...] } }
    """
    out = {}
    for name, data in poks.items():
        if not isinstance(data, dict):
            continue
        entry: dict = {}
        # Base stats
        stats: dict = {}
        for raw_key, val in data.items():
            k = STAT_KEY_MAP.get(raw_key.lower())
            if k and val is not None:
                try:
                    stats[k] = int(val)
                except (ValueError, TypeError):
                    pass
        if stats:
            entry["baseStats"] = stats
        # Types
        t = data.get("type") or data.get("types")
        if t:
            if isinstance(t, str):
                t = [t]
            entry["types"] = [normalize_type(x) for x in t if x]
        if entry:
            out[name] = entry
    return out


def download(url: str) -> str:
    print(f"  Downloading {url.split('/')[-1]} …")
    req = urllib.request.Request(url, headers={"User-Agent": "pokemon-app/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


# ─── Hardcoded inline adjustments from hzla initialize.js ────────────────────
# These are stat/type tweaks applied inline for each game that don't appear in
# the backup_moves / poks objects.

EI_EXTRA_SPECIES: dict = {
    "Raichu": {"types": ["Electric", "Normal"]},
    "Unfezant": {"baseStats": {"spe": 103}},  # +10 speed
}

EI_EXTRA_MOVES: dict = {
    "Flash Cannon": {"flags": {}},  # isPulse removed
    "Fury Attack":  {"basePower": 20},
    "Mighty Cleave": {"basePower": 90},
}

RR_EXTRA_SPECIES: dict = {}
RR_EXTRA_MOVES: dict   = {}


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    extras_species = {"radical-red": RR_EXTRA_SPECIES, "emerald-imperium": EI_EXTRA_SPECIES}
    extras_moves   = {"radical-red": RR_EXTRA_MOVES,   "emerald-imperium": EI_EXTRA_MOVES}

    for game, url in FILES.items():
        print(f"\n{'='*50}")
        print(f"Processing {game} …")
        src = download(url)
        print(f"  File size: {len(src):,} chars")

        moves_raw = parse_js_object(src, "backup_moves")
        poks_raw  = parse_js_object(src, "poks")

        if moves_raw:
            print(f"  backup_moves: {len(moves_raw):,} entries")
        else:
            print("  ⚠ backup_moves not found")
            moves_raw = {}

        if poks_raw:
            print(f"  poks: {len(poks_raw):,} entries")
        else:
            print("  ⚠ poks not found")
            poks_raw = {}

        move_overrides    = extract_move_overrides(moves_raw)
        species_overrides = extract_species_overrides(poks_raw)

        # Apply hardcoded extras
        for name, patch in extras_species[game].items():
            if name in species_overrides:
                species_overrides[name].update(patch)
            else:
                species_overrides[name] = patch

        for name, patch in extras_moves[game].items():
            if name in move_overrides:
                move_overrides[name].update(patch)
            else:
                move_overrides[name] = patch

        out = {
            "game":    game,
            "dmgGen":  8,
            "moves":   move_overrides,
            "species": species_overrides,
        }

        path = OUT_DIR / f"{game}-overrides.json"
        path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
        print(f"  → {path.name}  ({path.stat().st_size:,} bytes)")
        print(f"     {len(move_overrides)} move overrides, {len(species_overrides)} species overrides")


if __name__ == "__main__":
    main()
