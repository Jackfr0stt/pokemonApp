import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getLocations } from '@/lib/data';
import { useIsTablet } from '@/lib/layout';
import { colors, spacing, radius, font } from '@/lib/theme';
import TrainerAvatar from '@/components/TrainerAvatar';

export default function BattlesScreen() {
  const { game } = useGame();
  const router   = useRouter();
  const isTablet = useIsTablet();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.toLowerCase().trim();
    return getLocations(game)
      .map(loc => ({
        title: loc.name,
        locationId: loc.id,
        data: loc.trainers.filter(t =>
          !q || t.name?.toLowerCase().includes(q) || loc.name.toLowerCase().includes(q)
        ),
      }))
      .filter(s => s.data.length > 0);
  }, [game, query]);

  return (
    <View style={styles.container}>
      <View style={[styles.inner, isTablet && styles.innerTablet]}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search trainer or location…"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t, i) => `${t.id}-${i}`}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item: trainer, section }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: '/battles/[locationId]/[trainerId]',
                params: { locationId: section.locationId, trainerId: trainer.id },
              })
            }
          >
            <TrainerAvatar name={trainer.name} size={40} />
            <View style={styles.rowBody}>
              <Text style={styles.trainerName}>{trainer.name ?? 'Trainer'}</Text>
              <Text style={styles.teamPreview}>
                {trainer.team.map(m => m.species).join('  ·  ')}
              </Text>
            </View>
            <Text style={styles.count}>{trainer.team.length}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  inner:         { flex: 1, width: '100%' },
  innerTablet:   { maxWidth: 900, alignSelf: 'center', width: '100%' },
  searchRow:     {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon:    { marginRight: spacing.xs },
  search:        { flex: 1, height: 40, color: colors.text, fontSize: 14 },
  sectionHeader: {
    backgroundColor: colors.bg,
    color: colors.accent,
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  list:     { paddingBottom: spacing.xl },
  row:      {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowBody:      { flex: 1 },
  trainerName:  { color: colors.text, fontWeight: font.medium, fontSize: 15 },
  teamPreview:  { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  count:        { color: colors.textDim, fontSize: 13 },
});
