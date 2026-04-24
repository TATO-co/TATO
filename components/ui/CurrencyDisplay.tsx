import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { formatMoney, type CurrencyCode } from '@/lib/models';
import { COLORS, FONT_FAMILY } from '@/lib/ui';

type CurrencyDisplayProps = Omit<TextProps, 'children'> & {
  amount: number;
  currencyCode?: CurrencyCode;
  fractionDigits?: number;
  showSign?: boolean;
  tone?: 'auto' | 'neutral' | 'success' | 'error';
  className?: string;
  style?: StyleProp<TextStyle>;
};

export function CurrencyDisplay({
  amount,
  className = '',
  currencyCode = 'USD',
  fractionDigits = 2,
  showSign = false,
  tone = 'auto',
  style,
  ...textProps
}: CurrencyDisplayProps) {
  const color =
    tone === 'success'
      ? COLORS.profit
      : tone === 'error'
        ? COLORS.error
        : tone === 'neutral'
          ? COLORS.muted
          : amount < 0
            ? COLORS.error
            : amount > 0
              ? COLORS.profit
              : COLORS.muted;
  const prefix = showSign && amount > 0 ? '+' : '';

  return (
    <Text
      {...textProps}
      className={className}
      style={[
        {
          color,
          fontFamily: FONT_FAMILY.bodySemibold,
          fontWeight: '600',
          letterSpacing: 0,
        },
        style,
      ]}>
      {prefix}
      {formatMoney(amount, currencyCode, fractionDigits)}
    </Text>
  );
}
