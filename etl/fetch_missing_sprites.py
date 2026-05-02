#!/usr/bin/env python3
"""
Fetch sprites for every species listed in missing-sprites.md.
Saves files as <app-slug>.png so the spriteResolver can find them without changes.
"""

import json, re, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT       = Path(__file__).parent.parent
SPRITE_DIR = ROOT / "assets" / "sprites" / "static"
SPRITE_DIR.mkdir(parents=True, exist_ok=True)

# ─── Species list from missing-sprites.md ────────────────────────────────────
MISSING = [
    # Unevolved / mid-evolution
    "Abra","Aipom","Applin","Arrokuda","Avalugg","Axew","Baltoy","Banette",
    "Barboach","Basculin","Basculin-Blue","Bellsprout","Bergmite","Bewear",
    "Bidoof","Binacle","Bisharp","Blipbug","Blitzle","Boldore","Bonsly",
    "Bounsweet","Bramblin","Bronzor","Brute Bonnet","Bruxish","Budew","Buizel",
    "Bunnelby","Burmy","Burmy-Sandy","Burmy-Trash","Cacnea","Capsakid","Carkol",
    "Carnivine","Castform","Caterpie","Charjabug","Cherubi","Chewtle","Chimecho",
    "Chinchou","Chingling","Clauncher","Clobbopus","Cofagrigus","Combee","Comfey",
    "Corsola","Cottonee","Crabrawler","Cranidos","Croagunk","Cubchoo","Cubone",
    "Cufant","Cutiefly","Darumaka","Deerling","Deerling-Autumn","Deerling-Summer",
    "Deerling-Winter","Dewpider","Dhelmise","Doduo","Dondozo","Dragalge",
    "Drifloon","Drilbur","Drowzee","Druddigon","Ducklett","Dunsparce","Dusclops",
    "Dwebble","Eevee","Ekans","Electabuzz","Electrode","Elekid","Elgyem","Emolga",
    "Escavalier","Espurr","Exeggcute","Falinks","Fearow","Feebas","Fidough",
    "Finneon","Flabébé","Fletchling","Fomantis","Foongus","Frillish","Furfrou",
    "Gastly","Geodude","Gimmighoul","Girafarig","Goldeen","Golett","Gossifleur",
    "Gothita","Grapploct","Greavard","Grimer","Grubbin","Grumpig","Hatenna",
    "Haunter","Helioptile","Hippopotas","Hoothoot","Hoppip","Horsea","Illumise",
    "Inkay","Jellicent","Joltik","Karrablast","Kecleon","Klawf","Klefki","Krabby",
    "Kricketot","Lampent","Lechonk","Ledyba","Lickitung","Lilligant","Lillipup",
    "Litleo","Lotad","Lurantis","Machop","Magby","Magikarp","Magmar","Magnemite",
    "Makuhita","Mankey","Mantyke","Maractus","Mareanie","Mareep","Marill","Marowak",
    "Maschiff","Meditite","Meltan","Meowth","Mienfoo","Mime Jr.","Minccino",
    "Morelull","Morgrem","Morpeko","Mudbray","Muk","Munchlax","Munna","Murkrow",
    "Nacli","Natu","Nickit","Nidoran-F","Nidoran-M","Nincada","Numel","Nymble",
    "Oddish","Oranguru","Oricorio","Pachirisu","Pancham","Panpour","Pansage",
    "Pansear","Paras","Passimian","Patrat","Pawmi","Petilil","Phanpy","Phantump",
    "Pidgey","Pidove","Pikachu","Pikipek","Pineco","Poliwag","Poliwhirl",
    "Poltchageist","Ponyta","Porygon","Primeape","Psyduck","Pumpkaboo","Purrloin",
    "Pyukumuku","Ralts","Raticate","Rattata","Rellor","Remoraid","Riolu","Rockruff",
    "Roggenrola","Rolycoly","Rookidee","Roselia","Rotom","Sandile","Sandshrew",
    "Sandslash","Sandygast","Sawk","Scatterbug","Scraggy","Seadra","Sealeo",
    "Seedot","Seel","Seismitoad","Sentret","Sewaddle","Shellder","Shellos",
    "Shellos-East","Shelmet","Shieldon","Shinx","Shroodle","Shroomish","Shuckle",
    "Shuppet","Silicobra","Sinistea","Sizzlipede","Skiddo","Skitty","Skorupi",
    "Skrelp","Skuntank","Skwovet","Slakoth","Slowbro","Slowpoke","Slugma",
    "Smoliv","Smoochum","Sneasel","Snom","Snorunt","Snubbull","Solosis","Spearow",
    "Spinarak","Spritzee","Stantler","Staryu","Stonjourner","Stunky","Sunkern",
    "Surskit","Swablu","Swadloon","Swalot","Swinub","Swirlix","Tadbulb","Taillow",
    "Tandemaus","Tarountula","Tauros","Tauros-Aqua","Tauros-Blaze","Tauros-Combat",
    "Teddiursa","Tentacool","Throh","Timburr","Tinkatink","Toedscool","Togepi",
    "Trapinch","Trubbish","Tympole","Tynamo","Type: Null","Tyrogue","Unown",
    "Vanillite","Vanilluxe","Venipede","Venonat","Volbeat","Voltorb","Vullaby",
    "Vulpix","Wailmer","Wailord","Weedle","Weezing","Whirlipede","Whismur",
    "Wiglett","Wimpod","Wingull","Wishiwashi","Woobat","Wooloo","Wooper","Wurmple",
    "Xatu","Yamask","Yamper","Yanma","Yungoos","Zangoose","Zigzagoon","Zorua",
    "Zubat",
    # Regional forms
    "Corsola-Galar","Diglett-Alola","Grimer-Alola","Meowth-Alola","Meowth-Galar",
    "Mr. Mime-Galar","Ponyta-Galar","Raticate-Alola","Rattata-Alola",
    "Sandshrew-Alola","Sandslash-Alola","Slowpoke-Galar","Squawkabilly",
    "Squawkabilly-G","Squawkabilly-W","Ursaluna-BM","Vulpix-Alola","Yamask-Galar",
    "Zigzagoon-Galar","Zorua-Hisui",
    # EI additional
    "Arctibax","Aromatisse","Azurill","Bagon","Beldum","Braviary","Buzzwole",
    "Cleffa","Cosmog","Deino","Diancie","Diglett","Doublade","Drakloak","Dratini",
    "Dreepy","Drifblim","Duosion","Duskull","Eldegoss","Finizen","Flaaffy",
    "Floette","Fraxure","Frigibax","Gible","Glastrier","Gogoat","Goomy",
    "Gothorita","Hakamo-o","Happiny","Honedge","Igglybuff","Impidimp","Jangmo-o",
    "Kabuto","Kadabra","Klang","Klink","Koffing","Krokorok","Lairon","Larvesta",
    "Larvitar","Linoone","Litwick","Manaphy","Mandibuzz","Milcery","Mr. Mime",
    "Naclstack","Necrozma","Nidorina","Nidorino","Noctowl","Nuzleaf","Omanyte",
    "Phione","Pichu","Pidgeotto","Poipole","Probopass","Pupitar","Quagsire",
    "Shaymin","Shelgon","Sliggoo","Spectrier","Steenee","Swoobat","Tangela",
    "Ting-Lu","Tinkatuff","Tirtouga","Toxel","Trevenant","Tyrunt","Ursaring",
    "Vibrava","Wynaut","Zweilous",
]

