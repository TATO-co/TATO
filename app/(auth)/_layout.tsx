import { Stack } from 'expo-router';

import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
import { useAuth } from '@/components/providers/AuthProvider';

export default function AuthLayout() {
  const { user } = useAuth();

  return (
    <QueryErrorBoundary screenName="auth-recovery" userId={user?.id}>
      <Stack>
        <Stack.Screen name="account-suspended" options={{ headerShown: false }} />
        <Stack.Screen name="configuration-required" options={{ headerShown: false }} />
        <Stack.Screen name="persona-setup" options={{ headerShown: false }} />
        <Stack.Screen name="session-error" options={{ headerShown: false }} />
      </Stack>
    </QueryErrorBoundary>
  );
}
