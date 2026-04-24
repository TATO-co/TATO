import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';
import type { UserNotification } from '@/lib/models';
import { tatoQueryKeys } from '@/lib/query/keys';
import { notificationsQueryOptions } from '@/lib/query/workspace';
import { supabase } from '@/lib/supabase';

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = tatoQueryKeys.notifications(user?.id);
  const notificationsQuery = useQuery({
    ...notificationsQueryOptions(user?.id),
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    const sb = supabase;
    if (!sb || !user?.id) {
      return;
    }

    const invalidateNotifications = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const channel = sb
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_profile_id=eq.${user.id}`,
        },
        invalidateNotifications,
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  return {
    notifications: notificationsQuery.data ?? ([] as UserNotification[]),
    loading: Boolean(user?.id) && !notificationsQuery.data && notificationsQuery.isPending,
    error: notificationsQuery.error instanceof Error ? notificationsQuery.error.message : null,
    refresh: async () => {
      await notificationsQuery.refetch();
    },
  };
}
