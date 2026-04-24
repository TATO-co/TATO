import { ActivityIndicator, Text, type PressableProps } from 'react-native';

import { PlatformIcon, type PlatformIconName } from '@/components/ui/PlatformIcon';
import { PressableScale } from '@/components/ui/PressableScale';

type TatoButtonTone = 'primary' | 'secondary' | 'inverse' | 'success' | 'danger';
type TatoButtonSize = 'sm' | 'md' | 'lg';

type TatoButtonProps = PressableProps & {
  label: string;
  tone?: TatoButtonTone;
  size?: TatoButtonSize;
  icon?: PlatformIconName | string;
  loading?: boolean;
  className?: string;
  labelClassName?: string;
};

const sizeClasses: Record<TatoButtonSize, { button: string; label: string; icon: number }> = {
  sm: {
    button: 'min-h-[44px] px-4 py-2',
    label: 'text-[11px]',
    icon: 16,
  },
  md: {
    button: 'min-h-[48px] px-5 py-3',
    label: 'text-[12px]',
    icon: 18,
  },
  lg: {
    button: 'min-h-[56px] px-6 py-4',
    label: 'text-[13px]',
    icon: 20,
  },
};

const enabledToneClasses: Record<TatoButtonTone, { button: string; label: string; spinner: string; icon: string }> = {
  primary: {
    button: 'border-tato-accent bg-tato-accent hover:bg-tato-accentStrong focus:bg-tato-accentStrong active:bg-tato-accentStrong',
    label: 'text-white',
    spinner: '#ffffff',
    icon: '#ffffff',
  },
  secondary: {
    button: 'border-tato-line bg-tato-panelSoft hover:bg-tato-hover focus:bg-tato-hover active:bg-tato-hover',
    label: 'text-tato-text',
    spinner: '#edf4ff',
    icon: '#8ea4c8',
  },
  inverse: {
    button: 'border-white bg-white hover:bg-[#d9e7ff] focus:bg-[#d9e7ff] active:bg-[#d9e7ff]',
    label: 'text-[#041120]',
    spinner: '#041120',
    icon: '#041120',
  },
  success: {
    button: 'border-tato-profit bg-tato-profit/20 hover:bg-tato-profit/25 focus:bg-tato-profit/25 active:bg-tato-profit/25',
    label: 'text-tato-profit',
    spinner: '#1ec995',
    icon: '#1ec995',
  },
  danger: {
    button: 'border-tato-error/45 bg-tato-error/12 hover:bg-tato-error/18 focus:bg-tato-error/18 active:bg-tato-error/18',
    label: 'text-tato-error',
    spinner: '#ff8f8f',
    icon: '#ff8f8f',
  },
};

const disabledTone = {
  button: 'border-tato-line bg-tato-panelSoft opacity-90',
  label: 'text-tato-dim',
  spinner: '#64779c',
  icon: '#64779c',
};

export function TatoButton({
  accessibilityState,
  className = '',
  disabled,
  icon,
  label,
  labelClassName = '',
  loading = false,
  size = 'md',
  tone = 'primary',
  ...rest
}: TatoButtonProps) {
  const resolvedDisabled = Boolean(disabled || loading);
  const visuallyDisabled = Boolean(disabled && !loading);
  const sizeStyle = sizeClasses[size];
  const toneStyle = visuallyDisabled ? disabledTone : enabledToneClasses[tone];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading || accessibilityState?.busy,
        disabled: resolvedDisabled || accessibilityState?.disabled,
      }}
      activeScale={0.985}
      className={`flex-row items-center justify-center gap-2 rounded-full border ${sizeStyle.button} ${toneStyle.button} ${className}`}
      disabled={resolvedDisabled}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={toneStyle.spinner} />
      ) : (
        <>
          {icon ? (
            <PlatformIcon color={toneStyle.icon} name={icon} size={sizeStyle.icon} />
          ) : null}
          <Text
            adjustsFontSizeToFit
            className={`text-center font-mono font-semibold uppercase tracking-[1px] ${sizeStyle.label} ${toneStyle.label} ${labelClassName}`}
            minimumFontScale={0.84}
            numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}
