import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  createBlankSupplierHubDraft,
  createTestingSupplierHubDraft,
  hasActiveSupplierHub,
  type SupplierHubDraft,
} from '@/lib/hubs';
import { isLocalDevelopmentRuntime } from '@/lib/config';
import { createSupplierHub, listSupplierHubs } from '@/lib/repositories/hubs';

function HubDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View className="rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3">
      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <Text className="mt-1 text-sm leading-6 text-tato-text">{value}</Text>
    </View>
  );
}

function HubTextField({
  label,
  value,
  placeholder,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <TextInput
        className="mt-2 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        placeholder={placeholder}
        placeholderTextColor="#8ea4c8"
        style={multiline ? { minHeight: 92, textAlignVertical: 'top' } : undefined}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

function getTrimmedHubField(value: string) {
  return value.trim();
}

function isValidHubDraft(draft: SupplierHubDraft) {
  return Boolean(
    getTrimmedHubField(draft.name)
    && getTrimmedHubField(draft.addressLine1)
    && getTrimmedHubField(draft.city)
    && getTrimmedHubField(draft.state)
    && getTrimmedHubField(draft.postalCode),
  );
}

export function SupplierHubCard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hubs, setHubs] = useState<Awaited<ReturnType<typeof listSupplierHubs>>>([]);
  const [draft, setDraft] = useState(() => createBlankSupplierHubDraft());
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setDraft(createBlankSupplierHubDraft({ countryCode: profile?.country_code }));
    setMessage(null);
    setError(null);
  }, [profile?.country_code]);

  useEffect(() => {
    let cancelled = false;

    const loadHubs = async () => {
      setLoading(true);
      const nextHubs = await listSupplierHubs({ supplierId: profile?.id ?? null });
      if (!cancelled) {
        setHubs(nextHubs);
        setShowForm(nextHubs.length === 0);
        setLoading(false);
      }
    };

    void loadHubs();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const activeHub = useMemo(
    () => hubs.find((hub) => hub.status === 'active') ?? null,
    [hubs],
  );
  const developmentRuntime = isLocalDevelopmentRuntime();
  const missingHub = !hasActiveSupplierHub(hubs);

  const submitHub = async (nextDraft: SupplierHubDraft) => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const normalizedDraft: SupplierHubDraft = {
      name: getTrimmedHubField(nextDraft.name),
      addressLine1: getTrimmedHubField(nextDraft.addressLine1),
      addressLine2: getTrimmedHubField(nextDraft.addressLine2),
      city: getTrimmedHubField(nextDraft.city),
      state: getTrimmedHubField(nextDraft.state),
      postalCode: getTrimmedHubField(nextDraft.postalCode),
      countryCode: getTrimmedHubField(nextDraft.countryCode) || 'US',
      pickupInstructions: getTrimmedHubField(nextDraft.pickupInstructions),
    };

    if (!isValidHubDraft(normalizedDraft)) {
      setSaving(false);
      setError('Add a hub name, street address, city, state, and postal code to continue.');
      return;
    }

    const result = await createSupplierHub({ draft: normalizedDraft });
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setHubs((current) => [...current, result.hub]);
    setDraft(createBlankSupplierHubDraft({ countryCode: profile?.country_code }));
    setShowForm(false);
    setMessage('Supplier hub created. Live intake and new item drafts can use it now.');
  };

  return (
    <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">Supplier Hub</Text>
      <Text className="mt-2 text-sm leading-7 text-tato-muted">
        {missingHub
          ? 'Create one active supplier hub so live intake and new inventory drafts have a pickup location.'
          : 'Live intake and new supplier drafts route through your active hub. Keep these details current so pickup expectations stay clear.'}
      </Text>

      {loading ? (
        <View className="mt-4 rounded-[22px] border border-tato-line bg-tato-panelSoft p-4">
          <ActivityIndicator color="#1e6dff" />
        </View>
      ) : activeHub ? (
        <View className="mt-4 gap-3">
          <View className="rounded-[22px] border border-tato-profit/30 bg-tato-profit/10 p-4">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">Active Hub</Text>
            <Text className="mt-2 text-lg font-semibold text-tato-text">{activeHub.name}</Text>
            <Text className="mt-1 text-sm leading-6 text-tato-muted">
              {activeHub.addressLine1}
              {activeHub.addressLine2 ? `, ${activeHub.addressLine2}` : ''}
              {` · ${activeHub.city}, ${activeHub.state} ${activeHub.postalCode}`}
            </Text>
            {activeHub.pickupInstructions ? (
              <Text className="mt-2 text-sm leading-6 text-tato-muted">{activeHub.pickupInstructions}</Text>
            ) : null}
          </View>
          <View className="gap-3">
            <HubDetailRow
              label="Hub Coverage"
              value={hubs.length === 1 ? '1 supplier hub on file' : `${hubs.length} supplier hubs on file`}
            />
            <HubDetailRow
              label="Country"
              value={activeHub.countryCode}
            />
          </View>
          {message ? (
            <View className="rounded-[18px] border border-tato-profit/30 bg-tato-profit/10 p-3">
              <Text className="text-sm text-tato-profit">{message}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View className="mt-4 rounded-[22px] border border-[#f5b942]/30 bg-[#f5b942]/10 p-4">
            <Text className="text-sm leading-6 text-[#f5b942]">
              No active hub is on file for this supplier yet. Create one here to unlock live intake.
            </Text>
          </View>

          {showForm ? (
            <View className="mt-4 gap-4">
              <HubTextField
                label="Hub Name"
                value={draft.name}
                placeholder="Main Pickup Hub"
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, name: value }));
                  setError(null);
                  setMessage(null);
                }}
              />
              <HubTextField
                label="Street Address"
                value={draft.addressLine1}
                placeholder="100 Main Street"
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, addressLine1: value }));
                  setError(null);
                  setMessage(null);
                }}
              />
              <HubTextField
                label="Address Line 2"
                value={draft.addressLine2}
                placeholder="Suite, dock, or pickup note"
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, addressLine2: value }));
                  setError(null);
                  setMessage(null);
                }}
              />
              <View className="gap-4 md:flex-row">
                <HubTextField
                  label="City"
                  value={draft.city}
                  placeholder="Chicago"
                  onChangeText={(value) => {
                    setDraft((current) => ({ ...current, city: value }));
                    setError(null);
                    setMessage(null);
                  }}
                />
                <HubTextField
                  label="State"
                  value={draft.state}
                  placeholder="IL"
                  onChangeText={(value) => {
                    setDraft((current) => ({ ...current, state: value }));
                    setError(null);
                    setMessage(null);
                  }}
                />
              </View>
              <HubTextField
                label="Postal Code"
                value={draft.postalCode}
                placeholder="60601"
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, postalCode: value }));
                  setError(null);
                  setMessage(null);
                }}
              />
              <HubTextField
                label="Pickup Instructions"
                value={draft.pickupInstructions}
                placeholder="Pickup by appointment."
                multiline
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, pickupInstructions: value }));
                  setError(null);
                  setMessage(null);
                }}
              />

              {error ? (
                <View className="rounded-[18px] border border-tato-error/30 bg-tato-error/10 p-3">
                  <Text className="text-sm text-tato-error">{error}</Text>
                </View>
              ) : null}

              {message ? (
                <View className="rounded-[18px] border border-tato-profit/30 bg-tato-profit/10 p-3">
                  <Text className="text-sm text-tato-profit">{message}</Text>
                </View>
              ) : null}

              <Pressable
                className={`rounded-full px-5 py-3.5 ${saving ? 'bg-[#29436d]' : 'bg-tato-accent'}`}
                disabled={saving}
                onPress={() => {
                  void submitHub(draft);
                }}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                    Create Supplier Hub
                  </Text>
                )}
              </Pressable>

              {developmentRuntime ? (
                <Pressable
                  className="rounded-full border border-tato-line bg-tato-panelSoft px-5 py-3.5"
                  disabled={saving}
                  onPress={() => {
                    void submitHub(createTestingSupplierHubDraft({
                      countryCode: profile?.country_code,
                    }));
                  }}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Use Testing Hub
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
