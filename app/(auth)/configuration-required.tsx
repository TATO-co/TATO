import { SafeAreaView, ScrollView, Text, View } from 'react-native';

import { getRuntimeConfigIssueMessage } from '@/lib/config';

export default function ConfigurationRequiredScreen() {
  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-8 py-8">
          <View className="w-full max-w-[520px] rounded-[28px] border border-tato-line bg-tato-panel p-6">
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-accent">
              Configuration Error
            </Text>
            <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
              This build is missing required production settings.
            </Text>
            <Text className="mt-4 text-base leading-7 text-tato-muted">
              {getRuntimeConfigIssueMessage() ??
                'Supabase configuration is required before this build can be used.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
