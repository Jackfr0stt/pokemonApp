import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, font } from '@/lib/theme';

const STAT_MAX = 255;

const STAT_COLORS: Record<string, string> = {
  hp:  '#ff5959',
  atk: '#f5ac78',
  def: '#fae078',
  spa: '#9db7f5',
  spd: '#a7db8d',
  spe: '#fa92b2',
};

const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

interface Props { stat: string; value: number | undefined }

export default function StatBar({ stat, value }: Props) {
  if (value == null) return null;
  const pct = Math.min(value / STAT_MAX, 1);
  const color = STAT_COLORS[stat] ?? colors.primary;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{STAT_LABELS[stat] ?? stat}</Text>
      <Text style={styles.value}>{value}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: 1 },
  label: { color: colors.textMuted, fontSize: 11, width: 28, textAlign: 'right' },
  value: { color: colors.text, fontSize: 11, width: 28, textAlign: 'right', fontWeight: font.medium },
  track: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3 },
});
