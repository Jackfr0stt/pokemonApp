import { useState, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getGameData } from '@/lib/data';
import TypeBadge from '@/components/TypeBadge';
import { colors, spacing, radius, font } from '@/lib/theme';

type Tab = 'tms' | 'tutors' | 'megas';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tms',    label: 'TMs / HMs', icon: 'disc-outline' },
  { id: 'tutors', label: 'Tutors',    icon: 'school-outline' },
  { id: 'megas',  label: 'Mega',      icon: 'diamond-outline' },
];

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
    return tms.filter(tm =>
      !q ||
      tm.code.toLowerCase().includes(q) ||
      tm.move?.toLowerCase().includes(q) ||
      tm.location?.toLowerCase().includes(q)
    );
  }, [tms, query]);

  const filteredTutors = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tutors.filter(t =>
      !q ||
      t.move?.toLowerCase().includes(q) ||
      t.location?.toLowerCase().includes(q)
    );
  }, [tutors, query]);

  const filteredMegas = useMemo(() => {
    const q = query.toLowerCase().trim();
    return megas.filter(m =>
      !q ||
      m.stone?.toLowerCase().includes(q) ||
      m.location?.toLowerCase().includes(q)
    );
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
              <Text style={styles.code}>{item.code}</Text>
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.moveName}>{item.move}</Text>
                  {item.type && <TypeBadge type={item.type} />}
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
              <View style={styles.tutorDot} />
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
              <Ionicons name="diamond" size={14} color={colors.primary} style={styles.megaIcon} />
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
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  code:           { color: colors.accent, fontWeight: font.bold, fontSize: 12, width: 60, paddingTop: 2 },
  tutorDot:       {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary, marginTop: 5,
  },
  megaIcon:       { marginTop: 2 },
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
