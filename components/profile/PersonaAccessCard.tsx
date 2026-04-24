import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { ListRow, ListSection } from '@/components/primitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { TatoButton } from '@/components/ui/TatoButton';
import type { AppMode } from '@/lib/models';

export function PersonaAccessCard() {
  const { profile, updatePersonas } = useAuth();
  const [canBroker, setCanBroker] = useState(profile?.can_broker ?? false);
  const [canSupply, setCanSupply] = useState(profile?.can_supply ?? false);
  const [defaultMode, setDefaultMode] = useState<AppMode>(profile?.default_mode ?? (profile?.can_supply ? 'supplier' : 'broker'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    setCanBroker(profile?.can_broker ?? false);
    setCanSupply(profile?.can_supply ?? false);
    setDefaultMode(profile?.default_mode ?? (profile?.can_supply ? 'supplier' : 'broker'));
    setMessage(null);
    setSavedVisible(false);
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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setSavedVisible(false);
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

      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <ListSection first title="Personas">
        <ListRow
          label="Broker workspace"
          toggle={{ value: canBroker, onChange: () => handleToggle('broker') }}
        />
        <ListRow
          label="Supplier dashboard"
          toggle={{ value: canSupply, onChange: () => handleToggle('supplier') }}
        />
        <ListRow
          label="Default entry"
          onPress={canBroker && canSupply ? () => {
            setDefaultMode((current) => current === 'broker' ? 'supplier' : 'broker');
            setMessage(null);
          } : undefined}
          value={resolvedDefaultMode === 'broker' ? 'Broker Workspace' : 'Supplier Dashboard'}
        />
      </ListSection>

      {message ? (
        <Text className="mt-3 text-sm text-tato-muted">{message}</Text>
      ) : null}
      {savedVisible ? (
        <Text className="mt-3 text-sm font-semibold text-tato-profit">Saved</Text>
      ) : null}

      {!unchanged || saving ? (
        <Animated.View
          className="mt-4"
          entering={SlideInDown.duration(180)}
          exiting={SlideOutDown.duration(160)}>
          <TatoButton
            disabled={saving}
            label="Save Persona Settings"
            loading={saving}
            onPress={handleSave}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
