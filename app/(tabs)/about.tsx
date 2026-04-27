import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, font } from '@/lib/theme';

const SECTIONS: { heading: string; rows: { label: string; value: string }[] }[] = [
  {
    heading: 'Games',
    rows: [
      { label: 'Radical Red 4.1',   value: 'by HackMew — FireRed romhack' },
      { label: 'Emerald Imperium',  value: 'by Lunos — Emerald romhack' },
    ],
  },
  {
    heading: 'Battle Data',
    rows: [
      { label: 'Trainer teams & EVs',       value: 'Community spreadsheets' },
      { label: 'TM / HM & tutor lists',     value: 'hzla / Dynamic-Calc-Decomps' },
      { label: 'Damage calc overrides',     value: 'hzla / Dynamic-Calc-Decomps' },
      { label: 'Type chart',                value: 'Bulbapedia (Gen IX)' },
    ],
  },
  {
    heading: 'Sprites',
    rows: [
      { label: 'Animated sprites (Gen V)',  value: 'PokeAPI community contributors (CC0)' },
      { label: 'Static fallback sprites',   value: 'PokeAPI contributors (CC0)' },
    ],
  },
  {
    heading: 'Libraries & Tools',
    rows: [
      { label: 'Damage calc engine',   value: '@smogon/calc (smogon/damage-calc)' },
      { label: 'Framework',            value: 'Expo / React Native' },
      { label: 'Navigation',           value: 'expo-router' },
      { label: 'Icons',                value: 'Ionicons via @expo/vector-icons' },
      { label: 'Fonts',                value: 'Sora + JetBrains Mono (OFL)' },
    ],
  },
];

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Pokémon App</Text>
      <Text style={styles.sub}>Personal companion for Radical Red 4.1 &amp; Emerald Imperium</Text>

      {SECTIONS.map(section => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.heading}</Text>
          {section.rows.map(c => (
            <View key={c.label} style={styles.row}>
              <Text style={styles.label}>{c.label}</Text>
              <Text style={styles.value}>{c.value}</Text>
            </View>
          ))}
        </View>
      ))}

      <Text style={styles.disclaimer}>
        Pokémon names, type data, and related intellectual property belong to The Pokémon Company /
        Nintendo / Game Freak. Radical Red and Emerald Imperium are fan-made romhacks and are not
        affiliated with or endorsed by the original rights holders. This app is for personal,
        non-commercial use only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl },
  title:        { color: colors.text, fontSize: 24, fontWeight: font.bold, marginBottom: spacing.xs },
  sub:          { color: colors.textMuted, fontSize: 14, marginBottom: spacing.xl },
  section:      { marginBottom: spacing.xl },
  sectionTitle: {
    color: colors.accent, fontSize: 11, fontWeight: font.bold,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  label:      { color: colors.textMuted, fontSize: 13, flex: 1 },
  value:      { color: colors.text, fontSize: 13, flex: 1.5, textAlign: 'right' },
  disclaimer: {
    marginTop: spacing.lg, color: colors.textDim, fontSize: 11,
    lineHeight: 17, fontStyle: 'italic',
  },
});
