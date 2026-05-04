import { calculate, Pokemon, Move, Field, Generations } from '@smogon/calc';
import type { GameId } from '../GameContext';

const gen  = Generations.get(8);
const gen9 = Generations.get(9);  // fallback for Gen 9 mons and Hisuian forms

import eiOverrides from './emerald-imperium-overrides.json';
import rrOverrides from './radical-red-overrides.json';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CalcMon {
  species:         string;
  level:           number;
  nature:          string;
  evs:             { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ivs?:            { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ability?:        string;
  abilityIgnored?: boolean;  // when true, ability is excluded from damage calc
  item?:           string;
  boosts?:         { atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  status?:         'brn' | 'par' | 'psn' | 'tox' | 'frz' | 'slp' | '';
  curHP?:          number;  // percentage 1–100; undefined / 100 = full HP
  baseStats?:      { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  types?:          string[];
}

export interface CalcField {
  format?:         'Singles' | 'Doubles';
  weather?:        'Sun' | 'Rain' | 'Sand' | 'Snow' | 'Hail' | 'Harsh Sunshine' | 'Heavy Rain' | 'Strong Winds';
  terrain?:        'Electric' | 'Grassy' | 'Misty' | 'Psychic';
  // Global
  gravity?:        boolean;
  wonderRoom?:     boolean;
  magicRoom?:      boolean;
  // Ruin abilities (gen 9 paradox)
  tabletsOfRuin?:  boolean;
  vesselOfRuin?:   boolean;
  swordOfRuin?:    boolean;
  beadsOfRuin?:    boolean;
  // Attacker side
  atkTailwind?:    boolean;
  atkHelpingHand?: boolean;
  atkFlowerGift?:  boolean;
  atkBattery?:     boolean;
  atkPowerSpot?:   boolean;
  atkReflect?:     boolean;
  atkLightScreen?: boolean;
  atkAuroraVeil?:  boolean;
  atkSR?:          boolean;
  atkSpikes?:      0 | 1 | 2 | 3;
  atkSteelsurge?:  boolean;
  atkVineLash?:    boolean;
  atkWildfire?:    boolean;
  atkCannonade?:   boolean;
  atkVolcalith?:   boolean;
  // Defender side
  defReflect?:     boolean;
  defLightScreen?: boolean;
  defAuroraVeil?:  boolean;
  defTailwind?:    boolean;
  defFlowerGift?:  boolean;
  defFriendGuard?: boolean;
  defForesight?:   boolean;
  defProtect?:     boolean;
  defLeechSeed?:   boolean;
  defSwitching?:   boolean;
  defSR?:          boolean;
  defSpikes?:      0 | 1 | 2 | 3;
  defSteelsurge?:  boolean;
  defVineLash?:    boolean;
  defWildfire?:    boolean;
  defCannonade?:   boolean;
  defVolcalith?:   boolean;
  // Move options
  isCrit?:         boolean;
}

export interface CalcResult {
  damage:     number[];
  desc:       string;
  percentMin: number;
  percentMax: number;
  koChance:   string;
  defHp:      number;
  atkSpeed:   number;
  defSpeed:   number;
}

// ─── Move name normalization ──────────────────────────────────────────────────
// Maps game-data move names (typos, spacing, capitalisation variants) to the
// canonical names that @smogon/calc recognises.

const MOVE_NAME_MAP: Record<string, string> = {
  // Spacing / hyphenation variants
  'Double Edge':        'Double-Edge',
  'Doubleedge':         'Double-Edge',
  'Freeze Dry':         'Freeze-Dry',
  'Power Up Punch':     'Power-Up Punch',
  'Self Destruct':      'Self-Destruct',
  'Selfdestruct':       'Self-Destruct',
  'Will-o-Wisp':        'Will-O-Wisp',
  'Will-O-wisp':        'Will-O-Wisp',
  'V-Create':           'V-create',
  'U-Turn':             'U-turn',
  // Typos
  'Buldoze':            'Bulldoze',
  'Crab Hammer':        'Crabhammer',
  'Dbl Iron Bash':      'Double Iron Bash',
  'Drain Kiss':         'Draining Kiss',
  'DualWingbeat':       'Dual Wingbeat',
  'ExpandingForce':     'Expanding Force',
  'Extremespeed':       'Extreme Speed',
  'ExtremeSpeed':       'Extreme Speed',
  'Fake out':           'Fake Out',
  'Fishous Rend':       'Fishious Rend',
  'Hi Horsepower':      'High Horsepower',
  'Kings Shield':       "King's Shield",
  'Magical Leef':       'Magical Leaf',
  'PopulationBomb':     'Population Bomb',
  'Psychic Fang':       'Psychic Fangs',
  'Rising Volt':        'Rising Voltage',
  'Scorching Sand':     'Scorching Sands',
  'Signal beam':        'Signal Beam',
  'Stange Steam':       'Strange Steam',
  'StrangeSteam':       'Strange Steam',
  'Stealth Rocks':      'Stealth Rock',
  'Thunder Bolt':       'Thunderbolt',
  'Thunderbolt ':       'Thunderbolt',
  // Hidden Power type variants → canonical move name (type handled separately if needed)
  'HP Bug':             'Hidden Power',
  'HP Dark':            'Hidden Power',
  'HP Dragon':          'Hidden Power',
  'HP Electric':        'Hidden Power',
  'HP Fighting':        'Hidden Power',
  'HP Fire':            'Hidden Power',
  'HP Flying':          'Hidden Power',
  'HP Ghost':           'Hidden Power',
  'HP Grass':           'Hidden Power',
  'HP Ground':          'Hidden Power',
  'HP Ice':             'Hidden Power',
  'HP Poison':          'Hidden Power',
  'HP Psychic':         'Hidden Power',
  'HP Rock':            'Hidden Power',
  'HP Steel':           'Hidden Power',
  'HP Water':           'Hidden Power',
  'Hidden Power Bug':   'Hidden Power',
  'Hidden Power Dark':  'Hidden Power',
  'Hidden Power Dragon':'Hidden Power',
  'Hidden Power Electric':'Hidden Power',
  'Hidden Power Fighting':'Hidden Power',
  'Hidden Power Fire':  'Hidden Power',
  'Hidden Power Flying':'Hidden Power',
  'Hidden Power Ghost': 'Hidden Power',
  'Hidden Power Grass': 'Hidden Power',
  'Hidden Power Ground':'Hidden Power',
  'Hidden Power Ice':   'Hidden Power',
  'Hidden Power Poison':'Hidden Power',
  'Hidden Power Psychic':'Hidden Power',
  'Hidden Power Rock':  'Hidden Power',
  'Hidden Power Steel': 'Hidden Power',
  'Hidden Power Water': 'Hidden Power',
};

function normalizeMoveName(name: string): string {
  return MOVE_NAME_MAP[name] ?? name;
}

// ─── Species name normalization ───────────────────────────────────────────────
// Maps game-data names (typos, shorthand suffixes, alternate formats) to the
// canonical names that @smogon/calc recognises.

const SPECIES_NAME_MAP: Record<string, string> = {
  // Typos in game data
  'Amoongus':              'Amoonguss',
  'Crygonal':              'Cryogonal',
  'Farigaraf':             'Farigiraf',
  'Iron Juglis':           'Iron Jugulis',
  'Iron Jugulus':          'Iron Jugulis',
  'Lycaroc-Dusk':          'Lycanroc-Dusk',
  'Mabostiff':             'Mabosstiff',
  'Qwilfish Hisusi':       'Qwilfish-Hisui',
  'Slitherwing':           'Slither Wing',
  'Fluttermane':           'Flutter Mane',
  'Thunderus-Therian':     'Thundurus-Therian',
  'Trevanant':             'Trevenant',
  // Aegislash — game data omits Shield/Blade, default to Shield form
  'Aegislash':             'Aegislash-Shield',
  // Regional form shorthand suffixes
  'Dugtrio-A':             'Dugtrio-Alola',
  'Exeggutor-A':           'Exeggutor-Alola',
  'Geodude-A':             'Geodude-Alola',
  'Ninetales-A':           'Ninetales-Alola',
  'Persian-A':             'Persian-Alola',
  'Sandslash-A':           'Sandslash-Alola',
  'Weezing-G':             'Weezing-Galar',
  'Zapdos-G':              'Zapdos-Galar',
  'Darmanitan-G':          'Darmanitan-Galar',
  'Darmanitan -G':         'Darmanitan-Galar',
  'Arcanine-H':            'Arcanine-Hisui',
  'Braviary-H':            'Braviary-Hisui',
  'Electrode-H':           'Electrode-Hisui',
  'Goodra-H':              'Goodra-Hisui',
  'Lilligant -H':          'Lilligant-Hisui',
  'Lilligant-H':           'Lilligant-Hisui',
  'Zoroark-H':             'Zoroark-Hisui',
  // Prefix-style regional names
  'Alola-Marowak':         'Marowak-Alola',
  'Alolan Marowak':        'Marowak-Alola',
  'Galarian Weezing':      'Weezing-Galar',
  'Hisui Voltorb':         'Voltorb-Hisui',
  // Primal / Origin forms
  'Dialga-Primal':         'Dialga-Origin',
  'Primal Dialga':         'Dialga-Origin',
  'Palkia-Primal':         'Palkia-Origin',
  'Primal Palkia':         'Palkia-Origin',
  'Primal Kyogre':         'Kyogre-Primal',
  // Blood Moon
  'Bloodmoon Ursaluna':    'Ursaluna-Bloodmoon',
  // Charizard mega shorthands
  'Charizard X':           'Charizard-Mega-X',
  'Charizard Y':           'Charizard-Mega-Y',
  // Mega prefix style
  'Mega Sceptile':         'Sceptile-Mega',
  'Mega Blaziken':         'Blaziken-Mega',
  'Mega Swampert':         'Swampert-Mega',
  'Mega Gardevoir':        'Gardevoir-Mega',
  'Mega Lucario':          'Lucario-Mega',
  'Mega Mewtwo X':         'Mewtwo-Mega-X',
  'Mega Mewtwo Y':         'Mewtwo-Mega-Y',
  // Urshifu — base form is Single Strike; Rapid Strike is the alternate
  'Urshifu R':             'Urshifu-Rapid-Strike',
  'Urshifu S':             'Urshifu',               // Single Strike = base
  'Urshifu-S':             'Urshifu',
  'Urshifu-Single-Strike': 'Urshifu',
  // Duraludon typo
  'Duraladon':             'Duraludon',
  // Landorus incarnate
  'Landorus-I':            'Landorus',
  // Oricorio base form
  'Oricorio-Baile':        'Oricorio',
  // Palafin Hero
  'Palafin / Hero Form (HF)': 'Palafin-Hero',
  'Palafin-Hero-Form-HF':  'Palafin-Hero',
  // Pikachu specials
  'Pikachu-Surfing':       'Pikachu',
  'Pikachu-Libre':         'Pikachu',
  // RR custom megas — normalize space/mixed-case variants to hyphenated form
  'Flapple Mega':          'Flapple-Mega',
  'Empoleon-Mega D':       'Empoleon-Mega-D',
  'Empoleon-Mega O':       'Empoleon-Mega-O',
  'Centiskorch Sevii Mega':'Centiskorch-Sevii-Mega',
  'Centiskorch-Sevii Mega':'Centiskorch-Sevii-Mega',
};

function normalizeSpeciesName(species: string): string {
  return SPECIES_NAME_MAP[species] ?? species;
}

// ─── Game overrides lookup ────────────────────────────────────────────────────

function getOverrides(game: GameId): any {
  if (game === 'emerald-imperium') return eiOverrides;
  if (game === 'radical-red')      return rrOverrides;
  return null;
}

// ─── Ability override system ──────────────────────────────────────────────────

// @smogon/calc only knows standard Gen 8 abilities; fangame abilities are silently
// ignored. This override layer maps them to equivalent known abilities or applies
// post-calc multipliers to preserve correct damage numbers.
type AbilityOverride =
  | { kind: 'map';          mapTo: string }                        // replace with a known ability
  | { kind: 'offStat';      stat: 'atk' | 'spa'; mult: number }   // damage × mult when move uses that stat
  | { kind: 'offTypeMult';  typeNames: string[];  mult: number }   // damage × mult when move type matches
  | { kind: 'offSEMult';    mult: number }                         // attacker: damage × mult when move is SE
  | { kind: 'offFlag';      flag: string;         mult: number }   // attacker: damage × mult when move has flag in overrides
  | { kind: 'defSEMult';    mult: number }                         // defender: damage × mult when hit by SE
  | { kind: 'typeImmunity'; typeName: string };                    // defender is immune to moves of that type

function getAbilityOverride(game: GameId, ability: string | undefined): AbilityOverride | undefined {
  if (!ability) return undefined;
  const ov = getOverrides(game);
  return ov?.abilities?.[ability] as AbilityOverride | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moveTypeEffectiveness(moveType: string, defTypes: readonly string[]): number {
  try {
    const td = gen.types.get(moveType.toLowerCase() as any);
    return defTypes.reduce((eff, dt) => eff * ((td?.effectiveness as any)?.[dt] ?? 1), 1);
  } catch { return 1; }
}

function getMoveOverride(game: GameId, moveName: string) {
  const gameOv = getOverrides(game);
  if (!gameOv) return undefined;
  const ov = (gameOv.moves as Record<string, { basePower?: number; type?: string; category?: string } | undefined>)[moveName];
  if (!ov) return undefined;
  const result: Record<string, unknown> = {};
  if (ov.basePower !== undefined) result.basePower = ov.basePower;
  if (ov.type      !== undefined) result.type      = ov.type;
  if (ov.category  !== undefined) result.category  = ov.category;
  return Object.keys(result).length > 0 ? result : undefined;
}

function getSpeciesOverride(game: GameId, species: string) {
  const gameOv = getOverrides(game);
  if (!gameOv) return undefined;
  return (gameOv.species as Record<string, { types?: string[]; baseStats?: Partial<{ hp: number; atk: number; def: number; spa: number; spd: number; spe: number }> } | undefined>)[species];
}

function applySpeciesOverride(mon: CalcMon, game: GameId): CalcMon {
  // Normalize name first so lookups + @smogon/calc both see the canonical form
  const species = normalizeSpeciesName(mon.species);
  const normalized = species !== mon.species ? { ...mon, species } : mon;

  const spOv = getSpeciesOverride(game, species);

  // When caller already supplied baseStats (e.g. trainer mon with explicit stats),
  // skip stat resolution but still fill in types from game overrides / dex if absent.
  if (normalized.baseStats) {
    if (normalized.types) return normalized;
    const resolvedTypes = spOv?.types ?? (getSpeciesTypes(species) || undefined);
    const types = resolvedTypes && resolvedTypes.length > 0 ? resolvedTypes : undefined;
    return types ? { ...normalized, types } : normalized;
  }

  // Check Gen 8 directly (not via getBaseStats which already includes Gen 9 fallback),
  // so the Gen 9 block below fires correctly for Gen 9 Pokémon and Hisuian forms.
  type BS = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  let g8Stats: BS | null = null;
  try {
    const p8 = new Pokemon(gen, species, { level: 50 });
    const bs = p8.species.baseStats as BS;
    if (bs?.hp > 0) g8Stats = bs;
  } catch {}

  let fallbackStats: BS | null = null;
  let fallbackTypes: string[] | null = null;
  if (!g8Stats) {
    try {
      const p9 = new Pokemon(gen9, species, { level: 50 });
      const bs = p9.species.baseStats as BS;
      if (bs?.hp > 0) {
        fallbackStats = bs;
        fallbackTypes = [...p9.types] as string[];
      }
    } catch { /* truly unknown species */ }
  }

  const baseForMerge = g8Stats ?? fallbackStats;
  // spOv.baseStats patches on top; if no base exists, use spOv as the full block
  const mergedStats = spOv?.baseStats
    ? (baseForMerge ? { ...baseForMerge, ...spOv.baseStats } : spOv.baseStats as BS)
    : (fallbackStats ?? undefined);

  const mergedTypes = !normalized.types
    ? (spOv?.types ?? (fallbackTypes ?? undefined))
    : undefined;

  if (!mergedStats && !mergedTypes) return normalized;

  return {
    ...normalized,
    ...(mergedStats                              ? { baseStats: mergedStats } : {}),
    ...(!normalized.types && mergedTypes         ? { types:     mergedTypes } : {}),
  };
}

type PokemonOpts = ConstructorParameters<typeof Pokemon>[2];

function buildPokemon(mon: CalcMon): Pokemon {
  const opts: PokemonOpts = {
    level:  mon.level,
    nature: mon.nature as NonNullable<PokemonOpts>['nature'],
    evs:    mon.evs,
    ivs:    mon.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    ...(mon.ability && !mon.abilityIgnored ? { ability: mon.ability as any } : {}),
    ...(mon.item    ? { item:    mon.item    as any } : {}),
    ...(mon.boosts  ? { boosts:  mon.boosts         } : {}),
    ...(mon.status  ? { status:  mon.status  as any } : {}),
  };

  const speciesName = mon.baseStats ? 'Ditto' : mon.species;

  // Apply baseStats and/or type overrides — type override works even for known species
  const overridesObj: Record<string, unknown> = {};
  if (mon.baseStats) overridesObj.baseStats = mon.baseStats;
  if (mon.types)     overridesObj.types     = mon.types;
  if (Object.keys(overridesObj).length > 0) {
    (opts as Record<string, unknown>).overrides = overridesObj;
  }

  // Build once to get maxHP when a curHP% is set
  if (mon.curHP !== undefined && mon.curHP < 100) {
    const temp   = new Pokemon(gen, speciesName, opts);
    const maxHp  = temp.maxHP();
    const actual = Math.max(1, Math.round((mon.curHP / 100) * maxHp));
    return new Pokemon(gen, speciesName, { ...opts, curHP: actual });
  }

  return new Pokemon(gen, speciesName, opts);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function runCalc(
  game:     GameId,
  attacker: CalcMon,
  defender: CalcMon,
  moveName: string,
  field?:   CalcField,
): CalcResult | null {
  try {
    // Resolve ability overrides — only when the ability is active (not ignored)
    const atkAbOv = !attacker.abilityIgnored ? getAbilityOverride(game, attacker.ability) : undefined;
    const defAbOv = !defender.abilityIgnored  ? getAbilityOverride(game, defender.ability)  : undefined;

    // For 'map' abilities, swap to the equivalent @smogon/calc-known ability
    const atkMon = atkAbOv?.kind === 'map' ? { ...attacker, ability: atkAbOv.mapTo } : attacker;
    const defMon = defAbOv?.kind === 'map' ? { ...defender, ability: defAbOv.mapTo } : defender;

    // Apply game-specific species overrides (partial base stat / type patches)
    const atkPoke = buildPokemon(applySpeciesOverride(atkMon, game));
    const defPoke = buildPokemon(applySpeciesOverride(defMon, game));

    const moveOverride    = getMoveOverride(game, moveName);
    const normalizedMove  = normalizeMoveName(moveName);
    const move = new Move(gen, normalizedMove, {
      ...(moveOverride ? { overrides: moveOverride } : {}),
      isCrit: field?.isCrit ?? false,
    });

    // Defender type immunity — return null (no damage) before the calc
    if (defAbOv?.kind === 'typeImmunity' && move.type === defAbOv.typeName) return null;

    const calcField = new Field({
      gameType:        field?.format        ?? 'Singles',
      weather:         field?.weather       as any,
      terrain:         field?.terrain       as any,
      isGravity:       field?.gravity       ?? false,
      isWonderRoom:    field?.wonderRoom    ?? false,
      isMagicRoom:     field?.magicRoom     ?? false,
      isTabletsOfRuin: field?.tabletsOfRuin ?? false,
      isVesselOfRuin:  field?.vesselOfRuin  ?? false,
      isSwordOfRuin:   field?.swordOfRuin   ?? false,
      isBeadsOfRuin:   field?.beadsOfRuin   ?? false,
      attackerSide: {
        isTailwind:    field?.atkTailwind    ?? false,
        isHelpingHand: field?.atkHelpingHand ?? false,
        isFlowerGift:  field?.atkFlowerGift  ?? false,
        isBattery:     field?.atkBattery     ?? false,
        isPowerSpot:   field?.atkPowerSpot   ?? false,
        isReflect:     field?.atkReflect     ?? false,
        isLightScreen: field?.atkLightScreen ?? false,
        isAuroraVeil:  field?.atkAuroraVeil  ?? false,
        isSR:          field?.atkSR          ?? false,
        spikes:        field?.atkSpikes      ?? 0,
        steelsurge:    field?.atkSteelsurge  ?? false,
        vinelash:      field?.atkVineLash    ?? false,
        wildfire:      field?.atkWildfire    ?? false,
        cannonade:     field?.atkCannonade   ?? false,
        volcalith:     field?.atkVolcalith   ?? false,
      },
      defenderSide: {
        isReflect:     field?.defReflect     ?? false,
        isLightScreen: field?.defLightScreen ?? false,
        isAuroraVeil:  field?.defAuroraVeil  ?? false,
        isTailwind:    field?.defTailwind     ?? false,
        isFlowerGift:  field?.defFlowerGift   ?? false,
        isFriendGuard: field?.defFriendGuard  ?? false,
        isForesight:   field?.defForesight    ?? false,
        isProtected:   field?.defProtect      ?? false,
        isSeeded:      field?.defLeechSeed    ?? false,
        isSwitching:   field?.defSwitching ? 'out' : undefined,
        isSR:          field?.defSR           ?? false,
        spikes:        field?.defSpikes       ?? 0,
        steelsurge:    field?.defSteelsurge   ?? false,
        vinelash:      field?.defVineLash     ?? false,
        wildfire:      field?.defWildfire     ?? false,
        cannonade:     field?.defCannonade    ?? false,
        volcalith:     field?.defVolcalith    ?? false,
      },
    } as any);

    const result = calculate(gen, atkPoke, defPoke, move, calcField);

    let dmg   = result.damage as number[];
    const defHp = defPoke.maxHP();

    // Compute type effectiveness once (used by SE-conditional overrides)
    const isSE = moveTypeEffectiveness(move.type as string, defPoke.types) > 1;

    // Apply post-calc offensive ability multipliers
    if (atkAbOv) {
      let mult = 1;
      if (atkAbOv.kind === 'offStat') {
        if (atkAbOv.stat === 'spa' && move.category === 'Special')   mult = atkAbOv.mult;
        if (atkAbOv.stat === 'atk' && move.category === 'Physical')  mult = atkAbOv.mult;
      } else if (atkAbOv.kind === 'offTypeMult' && atkAbOv.typeNames.includes(move.type as string)) {
        mult = atkAbOv.mult;
      } else if (atkAbOv.kind === 'offSEMult' && isSE) {
        mult = atkAbOv.mult;
      } else if (atkAbOv.kind === 'offFlag') {
        const gameOv = getOverrides(game);
        const moveFlags = gameOv?.moves?.[moveName]?.flags as Record<string, boolean> | undefined;
        if (moveFlags?.[atkAbOv.flag]) mult = atkAbOv.mult;
      }
      if (mult !== 1) dmg = dmg.map(d => Math.floor(d * mult));
    }

    // Apply post-calc defensive ability multipliers
    if (defAbOv?.kind === 'defSEMult' && isSE) {
      dmg = dmg.map(d => Math.floor(d * defAbOv.mult));
    }

    // Frostbite (RR/EI replaces vanilla freeze): halves special damage, mirrors burn
    if (attacker.status === 'frz' && move.category === 'Special') {
      dmg = dmg.map(d => Math.floor(d * 0.5));
    }

    const pctMin = Math.round((dmg[0]              / defHp) * 1000) / 10;
    const pctMax = Math.round((dmg[dmg.length - 1] / defHp) * 1000) / 10;

    return {
      damage:     dmg,
      desc:       result.desc(),
      percentMin: pctMin,
      percentMax: pctMax,
      koChance:   result.kochance().text,
      defHp,
      atkSpeed:   atkPoke.stats.spe,
      defSpeed:   defPoke.stats.spe,
    };
  } catch {
    return null;
  }
}

/** First ability for a species (overrides → Gen 8 → Gen 9) */
export function getSpeciesAbility(species: string): string | null {
  const norm = normalizeSpeciesName(species);
  // Check game overrides first (covers custom megas)
  for (const ov of [rrOverrides, eiOverrides]) {
    const entry = (ov.species as Record<string, any>)[norm];
    if (entry?.abilities?.['0']) return entry.abilities['0'] as string;
  }
  try {
    const s = [...gen.species].find(sp => sp.name.toLowerCase() === norm.toLowerCase().trim());
    if (s) return (s.abilities as any)?.[0] ?? null;
    const s9 = [...gen9.species].find(sp => sp.name.toLowerCase() === norm.toLowerCase().trim());
    return (s9?.abilities as any)?.[0] ?? null;
  } catch { return null; }
}

/** True if the species is known to @smogon/calc Gen 8 or Gen 9 */
export function isKnownSpecies(name: string): boolean {
  const norm = normalizeSpeciesName(name);
  try { new Pokemon(gen, norm, { level: 50 }); return true; } catch {}
  try { new Pokemon(gen9, norm, { level: 50 }); return true; } catch {}
  return false;
}

/** Base stats for a known species (Gen 8, then Gen 9 fallback) */
export function getBaseStats(species: string): { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null {
  const norm = normalizeSpeciesName(species);
  try {
    const p = new Pokemon(gen, norm, { level: 50 });
    const bs = p.species.baseStats as { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    if (bs?.hp > 0) return bs;
  } catch {}
  try {
    const p9 = new Pokemon(gen9, norm, { level: 50 });
    const bs = p9.species.baseStats as { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    if (bs?.hp > 0) return bs;
  } catch {}
  return null;
}

/** All ability slots for a known species (overrides → Gen 8 → Gen 9) */
export function getSpeciesAbilities(species: string): string[] {
  const norm = normalizeSpeciesName(species);
  // Check game overrides first (covers custom megas with fan-game abilities)
  for (const ov of [rrOverrides, eiOverrides]) {
    const entry = (ov.species as Record<string, any>)[norm];
    if (entry?.abilities) {
      const result = Object.values(entry.abilities as Record<string, string>).filter(Boolean);
      if (result.length > 0) return [...new Set(result)];
    }
  }
  try {
    const p = new Pokemon(gen, norm, { level: 50 });
    const abs = p.species.abilities as Record<string, string | undefined>;
    const result = Object.values(abs).filter((a): a is string => !!a);
    if (result.length > 0) return result;
  } catch {}
  try {
    const p9 = new Pokemon(gen9, norm, { level: 50 });
    const abs = p9.species.abilities as Record<string, string | undefined>;
    return Object.values(abs).filter((a): a is string => !!a);
  } catch { return []; }
}

let _allAbilities: string[] | null = null;
export function getAllAbilities(): string[] {
  if (!_allAbilities) _allAbilities = [...gen.abilities].map(a => a.name).sort();
  return _allAbilities;
}

let _allSpecies: string[] | null = null;
export function getAllSpecies(): string[] {
  if (!_allSpecies) _allSpecies = [...gen.species].map(s => s.name).sort();
  return _allSpecies;
}

/** Default types for a known species (Gen 8, then Gen 9 fallback) */
export function getSpeciesTypes(species: string): string[] {
  const norm = normalizeSpeciesName(species);
  try {
    const s = [...gen.species].find(sp => sp.name.toLowerCase() === norm.toLowerCase().trim());
    if (s) return [...s.types];
    const s9 = [...gen9.species].find(sp => sp.name.toLowerCase() === norm.toLowerCase().trim());
    if (s9) return [...s9.types];
  } catch {}
  return [];
}

/** Base species name — 'Charizard-Mega-X' → 'Charizard', 'Charizard' → 'Charizard' */
export function getBaseSpeciesName(species: string): string {
  try {
    const entry = [...gen.species].find(s => s.name.toLowerCase() === species.toLowerCase().trim());
    return (entry as any)?.baseSpecies ?? entry?.name ?? species;
  } catch { return species; }
}

/** All alternate forms for a species family, excluding the current form */
export function getSpeciesForms(species: string): string[] {
  try {
    const allSpecies = [...gen.species];
    const entry = allSpecies.find(s => s.name.toLowerCase() === species.toLowerCase().trim());
    if (!entry) return [];
    const rootName: string = (entry as any).baseSpecies ?? entry.name;
    const root = rootName === entry.name ? entry : allSpecies.find(s => s.name === rootName);
    const otherForms: string[] = (root as any)?.otherFormes ?? [];
    return [rootName, ...otherForms].filter(f => f !== entry.name);
  } catch { return []; }
}

let _allMoves: string[] | null = null;
export function getAllMoves(): string[] {
  if (!_allMoves) _allMoves = [...gen.moves].map(m => m.name).sort();
  return _allMoves;
}

let _allItems: string[] | null = null;
export function getAllItems(): string[] {
  if (!_allItems) _allItems = [...gen.items].map(i => i.name).sort();
  return _allItems;
}

export interface MoveDetails {
  type:     string | null;
  power:    number | null;
  category: 'Physical' | 'Special' | 'Status' | null;
}

export function getMoveDetails(game: GameId, moveName: string): MoveDetails {
  if (!moveName.trim()) return { type: null, power: null, category: null };
  try {
    const ov = getMoveOverride(game, moveName);
    const m  = new Move(gen, moveName, ov ? { overrides: ov } : {});
    return {
      type:     (m.type as string)     ?? null,
      power:    m.bp                   ?? null,
      category: (m.category as 'Physical' | 'Special' | 'Status') ?? null,
    };
  } catch {
    return { type: null, power: null, category: null };
  }
}

/** Final Speed stat for a CalcMon without running a full calc */
export function getComputedSpeed(mon: CalcMon): number {
  try { return buildPokemon(mon).stats.spe; }
  catch { return 0; }
}

/** All final computed stats for a CalcMon, or null if species is unknown */
export function getComputedStats(mon: CalcMon): { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null {
  try {
    const p = buildPokemon(mon);
    return { hp: p.maxHP(), atk: p.stats.atk, def: p.stats.def, spa: p.stats.spa, spd: p.stats.spd, spe: p.stats.spe };
  } catch { return null; }
}

export interface AbilityStatMods {
  atkStage?: number;  // extra Atk stage (Intrepid Sword +1)
  defStage?: number;  // extra Def stage (Dauntless Shield +1, Grass Pelt +1)
  atkMult?:  number;  // Atk flat multiplier (Huge Power ×2, Guts ×1.5 …)
  defMult?:  number;  // Def flat multiplier (Marvel Scale ×1.5)
  spaMult?:  number;  // SpA flat multiplier (Feline Prowess ×2, Solar Power ×1.5 …)
  speMult?:  number;  // Spe flat multiplier (Sand Rush ×2, Quick Feet ×1.5 …)
}

/**
 * Ability-based stat modifiers not reflected in getComputedStats.
 * Covers: always-active mults, on-entry stage boosts, weather/terrain/status conditionals.
 * Handles both standard Gen 8 abilities and EI/RR fangame abilities.
 */
export function getAbilityStatMods(mon: CalcMon, field?: CalcField): AbilityStatMods {
  if (!mon.ability || mon.abilityIgnored) return {};
  const ab      = mon.ability;
  const weather = field?.weather;
  const terrain = field?.terrain;
  const status  = mon.status ?? '';
  const statused = status !== '';
  const result: AbilityStatMods = {};

  // ── Always-active Atk multipliers ─────────────────────────────────────
  if      (ab === 'Huge Power' || ab === 'Pure Power')  result.atkMult = 2;
  else if (ab === 'Gorilla Tactics' || ab === 'Hustle') result.atkMult = 1.5;
  else if (ab === 'Bull Rush' || ab === 'Quill Rush')   result.atkMult = 1.2;

  // Bull Rush / Quill Rush also grant +50% Speed on entry (treated as permanent here;
  // use the ability ON/OFF toggle to model the turn-1 limitation)
  if (ab === 'Bull Rush' || ab === 'Quill Rush') result.speMult = 1.5;

  // ── Always-active SpA multipliers ─────────────────────────────────────
  if      (ab === 'Feline Prowess') result.spaMult = 2;
  else if (ab === 'Sage Power')     result.spaMult = 1.5;

  // ── On-entry stage boosts ─────────────────────────────────────────────
  if (ab === 'Intrepid Sword')                           result.atkStage = 1;
  if (ab === 'Dauntless Shield' || ab === 'Valiant Shield') result.defStage = 1;

  // ── Status-conditional ────────────────────────────────────────────────
  if (ab === 'Guts'       && statused)                            result.atkMult = 1.5;
  if (ab === 'Marvel Scale' && statused)                          result.defMult = 1.5;
  if (ab === 'Quick Feet'   && statused)                          result.speMult = 1.5;
  if (ab === 'Toxic Boost'  && (status === 'psn' || status === 'tox')) result.atkMult = 1.5;
  if (ab === 'Flare Boost'  && status === 'brn')                  result.spaMult = 1.5;

  // ── Weather-conditional ───────────────────────────────────────────────
  if (ab === 'Solar Power'  && weather === 'Sun') result.spaMult = 1.5;
  if (ab === 'Flower Gift'  && weather === 'Sun') result.atkMult = 1.5;

  // ── Weather/terrain speed doublers ────────────────────────────────────
  if (
    (ab === 'Sand Rush'    && weather === 'Sand')                          ||
    (ab === 'Swift Swim'   && weather === 'Rain')                          ||
    (ab === 'Chlorophyll'  && weather === 'Sun')                           ||
    (ab === 'Slush Rush'   && (weather === 'Hail' || weather === 'Snow'))  ||
    (ab === 'Surge Surfer' && terrain === 'Electric')
  ) {
    result.speMult = 2;
  }

  // ── Terrain-conditional ───────────────────────────────────────────────
  if (ab === 'Grass Pelt' && terrain === 'Grassy') result.defStage = 1;

  // ── Status-based stat penalties (applied after abilities so ability-based overrides win) ──
  if (status === 'par' && !result.speMult) result.speMult = 0.5;
  // Frostbite (replaces vanilla freeze in RR/EI): halves SpA, mirrors burn for special moves
  if (status === 'frz' && !result.spaMult) result.spaMult = 0.5;

  return result;
}
