import { Stack } from 'expo-router';

export default function AppShellLayout() {
  return (
    <Stack>
      <Stack.Screen name="(broker)" options={{ headerShown: false }} />
      <Stack.Screen name="(supplier)" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="item/[itemId]" options={{ headerShown: false }} />
      <Stack.Screen name="ingestion" options={{ headerShown: false }} />
      <Stack.Screen name="live-intake" options={{ headerShown: false }} />
      <Stack.Screen name="payments" options={{ headerShown: false }} />
    </Stack>
  );
}
