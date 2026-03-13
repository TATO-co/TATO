import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen name="users" options={{ headerShown: false }} />
    </Stack>
  );
}
