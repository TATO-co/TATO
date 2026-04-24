import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { getRuntimeConfigIssueMessage } from '@/lib/config';

export default function ConfigurationRequiredScreen() {
  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <LinearGradient
        className="flex-1"
        colors={['#030813', '#07162b', '#081b34', '#030a16']}
        locations={[0, 0.34, 0.68, 1]}>
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 items-center justify-center px-8 py-8">
            <View className="w-full max-w-[560px] rounded-[32px] border border-tato-line bg-[#071121]/94 p-6">
              <Text className="font-mono text-[11px] uppercase tracking-[2px] text-tato-warn">
                Runtime Setup
              </Text>
              <Text className="mt-4 text-3xl font-sans-bold text-tato-text">
                This build is not ready for operator access.
              </Text>
              <Text className="mt-4 text-base leading-7 text-tato-muted">
                TATO is missing the configuration it needs before anyone can sign in or restore a workspace session.
              </Text>

              <View className="mt-5 rounded-[24px] border border-tato-line bg-tato-panelSoft p-4">
                <Text className="text-sm leading-6 text-tato-muted">
                  {getRuntimeConfigIssueMessage() ??
                    'Supabase configuration is required before this build can be used.'}
                </Text>
              </View>

              <Text className="mt-4 text-sm leading-6 text-tato-dim">
                Once the runtime is configured, operators return to the normal email-code sign-in flow automatically.
              </Text>

              <Link asChild href="/">
                <PressableScale
                  accessibilityLabel="Return to the welcome page"
                  accessibilityRole="link"
                  className="mt-6 self-start rounded-full border border-[#295088] bg-[#0c1830]/92 px-5 py-4">
                  <Text className="font-mono text-[12px] font-semibold uppercase tracking-[1.4px] text-tato-text">
                    Open Welcome Page
                  </Text>
                </PressableScale>
              </Link>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}
