import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useGame, type GameId } from '@/lib/GameContext';
import { colors, spacing, radius, font } from '@/lib/theme';

const GAMES: { id: GameId; label: string }[] = [
  { id: 'radical-red',      label: 'Radical Red' },
  { id: 'emerald-imperium', label: 'Imperium' },
];

function GameSelector() {
  const { game, setGame } = useGame();
  return (
    <View style={styles.selector}>
      {GAMES.map(g => (
        <TouchableOpacity
          key={g.id}
          style={[styles.chip, game === g.id && styles.chipActive]}
          onPress={() => setGame(g.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, game === g.id && styles.chipTextActive]}>
            {g.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle:      { backgroundColor: colors.surface },
        headerTintColor:  colors.text,
        headerTitleStyle: { fontWeight: font.bold, color: colors.text },
        tabBarStyle:      { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        headerRight: () => <GameSelector />,
        headerRightContainerStyle: { paddingRight: spacing.md },
      }}
    >
      <Tabs.Screen
        name="battles"
        options={{
          title: 'Battles',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tms"
        options={{
          title: 'Items',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="disc" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="codes"
        options={{
          title: 'Codes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="terminal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calc"
        options={{
          title: 'Calc',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calculator" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="information-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.xs,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor:     colors.primary,
  },
  chipText: {
    fontSize:   12,
    fontWeight: font.medium,
    color:      colors.textMuted,
  },
  chipTextActive: {
    color: colors.bg,
  },
});
