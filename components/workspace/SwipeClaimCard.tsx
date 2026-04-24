import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from '@/components/ui/TatoImage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { hapticMedium, hapticSuccess } from '@/lib/haptics';
import type { BrokerFeedStateItem } from '@/lib/hooks/useBrokerFeed';
import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { formatMoney } from '@/lib/models';
import { getSuggestedResaleRange } from '@/lib/stock-state';
import { SPRING_SMOOTH, TIMING } from '@/lib/ui';

type ClaimState = 'idle' | 'pending' | 'claimed' | 'error';

type SwipeClaimCardProps = {
  item: BrokerFeedStateItem;
  claimed: boolean;
  claimState?: ClaimState;
  claimError?: string;
  claimErrorActionLabel?: string;
  isDesktop?: boolean;
  index?: number;
  onClaim: (item: BrokerFeedStateItem) => void;
  onClaimErrorAction?: (item: BrokerFeedStateItem) => void;
  onOpenItem?: (itemId: string) => void;
};

const ACTION_WIDTH = 120;

function SwipeClaimCardInner({
  item,
  claimed,
  claimState,
  claimError,
  claimErrorActionLabel,
  onClaim,
  onClaimErrorAction,
  onOpenItem,
  isDesktop = false,
  index = 0,
}: SwipeClaimCardProps) {
  const offsetX = useSharedValue(0);
  const startX = useSharedValue(0);
  const reducedMotion = useReducedMotionPreference();
  const resolvedClaimState: ClaimState = claimState ?? (claimed ? 'claimed' : 'idle');
  const canClaim = resolvedClaimState === 'idle' || resolvedClaimState === 'error';
  const suggestedRange = getSuggestedResaleRange(item.floorPriceCents);
  const triggerClaim = () => onClaim(item);
  const triggerClaimErrorAction = () => onClaimErrorAction?.(item);
  const claimLabel = resolvedClaimState === 'pending'
    ? 'Claiming...'
    : resolvedClaimState === 'claimed'
      ? 'Claimed'
    : resolvedClaimState === 'error'
        ? claimErrorActionLabel ?? 'Retry Claim'
        : 'Claim Item';
  const claimAccessibilityLabel = resolvedClaimState === 'idle'
    ? 'Claim item for inspection'
    : claimLabel;
  const showClaimArrow = resolvedClaimState === 'idle' || resolvedClaimState === 'error';

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
        if (resolvedClaimState === 'error' && onClaimErrorAction) {
          runOnJS(triggerClaimErrorAction)();
        } else {
          runOnJS(triggerClaim)();
        }
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
      entering={reducedMotion ? undefined : FadeInDown.duration(TIMING.base).delay(Math.min(index * 40, TIMING.slow))}
      testID={`swipe-card-${item.id}`}>
      {!isDesktop ? (
        <View className="absolute inset-y-0 right-0 w-[120px] items-center justify-center bg-tato-accentStrong">
          <Text className="font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
            SWIPE CLAIM
          </Text>
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>
          <View className={`${isDesktop ? 'h-[400px]' : 'h-[540px]'}`}>
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

            <Pressable accessible={false} className="flex-1 justify-between" onPress={() => onOpenItem?.(item.id)}>
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
                style={styles.contentGradient}>
                <Text
                  className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent"
                  numberOfLines={1}
                  style={{ includeFontPadding: false, lineHeight: 13 }}>
                  HUB: {item.hubName}
                </Text>
                <Text
                  className={`mt-1 font-sans-bold text-white ${isDesktop ? 'text-[28px] leading-[32px]' : 'text-[32px] leading-[36px]'}`}
                  numberOfLines={2}
                  style={{ includeFontPadding: false }}>
                  {item.title}
                </Text>
                <Text className={`mt-1 text-tato-muted ${isDesktop ? 'text-sm leading-[18px]' : 'text-[15px] leading-[20px]'}`} numberOfLines={1}>
                  {item.subtitle}
                </Text>

                <View className="mt-3 rounded-[18px] border border-white/12 bg-black/35 px-3 py-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      Floor
                    </Text>
                    <Text className="text-sm font-bold text-white">
                      {formatMoney(item.floorPriceCents, item.currencyCode, 2)}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between gap-3">
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-muted">
                      Resale Range
                    </Text>
                    <Text className="text-sm font-bold text-tato-profit">
                      {formatMoney(suggestedRange.lowCents, item.currencyCode, 0)}-{formatMoney(suggestedRange.highCents, item.currencyCode, 0)}
                    </Text>
                  </View>
                </View>

                <View className="mt-4 flex-row items-center justify-between gap-3">
                  <View className="min-w-[36px] flex-row">
                    {item.sellerBadges.map((badge) => (
                      <View
                        className="-mr-2 h-8 w-8 items-center justify-center rounded-full border border-tato-base bg-tato-panelSoft"
                        key={badge}>
                        <Text className="font-mono text-[11px] font-bold text-white">
                          {badge}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View
                    style={isDesktop ? styles.claimButtonWrapperDesktop : styles.claimButtonWrapper}
                    testID={`swipe-claim-${item.id}`}>
                    <PressableScale
                      accessibilityLabel={claimAccessibilityLabel}
                      accessibilityRole="button"
                      activeScale={0.985}
                      disabled={!canClaim}
                      className={`h-full overflow-hidden rounded-full ${resolvedClaimState === 'claimed'
                          ? 'bg-tato-panelSoft'
                          : resolvedClaimState === 'pending'
                            ? 'bg-[#356db6]'
                            : 'bg-tato-accent'
                        }`}
                      onPress={() => {
                        hapticMedium();
                        if (resolvedClaimState === 'error' && onClaimErrorAction) {
                          triggerClaimErrorAction();
                          return;
                        }

                        triggerClaim();
                      }}
                      testID={`swipe-claim-button-${item.id}`}>
                      {resolvedClaimState === 'idle' || resolvedClaimState === 'error' ? (
                        <LinearGradient
                          colors={['#3278ff', '#1556d6']}
                          end={{ x: 1, y: 1 }}
                          start={{ x: 0, y: 0 }}
                          style={styles.claimButtonFill}>
                          <View className="flex-row items-center justify-center gap-1.5">
                            <Text
                              className="text-center font-sans-bold text-[15px] text-white"
                              numberOfLines={1}
                              style={{ includeFontPadding: false, lineHeight: 18 }}>
                              {claimLabel}
                            </Text>
                            {showClaimArrow ? (
                              <Text className="text-center text-[19px] font-semibold text-white" style={{ includeFontPadding: false, lineHeight: 20 }}>
                                →
                              </Text>
                            ) : null}
                          </View>
                        </LinearGradient>
                      ) : (
                        <View style={styles.claimButtonFill}>
                          <Text
                            className="text-center font-sans-bold text-[15px] text-white"
                            numberOfLines={1}
                            style={{ includeFontPadding: false, lineHeight: 18 }}>
                            {claimLabel}
                          </Text>
                        </View>
                      )}
                    </PressableScale>
                  </View>
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
  contentGradient: {
    paddingBottom: 22,
    paddingHorizontal: 16,
    paddingTop: 48,
  },
  claimButtonFill: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  claimButtonWrapper: {
    height: 48,
    minHeight: 48,
    width: 184,
  },
  claimButtonWrapperDesktop: {
    height: 48,
    minHeight: 48,
    width: 172,
  },
});

export const SwipeClaimCard = memo(SwipeClaimCardInner);
