import { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';

import { formatMoney, type RecentFlip } from '@/lib/models';

type RecentFlipsTickerProps = {
    flips: RecentFlip[];
};

export function RecentFlipsTicker({ flips }: RecentFlipsTickerProps) {
    const translateX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(translateX, {
                toValue: -1,
                duration: 25000,
                useNativeDriver: true,
            }),
        );
        loop.start();
        return () => loop.stop();
    }, [translateX]);

    const content = flips
        .map((f) => `${f.title} paid out +${formatMoney(f.payoutCents, f.currencyCode, 0)} (${f.agoLabel})`)
        .join('  •  ');
    
    // Create a single long string that repeats to ensure it fills the screen,
    // rather than two separate Text nodes that might wrap in a flex container.
    const repeatedContent = `${content}  •  ${content}`;

    const animatedStyle = {
        transform: [
            {
                translateX: translateX.interpolate({
                    inputRange: [-1, 0],
                    outputRange: ['-50%' as unknown as number, '0%' as unknown as number],
                }),
            },
        ],
    };

    // Platform-specific style to force text to never wrap on web
    const textStyle = Platform.OS === 'web' ? { whiteSpace: 'nowrap' } as any : undefined;

    return (
        <View className="overflow-hidden rounded-[18px] border border-tato-line bg-[#0a1931] shadow-[0_14px_40px_rgba(0,0,0,0.18)]" style={{ height: 42, position: 'relative' }}>
            <Animated.View className="flex-row absolute items-center left-0 top-0 bottom-0" style={[animatedStyle, Platform.OS === 'web' && { width: 'max-content' } as any]}>
                <Text className="font-mono text-[11px] text-tato-muted px-5" style={textStyle}>
                    <Text className="text-tato-accent uppercase tracking-[1px]">Live Payout Tape </Text>
                    {repeatedContent}
                </Text>
                <Text className="font-mono text-[11px] text-tato-muted px-5" style={textStyle}>
                    <Text className="text-tato-accent uppercase tracking-[1px]">Live Payout Tape </Text>
                    {repeatedContent}
                </Text>
            </Animated.View>
        </View>
    );
}
