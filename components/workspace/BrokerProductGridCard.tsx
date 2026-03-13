import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import type { BrokerFeedStateItem } from '@/lib/hooks/useBrokerFeed';
import { formatMoney } from '@/lib/models';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

type BrokerProductGridCardProps = {
  item: BrokerFeedStateItem;
  claimState: ClaimState;
  claimError?: string;
  compactDesktop?: boolean;
  onClaim: () => void;
  onOpenItem: (id: string) => void;
};

function aiGuidance(item: BrokerFeedStateItem) {
  if (item.aiIngestionConfidence >= 0.97) {
    return 'Gemini sees a clean match and high-confidence attribute extraction. This is safe to cross-list fast.';
  }

  if (item.aiIngestionConfidence >= 0.92) {
    return 'Gemini is confident on the core attributes. Review condition language before you push the listing live.';
  }

  return 'Gemini confidence is softer here. Verify bundled parts and condition in the detail view before claiming.';
}

export function BrokerProductGridCard({
  item,
  claimState,
  claimError,
  compactDesktop = false,
  onClaim,
  onOpenItem,
}: BrokerProductGridCardProps) {
  const [hovered, setHovered] = useState(false);
  const isClaimed = claimState === 'claimed';
  const isPending = claimState === 'pending';
  const canClaim = claimState === 'idle' || claimState === 'error';

  const projectedListPriceCents = useMemo(
    () => item.floorPriceCents + item.potentialProfitCents,
    [item.floorPriceCents, item.potentialProfitCents],
  );
  const netAfterFeeCents = useMemo(
    () => Math.max(item.potentialProfitCents - item.claimFeeCents, 0),
    [item.claimFeeCents, item.potentialProfitCents],
  );
  const summaryTone = item.shippable ? 'National listing candidate' : `Pickup-first play in ${item.city}`;

  return (
    <PressableScale
      activeScale={0.985}
      className={`overflow-hidden rounded-[24px] border bg-[#09192f] ${
        hovered ? 'border-[#2f73f5] shadow-[0_22px_56px_rgba(10,59,137,0.26)]' : 'border-tato-line shadow-[0_18px_48px_rgba(0,0,0,0.24)]'
      }`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => onOpenItem(item.id)}>
      <View className={`relative overflow-hidden bg-[#0d1b2e] ${compactDesktop ? 'aspect-[0.98]' : 'aspect-[0.94]'} p-5`}>
        <LinearGradient
          colors={['rgba(23,60,114,0.14)', 'rgba(5,13,26,0.04)']}
          className="absolute inset-0"
        />
        <View className="absolute left-4 right-4 top-4 z-10 flex-row items-center justify-between">
          <View className="rounded-full bg-tato-accent px-3 py-1.5">
              <Text className="font-mono text-[11px] font-bold uppercase tracking-[1px] text-white">
              +{formatMoney(item.potentialProfitCents, item.currencyCode, 0)}
            </Text>
          </View>
          <View className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-white">{item.gradeLabel}</Text>
          </View>
        </View>

        <Image className="h-full w-full" resizeMode="contain" source={{ uri: item.imageUrl }} />

        <View className="absolute bottom-4 left-4">
          <View className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#d0dbef]">
              {item.shippable ? 'Shippable' : item.city}
            </Text>
          </View>
        </View>

        {hovered ? (
          <Animated.View
            entering={FadeIn.duration(130)}
            exiting={FadeOut.duration(110)}
            className="absolute inset-4 rounded-[20px] border border-white/10 bg-[#061424]/94 p-4">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">Quick Preview</Text>
            <Text className="mt-2 text-xl font-sans-bold leading-7 text-white">{summaryTone}</Text>
            <Text className="mt-2 text-sm leading-6 text-[#a8bad8]">
              Estimated list at {formatMoney(projectedListPriceCents, item.currencyCode, 0)} with {item.photoCount} supplier photo{item.photoCount === 1 ? '' : 's'} ready for reuse.
            </Text>

            <View className="mt-4 gap-2">
              <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5">
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#93a7c7]">Supplier floor</Text>
                <Text className="text-sm font-bold text-white">{formatMoney(item.floorPriceCents, item.currencyCode, 0)}</Text>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5">
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#93a7c7]">Claim fee</Text>
                <Text className="text-sm font-bold text-tato-accent">{formatMoney(item.claimFeeCents, item.currencyCode, 2)}</Text>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5">
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#93a7c7]">Net after fee</Text>
                <Text className="text-sm font-bold text-tato-profit">{formatMoney(netAfterFeeCents, item.currencyCode, 0)}</Text>
              </View>
            </View>

            <View className="mt-4 rounded-[18px] border border-[#21406d] bg-[#0c1d35] px-3 py-3">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#8ab1ff]">AI Guidance</Text>
              <Text className="mt-2 text-sm leading-6 text-[#b1c2de]">{aiGuidance(item)}</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>

      <View className={compactDesktop ? 'p-4' : 'p-5'}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className={`font-sans-bold leading-7 text-tato-text ${compactDesktop ? 'text-[20px]' : 'text-[22px]'}`} numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-tato-muted" numberOfLines={2}>
              {item.subtitle}
            </Text>
          </View>
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
            {item.photoCount} shots
          </Text>
        </View>

        <View className="mt-4 flex-row flex-wrap gap-2">
          <View className="rounded-full bg-[#102443] px-3 py-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">
              Fee {formatMoney(item.claimFeeCents, item.currencyCode, 2)}
            </Text>
          </View>
          <View className="rounded-full bg-[#102443] px-3 py-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-muted">
              AI {(item.aiIngestionConfidence * 100).toFixed(0)}%
            </Text>
          </View>
          <View className="rounded-full bg-[#102443] px-3 py-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-muted">
              {item.hubName.replace(/^Hub:\s*/i, '')}
            </Text>
          </View>
        </View>

        <View className="mt-3 rounded-[18px] border border-[#17355f] bg-[#0d1c31] px-3 py-3">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Preview Angle</Text>
          <Text className="mt-2 text-sm leading-6 text-[#9db0cf]" numberOfLines={2}>
            {item.tags[0] ?? 'AI-assisted listing opportunity'} · {summaryTone}
          </Text>
        </View>

        <View className="mt-4 flex-row items-center gap-3">
          <View className="flex-row">
            {item.sellerBadges.map((badge) => (
              <View
                className="-mr-2 h-8 w-8 items-center justify-center rounded-full border border-tato-base bg-[#14315d]"
                key={badge}>
                <Text className="font-mono text-[10px] font-bold text-white">{badge}</Text>
              </View>
            ))}
          </View>

          <Pressable
            className={`flex-1 rounded-full px-4 py-3 ${
              isClaimed
                ? 'bg-tato-panelSoft'
                : isPending
                  ? 'bg-[#356db6]'
                  : 'bg-tato-accent hover:bg-tato-accentStrong focus:bg-tato-accentStrong'
            }`}
            disabled={!canClaim}
            onPress={(event) => {
              event.stopPropagation();
              onClaim();
            }}>
            <Text className="text-center text-sm font-bold text-white">
              {isPending ? 'Claiming...' : isClaimed ? 'Claimed' : claimState === 'error' ? 'Retry Claim' : 'Claim Item'}
            </Text>
          </Pressable>
        </View>

        {claimError ? <Text className="mt-3 text-xs text-tato-error">{claimError}</Text> : null}
      </View>
    </PressableScale>
  );
}