# ─── App slug (what the spriteResolver expects as the filename stem) ──────────

def app_slug(name: str) -> str:
    """Convert display name → the slug used as the PNG filename in assets/."""
    s = name.lower().strip()
    s = re.sub(r"[''']", "", s)
    s = re.sub(r"[♀♂]", "", s)
    s = re.sub(r"[éèêë]", "e", s)  # flabébé → flabebe
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s

# ─── Mapping: app slug → PokeAPI slug (when they differ) ─────────────────────

POKEAPI_SLUG: dict[str, str] = {
    # special chars / punctuation
    "flabebe":            "flabebe",
    "type-null":          "type-null",
    "mr-mime":            "mr-mime",
    "mr-mime-galar":      "mr-mime-galar",
    "mime-jr":            "mime-jr",
    "jangmo-o":           "jangmo-o",
    "hakamo-o":           "hakamo-o",
    "nidoran-f":          "nidoran-f",
    "nidoran-m":          "nidoran-m",
    # Basculin forms
    "basculin-blue":      "basculin-blue-striped",
    # Deerling seasons
    "deerling-autumn":    "deerling-autumn",
    "deerling-summer":    "deerling-summer",
    "deerling-winter":    "deerling-winter",
    # Tauros Paldean breeds
    "tauros-aqua":        "tauros-paldea-aqua-breed",
    "tauros-blaze":       "tauros-paldea-blaze-breed",
    "tauros-combat":      "tauros-paldea-combat-breed",
    # Ursaluna Blood Moon
    "ursaluna-bm":        "ursaluna-bloodmoon",
    # Squawkabilly plumages
    "squawkabilly-g":     "squawkabilly-green-plumage",
    "squawkabilly-w":     "squawkabilly-white-plumage",
    # Zorua Hisuian
    "zorua-hisui":        "zorua-hisui",
    # Shellos East Sea
    "shellos-east":       "shellos-east",
    # Burmy forms
    "burmy-sandy":        "burmy-sandy",
    "burmy-trash":        "burmy-trash",
    # Paradox / UBs with spaces
    "brute-bonnet":       "brute-bonnet",
    "ting-lu":            "ting-lu",
    # Misc
    "farfetchd":          "farfetchd",
    "sirfetchd":          "sirfetchd",
    # Form-only Pokémon — map base slug to a canonical form
    "oricorio":           "oricorio-baile",
    "morpeko":            "morpeko-full-belly",
    "wishiwashi":         "wishiwashi-solo",
    "pumpkaboo":          "pumpkaboo-average",
    "shaymin":            "shaymin-land",
    "frillish":           "frillish-male",
    "jellicent":          "jellicent-male",
    "basculin":           "basculin-red-striped",
    "squawkabilly":       "squawkabilly-green-plumage",
}

