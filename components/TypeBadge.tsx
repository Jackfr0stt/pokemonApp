import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, font } from '@/lib/theme';

interface Props { type: string; small?: boolean }

export default function TypeBadge({ type, small = false }: Props) {
  const bg = colors.types[type.toLowerCase()] ?? '#888';
  return (
    <View style={[styles.badge, small && styles.small, { backgroundColor: bg }]}>
      <Text style={[styles.text, small && styles.textSmall]}>
        {type.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge:     { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  small:     { paddingHorizontal: 4, paddingVertical: 1 },
  text:      { color: '#fff', fontSize: 11, fontWeight: font.bold, letterSpacing: 0.5 },
  textSmall: { fontSize: 9 },
});
