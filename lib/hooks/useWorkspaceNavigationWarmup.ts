import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  prefetchBrokerWorkspaceQueries,
  prefetchSupplierWorkspaceQueries,
} from '@/lib/query/workspace';

type WorkspaceMode = 'broker' | 'supplier';

export function useWorkspaceNavigationWarmup({
  enabled,
  mode,
  userId,
}: {
  enabled: boolean;
  mode: WorkspaceMode;
  userId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const warmedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') {
      return;
    }

    const warmupKey = `${mode}:${userId ?? 'anon'}`;
    if (warmedKeyRef.current === warmupKey) {
      return;
    }
    warmedKeyRef.current = warmupKey;

    if (mode === 'broker') {
      void prefetchBrokerWorkspaceQueries(queryClient, userId);
      return;
    }

    void prefetchSupplierWorkspaceQueries(queryClient, userId);
  }, [enabled, mode, queryClient, userId]);
}
