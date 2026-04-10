import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, type ViewStyle, type StyleProp } from 'react-native';

interface StaggeredRevealProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  index?: number;
  staggerStep?: number;
}

export function StaggeredReveal({
  children,
  delay = 0,
  duration = 800,
  style,
  index = 0,
  staggerStep = 100,
}: StaggeredRevealProps) {
  const disableAnimation = Platform.OS === 'web';
  const animatedValue = useRef(new Animated.Value(disableAnimation ? 1 : 0)).current;

  useEffect(() => {
    if (disableAnimation) {
      animatedValue.setValue(1);
      return;
    }

    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      delay: delay + (index * staggerStep),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animatedValue, delay, disableAnimation, duration, index, staggerStep]);

  const animatedStyle = {
    opacity: animatedValue,
    transform: [
      {
        translateY: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
