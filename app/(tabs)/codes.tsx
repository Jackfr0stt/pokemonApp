import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getGameData } from '@/lib/data';
import { colors, spacing, radius, font } from '@/lib/theme';

export default function CodesScreen() {
  const { game } = useGame();
  const data     = getGameData(game);
  const caps     = data.levelCaps ?? [];
  const codes    = data.codes ?? [];

  if (caps.length === 0 && codes.length === 0) {
    return (
      <View style={styles.emptyFull}>
        <Ionicons name="terminal-outline" size={48} color={colors.textDim} />
        <Text style={styles.emptyTitle}>No data for this game</Text>
        <Text style={styles.emptySub}>Codes and level caps are only available for Radical Red</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {caps.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Level Caps</Text>
          <View style={styles.capsCard}>
            {caps.map((cap, i) => (
              <View key={i} style={[styles.capRow, i < caps.length - 1 && styles.capRowBorder]}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelNum}>{cap.level}</Text>
                </View>
                <Text style={styles.capTrigger}>{cap.trigger}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {codes.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, caps.length > 0 && { marginTop: spacing.xl }]}>
            Cheat Codes
          </Text>
          <Text style={styles.codeHint}>
            Enter these codes in the in-game cheat menu before starting a session.
          </Text>
          {codes.map((c, i) => (
            <View key={i} style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Ionicons name="terminal-outline" size={13} color={colors.accent} />
                <Text style={styles.codeName}>{c.code}</Text>
              </View>
              <Text style={styles.codeDesc}>{c.description}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl },

  sectionTitle: {
    color: colors.accent, fontSize: 11, fontWeight: font.bold,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm,
  },

  capsCard:     {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  capRow:       {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, padding: spacing.md,
  },
  capRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  levelBadge:   {
    minWidth: 44, height: 28, borderRadius: radius.sm,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  levelNum:     { color: colors.bg, fontWeight: font.bold, fontSize: 14 },
  capTrigger:   { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },

  codeHint:     { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md, lineHeight: 17 },
  codeCard:     {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  codeHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  codeName:     { color: colors.accent, fontWeight: font.bold, fontSize: 15, letterSpacing: 0.5 },
  codeDesc:     { color: colors.textMuted, fontSize: 13, lineHeight: 18 },

  emptyFull:    {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, backgroundColor: colors.bg, padding: spacing.xl,
  },
  emptyTitle:   { color: colors.text, fontSize: 16, fontWeight: font.bold },
  emptySub:     { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
