import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { Text, View, type PressableProps } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';

type PhonePanelProps = PropsWithChildren<{
  className?: string;
  gradientTone?: 'accent' | 'neutral' | 'profit';
  padded?: 'sm' | 'md' | 'lg';
}>;

type PhoneEyebrowProps = {
  children: string;
  tone?: 'muted' | 'accent' | 'profit';
  className?: string;
};

type PhoneMetricChipProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'accent' | 'profit' | 'warning';
  className?: string;
};

type PhoneActionButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary';
  className?: string;
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
  muted: 'text-[#9cb7e1]',
  accent: 'text-tato-accent',
  profit: 'text-tato-profit',
} as const;

const metricToneStyles = {
  neutral: {
    border: 'border-[#17355f]',
    bg: 'bg-[#0f2140]',
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
}: PhonePanelProps) {
  return (
    <View className={`overflow-hidden rounded-[30px] border border-[#16355f] bg-[#07172d] ${panelPadding[padded]} ${className}`}>
      {gradientTone ? (
        <>
          <LinearGradient
            className="absolute inset-0"
            colors={panelGradients[gradientTone]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
          />
          <View className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/5" />
          <View className="absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-tato-accent/8" />
        </>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

export function PhoneEyebrow({ children, tone = 'muted', className = '' }: PhoneEyebrowProps) {
  return (
    <Text className={`font-mono text-[12px] uppercase tracking-[2px] ${eyebrowTones[tone]} ${className}`}>
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
    <View className={`min-w-[132px] flex-1 rounded-[24px] border px-4 py-3 ${styles.border} ${styles.bg} ${className}`}>
      <PhoneEyebrow className="text-[10px]" tone="muted">
        {label}
      </PhoneEyebrow>
      <Text className={`mt-2 text-[28px] font-sans-bold leading-[30px] ${styles.value}`}>
        {value}
      </Text>
      {helper ? (
        <Text className="mt-1 text-sm leading-6 text-tato-muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export function PhoneActionButton({
  className = '',
  label,
  variant = 'primary',
  ...rest
}: PhoneActionButtonProps) {
  if (variant === 'secondary') {
    return (
      <PressableScale
        activeScale={0.985}
        className={`rounded-[24px] border border-[#1b3e70] bg-[#091a31] px-5 py-4 ${className}`}
        {...rest}>
        <Text className="text-center font-mono text-[12px] font-semibold uppercase tracking-[1.4px] text-tato-text">
          {label}
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale activeScale={0.985} className={`overflow-hidden rounded-[24px] ${className}`} {...rest}>
      <LinearGradient
        className="rounded-[24px] px-5 py-4"
        colors={['#3278ff', '#1556d6']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}>
        <Text className="text-center font-mono text-[12px] font-semibold uppercase tracking-[1.4px] text-white">
          {label}
        </Text>
      </LinearGradient>
    </PressableScale>
  );
}
