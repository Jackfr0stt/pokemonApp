import { ScrollView, View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { colors, spacing, radius, font } from '@/lib/theme';

const CREDITS = [
  { label: 'Radical Red',           value: 'by HackMew' },
  { label: 'Emerald Imperium',       value: 'by Lunos' },
  { label: 'Battle docs',            value: 'Community spreadsheets' },
  { label: 'Damage calc engine',     value: '@smogon/calc + hzla/Dynamic-Calc-Decomps' },
  { label: 'Sprites',                value: 'PokeAPI (CC0)' },
];

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Pokémon App</Text>
      <Text style={styles.sub}>Personal companion for Radical Red 4.1 & Emerald Imperium</Text>

      <Text style={styles.sectionTitle}>Credits</Text>
      {CREDITS.map(c => (
        <View key={c.label} style={styles.row}>
          <Text style={styles.label}>{c.label}</Text>
          <Text style={styles.value}>{c.value}</Text>
        </View>
      ))}

      <Text style={styles.disclaimer}>
        Pokémon names, type data, and related IP belong to The Pokémon Company / Nintendo / Game Freak.
        This app is for personal, non-commercial use only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl },
  title:        { color: colors.text, fontSize: 24, fontWeight: font.bold, marginBottom: spacing.xs },
  sub:          { color: colors.textMuted, fontSize: 14, marginBottom: spacing.xl },
  sectionTitle: {
    color: colors.accent, fontSize: 11, fontWeight: font.bold,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  row:          {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  label:        { color: colors.textMuted, fontSize: 13, flex: 1 },
  value:        { color: colors.text, fontSize: 13, flex: 1.5, textAlign: 'right' },
  disclaimer:   {
    marginTop: spacing.xl, color: colors.textDim, fontSize: 11,
    lineHeight: 17, fontStyle: 'italic',
  },
});
