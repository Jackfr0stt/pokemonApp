#!/usr/bin/env python3
"""Download sprites for all unique species from PokeAPI GitHub CDN."""

import json, re, time, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT      = Path(__file__).parent.parent
DATA_DIR  = ROOT / "lib" / "data"
SPRITE_DIR = ROOT / "assets" / "sprites" / "static"
SPRITE_DIR.mkdir(parents=True, exist_ok=True)

SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"

# ─── Name → PokeAPI slug ─────────────────────────────────────────────────────

MANUAL_MAP = {
    # ROM-hack / spreadsheet name: pokeapi slug
    "nidoran-f":          "nidoran-f",
    "nidoran-m":          "nidoran-m",
    "mr-mime":            "mr-mime",
    "mr-rime":            "mr-rime",
    "mime-jr":            "mime-jr",
    "type-null":          "type-null",
    "jangmo-o":           "jangmo-o",
    "hakamo-o":           "hakamo-o",
    "kommo-o":            "kommo-o",
    "tapu-koko":          "tapu-koko",
    "tapu-lele":          "tapu-lele",
    "tapu-bulu":          "tapu-bulu",
    "tapu-fini":          "tapu-fini",
    "chi-yu":             "chi-yu",
    "chien-pao":          "chien-pao",
    "ting-lu":            "ting-lu",
    "wo-chien":           "wo-chien",
    "iron-leaves":        "iron-leaves",
    "iron-moth":          "iron-moth",
    "iron-hands":         "iron-hands",
    "iron-bundle":        "iron-bundle",
    "iron-jugulis":       "iron-jugulis",
    "iron-thorns":        "iron-thorns",
    "iron-valiant":       "iron-valiant",
    "great-tusk":         "great-tusk",
    "scream-tail":        "scream-tail",
    "brute-bonnet":       "brute-bonnet",
    "flutter-mane":       "flutter-mane",
    "slither-wing":       "slither-wing",
    "sandy-shocks":       "sandy-shocks",
    "roaring-moon":       "roaring-moon",
    "koraidon":           "koraidon",
    "miraidon":           "miraidon",
    "calyrex-shadow":     "calyrex-shadow",
    "calyrex-ice":        "calyrex-ice",
    "urshifu-rapid-strike": "urshifu-rapid-strike",
    "urshifu":            "urshifu",
    "basculegion-f":      "basculegion-female",
    "basculegion":        "basculegion",
    "rotom-mow":          "rotom-mow",
    "rotom-wash":         "rotom-wash",
    "rotom-heat":         "rotom-heat",
    "rotom-fan":          "rotom-fan",
    "rotom-frost":        "rotom-frost",
    "aegislash-both":     "aegislash-blade",
    "aegislash-blade":    "aegislash-blade",
    "aegislash-shield":   "aegislash-shield",
    "wormadam-trash":     "wormadam-trash",
    "wormadam-sandy":     "wormadam-sandy",
    "lycanroc-midnight":  "lycanroc-midnight",
    "lycanroc-dusk":      "lycanroc-dusk",
    "lycanroc":           "lycanroc",
    "meowstic-f":         "meowstic-female",
    "meowstic":           "meowstic",
    "indeedee-f":         "indeedee-female",
    "indeedee":           "indeedee",
    "morpeko":            "morpeko",
    "eiscue":             "eiscue",
    "zacian":             "zacian",
    "zamazenta":          "zamazenta",
    "eternatus":          "eternatus",
    "kubfu":              "kubfu",
    "zarude":             "zarude",
    "regieleki":          "regieleki",
    "regidrago":          "regidrago",
    "glastrier":          "glastrier",
    "spectrier":          "spectrier",
    "enamorus":           "enamorus",
    "tornadus":           "tornadus",
    "thundurus":          "thundurus",
    "landorus":           "landorus",
    "ogerpon":            "ogerpon",
    "terapagos":          "terapagos",
    "pecharunt":          "pecharunt",
}

