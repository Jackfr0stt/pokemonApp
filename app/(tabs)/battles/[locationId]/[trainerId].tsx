import { ScrollView, View, Text, Image, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getTrainer, getGameData } from '@/lib/data';
import type { Pokemon, TrainerPartner } from '@/lib/data';
import PokemonCard from '@/components/PokemonCard';
import { colors, spacing, font } from '@/lib/theme';
import { setPendingDefender } from '@/lib/calcStore';
import { resolveRewards } from '@/lib/rewardResolver';


export default function TrainerDetailScreen() {
  const { locationId, trainerId } = useLocalSearchParams<{
    locationId: string; trainerId: string;
  }>();
  const { game } = useGame();
  const router   = useRouter();
  const trainer  = getTrainer(game, locationId, trainerId);
  const tms      = getGameData(game).tms;

  function PartnerSection({ partner }: { partner: TrainerPartner }) {
    return (
      <View style={styles.partnerSection}>
        <View style={styles.partnerDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.partnerLabel}>{partner.name ?? 'Partner'}</Text>
          <View style={styles.dividerLine} />
        </View>
        {partner.team.filter(m => m.species).map((mon, i) => (
          <PokemonCard key={i} pokemon={mon} onCalc={() => sendToCalc(mon)} />
        ))}
        {partner.pokepaste && (
          <TouchableOpacity
            style={styles.pasteBtn}
            onPress={() => Linking.openURL(partner.pokepaste!)}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={14} color={colors.primary} />
            <Text style={styles.pasteBtnText}>View Poképaste</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function sendToCalc(mon: Pokemon) {
    const level = typeof mon.level === 'string' ? parseInt(mon.level, 10) || 50 : mon.level;
    setPendingDefender({
      species: mon.species,
      level,
      nature:  mon.nature ?? 'Hardy',
      evs:     mon.evs ?? {},
      ivs:     Object.keys(mon.ivs ?? {}).length ? mon.ivs : undefined,
    });
    router.navigate('/(tabs)/calc');
  }

  if (!trainer) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Trainer not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: trainer.name ?? 'Trainer', headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {trainer.tmReward && (
          <View style={styles.rewardBox}>
            <Text style={styles.rewardHeader}>Reward</Text>
            <View style={styles.rewardRow}>
              {resolveRewards(trainer.tmReward, tms).map((r, i) => (
                <View key={i} style={styles.rewardChip}>
                  {r.image != null && (
                    <Image source={r.image} style={styles.rewardIcon} resizeMode="contain" />
                  )}
                  <Text style={styles.rewardLabel}>{r.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {trainer.team.map((mon, i) => (
          <PokemonCard key={i} pokemon={mon} onCalc={() => sendToCalc(mon)} />
        ))}

        {trainer.pokepaste && (
          <TouchableOpacity
            style={styles.pasteBtn}
            onPress={() => Linking.openURL(trainer.pokepaste!)}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={14} color={colors.primary} />
            <Text style={styles.pasteBtnText}>View Poképaste</Text>
          </TouchableOpacity>
        )}

        {trainer.partner && <PartnerSection partner={trainer.partner} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  missing:   { color: colors.textMuted },
  rewardBox: {
    backgroundColor: colors.surface, borderRadius: 8, padding: spacing.sm, gap: spacing.xs,
  },
  rewardHeader: { color: colors.accent, fontSize: 11, fontWeight: font.medium, textTransform: 'uppercase', letterSpacing: 0.8 },
  rewardRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rewardChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rewardIcon: { width: 22, height: 22 },
  rewardLabel: { color: colors.text, fontSize: 13 },
  pasteBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  pasteBtnText: { color: colors.primary, fontSize: 13 },
  partnerSection: { gap: spacing.md },
  partnerDivider: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  partnerLabel: {
    color: colors.textMuted, fontSize: 12, fontWeight: font.medium,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
});
