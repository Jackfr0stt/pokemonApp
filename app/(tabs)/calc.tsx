import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font } from '@/lib/theme';

export default function CalcScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="calculator-outline" size={56} color={colors.textDim} />
      <Text style={styles.title}>Damage Calculator</Text>
      <Text style={styles.sub}>Coming Day 6–7</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  title:     { color: colors.text, fontSize: 20, fontWeight: font.bold },
  sub:       { color: colors.textMuted, fontSize: 14 },
});