def pokeapi_slug(aslug: str) -> str:
    return POKEAPI_SLUG.get(aslug, aslug)


# ─── Fetch from PokeAPI ───────────────────────────────────────────────────────

def fetch_sprite(slug: str) -> bytes | None:
    url = f"https://pokeapi.co/api/v2/pokemon/{slug}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pokedex-personal/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        sprite_url = (data.get("sprites") or {}).get("front_default")
        if not sprite_url:
            return None
        with urllib.request.urlopen(sprite_url, timeout=10) as r:
            return r.read()
    except Exception:
        return None


def download_one(name: str) -> tuple[str, str, str]:
    aslug = app_slug(name)
    out   = SPRITE_DIR / f"{aslug}.png"

    if out.exists():
        return name, aslug, "cached"

    pslug  = pokeapi_slug(aslug)
    img    = fetch_sprite(pslug)

    # Fallback: try the app slug directly in case it happens to match PokeAPI
    if img is None and pslug != aslug:
        img = fetch_sprite(aslug)

    # Fallback: strip last hyphen-segment (base form)
    if img is None and "-" in pslug:
        base = pslug.rsplit("-", 1)[0]
        img  = fetch_sprite(base)

    if img:
        out.write_bytes(img)
        return name, aslug, "ok"

    return name, aslug, "miss"


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    # Deduplicate while preserving order
    seen: set[str] = set()
    targets = []
    for n in MISSING:
        key = app_slug(n)
        if key not in seen:
            seen.add(key)
            targets.append(n)

    print(f"Fetching {len(targets)} missing sprites…\n")

    results: dict[str, list[tuple[str, str]]] = {"ok": [], "cached": [], "miss": []}

    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download_one, n): n for n in targets}
        for i, fut in enumerate(as_completed(futures), 1):
            name, aslug, status = fut.result()
            results[status].append((name, aslug))
            if i % 50 == 0 or i == len(targets):
                print(f"  {i}/{len(targets)}  "
                      f"ok={len(results['ok'])}  "
                      f"cached={len(results['cached'])}  "
                      f"miss={len(results['miss'])}")

    print(f"\n✓  Downloaded : {len(results['ok'])}")
    print(f"   Already had: {len(results['cached'])}")
    print(f"✗  Not found  : {len(results['miss'])}")

    if results["miss"]:
        print("\nMissing (could not download):")
        for name, slug in sorted(results["miss"]):
            print(f"  {name!r:30s}  (tried slug: {slug})")

    if results["ok"]:
        print("\nRe-run sprite map generator:")
        print("  python3 etl/gen_sprite_map.py")


if __name__ == "__main__":
    main()
