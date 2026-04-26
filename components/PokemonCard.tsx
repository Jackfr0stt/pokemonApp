import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Pokemon } from '@/lib/data';
import StatBar from './StatBar';
import { colors, spacing, radius, font } from '@/lib/theme';

interface Props { pokemon: Pokemon }

const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

export default function PokemonCard({ pokemon }: Props) {
  const [expanded, setExpanded] = useState(false);

  const levelStr = typeof pokemon.level === 'number'
    ? `Lv ${pokemon.level}`
    : `Lv ${pokemon.level}`;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.species}>{pokemon.species}</Text>
          <Text style={styles.meta}>
            {levelStr}
            {pokemon.nature ? `  ·  ${pokemon.nature}` : ''}
            {pokemon.speedStat != null ? `  ·  ⚡ ${pokemon.speedStat}` : ''}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textDim}
        />
      </View>

      {/* Moves row — always visible */}
      <View style={styles.movesRow}>
        {pokemon.moves.filter(Boolean).map((mv, i) => (
          <View key={i} style={styles.movePill}>
            <Text style={styles.moveText}>{mv}</Text>
          </View>
        ))}
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.detail}>
          <View style={styles.detailRow}>
            {pokemon.ability && (
              <View style={styles.attr}>
                <Text style={styles.attrLabel}>Ability</Text>
                <Text style={styles.attrValue}>{pokemon.ability}</Text>
              </View>
            )}
            {pokemon.item && (
              <View style={styles.attr}>
                <Text style={styles.attrLabel}>Item</Text>
                <Text style={styles.attrValue}>{pokemon.item}</Text>
              </View>
            )}
          </View>

          <View style={styles.stats}>
            {STAT_ORDER.map(s => (
              <StatBar key={s} stat={s} value={pokemon.stats[s]} />
            ))}
          </View>

          {/* IVs / EVs summary if non-default */}
          {Object.values(pokemon.evs ?? {}).some(v => v && v > 0) && (
            <Text style={styles.evNote}>
              EVs: {STAT_ORDER
                .filter(s => pokemon.evs[s])
                .map(s => `${pokemon.evs[s]} ${s.toUpperCase()}`)
                .join(' / ')}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card:       {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  header:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { flex: 1 },
  species:    { color: colors.text, fontSize: 16, fontWeight: font.bold },
  meta:       { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  movesRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  movePill:   {
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  moveText:   { color: colors.textMuted, fontSize: 11 },
  detail:     { marginTop: spacing.md, gap: spacing.sm },
  detailRow:  { flexDirection: 'row', gap: spacing.xl },
  attr:       { flex: 1 },
  attrLabel:  { color: colors.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  attrValue:  { color: colors.text, fontSize: 13, fontWeight: font.medium, marginTop: 2 },
  stats:      { gap: 0 },
  evNote:     { color: colors.textDim, fontSize: 11, marginTop: spacing.xs },
});
