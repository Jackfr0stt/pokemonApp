import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Pokemon } from '@/lib/data';
import { useIsTablet } from '@/lib/layout';
import Sprite from './Sprite';
import StatBar from './StatBar';
import { colors, spacing, radius, font } from '@/lib/theme';
import { resolveHeldItem } from '@/lib/itemSpriteMap';

interface Props {
  pokemon: Pokemon;
  onCalc?: () => void;
}

const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

export default function PokemonCard({ pokemon, onCalc }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isTablet = useIsTablet();
  const spriteSize = isTablet ? 80 : 64;

  const levelStr = `Lv ${pokemon.level}`;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => setExpanded(e => !e)}
    >
      {/* Header */}
      <View style={styles.header}>
        <Sprite species={pokemon.species} size={spriteSize} />

        <View style={styles.headerBody}>
          <View style={styles.titleRow}>
            <Text style={[styles.species, isTablet && styles.speciesTablet]}>
              {pokemon.species}
            </Text>
            {onCalc && (
              <TouchableOpacity
                style={styles.calcChip}
                onPress={e => { e.stopPropagation?.(); onCalc(); }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.calcChipText}>Calc</Text>
                <Ionicons name="calculator-outline" size={11} color={colors.primary} />
              </TouchableOpacity>
            )}
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textDim}
            />
          </View>

          <Text style={styles.meta}>
            {levelStr}
            {pokemon.nature ? `  ·  ${pokemon.nature}` : ''}
            {pokemon.speedStat != null ? `  ·  ⚡ ${pokemon.speedStat}` : ''}
          </Text>

          {/* Ability + Item inline on tablet, below species on phone */}
          {isTablet && (
            <View style={styles.attrRowTablet}>
              {pokemon.ability && (
                <Text style={styles.attrInline}>
                  <Text style={styles.attrInlineLabel}>Ability  </Text>
                  {pokemon.ability}
                </Text>
              )}
              {pokemon.item && (() => {
                const src = resolveHeldItem(pokemon.item);
                return (
                  <View style={styles.itemInlineRow}>
                    {src && <Image source={src} style={styles.itemIcon} resizeMode="contain" />}
                    <Text style={styles.attrInline}>
                      <Text style={styles.attrInlineLabel}>Item  </Text>
                      {pokemon.item}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Moves — always visible */}
          <View style={styles.movesRow}>
            {pokemon.moves.filter(Boolean).map((mv, i) => (
              <View key={i} style={styles.movePill}>
                <Text style={styles.moveText}>{mv}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={[styles.detail, isTablet && styles.detailTablet]}>
          {/* Ability + Item (phone only — already shown inline on tablet) */}
          {!isTablet && (
            <View style={styles.attrRow}>
              {pokemon.ability && (
                <View style={styles.attr}>
                  <Text style={styles.attrLabel}>Ability</Text>
                  <Text style={styles.attrValue}>{pokemon.ability}</Text>
                </View>
              )}
              {pokemon.item && (() => {
                const src = resolveHeldItem(pokemon.item);
                return (
                  <View style={styles.attr}>
                    <Text style={styles.attrLabel}>Item</Text>
                    <View style={styles.itemRow}>
                      {src && <Image source={src} style={styles.itemIcon} resizeMode="contain" />}
                      <Text style={styles.attrValue}>{pokemon.item}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Stats — two columns on tablet */}
          <View style={[styles.stats, isTablet && styles.statsTablet]}>
            {STAT_ORDER.map(s => (
              <StatBar key={s} stat={s} value={pokemon.stats[s]} />
            ))}
          </View>

          {Object.values(pokemon.evs ?? {}).some(v => v && v > 0) && (
            <Text style={styles.evNote}>
              EVs:{' '}
              {STAT_ORDER
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
  card:             {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  header:           { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  headerBody:       { flex: 1 },
  titleRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  species:          { color: colors.text, fontSize: 16, fontWeight: font.bold, flex: 1 },
  speciesTablet:    { fontSize: 18 },
  meta:             { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  attrRowTablet:    { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xs },
  attrInline:       { color: colors.text, fontSize: 13 },
  attrInlineLabel:  { color: colors.textDim, fontSize: 11 },
  itemInlineRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemRow:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  itemIcon:         { width: 20, height: 20 },

  movesRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  movePill:         {
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  moveText:         { color: colors.textMuted, fontSize: 11 },

  detail:           { marginTop: spacing.md, gap: spacing.sm },
  detailTablet:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  attrRow:          { flexDirection: 'row', gap: spacing.xl },
  attr:             { flex: 1 },
  attrLabel:        { color: colors.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  attrValue:        { color: colors.text, fontSize: 13, fontWeight: font.medium, marginTop: 2 },
  stats:            { gap: 0 },
  statsTablet:      { flex: 1, minWidth: 200 },
  evNote:           { color: colors.textDim, fontSize: 11, marginTop: spacing.xs },
  calcChip:         {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: colors.primary + '88',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    marginRight: spacing.xs,
  },
  calcChipText:     { color: colors.primary, fontSize: 11, fontWeight: font.medium },
});
