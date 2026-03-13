import { useCallback, useEffect, useState } from 'react';

import {
  approveUserAccess,
  fetchReviewProfiles,
  suspendUserAccess,
  type ReviewProfile,
} from '@/lib/repositories/tato';
import { captureException, trackEvent } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export function useAdminProfiles() {
  const [profiles, setProfiles] = useState<ReviewProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchReviewProfiles();
      setProfiles(data);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load review profiles.';
      setError(message);
      captureException(loadError, { flow: 'hook.useAdminProfiles.load' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }

    const channel = sb
      .channel('admin-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [load]);

  const approve = useCallback(
    async (profileId: string) => {
      setWorkingId(profileId);
      const result = await approveUserAccess({ profileId });
      setWorkingId(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      trackEvent('admin_approve_user', { profileId });
      await load();
    },
    [load],
  );

  const suspend = useCallback(
    async (profileId: string) => {
      setWorkingId(profileId);
      const result = await suspendUserAccess({ profileId });
      setWorkingId(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      trackEvent('admin_suspend_user', { profileId });
      await load();
    },
    [load],
  );

  return {
    profiles,
    loading,
    error,
    workingId,
    approve,
    suspend,
    refresh: load,
  };
}
