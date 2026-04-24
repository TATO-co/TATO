import type {
  ClaimExternalListing,
  ClaimStatus,
  StockState,
  StockStateHistoryEntry,
  StockViewer,
} from '@/lib/models';

export const STOCK_STATE_ORDER: StockState[] = [
  'draft',
  'available',
  'claimed',
  'listed',
  'sold',
  'pending_fulfillment',
  'fulfilled',
  'archived',
];

type StockStateTone = 'accent' | 'warning' | 'success' | 'info' | 'tertiary';

export function stockStateFromDigitalStatus(
  digitalStatus: string | null | undefined,
  archivedAt?: string | null,
): StockState {
  if (archivedAt || digitalStatus === 'withdrawn') {
    return 'archived';
  }

  switch (digitalStatus) {
    case 'ready_for_claim':
    case 'claim_expired':
      return 'available';
    case 'claimed':
      return 'claimed';
    case 'broker_listing_live':
      return 'listed';
    case 'buyer_committed':
      return 'sold';
    case 'awaiting_hub_payment':
      return 'pending_fulfillment';
    case 'paid_at_hub':
    case 'completed':
      return 'fulfilled';
    case 'supplier_draft':
    case 'ai_ingestion_pending':
    case 'ai_ingestion_complete':
    default:
      return 'draft';
  }
}

export function stockStateFromClaimStatus(status: ClaimStatus): StockState {
  switch (status) {
    case 'listed_externally':
      return 'listed';
    case 'buyer_committed':
      return 'sold';
    case 'awaiting_pickup':
      return 'pending_fulfillment';
    case 'completed':
      return 'fulfilled';
    case 'expired':
    case 'deposit_expired':
    case 'cancelled':
      return 'archived';
    case 'active':
    case 'listing_generated':
    default:
      return 'claimed';
  }
}

export function getStockStatePresentation(state: StockState, viewer: StockViewer): {
  label: string;
  tone: StockStateTone;
} {
  const supplierLabels: Record<StockState, string> = {
    draft: 'Supplier Draft',
    available: 'Visible To Brokers',
    claimed: 'Claimed By Broker',
    listed: 'Broker Listed',
    sold: 'Buyer Committed',
    pending_fulfillment: 'Fulfillment Needed',
    fulfilled: 'Fulfilled',
    archived: 'Archived',
  };
  const brokerLabels: Record<StockState, string> = {
    draft: 'Draft',
    available: 'Available To Claim',
    claimed: 'In Your Inventory',
    listed: 'Listing Live',
    sold: 'Buyer Committed',
    pending_fulfillment: 'Awaiting Fulfillment',
    fulfilled: 'Payout Triggered',
    archived: 'Inactive',
  };
  const tones: Record<StockState, StockStateTone> = {
    draft: 'tertiary',
    available: 'accent',
    claimed: 'warning',
    listed: 'info',
    sold: 'success',
    pending_fulfillment: 'info',
    fulfilled: 'success',
    archived: 'tertiary',
  };

  return {
    label: viewer === 'supplier' ? supplierLabels[state] : brokerLabels[state],
    tone: tones[state],
  };
}

function stateLabel(state: StockState) {
  return state
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function addHistoryEntry(
  entries: StockStateHistoryEntry[],
  entry: StockStateHistoryEntry | null,
) {
  if (!entry) {
    return;
  }

  if (!entry.timestamp) {
    return;
  }

  if (entries.some((existing) => existing.state === entry.state)) {
    return;
  }

  entries.push(entry);
}

export function buildStockStateHistory(args: {
  currentState: StockState;
  createdAt: string;
  readyAt?: string | null;
  claimedAt?: string | null;
  listedAt?: string | null;
  soldAt?: string | null;
  fulfillmentRequestedAt?: string | null;
  fulfilledAt?: string | null;
  archivedAt?: string | null;
}): StockStateHistoryEntry[] {
  const entries: StockStateHistoryEntry[] = [];

  addHistoryEntry(entries, {
    actor: 'supplier',
    label: 'Draft created',
    state: 'draft',
    timestamp: args.createdAt,
  });

  if (STOCK_STATE_ORDER.indexOf(args.currentState) >= STOCK_STATE_ORDER.indexOf('available')) {
    addHistoryEntry(entries, {
      actor: 'supplier',
      label: 'Visible to brokers',
      state: 'available',
      timestamp: args.readyAt ?? args.createdAt,
    });
  }

  addHistoryEntry(entries, args.claimedAt ? {
    actor: 'broker',
    label: 'Broker claimed',
    state: 'claimed',
    timestamp: args.claimedAt,
  } : null);

  addHistoryEntry(entries, args.listedAt ? {
    actor: 'broker',
    label: 'External listing saved',
    state: 'listed',
    timestamp: args.listedAt,
  } : null);

  addHistoryEntry(entries, args.soldAt ? {
    actor: 'broker',
    label: 'Buyer committed',
    state: 'sold',
    timestamp: args.soldAt,
  } : null);

  addHistoryEntry(entries, args.fulfillmentRequestedAt ? {
    actor: 'broker',
    label: 'Fulfillment requested',
    state: 'pending_fulfillment',
    timestamp: args.fulfillmentRequestedAt,
  } : null);

  addHistoryEntry(entries, args.fulfilledAt ? {
    actor: 'system',
    label: 'Payment settled',
    state: 'fulfilled',
    timestamp: args.fulfilledAt,
  } : null);

  addHistoryEntry(entries, args.archivedAt ? {
    actor: 'system',
    label: 'Archived',
    state: 'archived',
    timestamp: args.archivedAt,
  } : null);

  if (!entries.some((entry) => entry.state === args.currentState)) {
    addHistoryEntry(entries, {
      actor: 'system',
      label: stateLabel(args.currentState),
      state: args.currentState,
      timestamp: args.readyAt ?? args.createdAt,
    });
  }

  return entries.sort((left, right) => (
    new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  ));
}

export function getLatestListingActivity(listings: ClaimExternalListing[]) {
  return listings.reduce<string | null>((latest, listing) => {
    if (!listing.updatedAt) {
      return latest;
    }

    if (!latest) {
      return listing.updatedAt;
    }

    return new Date(listing.updatedAt).getTime() > new Date(latest).getTime()
      ? listing.updatedAt
      : latest;
  }, null);
}

export function getSuggestedResaleRange(floorPriceCents: number) {
  const floor = Math.max(0, floorPriceCents);
  return {
    lowCents: Math.round(floor * 1.2),
    highCents: Math.round(floor * 1.5),
  };
}
