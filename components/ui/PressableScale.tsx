import { PropsWithChildren } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';
import { PRESS_FEEDBACK, withMinimumHitSlop } from '@/lib/ui';

type PressableScaleProps = PropsWithChildren<
    PressableProps & {
        /** Scale factor when pressed (default: 0.97). */
        activeScale?: number;
        /** Layout styles for the animated wrapper, useful when the pressable participates in flex rows. */
        containerClassName?: string;
        containerStyle?: StyleProp<ViewStyle>;
    }
>;

/**
 * A pressable that subtly scales down on press for micro-interaction feedback.
 *
 * Falls back to a regular Pressable when the user prefers reduced motion.
 */
export function PressableScale({
    activeScale = 0.97,
    android_ripple,
    children,
    containerClassName,
    containerStyle,
    hitSlop,
    onPressIn,
    onPressOut,
    style,
    ...rest
}: PressableScaleProps) {
    const reducedMotion = useReducedMotionPreference();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    if (reducedMotion) {
        const pressable = (
            <Pressable
                android_ripple={android_ripple ?? PRESS_FEEDBACK.ripple.subtle}
                hitSlop={withMinimumHitSlop(hitSlop)}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                style={style}
                {...rest}>
                {children}
            </Pressable>
        );

        if (!containerClassName && !containerStyle) {
            return pressable;
        }

        return (
            <View className={containerClassName} style={containerStyle}>
                {pressable}
            </View>
        );
    }

    return (
        <Animated.View className={containerClassName} style={[containerStyle, animatedStyle]}>
            <Pressable
                android_ripple={android_ripple ?? PRESS_FEEDBACK.ripple.subtle}
                hitSlop={withMinimumHitSlop(hitSlop)}
                onPressIn={(event) => {
                    scale.value = withTiming(activeScale, { duration: 100 });
                    onPressIn?.(event);
                }}
                onPressOut={(event) => {
                    scale.value = withTiming(1, { duration: 140 });
                    onPressOut?.(event);
                }}
                style={style}
                {...rest}>
                {children}
            </Pressable>
        </Animated.View>
    );
}
