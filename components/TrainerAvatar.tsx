import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, font } from '@/lib/theme';

const GRADIENT_PAIRS: [string, string][] = [
  ['#e8b4b8', '#c45c6a'],
  ['#f4c430', '#d4941a'],
  ['#63bb5b', '#2d8a24'],
  ['#4d90d5', '#1a5fa0'],
  ['#ab6ac8', '#7a3a9a'],
  ['#74cfc0', '#3a9a8a'],
  ['#f96d21', '#c44a00'],
  ['#ce4265', '#9a1a35'],
];

function colorForName(name: string | null): [string, string] {
  if (!name) return GRADIENT_PAIRS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length];
}

interface Props {
  name: string | null;
  size?: number;
}

export default function TrainerAvatar({ name, size = 40 }: Props) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const [bg] = colorForName(name);

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar:  { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: font.bold },
});
