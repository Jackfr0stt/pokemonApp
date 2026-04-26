import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GameProvider } from '@/lib/GameContext';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <GameProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </GameProvider>
  );
}
