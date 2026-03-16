import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import type { AppMode } from '@/lib/models';

function PersonaToggle(args: {
  active: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`rounded-[22px] border p-4 ${args.active ? 'border-tato-accent bg-tato-accent/10' : 'border-tato-line bg-tato-panelSoft'}`}
      disabled={args.disabled}
      onPress={args.onPress}>
      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${args.active ? 'text-tato-accent' : 'text-tato-dim'}`}>
        {args.label}
      </Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{args.description}</Text>
    </Pressable>
  );
}

export function PersonaAccessCard() {
  const { profile, updatePersonas } = useAuth();
  const [canBroker, setCanBroker] = useState(profile?.can_broker ?? false);
  const [canSupply, setCanSupply] = useState(profile?.can_supply ?? false);
  const [defaultMode, setDefaultMode] = useState<AppMode>(profile?.default_mode ?? (profile?.can_supply ? 'supplier' : 'broker'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCanBroker(profile?.can_broker ?? false);
    setCanSupply(profile?.can_supply ?? false);
    setDefaultMode(profile?.default_mode ?? (profile?.can_supply ? 'supplier' : 'broker'));
    setMessage(null);
  }, [profile]);

  const resolvedDefaultMode = useMemo<AppMode>(() => {
    if (canBroker && canSupply) {
      return defaultMode;
    }

    return canSupply ? 'supplier' : 'broker';
  }, [canBroker, canSupply, defaultMode]);

  const unchanged = Boolean(
    profile
      && canBroker === profile.can_broker
      && canSupply === profile.can_supply
      && resolvedDefaultMode === (profile.default_mode ?? (profile.can_supply ? 'supplier' : 'broker')),
  );

  const handleToggle = (persona: AppMode) => {
    setMessage(null);

    if (persona === 'broker') {
      if (canBroker && !canSupply) {
        setMessage('Keep at least one persona enabled.');
        return;
      }

      const next = !canBroker;
      setCanBroker(next);
      if (!next || (!canSupply && next)) {
        setDefaultMode(canSupply ? 'supplier' : 'broker');
      }
      return;
    }

    if (canSupply && !canBroker) {
      setMessage('Keep at least one persona enabled.');
      return;
    }

    const next = !canSupply;
    setCanSupply(next);
    if (!next || (!canBroker && next)) {
      setDefaultMode(canBroker ? 'broker' : 'supplier');
    }
  };

  return (
    <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
        Persona Access
      </Text>
      <Text className="mt-2 text-sm leading-7 text-tato-muted">
        Enable the workflows you want on this account. Keep at least one persona enabled at all times.
      </Text>

      <View className="mt-4 gap-3">
        <PersonaToggle
          active={canBroker}
          description="Claim inventory, work broker listings, and access broker payouts."
          label="Broker"
          onPress={() => handleToggle('broker')}
        />
        <PersonaToggle
          active={canSupply}
          description="Run intake, manage supplier inventory, and access supplier payouts."
          label="Supplier"
          onPress={() => handleToggle('supplier')}
        />
      </View>

      {canBroker && canSupply ? (
        <View className="mt-4 rounded-[22px] border border-tato-line bg-tato-panelSoft p-4">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
            Default Entry Mode
          </Text>
          <View className="mt-3 flex-row gap-3">
            {(['broker', 'supplier'] as AppMode[]).map((mode) => {
              const active = resolvedDefaultMode === mode;
              return (
                <Pressable
                  className={`flex-1 rounded-full border px-4 py-3 ${active ? 'border-tato-accent bg-tato-accent/10' : 'border-tato-line bg-tato-panel'}`}
                  key={mode}
                  onPress={() => {
                    setDefaultMode(mode);
                    setMessage(null);
                  }}>
                  <Text className={`text-center font-mono text-xs font-semibold uppercase tracking-[1px] ${active ? 'text-tato-accent' : 'text-tato-text'}`}>
                    {mode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View className="mt-4 rounded-[22px] border border-tato-line bg-tato-panelSoft p-4">
          <Text className="text-sm text-tato-muted">
            Default entry mode: {resolvedDefaultMode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'}.
          </Text>
        </View>
      )}

      {message ? (
        <Text className="mt-3 text-sm text-tato-muted">{message}</Text>
      ) : null}

      <Pressable
        className={`mt-4 rounded-full px-5 py-3.5 ${unchanged || saving ? 'bg-[#29436d]' : 'bg-tato-accent'}`}
        disabled={unchanged || saving}
        onPress={async () => {
          setSaving(true);
          setMessage(null);
          try {
            const { error } = await updatePersonas({
              canBroker,
              canSupply,
              defaultMode: resolvedDefaultMode,
            });

            if (error) {
              setMessage(error);
              return;
            }

            setMessage(`Saved. TATO will open in ${resolvedDefaultMode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'} by default.`);
          } finally {
            setSaving(false);
          }
        }}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
            Save Persona Settings
          </Text>
        )}
      </Pressable>
    </View>
  );
}
