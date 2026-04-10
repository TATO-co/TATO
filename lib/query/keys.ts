export const tatoQueryKeys = {
  brokerClaims: (userId: string | null | undefined) => ['broker-claims', userId ?? 'anon'] as const,
  brokerFeed: (userId: string | null | undefined) => ['broker-feed', userId ?? 'anon'] as const,
  itemDetail: (itemId: string | null | undefined) => ['item-detail', itemId ?? 'none'] as const,
  ledger: (userId: string | null | undefined) => ['ledger', userId ?? 'anon'] as const,
  recentFlips: (userId: string | null | undefined) => ['recent-flips', userId ?? 'anon'] as const,
  supplierDashboard: (userId: string | null | undefined) => ['supplier-dashboard', userId ?? 'anon'] as const,
};
