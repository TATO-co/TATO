import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

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
        .map((f) => `${f.title} settled for +${formatMoney(f.profitCents, f.currencyCode, 0)} (${f.agoLabel})`)
        .join('  •  ');

    // We render the text twice side-by-side and translate by percentage
    // so it loops seamlessly. The Animated.Value of -1 maps to -50% via interpolation.
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

    return (
        <View className="overflow-hidden rounded-[18px] border border-tato-line bg-[#0a1931] py-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)]">
            <Animated.View className="flex-row" style={animatedStyle}>
                <Text className="font-mono text-[11px] text-tato-muted whitespace-nowrap px-5">
                    <Text className="text-tato-accent uppercase tracking-[1px]">Live Profit Tape </Text>
                    {content}
                </Text>
                <Text className="font-mono text-[11px] text-tato-muted whitespace-nowrap px-5">
                    <Text className="text-tato-accent uppercase tracking-[1px]">Live Profit Tape </Text>
                    {content}
                </Text>
            </Animated.View>
        </View>
    );
}
