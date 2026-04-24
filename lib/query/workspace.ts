import type { QueryClient } from '@tanstack/react-query';

import {
  fetchBrokerClaims,
  fetchBrokerFeed,
  fetchBrokerPendingClaimCheckouts,
  fetchLedger,
  fetchNotifications,
  fetchSupplierDashboard,
} from '@/lib/repositories/tato';
import { tatoQueryKeys } from '@/lib/query/keys';

function keepPreviousResult<T>(previous: T | undefined) {
  return previous;
}

export function brokerFeedQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.brokerFeed(userId),
    queryFn: () => fetchBrokerFeed(),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export function brokerPendingClaimCheckoutsQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.brokerPendingClaimCheckouts(userId),
    queryFn: () => fetchBrokerPendingClaimCheckouts(userId ?? null),
    staleTime: 20 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export function brokerClaimsQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.brokerClaims(userId),
    queryFn: () => fetchBrokerClaims(userId ?? null),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export function ledgerQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.ledger(userId),
    queryFn: () => fetchLedger(userId ?? null),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export function notificationsQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.notifications(userId),
    queryFn: () => fetchNotifications(userId ?? null),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export function supplierDashboardQueryOptions(userId: string | null | undefined) {
  return {
    queryKey: tatoQueryKeys.supplierDashboard(userId),
    queryFn: () => fetchSupplierDashboard(userId ?? null),
    staleTime: 20 * 1000,
    placeholderData: keepPreviousResult,
  };
}

export async function prefetchBrokerWorkspaceQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
) {
  if (!userId) {
    return;
  }

  await Promise.allSettled([
    queryClient.prefetchQuery(brokerFeedQueryOptions(userId)),
    queryClient.prefetchQuery(brokerPendingClaimCheckoutsQueryOptions(userId)),
    queryClient.prefetchQuery(brokerClaimsQueryOptions(userId)),
    queryClient.prefetchQuery(ledgerQueryOptions(userId)),
    queryClient.prefetchQuery(notificationsQueryOptions(userId)),
  ]);
}

export async function prefetchSupplierWorkspaceQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
) {
  if (!userId) {
    return;
  }

  await Promise.allSettled([
    queryClient.prefetchQuery(supplierDashboardQueryOptions(userId)),
    queryClient.prefetchQuery(notificationsQueryOptions(userId)),
  ]);
}
