import { View, Image, Text, StyleSheet } from 'react-native';
import { resolveSprite } from '@/lib/spriteResolver';
import { colors, font } from '@/lib/theme';

interface Props {
  species: string | null | undefined;
  size?: number;
}

// Stable placeholder color from species name
function placeholderColor(species: string): string {
  const palette = [
    '#e8b4b8', '#f4c430', '#63bb5b', '#4d90d5',
    '#ab6ac8', '#74cfc0', '#f96d21', '#9ea0a1',
  ];
  let h = 0;
  for (let i = 0; i < species.length; i++) h = (h * 31 + species.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

export default function Sprite({ species, size = 64 }: Props) {
  if (!species) return null;
  const src = resolveSprite(species);

  if (!src) {
    // Placeholder: colored circle with initials
    const initial = (species?.[0] ?? '?').toUpperCase();
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: placeholderColor(species) },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
      </View>
    );
  }

  return (
    <Image
      source={src}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initial:     { color: '#fff', fontWeight: font.bold },
});
