import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';

import { AuthAccessCard } from '@/components/auth/AuthAccessCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { useViewportInfo } from '@/lib/constants';

export default function SignInScreen() {
  const { isDesktop, pageGutter } = useViewportInfo();

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <LinearGradient
        colors={['#030813', '#07162b', '#081b34', '#030a16']}
        locations={[0, 0.34, 0.68, 1]}
        className="flex-1">
        <View className="absolute -left-12 top-24 h-48 w-48 rounded-full bg-[#1e6dff]/18" />
        <View className="absolute right-0 top-4 h-56 w-56 rounded-full bg-white/6" />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: pageGutter,
            paddingVertical: isDesktop ? 36 : 22,
          }}>
          <View className="mx-auto w-full max-w-[1120px]">
            <View className={`${isDesktop ? 'flex-row items-center gap-8' : 'gap-7'}`}>
              <View className={`${isDesktop ? 'max-w-[450px] flex-1' : 'w-full'}`}>
                <View className="h-20 w-20 items-center justify-center rounded-[24px] border border-white/12 bg-white/7">
                  <Text className="font-sans-bold text-4xl text-white">T</Text>
                </View>

                <Text className="mt-6 font-mono text-sm uppercase tracking-[3px] text-tato-accent">
                  TATO ACCESS
                </Text>
                <Text className="mt-3 text-[42px] font-sans-bold leading-[46px] text-tato-text">
                  Direct access to the workspace.
                </Text>
                <Text className="mt-4 max-w-[420px] text-base leading-7 text-tato-muted">
                  Use the focused sign-in route when you already know why you&apos;re here. Supplier and broker access still share the same account flow.
                </Text>

                <Link href="/" asChild>
                  <PressableScale
                    accessibilityLabel="Open the welcome page"
                    accessibilityRole="link"
                    className="mt-6 self-start rounded-full border border-[#295088] bg-[#0c1830]/92 px-5 py-4">
                    <Text className="font-mono text-[12px] font-semibold uppercase tracking-[1.4px] text-tato-text">
                      Open Welcome Page
                    </Text>
                  </PressableScale>
                </Link>

                <Text className="mt-6 font-mono text-[10px] uppercase tracking-[2px] text-tato-dim">
                  Terminal v1.0.4 • Built for Recommerce
                </Text>
              </View>

              <View className={`${isDesktop ? 'max-w-[440px] flex-1' : 'w-full'}`}>
                <AuthAccessCard
                  description="One sign-in opens supplier intake, broker workflow, and persona setup for new operators."
                  eyebrow="TATO ACCESS"
                  title="Access TATO."
                  variant="signIn"
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}
