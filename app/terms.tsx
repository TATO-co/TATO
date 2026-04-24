import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

export default function TermsPage() {
  return (
    <ScrollView className="flex-1 bg-tato-base" contentContainerClassName="mx-auto w-full max-w-[860px] gap-6 px-5 py-12">
      <Text className="font-mono text-[12px] uppercase tracking-[2px] text-tato-accent">TATO Terms</Text>
      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-4xl font-bold text-tato-text">Marketplace Payment Terms</Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          TATO facilitates local resale payments between a buyer, a broker, and the original supplier. When you complete a Stripe payment, you authorize TATO to collect the listed amount for the selected item and coordinate pickup with the broker who shared the link.
        </Text>
        <Text className="mt-4 text-base leading-8 text-tato-muted">
          Payment links are item-specific and may expire or be replaced if the broker updates the sale details. Refunds, cancellations, and pickup disputes are handled by the TATO support team using the transaction record connected to the link you received.
        </Text>
      </View>

      <View className="rounded-[28px] border border-tato-line bg-tato-panel p-6">
        <Text className="text-2xl font-bold text-tato-text">More Information</Text>
        <View className="mt-4 gap-3">
          <Link className="text-base text-tato-accent" href={'/privacy' as never}>Read Privacy Policy</Link>
          <Link className="text-base text-tato-accent" href={'/support' as never}>Contact Support</Link>
        </View>
      </View>
    </ScrollView>
  );
}
