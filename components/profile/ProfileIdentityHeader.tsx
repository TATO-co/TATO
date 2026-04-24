import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import type { AppMode, CurrencyCode } from '@/lib/models';

type ProfileStat = {
  label: string;
  value: string | ReactNode;
};

type ProfileIdentityHeaderProps = {
  displayName: string;
  email?: string | null;
  personas: AppMode[];
  stats: ProfileStat[];
  accent: 'broker' | 'supplier';
};

function initialsForName(value: string) {
  return value
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'T';
}

export function currencyProfileStat(amount: number, currencyCode: CurrencyCode): ReactNode {
  return (
    <CurrencyDisplay
      amount={amount}
      className="text-center text-base font-bold"
      currencyCode={currencyCode}
      fractionDigits={0}
    />
  );
}

export function ProfileIdentityHeader({
  accent,
  displayName,
  email,
  personas,
  stats,
}: ProfileIdentityHeaderProps) {
  const gradientColors: [string, string, string] = accent === 'supplier'
    ? ['rgba(30, 201, 149, 0.54)', 'rgba(30, 109, 255, 0.3)', 'rgba(9, 23, 45, 0.96)']
    : ['rgba(30, 109, 255, 0.64)', 'rgba(138, 177, 255, 0.26)', 'rgba(9, 23, 45, 0.96)'];

  return (
    <View className="overflow-hidden rounded-[24px] border border-tato-line bg-tato-panel">
      <LinearGradient colors={gradientColors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={{ height: 160 }} />
      <View className="px-5 pb-5">
        <View className="-mt-9 h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-tato-panel bg-tato-panelSoft">
          <Text className="text-xl font-bold text-tato-text">{initialsForName(displayName)}</Text>
        </View>
        <Text className="mt-3 text-[20px] font-bold leading-6 text-tato-text" numberOfLines={1}>
          {displayName}
        </Text>
        {email ? (
          <Text className="mt-1 text-sm text-tato-muted" numberOfLines={1}>{email}</Text>
        ) : null}
        <View className="mt-3 flex-row flex-wrap gap-2">
          {personas.map((persona) => (
            <View className="rounded-full border border-tato-line bg-tato-panelSoft px-3 py-1.5" key={persona}>
              <Text className="font-mono text-[11px] uppercase tracking-[0.5px] text-tato-accent">
                {persona === 'broker' ? 'Broker' : 'Supplier'}
              </Text>
            </View>
          ))}
        </View>
        <View className="mt-5 flex-row overflow-hidden rounded-[18px] border border-tato-line bg-tato-panelDeep">
          {stats.map((stat, index) => (
            <View className="min-w-0 flex-1 px-3 py-4" key={stat.label}>
              {index > 0 ? <View className="absolute left-0 top-4 h-10 w-px bg-tato-line" /> : null}
              {typeof stat.value === 'string' ? (
                <Text className="text-center text-base font-bold text-tato-text" numberOfLines={1}>
                  {stat.value}
                </Text>
              ) : stat.value}
              <Text className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.5px] text-tato-dim" numberOfLines={2}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
