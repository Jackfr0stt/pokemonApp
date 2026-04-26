// Sprite resolution: animated GIF → static PNG → null (placeholder rendered in component)
// All sprites are bundled in assets/sprites/ — no network needed.

const ANIMATED_BASE = require('../assets/sprites/animated');
const STATIC_BASE   = require('../assets/sprites/static');

// PokeAPI uses lowercase, hyphenated names (e.g. "charizard", "mr-mime", "nidoran-f")
function toSpriteKey(species: string): string {
  return species
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// Returns a require() source for use with <Image source={...} />
// Falls back through: animated → static → null
export function resolveSprite(species: string): number | null {
  const key = toSpriteKey(species);
  try {
    // Dynamic require won't tree-shake but sprites are small; fine for a bundled app
    return require(`../assets/sprites/animated/${key}.gif`);
  } catch {
    try {
      return require(`../assets/sprites/static/${key}.png`);
    } catch {
      return null;
    }
  }
}
