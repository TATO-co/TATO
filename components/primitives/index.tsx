import { Children, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { COLORS, FONT_FAMILY, HIT_SLOP, PRESS_FEEDBACK, RADIUS, SPACE, TOUCH_TARGET, TYPE } from '@/lib/ui';

type ListSectionProps = {
  title?: string;
  children: ReactNode;
  footer?: string;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
};

type ListRowProps = {
  label: string;
  value?: string | ReactNode;
  icon?: ReactNode;
  onPress?: PressableProps['onPress'];
  destructive?: boolean;
  toggle?: { value: boolean; onChange: (nextValue: boolean) => void };
  badge?: string;
  disabled?: boolean;
  testID?: string;
};

type ContentCardProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onPress: PressableProps['onPress'] };
  children?: ReactNode;
  variant?: 'default' | 'info' | 'warning' | 'success';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type ScreenSectionProps = {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

type InsetTabBarProps<T extends string> = {
  tabs: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

type ActionTierButtonProps = {
  label: string;
  onPress?: PressableProps['onPress'];
  tier?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const variantStyles = {
  default: {
    borderColor: 'rgba(142, 164, 200, 0.08)',
    backgroundColor: COLORS.panelDeep,
  },
  info: {
    borderColor: 'rgba(30, 109, 255, 0.28)',
    backgroundColor: 'rgba(30, 109, 255, 0.08)',
  },
  warning: {
    borderColor: 'rgba(245, 185, 66, 0.28)',
    backgroundColor: 'rgba(245, 185, 66, 0.08)',
  },
  success: {
    borderColor: 'rgba(30, 201, 149, 0.28)',
    backgroundColor: 'rgba(30, 201, 149, 0.08)',
  },
} as const;

const screenSectionGap = {
  sm: SPACE[12],
  md: SPACE[24],
  lg: SPACE[40],
} as const;

function renderValue(value: string | ReactNode) {
  if (typeof value === 'string') {
    return (
      <Text numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
    );
  }

  return value;
}

export function ListSection({ title, children, footer, first = false, style }: ListSectionProps) {
  const rows = Children.toArray(children);

  return (
    <View style={[{ marginTop: first ? 0 : SPACE[24] }, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionCard}>
        {rows.map((child, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            {child}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function ListRow({
  label,
  value,
  icon,
  onPress,
  destructive = false,
  toggle,
  badge,
  disabled = false,
  testID,
}: ListRowProps) {
  const interactive = Boolean(onPress) && !disabled;
  const content = (
    <>
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <Text numberOfLines={1} style={[styles.rowLabel, destructive ? styles.destructiveText : null]}>
        {label}
      </Text>
      <View style={styles.rowTrailing}>
        {badge ? (
          <View style={[styles.badge, destructive ? styles.badgeDestructive : null]}>
            <Text style={[styles.badgeText, destructive ? styles.destructiveText : null]}>{badge}</Text>
          </View>
        ) : null}
        {value ? renderValue(value) : null}
        {toggle ? (
          <Switch
            disabled={disabled}
            ios_backgroundColor={COLORS.panelInset}
            onValueChange={toggle.onChange}
            thumbColor={toggle.value ? COLORS.text : COLORS.muted}
            trackColor={{ false: COLORS.line, true: COLORS.accent }}
            value={toggle.value}
          />
        ) : null}
        {interactive ? (
          <PlatformIcon
            color={COLORS.dim}
            name={{ ios: 'chevron.right', android: 'chevron-right', web: 'chevron-right' }}
            size={16}
          />
        ) : null}
      </View>
    </>
  );

  if (!interactive) {
    return (
      <View style={[styles.row, disabled ? styles.disabled : null]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={PRESS_FEEDBACK.ripple.subtle}
      disabled={disabled}
      hitSlop={HIT_SLOP.comfortable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? styles.rowPressed : null,
        disabled ? styles.disabled : null,
      ]}
      testID={testID}>
      {content}
    </Pressable>
  );
}

export function ContentCard({
  title,
  description,
  icon,
  action,
  children,
  variant = 'default',
  testID,
  style,
}: ContentCardProps) {
  return (
    <View style={[styles.contentCard, variantStyles[variant], style]} testID={testID}>
      <View style={styles.contentHeader}>
        {icon ? <View style={styles.contentIcon}>{icon}</View> : null}
        <View style={styles.contentText}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
          {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
        </View>
      </View>
      {children ? <View style={title || description || icon ? styles.cardChildren : null}>{children}</View> : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          android_ripple={PRESS_FEEDBACK.ripple.subtle}
          hitSlop={HIT_SLOP.comfortable}
          onPress={action.onPress}
          style={({ pressed }) => [styles.cardAction, pressed ? styles.cardActionPressed : null]}>
          <Text style={styles.cardActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ScreenSection({ children, gap = 'md', style }: ScreenSectionProps) {
  return <View style={[{ marginTop: screenSectionGap[gap] }, style]}>{children}</View>;
}

export function InsetTabBar<T extends string>({
  tabs,
  value,
  onChange,
  style,
}: InsetTabBarProps<T>) {
  return (
    <View style={[styles.tabBar, style]}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            android_ripple={PRESS_FEEDBACK.ripple.subtle}
            hitSlop={HIT_SLOP.comfortable}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tabButton,
              selected ? styles.tabButtonSelected : null,
              pressed ? styles.rowPressed : null,
            ]}>
            <Text style={[styles.tabButtonText, selected ? styles.tabButtonTextSelected : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ActionTierButton({
  disabled = false,
  fullWidth,
  label,
  loading = false,
  onPress,
  style,
  testID,
  tier = 'primary',
}: ActionTierButtonProps) {
  const textOnly = tier === 'tertiary' || tier === 'destructive';
  const resolvedFullWidth = fullWidth ?? !textOnly;
  const resolvedDisabled = disabled || loading;
  const textStyle =
    tier === 'primary'
      ? styles.actionPrimaryText
      : tier === 'secondary'
        ? styles.actionSecondaryText
        : tier === 'destructive'
          ? styles.actionDestructiveText
          : styles.actionTertiaryText;

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={textOnly ? undefined : PRESS_FEEDBACK.ripple.accent}
      disabled={resolvedDisabled}
      hitSlop={HIT_SLOP.comfortable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tier === 'primary' ? styles.actionPrimary : null,
        tier === 'secondary' ? styles.actionSecondary : null,
        textOnly ? styles.actionTextOnly : null,
        resolvedFullWidth ? styles.actionFullWidth : styles.actionNaturalWidth,
        pressed ? styles.actionPressed : null,
        resolvedDisabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}>
      {loading ? (
        <ActivityIndicator color={tier === 'primary' ? COLORS.white : tier === 'destructive' ? COLORS.error : COLORS.accent} />
      ) : (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.84}
          numberOfLines={1}
          style={textStyle}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const textBase = {
  fontFamily: TYPE.body.fontFamily,
  letterSpacing: 0,
} as const satisfies TextStyle;

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(30, 109, 255, 0.12)',
    borderColor: 'rgba(30, 109, 255, 0.32)',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE[8],
    paddingVertical: SPACE[4],
  },
  badgeDestructive: {
    backgroundColor: 'rgba(255, 143, 143, 0.12)',
    borderColor: 'rgba(255, 143, 143, 0.32)',
  },
  badgeText: {
    color: COLORS.accent,
    fontFamily: TYPE.label.fontFamily,
    fontSize: TYPE.label.fontSize,
    fontWeight: TYPE.label.fontWeight,
    letterSpacing: TYPE.label.letterSpacing,
    lineHeight: TYPE.label.fontSize,
    textTransform: 'uppercase',
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET.minimum,
  },
  actionDestructiveText: {
    color: COLORS.error,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
  },
  actionFullWidth: {
    alignSelf: 'stretch',
  },
  actionNaturalWidth: {
    alignSelf: 'flex-start',
  },
  actionPressed: {
    opacity: PRESS_FEEDBACK.opacity.pressed,
  },
  actionPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE[16],
    paddingVertical: SPACE[12],
  },
  actionPrimaryText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    lineHeight: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE[16],
    paddingVertical: SPACE[12],
  },
  actionSecondaryText: {
    color: COLORS.accent,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
    textAlign: 'center',
  },
  actionTertiaryText: {
    color: COLORS.muted,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
  },
  actionTextOnly: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: TOUCH_TARGET.ios,
    paddingHorizontal: 0,
    paddingVertical: SPACE[8],
  },
  cardAction: {
    alignSelf: 'flex-start',
    marginTop: SPACE[12],
    minHeight: TOUCH_TARGET.ios,
    paddingHorizontal: SPACE[12],
    paddingVertical: SPACE[8],
  },
  cardActionPressed: {
    opacity: PRESS_FEEDBACK.opacity.pressed,
  },
  cardActionText: {
    color: COLORS.accent,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: TYPE.bodySmall.fontSize,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: TYPE.bodySmall.fontSize,
  },
  cardChildren: {
    marginTop: SPACE[12],
  },
  cardDescription: {
    ...textBase,
    color: COLORS.muted,
    fontSize: TYPE.bodySmall.fontSize,
    lineHeight: TYPE.bodySmall.lineHeight,
  },
  cardTitle: {
    ...textBase,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  contentCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE[16],
  },
  contentHeader: {
    flexDirection: 'row',
    gap: SPACE[12],
  },
  contentIcon: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  contentText: {
    flex: 1,
    gap: SPACE[4],
    minWidth: 0,
  },
  destructiveText: {
    color: COLORS.error,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE[12],
    minHeight: 52,
    paddingHorizontal: SPACE[16],
    paddingVertical: SPACE[8],
  },
  rowDivider: {
    backgroundColor: 'rgba(142, 164, 200, 0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACE[16],
  },
  rowIcon: {
    alignItems: 'center',
    height: SPACE[32],
    justifyContent: 'center',
    marginRight: 0,
    width: SPACE[32],
  },
  rowLabel: {
    ...textBase,
    color: COLORS.muted,
    flex: 1,
    fontFamily: TYPE.label.fontFamily,
    fontSize: 11,
    fontWeight: TYPE.label.fontWeight,
    letterSpacing: 0.5,
    lineHeight: 16,
    minWidth: 0,
    opacity: 0.65,
    textTransform: 'uppercase',
  },
  rowPressed: {
    backgroundColor: 'rgba(142, 164, 200, 0.06)',
  },
  rowTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE[8],
    justifyContent: 'flex-end',
    minHeight: SPACE[32],
  },
  rowValue: {
    ...textBase,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
    maxWidth: 160,
    textAlign: 'right',
  },
  sectionCard: {
    backgroundColor: COLORS.panelDeep,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  sectionFooter: {
    ...textBase,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    marginHorizontal: SPACE[16],
    marginTop: SPACE[8],
  },
  sectionTitle: {
    color: COLORS.muted,
    fontFamily: TYPE.label.fontFamily,
    fontSize: 11,
    fontWeight: TYPE.label.fontWeight,
    letterSpacing: 0.6,
    lineHeight: 11,
    marginBottom: SPACE[8],
    textTransform: 'uppercase',
  },
  tabBar: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.panelInset,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACE[4],
    padding: SPACE[4],
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: RADIUS.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: TOUCH_TARGET.minimum,
    paddingHorizontal: SPACE[8],
    paddingVertical: SPACE[8],
  },
  tabButtonSelected: {
    backgroundColor: COLORS.accent,
  },
  tabButtonText: {
    color: COLORS.muted,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14,
  },
  tabButtonTextSelected: {
    color: COLORS.white,
  },
});
