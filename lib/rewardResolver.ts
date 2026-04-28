import type { TM } from './data';
import { HELD_ITEM, TM_DISC, MEGA_STONE } from './itemSpriteMap';

export type ResolvedReward = {
  label:  string;
  image?: number;   // require() result from asset maps
  kind?:  'tm' | 'mega' | 'item';
};

// Abbreviations that don't match move names directly
const MOVE_ALIASES: Record<string, string> = {
  'eq': 'earthquake',
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Split "Charizardite Y \nChoice Specs \n10 Life Orbs" or "Swampertite & EQ TM"
// into individual item tokens, stripping leading quantity words ("10 Life Orbs" → "Life Orbs").
function tokenise(raw: string): string[] {
  return raw
    .split(/[\n]+|(?<!\w)\s*&\s*(?!\w)/)   // split on newlines or ' & '
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^\d+\s+/, '').trim());  // strip "10 Life Orbs" → "Life Orbs"
}

// Strip move-context words so we can look up the actual move name.
// "Rival Cut HM" → "Cut",  "Giga Drain TM" → "Giga Drain",  "EQ TM" → "EQ"
function extractMoveName(token: string): string {
  return token
    .replace(/^rival\s+/i, '')
    .replace(/\s+(TM|HM|Tm|Hm)$/i, '')
    .trim();
}

export function resolveRewards(tmReward: string, tms: TM[]): ResolvedReward[] {
  // Build move-name → lowercase type map once per call (cheap, ~130 entries)
  const moveToType: Record<string, string> = {};
  for (const tm of tms) {
    if (tm.move && tm.type) moveToType[tm.move.toLowerCase()] = tm.type.toLowerCase();
  }

  return tokenise(tmReward).map((token): ResolvedReward => {
    const s = slug(token);

    // 1. Mega stone
    if (MEGA_STONE[s]) return { label: token, image: MEGA_STONE[s], kind: 'mega' };

    // 2. TM / HM — try matching the move name against the TMs list
    const moveName = extractMoveName(token);
    const moveSlug  = slug(moveName);
    const aliased   = MOVE_ALIASES[moveSlug] ?? moveName.toLowerCase();
    // Try: aliased name, slug with spaces, slug without hyphens (e.g. "electro-web" → "electroweb")
    const moveType  = moveToType[aliased]
      ?? moveToType[moveSlug.replace(/-/g, ' ')]
      ?? moveToType[moveSlug.replace(/-/g, '')];
    if (moveType && TM_DISC[moveType]) {
      return { label: token, image: TM_DISC[moveType], kind: 'tm' };
    }

    // 3. Held item
    if (HELD_ITEM[s]) return { label: token, image: HELD_ITEM[s], kind: 'item' };

    // Unrecognised — show text only
    return { label: token };
  });
}
