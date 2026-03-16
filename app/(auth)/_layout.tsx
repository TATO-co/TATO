import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="account-suspended" options={{ headerShown: false }} />
      <Stack.Screen name="configuration-required" options={{ headerShown: false }} />
      <Stack.Screen name="persona-setup" options={{ headerShown: false }} />
      <Stack.Screen name="session-error" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
