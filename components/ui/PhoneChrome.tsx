import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';

type PhonePanelProps = PropsWithChildren<{
  className?: string;
  gradientTone?: 'accent' | 'neutral' | 'profit';
  padded?: 'sm' | 'md' | 'lg';
  /** Optional testID for E2E testing. */
  testID?: string;
}>;

type PhoneEyebrowProps = {
  children: string;
  tone?: 'muted' | 'accent' | 'profit';
  className?: string;
  /** Optional testID for E2E testing. */
  testID?: string;
};

type PhoneMetricChipProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'accent' | 'profit' | 'warning';
  className?: string;
};

type PhoneActionButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  containerClassName?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

const panelPadding = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

const panelGradients = {
  accent: ['rgba(26, 62, 118, 0.88)', 'rgba(9, 23, 45, 0.98)'],
  neutral: ['rgba(12, 31, 58, 0.96)', 'rgba(7, 18, 36, 0.98)'],
  profit: ['rgba(11, 69, 58, 0.9)', 'rgba(7, 18, 36, 0.98)'],
} as const;

const eyebrowTones = {
  muted: 'text-tato-textSoft',
  accent: 'text-tato-accent',
  profit: 'text-tato-profit',
} as const;

const metricToneStyles = {
  neutral: {
    border: 'border-tato-lineSoft',
    bg: 'bg-tato-panelSoft',
    value: 'text-tato-text',
  },
  accent: {
    border: 'border-tato-accent/35',
    bg: 'bg-[#11284d]',
    value: 'text-tato-accent',
  },
  profit: {
    border: 'border-tato-profit/30',
    bg: 'bg-[#0d2a2a]',
    value: 'text-tato-profit',
  },
  warning: {
    border: 'border-[#f5b942]/30',
    bg: 'bg-[#2a2417]',
    value: 'text-[#f5b942]',
  },
} as const;

export function PhonePanel({
  children,
  className = '',
  gradientTone,
  padded = 'md',
  testID,
}: PhonePanelProps) {
  return (
    <View className={`overflow-hidden rounded-[24px] border border-tato-lineSoft bg-tato-panelDeep ${panelPadding[padded]} ${className}`} testID={testID}>
      {gradientTone ? (
        <LinearGradient
          className="absolute inset-0"
          colors={panelGradients[gradientTone]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
        />
      ) : null}
      <View>{children}</View>
    </View>
  );
}

export function PhoneEyebrow({ children, tone = 'muted', className = '', testID }: PhoneEyebrowProps) {
  return (
    <Text
      className={`font-mono text-[12px] uppercase tracking-[2px] ${eyebrowTones[tone]} ${className}`}
      style={{ includeFontPadding: false, lineHeight: 14 }}
      testID={testID}>
      {children}
    </Text>
  );
}

export function PhoneMetricChip({
  label,
  value,
  helper,
  tone = 'neutral',
  className = '',
}: PhoneMetricChipProps) {
  const styles = metricToneStyles[tone];

  return (
    <View className={`min-w-[132px] flex-1 rounded-[20px] border px-4 py-3 ${styles.border} ${styles.bg} ${className}`}>
      <PhoneEyebrow className="text-[10px]" tone="muted">
        {label}
      </PhoneEyebrow>
      <Text className={`mt-2 text-[28px] font-sans-bold leading-[30px] ${styles.value}`} style={{ includeFontPadding: false }}>
        {value}
      </Text>
      {helper ? (
        <Text className="mt-1 text-[13px] leading-[18px] text-tato-muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export function PhoneActionButton({
  className = '',
  containerClassName,
  containerStyle,
  label,
  variant = 'primary',
  ...rest
}: PhoneActionButtonProps) {
  if (variant === 'secondary') {
    return (
      <PressableScale
        activeScale={0.985}
        className={`items-center justify-center rounded-[20px] border border-tato-lineSoft bg-tato-panel px-4 py-0 ${className}`}
        containerClassName={containerClassName}
        containerStyle={[styles.actionButtonWrapper, containerStyle]}
        style={styles.actionButtonPressable}
        {...rest}>
        <Text
          adjustsFontSizeToFit
          className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1.2px] text-tato-text"
          minimumFontScale={0.82}
          numberOfLines={1}
          style={{ includeFontPadding: false, lineHeight: 13 }}>
          {label}
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      activeScale={0.985}
      className={`overflow-hidden rounded-[20px] ${className}`}
      containerClassName={containerClassName}
      containerStyle={[styles.actionButtonWrapper, containerStyle]}
      style={styles.actionButtonPressable}
      {...rest}>
      <LinearGradient
        colors={['#3278ff', '#1556d6']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.actionButtonFill}>
        <Text
          adjustsFontSizeToFit
          className="text-center font-mono text-[11px] font-semibold uppercase tracking-[1.2px] text-white"
          minimumFontScale={0.82}
          numberOfLines={1}
          style={{ includeFontPadding: false, lineHeight: 13 }}>
          {label}
        </Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  actionButtonFill: {
    alignItems: 'center',
    borderRadius: 20,
    height: 48,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  actionButtonPressable: {
    height: 48,
    minHeight: 48,
  },
  actionButtonWrapper: {
    height: 48,
    minHeight: 48,
  },
});
