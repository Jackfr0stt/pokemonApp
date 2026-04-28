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

// Expand shorthand form suffixes to full names
function normalizeFormSuffix(slug: string): string {
  if (slug.endsWith('-h') && !slug.endsWith('-th')) return slug.slice(0, -2) + '-hisui';
  if (slug.endsWith('-a'))  return slug.slice(0, -2) + '-alola';
  if (slug.endsWith('-g'))  return slug.slice(0, -2) + '-galar';
  return slug;
}

function baseSlug(slug: string): string {
  const formSuffixes = ['-mega-x', '-mega-y', '-mega', '-gmax', '-alola', '-galar', '-hisui', '-paldea'];
  for (const suf of formSuffixes) {
    if (slug.endsWith(suf)) return slug.slice(0, -suf.length);
  }
  return slug;
}

// Explicit aliases for non-standard naming, typos, and game-specific naming
const ALIASES: Record<string, string> = {
  // Aegislash (both forms merged in custom sprite)
  'aegislash-both':          'rr-aegislash',
  // Alolan forms with prefix rather than suffix
  'alolan-marowak':          'marowak-alola',
  'alola-marowak':           'marowak-alola',
  'hisui-voltorb':           'rr-voltorb-hisui',
  'galarian-weezing':        'rr-weezing-galar',
  // Charizard X/Y shorthand
  'charizard-x':             'charizard-mega-x',
  'charizard-y':             'charizard-mega-y',
  // Ogerpon forms
  'ogerpon-cornerstone':     'rr-ogerpon-stone',
  'ogerpon-hearthflame':     'rr-ogerpon-herth',
  'ogerpon-wellspring':      'rr-ogerpon-weal',
  // Ursaluna blood moon
  'bloodmoon-ursaluna':      'rr-ursaluna-blood',
  'ursaluna-blood-moon':     'rr-ursaluna-blood',
  // Palafin
  'palafin-hero-form-hf':    'rr-palafin-hero',
  'palafin-hero-form':       'rr-palafin-hero',
  // Surfing Pikachu
  'pikachu-surfing':         'rr-surfing-pikachu',
  // Iron Jugulis typos
  'iron-juglis':             'rr-iron-jugulis',
  'iron-jugulus':            'rr-iron-jugulis',
  // Indeedee female
  'indeedee-f':              'rr-indeedee-f',
  'indeedeef':               'rr-indeedee-f',
  // Darmanitan Galar
  'darmanitan-g':            'rr-darmanitan',
  'darmanitan-galar':        'rr-darmanitan',
  // Primal / Origin forms
  'primal-dialga':           'rr-primal-dialga',
  'dialga-primal':           'rr-primal-dialga',
  'palkia-primal':           'ei-primal-palkia',
  'primal-palkia':           'ei-primal-palkia',
  'primal-groudon':          'groudon',
  'primal-kyogre':           'kyogre',
  // Urshifu forms
  'urshifu-r':               'rr-rapid-strike-urshifu',
  'urshifu-rapid-strike':    'rr-rapid-strike-urshifu',
  'urshifu-s':               'rr-single-strike-urshifu',
  'urshifu-single-strike':   'rr-single-strike-urshifu',
  // Forces of nature therian forms
  'thundurus-therian':       'rr-thundurus-therian',
  'thunderus-therian':       'rr-thundurus-therian',
  'landorus-i':              'rr-landorus',
  'landorus-incarnate':      'rr-landorus',
  // Lycanroc
  'lycaroc-dusk':            'rr-lycanroc',
  'lycanroc-dusk':           'rr-lycanroc',
  // Trevenant typo in game data
  'trevanant':               'rr-trevanant',
  // Pyroar male
  'pyroar':                  'rr-pyroar-m',
  // Porygon2 hyphen form
  'porygon-2':               'porygon2',
  // Empoleon mega forms
  'empoleon-mega-d':         'ei-empoleon-mega-d',
  'empoleon-mega-o':         'rr-empoleon-mega-o',
  // Typos in game data
  'amoongus':                'amoonguss',
  'crygonal':                'rr-cryogonal',
  'qwilfish-hisusi':         'qwilfish',
  // Mega shorthand (some games write "Mega Sceptile" not "Sceptile-Mega")
  'mega-sceptile':           'sceptile-mega',
  'mega-blaziken':           'blaziken-mega',
  'mega-swampert':           'swampert-mega',
  'mega-lucario':            'lucario-mega',
  'mega-gardevoir':          'gardevoir-mega',
  'mega-gengar':             'gengar-mega',
  'mega-mewtwo-x':           'mewtwo-mega-x',
  'mega-mewtwo-y':           'mewtwo-mega-y',
};

function lookup(key: string): number | undefined {
  return SPRITE_MAP[key];
}

// Returns a bundled require() source, or null → Sprite component shows placeholder
export function resolveSprite(species: string): number | null {
  const slug = toSlug(species);
  const norm = normalizeFormSuffix(slug);
  const base = baseSlug(norm);

  // 1. Direct match (plain slug, normalized, base)
  const direct = lookup(slug) ?? lookup(norm) ?? lookup(base);
  if (direct) return direct;

  // 2. Bare Urshifu → single strike form
  if (slug === 'urshifu') return lookup('rr-single-strike-urshifu') ?? null;

  // 3. Silvally type variants → silvally
  if (slug.startsWith('silvally-')) return lookup('silvally') ?? null;

  // 4. Explicit ALIASES
  const aliased = ALIASES[slug] ?? ALIASES[norm];
  if (aliased) {
    const hit = lookup(aliased) ?? lookup(baseSlug(aliased));
    if (hit) return hit;
  }

  // 5. Try rr- prefix variants
  const rrHit =
    lookup('rr-' + slug) ??
    lookup('rr-' + norm) ??
    lookup('rr-' + base);
  if (rrHit) return rrHit;

  // 6. Try ei- prefix variants
  const eiHit =
    lookup('ei-' + slug) ??
    lookup('ei-' + norm) ??
    lookup('ei-' + base);
  if (eiHit) return eiHit;

  return null;
}
