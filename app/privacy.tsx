import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

export default function PrivacyPage() {
  return (
    <ScrollView className="flex-1 bg-tato-base" contentContainerClassName="mx-auto w-full max-w-[860px] gap-6 px-5 py-12">
      <Text className="font-mono text-[12px] uppercase tracking-[2px] text-tato-accent">TATO Privacy</Text>
      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-4xl font-bold text-tato-text">How TATO handles payment data</Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          TATO stores transaction records, payout onboarding state, claim activity, and operational support data needed to move inventory and settle payments. Card details are collected and stored by Stripe, not in the TATO app bundle.
        </Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          Public buyer payment pages are limited to the item, amount, and support links needed to complete checkout safely. Private inventory photos remain in a protected storage bucket and are only exposed through time-limited signed URLs.
        </Text>
      </View>

      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-2xl font-bold text-tato-text">Need help?</Text>
        <View className="mt-4 gap-3">
          <Link className="text-base text-tato-accent" href={'/support' as never}>Contact Support</Link>
          <Link className="text-base text-tato-accent" href={'/terms' as never}>Review Terms</Link>
        </View>
      </View>
    </ScrollView>
  );
}
