import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

export default function SupportPage() {
  return (
    <ScrollView className="flex-1 bg-tato-base" contentContainerClassName="mx-auto w-full max-w-[860px] gap-6 px-5 py-12">
      <Text className="font-mono text-[12px] uppercase tracking-[2px] text-tato-accent">TATO Support</Text>
      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-4xl font-bold text-tato-text">Need help with a payment or pickup?</Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          Reach the TATO team at support@tato-fork.vercel.app. Include the item title, the link you opened, and what happened so we can help quickly.
        </Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          For payment questions, mention whether the card was charged, declined, or refunded. For pickup questions, include the broker who shared the link with you.
        </Text>
      </View>

      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-2xl font-bold text-tato-text">Quick Links</Text>
        <View className="mt-4 gap-3">
          <Link className="text-base text-tato-accent" href={'/terms' as never}>View Terms</Link>
          <Link className="text-base text-tato-accent" href={'/privacy' as never}>View Privacy Policy</Link>
          <Link className="text-base text-tato-accent" href="/">Return to TATO</Link>
        </View>
      </View>
    </ScrollView>
  );
}
