import { PropsWithChildren } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { useReducedMotionPreference } from '@/lib/hooks/useReducedMotionPreference';

type PressableScaleProps = PropsWithChildren<
    PressableProps & {
        /** Scale factor when pressed (default: 0.97). */
        activeScale?: number;
    }
>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A pressable that subtly scales down on press for micro-interaction feedback.
 *
 * Falls back to a regular Pressable when the user prefers reduced motion.
 */
export function PressableScale({
    activeScale = 0.97,
    children,
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
        return (
            <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={style} {...rest}>
                {children}
            </Pressable>
        );
    }

    return (
        <AnimatedPressable
            onPressIn={(event) => {
                scale.value = withTiming(activeScale, { duration: 100 });
                onPressIn?.(event);
            }}
            onPressOut={(event) => {
                scale.value = withTiming(1, { duration: 140 });
                onPressOut?.(event);
            }}
            style={[animatedStyle, style]}
            {...rest}>
            {children}
        </AnimatedPressable>
    );
}
