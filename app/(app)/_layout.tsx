import { Stack } from 'expo-router';

import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
import { useAuth } from '@/components/providers/AuthProvider';

export default function AppShellLayout() {
  const { user } = useAuth();

  return (
    <QueryErrorBoundary screenName="protected-shell" userId={user?.id}>
      <Stack>
        <Stack.Screen name="(broker)" options={{ headerShown: false }} />
        <Stack.Screen name="(supplier)" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="item/[itemId]" options={{ headerShown: false }} />
        <Stack.Screen name="ingestion" options={{ headerShown: false }} />
        <Stack.Screen name="live-intake" options={{ headerShown: false }} />
        <Stack.Screen name="payments" options={{ headerShown: false }} />
      </Stack>
    </QueryErrorBoundary>
  );
}
