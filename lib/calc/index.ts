import { calculate, Pokemon, Move, Field, Generations } from '@smogon/calc';
import type { GameId } from '../GameContext';

const gen = Generations.get(8);

import eiOverrides from './emerald-imperium-overrides.json';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CalcMon {
  species:    string;
  level:      number;
  nature:     string;
  evs:        { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ivs?:       { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ability?:   string;
  item?:      string;
  boosts?:    { atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  status?:    'brn' | 'par' | 'psn' | 'tox' | 'frz' | 'slp' | '';
  curHP?:     number;  // percentage 1–100; undefined / 100 = full HP
  baseStats?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  types?:     string[];
}

export interface CalcField {
  weather?:        'Sun' | 'Rain' | 'Sand' | 'Snow' | 'Hail';
  terrain?:        'Electric' | 'Grassy' | 'Misty' | 'Psychic';
  gravity?:        boolean;
  wonderRoom?:     boolean;
  // Attacker side
  atkTailwind?:    boolean;
  atkHelpingHand?: boolean;
  // Defender side
  defReflect?:     boolean;
  defLightScreen?: boolean;
  defAuroraVeil?:  boolean;
  defSR?:          boolean;
  defSpikes?:      0 | 1 | 2 | 3;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMoveOverride(game: GameId, moveName: string) {
  if (game !== 'emerald-imperium') return undefined;
  const ov = (eiOverrides.moves as Record<string, { basePower?: number; type?: string }>)[moveName];
  if (!ov) return undefined;
  const result: Record<string, unknown> = {};
  if (ov.basePower !== undefined) result.basePower = ov.basePower;
  if (ov.type      !== undefined) result.type      = ov.type;
  return result;
}

type PokemonOpts = ConstructorParameters<typeof Pokemon>[2];

function buildPokemon(mon: CalcMon): Pokemon {
  const opts: PokemonOpts = {
    level:  mon.level,
    nature: mon.nature as NonNullable<PokemonOpts>['nature'],
    evs:    mon.evs,
    ivs:    mon.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    ...(mon.ability ? { ability: mon.ability as any } : {}),
    ...(mon.item    ? { item:    mon.item    as any } : {}),
    ...(mon.boosts  ? { boosts:  mon.boosts         } : {}),
    ...(mon.status  ? { status:  mon.status  as any } : {}),
  };

  const speciesName = mon.baseStats ? 'Ditto' : mon.species;
  if (mon.baseStats) {
    (opts as Record<string, unknown>).overrides = {
      baseStats: mon.baseStats,
      ...(mon.types ? { types: mon.types } : {}),
    };
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
    const atkPoke = buildPokemon(attacker);
    const defPoke = buildPokemon(defender);

    const moveOverride = getMoveOverride(game, moveName);
    const move = new Move(gen, moveName, {
      ...(moveOverride ? { overrides: moveOverride } : {}),
      isCrit: field?.isCrit ?? false,
    });

    const calcField = new Field({
      weather:      field?.weather      as any,
      terrain:      field?.terrain      as any,
      isGravity:    field?.gravity      ?? false,
      isWonderRoom: field?.wonderRoom   ?? false,
      attackerSide: {
        isTailwind:    field?.atkTailwind    ?? false,
        isHelpingHand: field?.atkHelpingHand ?? false,
      },
      defenderSide: {
        isReflect:     field?.defReflect     ?? false,
        isLightScreen: field?.defLightScreen  ?? false,
        isAuroraVeil:  field?.defAuroraVeil   ?? false,
        isSR:          field?.defSR           ?? false,
        spikes:        field?.defSpikes       ?? 0,
      },
    });

    const result = calculate(gen, atkPoke, defPoke, move, calcField);

    const dmg    = result.damage as number[];
    const defHp  = defPoke.maxHP();
    const pctMin = Math.round((dmg[0]                / defHp) * 1000) / 10;
    const pctMax = Math.round((dmg[dmg.length - 1]   / defHp) * 1000) / 10;

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

/** First ability for a species known to the Gen 8 dex, or null */
export function getSpeciesAbility(species: string): string | null {
  try {
    const s = [...gen.species].find(sp => sp.name.toLowerCase() === species.toLowerCase().trim());
    return (s?.abilities as any)?.[0] ?? null;
  } catch { return null; }
}

/** True if the species is known to @smogon/calc Gen 8 */
export function isKnownSpecies(name: string): boolean {
  try { new Pokemon(gen, name, { level: 50 }); return true; }
  catch { return false; }
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
