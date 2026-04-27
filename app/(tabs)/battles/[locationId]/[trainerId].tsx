import { ScrollView, View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/lib/GameContext';
import { getTrainer } from '@/lib/data';
import type { Pokemon } from '@/lib/data';
import PokemonCard from '@/components/PokemonCard';
import { colors, spacing, font } from '@/lib/theme';
import { setPendingDefender } from '@/lib/calcStore';


export default function TrainerDetailScreen() {
  const { locationId, trainerId } = useLocalSearchParams<{
    locationId: string; trainerId: string;
  }>();
  const { game } = useGame();
  const router   = useRouter();
  const trainer  = getTrainer(game, locationId, trainerId);

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
          <View style={styles.badge}>
            <Ionicons name="disc" size={14} color={colors.accent} />
            <Text style={styles.badgeText}>Reward: {trainer.tmReward}</Text>
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
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  missing:   { color: colors.textMuted },
  badge:     {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, padding: spacing.sm,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  badgeText: { color: colors.accent, fontSize: 13, fontWeight: font.medium },
  pasteBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
  },
  pasteBtnText: { color: colors.primary, fontSize: 13 },
});
