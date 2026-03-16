import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Share } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { FeedState } from '@/components/ui/FeedState';
import { useViewportInfo } from '@/lib/constants';
import { useItemDetail } from '@/lib/hooks/useItemDetail';
import { formatMoney } from '@/lib/models';

export default function ItemDetailsScreen() {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const router = useRouter();
  const { isPhone, pageGutter, pageMaxWidth } = useViewportInfo();
  const { detail, error, loading, refresh } = useItemDetail(itemId ?? null);

  const handleShare = async () => {
    if (!detail) {
      return;
    }

    const payload = `${detail.title}\n${detail.description}\nClaim fee: ${formatMoney(detail.claimFeeCents, detail.currencyCode, 2)}`;
    try {
      await Share.share({ message: payload });
    } catch {
      // no-op
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-tato-base">
      <View className="mx-auto flex-1 w-full pt-4" style={{ maxWidth: pageMaxWidth ?? 1180, paddingHorizontal: pageGutter }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-[#132342]"
            onPress={() => router.back()}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
          </Pressable>
          <Text className="text-2xl font-bold text-tato-text">Item Detail</Text>
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-[#132342]"
            onPress={handleShare}>
            <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={18} tintColor="#edf4ff" />
          </Pressable>
        </View>

        {loading ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color="#1e6dff" />
          </View>
        ) : error ? (
          <FeedState error={error} onRetry={refresh} />
        ) : !detail ? (
          <FeedState empty emptyLabel="Item not found." />
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-10">
            <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
              <Image className="h-[320px] w-full" resizeMode="cover" source={{ uri: detail.imageUrl }} />
              <View className="p-5">
                <View className="flex-row flex-wrap gap-2">
                  <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                      {detail.lifecycleStage}
                    </Text>
                  </View>
                  <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      {detail.sku}
                    </Text>
                  </View>
                </View>

                <Text className="mt-4 text-3xl font-bold text-tato-text">{detail.title}</Text>
                <Text className="mt-3 text-sm leading-7 text-tato-muted">{detail.description}</Text>
              </View>
            </View>

            <View className={`gap-4 ${!isPhone ? 'flex-row' : ''}`}>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Estimated Profit</Text>
                <Text className="mt-2 text-3xl font-bold text-tato-profit">
                  {formatMoney(detail.estimatedProfitCents, detail.currencyCode, 2)}
                </Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Claim Fee</Text>
                <Text className="mt-2 text-3xl font-bold text-tato-accent">
                  {formatMoney(detail.claimFeeCents, detail.currencyCode, 2)}
                </Text>
              </View>
              <View className="flex-1 rounded-[24px] border border-tato-line bg-tato-panel p-5">
                <Text className="text-xs uppercase tracking-[1px] text-tato-dim">Market Velocity</Text>
                <Text className="mt-2 text-3xl font-bold text-tato-text">{detail.marketVelocityLabel}</Text>
              </View>
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                Workflow Note
              </Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">
                {detail.lifecycleStage === 'inventoried'
                  ? 'This item is available for broker review from the main workspace feed.'
                  : 'This item is already in the active workflow. Open your claim desk to review the next operational step.'}
              </Text>
              <Pressable
                className="mt-4 rounded-full bg-tato-accent px-5 py-3.5"
                onPress={() =>
                  router.push(
                    detail.lifecycleStage === 'inventoried'
                      ? '/(app)/(broker)/workspace'
                      : '/(app)/(broker)/claims',
                  )
                }>
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                  {detail.lifecycleStage === 'inventoried' ? 'Back to Workspace' : 'Open Claim Desk'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
