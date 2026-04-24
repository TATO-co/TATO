import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-4xl font-bold text-tato-text">Screen not found</Text>
        <Text className="mt-2 text-center text-base text-tato-muted">
          No matching TATO screen is available from this link.
        </Text>
        <Link className="mt-5 text-sm font-semibold uppercase tracking-[1px] text-tato-accent" href="/(app)/(broker)/workspace">
          Return to explore
        </Link>
      </View>
    </SafeAreaView>
  );
}
