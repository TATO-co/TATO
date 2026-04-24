import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';

type SkeletonCardProps = {
    /** Height of the skeleton placeholder. */
    height?: number;
    /** Border radius applied to the outer container. */
    borderRadius?: number;
    /** Optional testID for E2E testing. */
    testID?: string;
};

/**
 * Shimmer skeleton placeholder rendered during initial data loads.
 *
 * Falls back to a static muted box when the user prefers reduced motion.
 */
export function SkeletonCard({ height = 320, borderRadius = 24, testID = 'skeleton-card' }: SkeletonCardProps) {
    const reducedMotion = useReducedMotionPreference();
    const opacity = useSharedValue(0.45);

    useEffect(() => {
        if (reducedMotion) {
            return;
        }

        opacity.value = withRepeat(
            withTiming(0.75, { duration: 1000 }),
            -1,
            true,
        );
    }, [reducedMotion, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: reducedMotion ? 0.5 : opacity.value,
    }));

    return (
        <Animated.View
            testID={testID}
            style={[
                {
                    height,
                    borderRadius,
                    backgroundColor: '#12243f',
                    borderWidth: 1,
                    borderColor: '#1c3358',
                },
                animatedStyle,
            ]}
        />
    );
}

/**
 * A row-style skeleton for list items (e.g., supplier inventory rows).
 */
export function SkeletonRow() {
    const reducedMotion = useReducedMotionPreference();
    const opacity = useSharedValue(0.45);

    useEffect(() => {
        if (reducedMotion) {
            return;
        }

        opacity.value = withRepeat(
            withTiming(0.75, { duration: 1000 }),
            -1,
            true,
        );
    }, [reducedMotion, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: reducedMotion ? 0.5 : opacity.value,
    }));

    return (
        <Animated.View
            className="flex-row items-center gap-4 rounded-[20px] border border-tato-line p-4"
            style={[{ backgroundColor: '#12243f' }, animatedStyle]}
            testID="skeleton-row">
            <View className="h-14 w-14 rounded-xl bg-tato-panelSoft" />
            <View className="flex-1 gap-2">
                <View className="h-4 w-2/3 rounded-full bg-tato-panelSoft" />
                <View className="h-3 w-1/3 rounded-full bg-tato-panelSoft" />
            </View>
            <View className="h-4 w-16 rounded-full bg-tato-panelSoft" />
        </Animated.View>
    );
}
