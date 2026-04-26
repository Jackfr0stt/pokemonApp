import { useState, useMemo } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getGameData } from '@/lib/data';
import TypeBadge from '@/components/TypeBadge';
import { colors, spacing, radius, font } from '@/lib/theme';

export default function TMsScreen() {
  const { game } = useGame();
  const [query, setQuery] = useState('');

  const data = getGameData(game);
  const tms  = data.tms ?? [];
  const tutors = data.tutors ?? [];
  const megas  = data.megaStones ?? [];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tms.filter(
      tm => !q || tm.code.toLowerCase().includes(q) || tm.move?.toLowerCase().includes(q) || tm.location?.toLowerCase().includes(q)
    );
  }, [tms, query]);

  if (tms.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="disc-outline" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>TM data coming soon</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search TM, move, or location…"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filtered}
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
                <Text style={styles.location} numberOfLines={2}>{item.location}</Text>
              )}
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  searchRow:  {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: spacing.xs },
  search:     { flex: 1, height: 40, color: colors.text, fontSize: 14 },
  list:       { paddingBottom: spacing.xl },
  row:        { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  code:       { color: colors.accent, fontWeight: font.bold, fontSize: 12, width: 56, marginTop: 2 },
  rowBody:    { flex: 1, gap: 4 },
  nameRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moveName:   { color: colors.text, fontWeight: font.medium, fontSize: 15 },
  location:   { color: colors.textMuted, fontSize: 12 },
  sep:        { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  emptyText:  { color: colors.textMuted },
});
