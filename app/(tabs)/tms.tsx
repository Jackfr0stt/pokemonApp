import { useState, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getGameData } from '@/lib/data';
import TypeBadge from '@/components/TypeBadge';
import Sprite from '@/components/Sprite';
import { TM_DISC, MEGA_STONE, HELD_ITEM } from '@/lib/itemSpriteMap';
import { colors, spacing, radius, font } from '@/lib/theme';

type Tab = 'tms' | 'tutors' | 'megas' | 'held';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tms',    label: 'TMs / HMs',  icon: 'disc-outline' },
  { id: 'tutors', label: 'Tutors',     icon: 'school-outline' },
  { id: 'megas',  label: 'Mega',       icon: 'diamond-outline' },
  { id: 'held',   label: 'Held',       icon: 'bag-handle-outline' },
];

// ── Mega Stone → base Pokémon species ────────────────────────────────────────
const MEGA_STONE_MAP: Record<string, string> = {
  Venusaurite:   'Venusaur',    Charizardite:  'Charizard',
  Blastoisinite: 'Blastoise',   Pidgeotite:    'Pidgeot',
  Beedrilite:    'Beedrill',    Kangaskhanite: 'Kangaskhan',
  Slowbronite:   'Slowbro',     Gengarite:     'Gengar',
  Aerodactylite: 'Aerodactyl',  Mewtwonite:    'Mewtwo',
  Pinsirite:     'Pinsir',      Gyaradosite:   'Gyarados',
  Laprasite:     'Lapras',      Alakazite:     'Alakazam',
  Machampite:    'Machamp',     Ampharosite:   'Ampharos',
  Scizorite:     'Scizor',      Heracronite:   'Heracross',
  Houndoominite: 'Houndoom',    Tyranitarite:  'Tyranitar',
  Blazikenite:   'Blaziken',    Sceptilite:    'Sceptile',
  Swampertite:   'Swampert',    Mawilite:      'Mawile',
  Aggronite:     'Aggron',      Medichamite:   'Medicham',
  Manectite:     'Manectric',   Sharpedonite:  'Sharpedo',
  Cameruptite:   'Camerupt',    Altarianite:   'Altaria',
  Sablenite:     'Sableye',     Absolite:      'Absol',
  Glalitite:     'Glalie',      Steelixite:    'Steelix',
  Lucarionite:   'Lucario',     Latiosite:     'Latios',
  Latiasite:     'Latias',      Salamencite:   'Salamence',
  Metagrossite:  'Metagross',   Galladite:     'Gallade',
  Lopunnite:     'Lopunny',     Garchompite:   'Garchomp',
  Audinite:      'Audino',      Abomasite:     'Abomasnow',
  Diancite:      'Diancie',     Garbodorite:   'Garbodor',
  Gardevoirite:  'Gardevoir',   Kinglerite:    'Kingler',
  Dreadnawite:   'Drednaw',     Drednawite:    'Drednaw',
  Beedrillite:   'Beedrill',    Toxtricitite:  'Toxtricity',
  Banettite:     'Banette',     Snorlaxite:    'Snorlax',
  Copperajite:   'Copperajah',  Centiskite:    'Centiskorch',
  Sandacondite:  'Sandaconda',  Applite:       'Appletun',
  Alcremite:     'Alcremie',    Coalossite:    'Coalossal',
  Duraludonite:  'Duraludon',   Butterfrite:   'Butterfree',
  Orbeetlite:    'Orbeetle',
};

function megaStoneToSpecies(stone: string): string {
  const base = stone.replace(/\s+[XY]$/, ''); // strip " X" / " Y"
  return MEGA_STONE_MAP[base] ?? base;
}

// ── TM / HM disc icon — uses the type-coloured disc sprite ───────────────────
function TmIcon({ type }: { type?: string }) {
  const src = type ? TM_DISC[type.toLowerCase()] : undefined;
  if (src) {
    return <Image source={src} style={iconStyles.img} resizeMode="contain" />;
  }
  // fallback: plain disc for unknown type
  return (
    <View style={[iconStyles.img, iconStyles.fallback]}>
      <Ionicons name="disc-outline" size={20} color={colors.textDim} />
    </View>
  );
}

