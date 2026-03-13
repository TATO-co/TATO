import { Link, Stack } from 'expo-router';
import { SafeAreaView, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-4xl font-bold text-tato-text">Screen not found</Text>
        <Text className="mt-2 text-center text-base text-tato-muted">
          This route does not exist in the current TATO navigation tree.
        </Text>
        <Link className="mt-5 text-sm font-semibold uppercase tracking-[1px] text-tato-accent" href="/(app)/(broker)/workspace">
          Return to explore
        </Link>
      </View>
    </SafeAreaView>
  );
}
