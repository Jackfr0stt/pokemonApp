import { calculate, Pokemon, Move, Field, Generations } from '@smogon/calc';
import type { GameId } from '../GameContext';

// Both hacks use Gen 8 damage formula
const gen = Generations.get(8);

// EI move overrides loaded at bundle time
// RR uses standard Gen 8 move data (no overrides needed)
import eiOverrides from './emerald-imperium-overrides.json';

export interface CalcMon {
  species:   string;
  level:     number;
  nature:    string;
  evs:       { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ivs?:      { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  // When species is not in Gen8 dex, caller can supply base stats + types directly
  baseStats?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  types?:     string[];
}

export interface CalcResult {
  damage:     number[];
  desc:       string;
  percentMin: number;
  percentMax: number;
  koChance:   string;
  defHp:      number;
}

function getMoveOverride(game: GameId, moveName: string) {
  if (game !== 'emerald-imperium') return undefined;
  const ov = (eiOverrides.moves as Record<string, { basePower?: number; type?: string }>)[moveName];
  if (!ov) return undefined;
  const result: Record<string, unknown> = {};
  if (ov.basePower !== undefined) result.basePower = ov.basePower;
  if (ov.type !== undefined) result.type = ov.type;
  return result;
}

type PokemonOpts = ConstructorParameters<typeof Pokemon>[2];

function buildPokemon(mon: CalcMon): Pokemon {
  const opts: PokemonOpts = {
    level:  mon.level,
    nature: mon.nature as NonNullable<PokemonOpts>['nature'],
    evs:    mon.evs,
    ivs:    mon.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };

  if (mon.baseStats) {
    (opts as Record<string, unknown>).overrides = {
      baseStats: mon.baseStats,
      ...(mon.types ? { types: mon.types } : {}),
    };
    // Use a neutral template species when the real one isn't in the Gen 8 dex
    return new Pokemon(gen, 'Ditto', opts);
  }

  return new Pokemon(gen, mon.species, opts);
}

export function runCalc(
  game:     GameId,
  attacker: CalcMon,
  defender: CalcMon,
  moveName: string,
): CalcResult | null {
  try {
    const atkPoke = buildPokemon(attacker);
    const defPoke = buildPokemon(defender);

    const moveOverride = getMoveOverride(game, moveName);
    const move = new Move(gen, moveName, moveOverride ? { overrides: moveOverride } : undefined);

    const result = calculate(gen, atkPoke, defPoke, move, new Field());

    const dmg    = result.damage as number[];
    const defHp  = defPoke.maxHP();
    const pctMin = Math.round((dmg[0] / defHp) * 1000) / 10;
    const pctMax = Math.round((dmg[dmg.length - 1] / defHp) * 1000) / 10;

    return {
      damage:     dmg,
      desc:       result.desc(),
      percentMin: pctMin,
      percentMax: pctMax,
      koChance:   result.kochance().text,
      defHp,
    };
  } catch {
    return null;
  }
}

/** Returns true if the species is known to @smogon/calc Gen 8 */
export function isKnownSpecies(name: string): boolean {
  try {
    new Pokemon(gen, name, { level: 50 });
    return true;
  } catch {
    return false;
  }
}
