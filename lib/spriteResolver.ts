import { SPRITE_MAP } from './spriteMap';

function toSlug(species: string): string {
  return species
    .toLowerCase()
    .replace(/[''']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function baseSlug(slug: string): string {
  const formSuffixes = ['-mega-x', '-mega-y', '-mega', '-gmax', '-alola', '-galar', '-hisui', '-paldea'];
  for (const suf of formSuffixes) {
    if (slug.endsWith(suf)) return slug.slice(0, -suf.length);
  }
  return slug;
}

// Returns a bundled require() source, or null → Sprite component shows placeholder
export function resolveSprite(species: string): number | null {
  const slug = toSlug(species);
  return SPRITE_MAP[slug] ?? SPRITE_MAP[baseSlug(slug)] ?? null;
}
