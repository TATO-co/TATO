import { useCallback, useEffect, useState } from 'react';

import { fetchRecentFlips } from '@/lib/repositories/tato';
import { useAuth } from '@/components/providers/AuthProvider';
import type { RecentFlip } from '@/lib/models';

export function useRecentFlips() {
  const { user } = useAuth();
  const [flips, setFlips] = useState<RecentFlip[]>([]);

  const load = useCallback(async () => {
    const data = await fetchRecentFlips(user?.id ?? null);
    setFlips(data);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { flips, refresh: load };
}
