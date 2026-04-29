import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'player_box_v1';

export interface BoxMon {
  id:      string;
  species: string;
  level:   number;
  nature:  string;
  ability?: string;
  item:    string;
  moves:   [string, string, string, string];
  evs:     { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  ivs?:    { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
}

export function emptyBoxMon(): BoxMon {
  return {
    id:      Math.random().toString(36).slice(2),
    species: '',
    level:   50,
    nature:  'Hardy',
    item:    '',
    moves:   ['', '', '', ''],
    evs:     {},
  };
}

// Module-level cache — survives component remounts, so loadBox never races with saveBox.
let _cache: BoxMon[] | null = null;

export async function loadBox(): Promise<BoxMon[]> {
  if (_cache !== null) return _cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    _cache = raw ? (JSON.parse(raw) as BoxMon[]) : [];
  } catch {
    _cache = [];
  }
  return _cache;
}

export function saveBox(box: BoxMon[]): void {
  _cache = box;                                          // update cache synchronously
  AsyncStorage.setItem(KEY, JSON.stringify(box));        // persist in background
}
