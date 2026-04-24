import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import type { ClaimMessage } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { fetchClaimMessages, sendClaimMessage } from '@/lib/repositories/tato';
import { supabase } from '@/lib/supabase';

export function useClaimMessages(claimId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = tatoQueryKeys.claimMessages(claimId);
  const messagesQuery = useQuery({
    queryKey,
    queryFn: () => fetchClaimMessages(claimId ?? null),
    enabled: Boolean(claimId && user?.id),
    placeholderData: (previous) => previous,
    staleTime: 15 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendClaimMessage({ claimId: claimId!, body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: tatoQueryKeys.notifications(user?.id) });
    },
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !claimId || !user?.id) {
      return;
    }

    const invalidateMessages = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const channel = sb
      .channel(`claim-messages:${claimId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'claim_messages',
          filter: `claim_id=eq.${claimId}`,
        },
        invalidateMessages,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [claimId, queryClient, queryKey, user?.id]);

  return {
    messages: messagesQuery.data ?? ([] as ClaimMessage[]),
    loading: Boolean(claimId && user?.id) && !messagesQuery.data && messagesQuery.isPending,
    refreshing: messagesQuery.isRefetching,
    error: messagesQuery.error instanceof Error ? messagesQuery.error.message : null,
    sending: sendMutation.isPending,
    sendError: sendMutation.data?.ok === false ? sendMutation.data.message : null,
    refresh: async () => {
      await messagesQuery.refetch();
    },
    send: async (body: string) => {
      if (!claimId) {
        return { ok: false as const, message: 'No active claim is selected.' };
      }

      return sendMutation.mutateAsync(body);
    },
  };
}
