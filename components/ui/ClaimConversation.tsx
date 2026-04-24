import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { TatoButton } from '@/components/ui/TatoButton';
import { getUserSafeErrorMessage } from '@/lib/errorMessages';
import { useClaimMessages } from '@/lib/hooks/useClaimMessages';

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'now';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function ClaimConversation({
  claimId,
  counterpartLabel,
  disabledLabel,
}: {
  claimId: string | null | undefined;
  counterpartLabel: string;
  disabledLabel?: string;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    messages,
    loading,
    refreshing,
    error,
    sending,
    sendError,
    refresh,
    send,
  } = useClaimMessages(claimId);
  const canSend = Boolean(claimId && draft.trim() && !sending);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) {
      setLocalError('Enter a message before sending.');
      return;
    }

    setLocalError(null);
    const result = await send(body);
    if (!result.ok) {
      setLocalError(result.message);
      return;
    }

    setDraft('');
  };

  return (
    <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
            Claim Conversation
          </Text>
          <Text className="mt-2 text-xl font-sans-bold text-tato-text">
            Contact {counterpartLabel}
          </Text>
          <Text className="mt-2 text-sm leading-6 text-tato-muted">
            Messages stay attached to this claim so both sides can track handoff details.
          </Text>
        </View>
        {refreshing ? <ActivityIndicator color="#8ea4c8" /> : null}
      </View>

      <View className="mt-4 gap-3">
        {loading ? (
          <View className="items-center justify-center py-4">
            <ActivityIndicator color="#1e6dff" />
            <Text className="mt-2 text-sm text-tato-muted">Loading...</Text>
          </View>
        ) : error ? (
          <View className="gap-3">
            <Text className="text-sm text-tato-error">
              {getUserSafeErrorMessage(error, 'Claim messages are unavailable. Pull to refresh.')}
            </Text>
            <TatoButton
              label="Retry Messages"
              onPress={() => {
                void refresh();
              }}
              tone="secondary"
            />
          </View>
        ) : !messages.length ? (
          <Text className="rounded-[18px] border border-dashed border-tato-line px-4 py-3 text-sm text-tato-muted">
            {disabledLabel ?? 'No messages on this claim yet.'}
          </Text>
        ) : null}
        {messages.map((message) => {
          const mine = message.senderProfileId === user?.id;
          return (
            <View
              className={`max-w-[88%] rounded-[18px] border px-4 py-3 ${
                mine
                  ? 'self-end border-tato-accent/30 bg-tato-accent/10'
                  : 'self-start border-tato-line bg-tato-panelSoft'
              }`}
              key={message.id}>
              <Text className={`text-sm leading-6 ${mine ? 'text-tato-text' : 'text-tato-muted'}`}>
                {message.body}
              </Text>
              <Text className="mt-2 font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                {mine ? 'You' : counterpartLabel} · {formatMessageTime(message.createdAt)}
              </Text>
            </View>
          );
        })}
      </View>

      {claimId ? (
        <View className="mt-5 gap-3">
          <TextInput
            className="min-h-[92px] rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3 text-base text-tato-text"
            multiline
            onChangeText={(value) => {
              setDraft(value);
              setLocalError(null);
            }}
            placeholder={`Message ${counterpartLabel}`}
            placeholderTextColor="#8ea4c8"
            style={{ textAlignVertical: 'top' }}
            value={draft}
          />
          {localError || sendError ? (
            <Text className="text-sm text-tato-error">{localError ?? sendError}</Text>
          ) : null}
          <TatoButton
            disabled={!canSend}
            label={sending ? 'Sending...' : 'Send Message'}
            loading={sending}
            onPress={handleSend}
            tone="primary"
          />
        </View>
      ) : null}
    </View>
  );
}
