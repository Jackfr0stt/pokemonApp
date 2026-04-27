import { Stack } from 'expo-router';
import { colors, font } from '@/lib/theme';

export default function BattlesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: colors.surface },
        headerTintColor:  colors.text,
        headerTitleStyle: { fontWeight: font.bold, color: colors.text },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
