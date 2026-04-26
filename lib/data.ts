import type { GameId } from './GameContext';

// Bundled JSON — imported at build time so the app is fully offline
import rrRaw from './data/radical-red.json';
import eiRaw from './data/emerald-imperium.json';

export interface StatBlock {
  hp?: number; atk?: number; def?: number;
  spa?: number; spd?: number; spe?: number;
}

export interface Pokemon {
  species:    string;
  level:      number | string;
  nature:     string | null;
  ability:    string | null;
  item:       string | null;
  moves:      string[];
  stats:      StatBlock;
  ivs:        StatBlock;
  evs:        StatBlock;
  speedStat:  number | null;
}

export interface Trainer {
  id:         string;
  name:       string | null;
  tmReward?:  string | null;
  pokepaste?: string | null;
  team:       Pokemon[];
}

export interface Location {
  id:       string;
  name:     string;
  trainers: Trainer[];
}

export interface TM {
  id:       string;
  code:     string;
  move:     string | null;
  type:     string | null;
  location: string | null;
}

export interface LevelCap {
  trigger: string;
  level:   number;
}

export interface Code {
  code:        string;
  description: string;
}

export interface GameData {
  game:       string;
  locations:  Location[];
  tms:        TM[];
  tutors?:    { move: string; location: string | null }[];
  megaStones?: { stone: string; location: string | null }[];
  levelCaps:  LevelCap[];
  codes:      Code[];
}

const DATA: Record<GameId, GameData> = {
  'radical-red':      rrRaw as GameData,
  'emerald-imperium': eiRaw as GameData,
};

export function getGameData(game: GameId): GameData {
  return DATA[game];
}

export function getLocations(game: GameId): Location[] {
  return DATA[game].locations;
}

export function getTrainer(game: GameId, locationId: string, trainerId: string): Trainer | undefined {
  const loc = DATA[game].locations.find(l => l.id === locationId);
  return loc?.trainers.find(t => t.id === trainerId);
}