FORM_SUFFIXES = {
    # spreadsheet suffix → pokeapi suffix
    "-mega":      "-mega",
    "-mega-x":    "-mega-x",
    "-mega-y":    "-mega-y",
    "mega":       "-mega",         # "Absol Mega" style
    "-gmax":      "-gmax",
    "-alola":     "-alola",
    "alola":      "-alola",
    "alolan":     "-alola",
    "-galar":     "-galar",
    "galarian":   "-galar",
    "-hisui":     "-hisui",
    "hisuian":    "-hisui",
    "-paldea":    "-paldea",
    "paldean":    "-paldea",
    "-h":         "-hisui",
    "-a":         "-alola",
    "-g":         "-galar",
}


def to_slug(name: str) -> str:
    """Convert a spreadsheet species name to a PokeAPI slug (best effort)."""
    s = name.lower().strip()

    # Check manual overrides first (exact match)
    if s in MANUAL_MAP:
        return MANUAL_MAP[s]

    # Normalize separators and special chars
    s = re.sub(r"[''']", "", s)
    s = re.sub(r"[♀♂]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = s.strip("-")

    # Check manual overrides after normalization
    if s in MANUAL_MAP:
        return MANUAL_MAP[s]

    # Strip trailing -m / -f (gender from RR spreadsheet)
    s = re.sub(r"-(m|f)$", "", s)

    # Handle "alolan-X" → "X-alola"
    m = re.match(r"^(alolan?|galarian?|hisuian?|paldean?)-(.+)$", s)
    if m:
        region_map = {"alola": "alola", "alolan": "alola",
                      "galar": "galar", "galarian": "galar",
                      "hisui": "hisui", "hisuian": "hisui",
                      "paldea": "paldea", "paldean": "paldea"}
        region = region_map.get(m.group(1), m.group(1))
        return f"{m.group(2)}-{region}"

    # Handle "X Mega" (space before mega)
    s = re.sub(r"-mega-([xy])$", r"-mega-\1", s)

    # "wooper-paldea" → "wooper-paldea" (already correct)
    # "marowak-alola" → "marowak-alola" (already correct)

    return s


def base_slug(slug: str) -> str:
    """Strip form suffix to get base species slug."""
    for suffix in ["-mega-x", "-mega-y", "-mega", "-gmax", "-alola", "-galar", "-hisui", "-paldea"]:
        if slug.endswith(suffix):
            return slug[: -len(suffix)]
    return slug


def fetch_sprite(slug: str) -> bytes | None:
    """Fetch sprite PNG from PokeAPI CDN by trying the API endpoint."""
    url = f"https://pokeapi.co/api/v2/pokemon/{slug}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pokemon-app-personal/1.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        sprite_url = data.get("sprites", {}).get("front_default")
        if not sprite_url:
            return None
        with urllib.request.urlopen(sprite_url, timeout=8) as r:
            return r.read()
    except Exception:
        return None


def download_one(species: str):
    slug = to_slug(species)
    out_path = SPRITE_DIR / f"{slug}.png"

    if out_path.exists():
        return slug, "cached"

    img = fetch_sprite(slug)
    if img is None:
        # Try base form
        base = base_slug(slug)
        if base != slug:
            img = fetch_sprite(base)
            if img:
                slug = base
                out_path = SPRITE_DIR / f"{slug}.png"

    if img:
        out_path.write_bytes(img)
        return slug, "ok"
    return slug, "miss"


def main():
    # Collect unique species
    species_set: set[str] = set()
    for fname in ["radical-red.json", "emerald-imperium.json"]:
        data = json.loads((DATA_DIR / fname).read_text())
        for loc in data["locations"]:
            for t in loc["trainers"]:
                for mon in t["team"]:
                    s = mon.get("species")
                    if s:
                        species_set.add(s)

    species_list = sorted(species_set)
    print(f"Downloading sprites for {len(species_list)} unique species…")

    ok = miss = cached = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download_one, sp): sp for sp in species_list}
        for i, fut in enumerate(as_completed(futures), 1):
            slug, status = fut.result()
            if status == "ok":      ok += 1
            elif status == "cached": cached += 1
            else:                   miss += 1
            if i % 50 == 0 or i == len(species_list):
                print(f"  {i}/{len(species_list)}  ok={ok}  cached={cached}  miss={miss}")

    print(f"\nDone — {ok} downloaded, {cached} already cached, {miss} not found (will use placeholder)")
    print(f"Sprites saved to: {SPRITE_DIR}")


if __name__ == "__main__":
    main()