// ── Mega Stone icon — official item sprite, falls back to Pokémon sprite ──────
function MegaIcon({ stone }: { stone: string }) {
  const slug = stone.toLowerCase().replace(/\s+/g, '-');
  const src  = MEGA_STONE[slug];
  if (src) {
    return <Image source={src} style={iconStyles.img} resizeMode="contain" />;
  }
  return <Sprite species={megaStoneToSpecies(stone)} size={36} />;
}

// Extra move→type entries not covered by the TM list
const TUTOR_MOVE_TYPE_EXTRAS: Record<string, string> = {
  // existing
  'bug bite':'bug', 'fire fang':'fire', 'ice fang':'ice', 'thunder fang':'electric',
  'psychic fangs':'psychic', 'drill run':'ground', 'blaze kick':'fire',
  'pain split':'normal', 'hex':'ghost', 'mystical fire':'fire', 'leaf blade':'grass',
  'power gem':'rock', 'rock blast':'rock', 'pin missile':'bug', 'icicle spear':'ice',
  'tail slap':'normal', 'body slam':'normal', 'foul play':'dark', 'iron defense':'steel',
  'nasty plot':'dark', 'power whip':'grass', 'bug buzz':'bug', 'phantom force':'ghost',
  'flare blitz':'fire', 'stored power':'psychic', 'tailwind':'flying', 'megahorn':'bug',
  'dark hole':'dark', 'frenzy plant':'grass', 'hydro cannon':'water', 'blast burn':'fire',
  'hone claws':'dark', 'toxic spikes':'poison', 'celebrate':'normal',
  // RR tutors (Group 1-5 from Drive source)
  'sunny day':'fire', 'rain dance':'water', 'snowscape':'ice', 'sandstorm':'rock',
  'flame charge':'fire', 'trailblaze':'grass', 'power-up punch':'fighting',
  'charge beam':'electric', 'work up':'normal', 'swords dance':'normal',
  'bulk up':'fighting', 'calm mind':'psychic', 'meteor beam':'rock',
  'alluring voice':'fairy', 'focus punch':'fighting', 'stealth rock':'rock',
  'spikes':'normal', 'solar beam':'grass', 'solar blade':'grass',
};

// Held items list derived from the sprite map — slug as key, image as value
const HELD_ITEMS_LIST = Object.entries(HELD_ITEM).map(([slug, src]) => ({
  slug,
  name: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  src,
})).sort((a, b) => a.name.localeCompare(b.name));

