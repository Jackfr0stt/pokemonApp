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
import { TM_DISC, MEGA_STONE } from '@/lib/itemSpriteMap';
import { colors, spacing, radius, font } from '@/lib/theme';

type Tab = 'tms' | 'tutors' | 'megas';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tms',    label: 'TMs / HMs', icon: 'disc-outline' },
  { id: 'tutors', label: 'Tutors',    icon: 'school-outline' },
  { id: 'megas',  label: 'Mega',      icon: 'diamond-outline' },
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

// ── Tutor star disc ───────────────────────────────────────────────────────────
function TutorIcon() {
  return (
    <View style={[iconStyles.img, iconStyles.tutorDisc]}>
      <Ionicons name="star" size={16} color="#fff" />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  img:       { width: 36, height: 36, flexShrink: 0 },
  fallback:  { alignItems: 'center', justifyContent: 'center' },
  tutorDisc: {
    borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
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

  const placeholder = tab === 'tms'
    ? 'Search TM, move, or location…'
    : tab === 'tutors'
    ? 'Search move or location…'
    : 'Search stone or location…';

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

  const isEmpty =
    (tab === 'tms'    && tms.length === 0) ||
    (tab === 'tutors' && tutors.length === 0) ||
    (tab === 'megas'  && megas.length === 0);

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
                  <Text style={styles.moveName}>{item.move}</Text>
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
              <TutorIcon />
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
      ) : (
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
