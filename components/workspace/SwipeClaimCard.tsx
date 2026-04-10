import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { hapticMedium, hapticSuccess } from '@/lib/haptics';
import type { BrokerFeedStateItem } from '@/lib/hooks/useBrokerFeed';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { formatMoney } from '@/lib/models';
import { SPRING_SMOOTH, TIMING } from '@/lib/ui';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

type SwipeClaimCardProps = {
  item: BrokerFeedStateItem;
  claimed: boolean;
  claimState?: ClaimState;
  claimError?: string;
  isDesktop?: boolean;
  index?: number;
  onClaim: (item: BrokerFeedStateItem) => void;
  onOpenItem?: (itemId: string) => void;
};

const ACTION_WIDTH = 120;

function SwipeClaimCardInner({
  item,
  claimed,
  claimState,
  claimError,
  onClaim,
  onOpenItem,
  isDesktop = false,
  index = 0,
}: SwipeClaimCardProps) {
  const offsetX = useSharedValue(0);
  const startX = useSharedValue(0);
  const reducedMotion = useReducedMotionPreference();
  const resolvedClaimState: ClaimState = claimState ?? (claimed ? 'claimed' : 'idle');
  const canClaim = resolvedClaimState === 'idle' || resolvedClaimState === 'error';
  const triggerClaim = () => onClaim(item);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  const pan = Gesture.Pan()
    .enabled(!isDesktop)
    .activeOffsetX([-10, 10])
    .onStart(() => {
      startX.value = offsetX.value;
    })
    .onUpdate((event) => {
      const next = startX.value + event.translationX;
      offsetX.value = Math.max(-ACTION_WIDTH, Math.min(0, next));
    })
    .onEnd(() => {
      const shouldClaim = offsetX.value < -ACTION_WIDTH * 0.7;

      if (shouldClaim && canClaim) {
        runOnJS(hapticSuccess)();
        runOnJS(triggerClaim)();
      }

      if (reducedMotion) {
        offsetX.value = 0;
      } else {
        offsetX.value = withSpring(0, SPRING_SMOOTH);
      }
    });

  return (
    <Animated.View
      className={`overflow-hidden border border-tato-line bg-tato-panel ${isDesktop ? 'rounded-[26px]' : 'rounded-[34px]'}`}
      entering={reducedMotion ? undefined : FadeInDown.duration(TIMING.base).delay(Math.min(index * 40, TIMING.slow))}>
      {!isDesktop ? (
        <View className="absolute inset-y-0 right-0 w-[120px] items-center justify-center bg-tato-accentStrong">
          <Text className="font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
            SWIPE CLAIM
          </Text>
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>
          <View className={`${isDesktop ? 'h-[360px]' : 'h-[460px]'}`}>
            <Image
              cachePolicy="disk"
              contentFit="cover"
              source={{ uri: item.imageUrl }}
              style={[
                styles.cardImage,
                { borderRadius: isDesktop ? 26 : 34 },
              ]}
              transition={120}
            />

            <Pressable className="flex-1 justify-between" onPress={() => onOpenItem?.(item.id)}>
              <View className="px-4 pt-4">
                <View className="flex-row items-center justify-between">
                  <View className="rounded-full bg-tato-accent px-3 py-2">
                    <Text className="font-mono text-xs font-semibold text-white">
                      +{formatMoney(item.estimatedBrokerPayoutCents, item.currencyCode, 2)} PAYOUT
                    </Text>
                  </View>

                  <View className="rounded-full border border-white/35 bg-white/15 px-3 py-2">
                    <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1px] text-white">
                      {item.gradeLabel}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Gradient overlay replacing the flat bg-black/58 */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.82)']}
                locations={[0, 0.35, 1]}
                className="px-4 pb-4 pt-14">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                  HUB: {item.hubName}
                </Text>
                <Text className={`mt-1 font-sans-bold text-white ${isDesktop ? 'text-3xl' : 'text-4xl'}`}>
                  {item.title}
                </Text>
                <Text className={`mt-1 text-[#9fb0cd] ${isDesktop ? 'text-sm' : 'text-base'}`}>
                  {item.subtitle}
                </Text>

                <View className="mt-4 flex-row items-center gap-3">
                  <View className="flex-row">
                    {item.sellerBadges.map((badge) => (
                      <View
                        className="-mr-2 h-8 w-8 items-center justify-center rounded-full border border-tato-base bg-[#10274e]"
                        key={badge}>
                        <Text className="font-mono text-[11px] font-bold text-white">
                          {badge}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <PressableScale
                    disabled={!canClaim}
                    className={`flex-1 rounded-full px-4 py-3 ${resolvedClaimState === 'claimed'
                        ? 'bg-tato-panelSoft'
                        : resolvedClaimState === 'pending'
                          ? 'bg-[#356db6]'
                          : 'bg-tato-accent hover:bg-tato-accentStrong focus:bg-tato-accentStrong'
                      }`}
                    onPress={() => {
                      hapticMedium();
                      triggerClaim();
                    }}>
                    <Text className={`text-center font-bold text-white ${isDesktop ? 'text-base' : 'text-lg'}`}>
                      {resolvedClaimState === 'pending'
                        ? 'Claiming...'
                        : resolvedClaimState === 'claimed'
                          ? 'Claimed'
                          : resolvedClaimState === 'error'
                            ? 'Retry Claim ->'
                            : 'Claim for Inspection ->'}
                    </Text>
                  </PressableScale>
                </View>

                {claimError ? (
                  <Text className="mt-2 font-mono text-xs text-tato-error">
                    {claimError}
                  </Text>
                ) : null}
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
});

export const SwipeClaimCard = memo(SwipeClaimCardInner);
