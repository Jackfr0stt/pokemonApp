import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getGameData } from '@/lib/data';
import { colors, spacing, radius, font } from '@/lib/theme';

export default function CodesScreen() {
  const { game }  = useGame();
  const data      = getGameData(game);
  const caps      = data.levelCaps ?? [];
  const codes     = data.codes ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {caps.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Level Caps</Text>
          {caps.map((cap, i) => (
            <View key={i} style={styles.capRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelNum}>{cap.level}</Text>
              </View>
              <Text style={styles.capTrigger}>{cap.trigger}</Text>
            </View>
          ))}
        </>
      )}

      {codes.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Cheat Codes</Text>
          {codes.map((c, i) => (
            <View key={i} style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Ionicons name="terminal-outline" size={14} color={colors.accent} />
                <Text style={styles.codeName}>{c.code}</Text>
              </View>
              <Text style={styles.codeDesc}>{c.description}</Text>
            </View>
          ))}
        </>
      )}

      {caps.length === 0 && codes.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No data for this game yet</Text>
        </View>
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
  capRow:       {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  levelBadge:   {
    width: 44, height: 28, borderRadius: radius.sm,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  levelNum:     { color: colors.bg, fontWeight: font.bold, fontSize: 14 },
  capTrigger:   { flex: 1, color: colors.text, fontSize: 13 },
  codeCard:     {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  codeHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  codeName:     { color: colors.accent, fontWeight: font.bold, fontSize: 14 },
  codeDesc:     { color: colors.textMuted, fontSize: 13 },
  empty:        { flex: 1, alignItems: 'center', paddingTop: spacing.xxl },
  emptyText:    { color: colors.textMuted },
});