const iconStyles = StyleSheet.create({
  img:      { width: 36, height: 36, flexShrink: 0 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function TMsScreen() {
  const { game }   = useGame();
  const [tab, setTab]     = useState<Tab>('tms');
  const [query, setQuery] = useState('');

  const data   = getGameData(game);
  const tms    = data.tms ?? [];
  const tutors = data.tutors ?? [];
  const megas  = data.megaStones ?? [];

  const moveToType = useMemo(() => {
    const map: Record<string, string> = { ...TUTOR_MOVE_TYPE_EXTRAS };
    for (const tm of tms) {
      if (tm.move && tm.type) map[tm.move.toLowerCase()] = tm.type.toLowerCase();
    }
    return map;
  }, [tms]);

  const placeholder =
    tab === 'tms'    ? 'Search TM, move, or location…' :
    tab === 'tutors' ? 'Search move or location…' :
    tab === 'megas'  ? 'Search stone or location…' :
                       'Search held item…';

  const filteredTms = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tms
      .filter(tm =>
        !q ||
        tm.code.toLowerCase().includes(q) ||
        tm.move?.toLowerCase().includes(q) ||
        tm.location?.toLowerCase().includes(q)
      )
      .sort((a, b) => (a.move ?? '').localeCompare(b.move ?? ''));
  }, [tms, query]);

  const filteredTutors = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tutors
      .filter(t =>
        !q ||
        t.move?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q)
      )
      .sort((a, b) => (a.move ?? '').localeCompare(b.move ?? ''));
  }, [tutors, query]);

  const filteredMegas = useMemo(() => {
    const q = query.toLowerCase().trim();
    return megas
      .filter(m =>
        !q ||
        m.stone?.toLowerCase().includes(q) ||
        m.location?.toLowerCase().includes(q)
      )
      .sort((a, b) => (a.stone ?? '').localeCompare(b.stone ?? ''));
  }, [megas, query]);

  const filteredHeld = useMemo(() => {
    const q = query.toLowerCase().trim();
    return !q ? HELD_ITEMS_LIST : HELD_ITEMS_LIST.filter(h => h.name.toLowerCase().includes(q));
  }, [query]);

  const isEmpty =
    (tab === 'tms'    && tms.length === 0) ||
    (tab === 'tutors' && tutors.length === 0) ||
    (tab === 'megas'  && megas.length === 0) ||
    (tab === 'held'   && HELD_ITEMS_LIST.length === 0);

  return (
    <View style={styles.container}>
      {/* Segmented control */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
            onPress={() => { setTab(t.id); setQuery(''); }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t.icon as any}
              size={14}
              color={tab === t.id ? colors.bg : colors.textMuted}
            />
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="disc-outline" size={48} color={colors.textDim} />
          <Text style={styles.emptyText}>No data for this game</Text>
        </View>
      ) : tab === 'tms' ? (
        <FlatList
          data={filteredTms}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TmIcon type={item.type ?? undefined} />
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.moveName}>{item.code} — {item.move}</Text>
                  {item.type && <TypeBadge type={item.type} small />}
                </View>
                {item.location && (
                  <Text style={styles.location}>{item.location}</Text>
                )}
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.list}
        />
      ) : tab === 'tutors' ? (
        <FlatList
          data={filteredTutors}
          keyExtractor={(item, i) => `${item.move}-${i}`}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TmIcon type={moveToType[item.move?.toLowerCase() ?? '']} />
              <View style={styles.rowBody}>
                <Text style={styles.moveName}>{item.move}</Text>
                {item.location && (
                  <Text style={styles.location}>{item.location}</Text>
                )}
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.list}
        />
      ) : tab === 'megas' ? (
        <FlatList
          data={filteredMegas}
          keyExtractor={(item, i) => `${item.stone}-${i}`}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <MegaIcon stone={item.stone} />
              <View style={styles.rowBody}>
                <Text style={styles.moveName}>{item.stone}</Text>
                {item.location && (
                  <Text style={styles.location}>{item.location}</Text>
                )}
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.list}
        />
      ) : (
        <FlatList
          data={filteredHeld}
          keyExtractor={item => item.slug}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image source={item.src} style={iconStyles.img} resizeMode="contain" />
              <Text style={styles.moveName}>{item.name}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },

  tabs:           {
    flexDirection: 'row', margin: spacing.md, marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  tabBtn:         {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm,
    borderRadius: radius.sm - 1,
  },
  tabBtnActive:   { backgroundColor: colors.primary },
  tabLabel:       { fontSize: 12, fontWeight: font.medium, color: colors.textMuted },
  tabLabelActive: { color: colors.bg, fontWeight: font.bold },

  searchRow:      {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon:     { marginRight: spacing.xs },
  search:         { flex: 1, height: 40, color: colors.text, fontSize: 14 },

  list:           { paddingBottom: spacing.xl },
  row:            {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  rowBody:        { flex: 1, gap: 3 },
  nameRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moveName:       { color: colors.text, fontWeight: font.medium, fontSize: 15 },
  location:       { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  sep:            {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  empty:          {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, backgroundColor: colors.bg,
  },
  emptyText:      { color: colors.textMuted },
});
