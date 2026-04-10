import {
  brokerCategories,
  lifecycleFromClaimStatus,
  createRequestKey,
  formatMoney,
  normalizeClaimPlatformVariants,
  normalizeClaimStatus,
  normalizeExternalListingRefs,
  resolveCurrencyCode,
  serializeExternalListingRefs,
  slugifyClaimPlatform,
  type ClaimExternalListing,
  type BrokerFeedItem,
  type ClaimSnapshot,
  type ClaimStatus,
  type CurrencyCode,
  type ItemDetail,
  type SupplierItem,
  type SupplierMetric,
} from '@/lib/models';
import { captureException } from '@/lib/analytics';
import {
  DEFAULT_BROKER_UPSIDE_BPS,
  DEFAULT_PLATFORM_UPSIDE_BPS,
  DEFAULT_SUPPLIER_UPSIDE_BPS,
  resolveEstimatedClaimEconomics,
} from '@/lib/economics';
import {
  canSupplierDeleteItem,
  canSupplierEditItem,
  supplierDeletableItemStatuses,
  supplierEditableItemStatuses,
  type SupplierItemUpdatePayload,
} from '@/lib/item-detail';
import { classifyLiveWorkflowError } from '@/lib/liveIntake/errors';
import { MAX_STILL_PHOTO_SET_SIZE } from '@/lib/stillPhotoIntake';
import { supabase } from '@/lib/supabase';

type BrokerFeedRecord = {
  id: string;
  title: string | null;
  description: string | null;
  condition_summary: string | null;
  floor_price_cents: number | null;
  suggested_list_price_cents: number | null;
  ingestion_ai_confidence: number | null;
  photo_paths: string[] | null;
  hub_id: string;
  supplier_id: string;
  currency_code: string | null;
};

type HubRecord = { id: string; name: string; city: string };
type ProfileRecord = {
  id: string;
  display_name: string | null;
  status?: string | null;
  email?: string | null;
};
type ClaimRecord = {
  id: string;
  item_id: string;
  status: string;
  expires_at: string;
  claim_fee_cents: number;
  claim_deposit_cents: number | null;
  hub_id: string;
  currency_code: string | null;
  locked_floor_price_cents: number | null;
  locked_suggested_list_price_cents: number | null;
  supplier_upside_bps: number | null;
  broker_upside_bps: number | null;
  platform_upside_bps: number | null;
  listing_ai_title: string | null;
  listing_ai_description: string | null;
  listing_ai_platform_variants: Record<string, unknown> | null;
  external_listing_refs: Record<string, unknown> | null;
  buyer_committed_at: string | null;
  pickup_due_at: string | null;
};

type ItemDetailRecord = {
  id: string;
  supplier_id: string;
  title: string | null;
  description: string | null;
  condition_summary: string | null;
  floor_price_cents: number | null;
  suggested_list_price_cents: number | null;
  ingestion_ai_confidence: number | null;
  ingestion_ai_attributes: Record<string, unknown> | null;
  ingestion_ai_market_snapshot: Record<string, unknown> | null;
  photo_paths: string[] | null;
  digital_status: string;
  currency_code: string | null;
  updated_at: string;
};

type SupplierItemPhotoRecord = {
  id: string;
  supplier_id: string;
  digital_status: string;
  primary_photo_path: string | null;
  photo_paths: string[] | null;
};

type SupplierDashboardItemRecord = {
  id: string;
  title: string | null;
  digital_status: string;
  floor_price_cents: number | null;
  suggested_list_price_cents: number | null;
  photo_paths: string[] | null;
  quantity: number;
  currency_code: string | null;
};

type TransactionRecord = {
  id: string;
  transaction_type: string;
  status: string;
  gross_amount_cents: number;
  currency_code: string;
  occurred_at: string;
  item_id: string;
  supplier_id: string;
  broker_id: string | null;
};

type MutationErrorResponse = {
  ok?: false;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type LedgerEntry = {
  id: string;
  label: string;
  status: string;
  amountText: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  occurredAt: string;
  direction: 'in' | 'out';
};

type SupplierHubRecord = {
  id: string;
};

export type IngestionAnalysis = {
  itemTitle: string;
  description: string;
  conditionSummary: string;
  floorPriceCents: number;
  suggestedListPriceCents: number;
  confidence: number;
  attributes: Record<string, unknown>;
  marketSnapshot: Record<string, unknown>;
};

export type IngestionPipelineResult =
  | {
      ok: true;
      itemId: string;
      hubId: string;
      storagePath: string;
      analysis: IngestionAnalysis;
    }
  | {
      ok: false;
      message: string;
    };

export type ClaimFeeIntentResult =
  | {
      ok: true;
      paymentIntentId: string;
      clientSecret: string | null;
      transactionId: string | null;
    }
  | {
      ok: false;
      message: string;
    };

export type SalePaymentIntentResult =
  | {
      ok: true;
      paymentIntentId: string;
      clientSecret: string | null;
      transactionId: string | null;
    }
  | {
      ok: false;
      message: string;
    };

type IngestionPhotoInput = {
  uri: string;
  mimeType?: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured for this build.');
  }

  return supabase;
}

function placeholderImage(label: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
      <rect width="100%" height="100%" fill="#09172d"/>
      <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" fill="#edf4ff" font-size="42" font-family="Arial">TATO</text>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#8ea4c8" font-size="22" font-family="Arial">${label}</text>
    </svg>`,
  )}`;
}

function normalizeJsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeJsonStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function humanizeLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatInsightValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatInsightValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(', ') : null;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => {
        const formatted = formatInsightValue(entry);
        return formatted ? `${humanizeLabel(key)}: ${formatted}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(', ') : null;
  }

  return null;
}

function buildObservedDetails(attributes: Record<string, unknown>) {
  const sourceIgnored = new Set([
    'source',
    'category',
    'brand',
    'model',
    'candidate_items',
    'condition_signals',
    'confirmed_condition_grade',
    'condition_confidence',
    'next_best_action',
    'missing_views',
    'capture_mode',
    'live_session_id',
  ]);

  const observedDetails = Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (sourceIgnored.has(key)) {
        return [];
      }

      if (key === 'attributes' && value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.entries(value as Record<string, unknown>)
          .map(([nestedKey, nestedValue]) => {
            const formatted = formatInsightValue(nestedValue);
            return formatted
              ? { label: humanizeLabel(nestedKey), value: formatted }
              : null;
          })
          .filter((entry): entry is { label: string; value: string } => Boolean(entry));
      }

      const formatted = formatInsightValue(value);
      return formatted ? [{ label: humanizeLabel(key), value: formatted }] : [];
    });

  return observedDetails.slice(0, 8);
}

function buildCandidateItems(attributes: Record<string, unknown>) {
  const candidates = Array.isArray(attributes.candidate_items) ? attributes.candidate_items : [];

  return candidates
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
      if (!title) {
        return null;
      }

      const subtitle = [candidate.brand, candidate.model, candidate.category]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · ');
      const confidence = typeof candidate.confidence === 'number'
        ? Math.max(0, Math.min(1, candidate.confidence))
        : 0;

      return {
        title,
        subtitle,
        confidence,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 3);
}

function initials(name: string | null | undefined) {
  if (!name) {
    return 'TA';
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return chars.join('') || 'TA';
}

function lifecycleFromItemStatus(status: string): ItemDetail['lifecycleStage'] {
  if (status === 'completed' || status === 'paid_at_hub') {
    return 'sold';
  }
  if (status === 'broker_listing_live') {
    return 'listed';
  }
  if (status === 'claimed' || status === 'buyer_committed' || status === 'awaiting_hub_payment') {
    return 'claimed';
  }

  return 'inventoried';
}

function supplierStatusFromItemStatus(digitalStatus: string): SupplierItem['status'] {
  if (digitalStatus === 'claimed' || digitalStatus === 'broker_listing_live' || digitalStatus === 'buyer_committed') {
    return 'claimed';
  }

  if (digitalStatus === 'awaiting_hub_payment' || digitalStatus === 'paid_at_hub' || digitalStatus === 'completed') {
    return 'pending_pickup';
  }

  return 'available';
}

async function resolveImage(path: string | null | undefined, label: string) {
  if (!path) {
    return placeholderImage(label);
  }

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }

  const client = requireSupabase();
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    return placeholderImage(label);
  }

  const [bucket, ...rest] = parts;
  const objectPath = rest.join('/');
  const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
  if (error || !data?.signedUrl) {
    return placeholderImage(label);
  }

  return data.signedUrl;
}

function inferImageExtension(uri: string, mimeType?: string) {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return 'heic';
  }

  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return 'jpg';
}

function parseStoragePath(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return {
    bucket: parts[0],
    objectPath: parts.slice(1).join('/'),
  };
}

async function removeStoragePaths(paths: Array<string | null | undefined>) {
  const client = requireSupabase();
  const groupedPaths = paths.reduce<Map<string, string[]>>((current, path) => {
    const parsed = parseStoragePath(path);
    if (!parsed) {
      return current;
    }

    const bucketPaths = current.get(parsed.bucket) ?? [];
    bucketPaths.push(parsed.objectPath);
    current.set(parsed.bucket, bucketPaths);
    return current;
  }, new Map());

  await Promise.all(
    [...groupedPaths.entries()].map(async ([bucket, objectPaths]) => {
      if (!objectPaths.length) {
        return;
      }

      const { error } = await client.storage.from(bucket).remove(objectPaths);
      if (error) {
        captureException(error, {
          flow: 'repo.removeStoragePaths',
          bucket,
          objectPathCount: objectPaths.length,
        });
      }
    }),
  );
}

async function uploadSupplierItemPhoto(args: {
  supplierId: string;
  itemId: string;
  imageUri: string;
  mimeType?: string;
}) {
  const fileExt = inferImageExtension(args.imageUri, args.mimeType);
  const storageKey = `${args.supplierId}/${args.itemId}/photo-${Date.now()}.${fileExt}`;
  const storagePath = `items/${storageKey}`;
  await uploadImageToStorage({
    bucket: 'items',
    storageKey,
    imageUri: args.imageUri,
    mimeType: args.mimeType,
    upsert: false,
  });

  return storagePath;
}

async function uploadImageToStorage(args: {
  bucket: string;
  storageKey: string;
  imageUri: string;
  mimeType?: string;
  upsert: boolean;
}) {
  const client = requireSupabase();
  const response = await fetch(args.imageUri);
  const blob = await response.blob();

  const { error } = await client.storage.from(args.bucket).upload(args.storageKey, blob, {
    upsert: args.upsert,
    contentType: args.mimeType ?? blob.type ?? 'image/jpeg',
  });

  if (error) {
    throw error;
  }
}

function toMutationMessage(data: MutationErrorResponse | null | undefined, fallback: string) {
  return data?.message ?? fallback;
}

function toRepositoryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
}

function buildRecentFlips(entries: LedgerEntry[]) {
  return entries
    .filter((entry) => entry.direction === 'in')
    .slice(0, 6)
    .map((entry) => {
      const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(entry.occurredAt).getTime()) / 60000));
      const agoLabel = diffMinutes < 60 ? `${diffMinutes}m ago` : `${Math.round(diffMinutes / 60)}h ago`;
      return {
        title: entry.label,
        payoutCents: entry.amountCents,
        agoLabel,
        currencyCode: entry.currencyCode,
      };
    });
}

async function resolvePrimaryHubId(supplierId: string) {
  const client = requireSupabase();

  const { data, error } = await client
    .from('hubs')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data?.length) {
    return null;
  }

  return (data[0] as SupplierHubRecord).id;
}

export async function fetchBrokerFeed(limit = 40): Promise<BrokerFeedItem[]> {
  const client = requireSupabase();

  const { data: itemRows, error } = await client
    .from('items')
    .select(
      'id,title,description,condition_summary,floor_price_cents,suggested_list_price_cents,ingestion_ai_confidence,photo_paths,hub_id,supplier_id,currency_code',
    )
    .eq('digital_status', 'ready_for_claim')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    captureException(error, { flow: 'repo.fetchBrokerFeed' });
    throw new Error(error.message);
  }

  const items = (itemRows ?? []) as BrokerFeedRecord[];
  if (!items.length) {
    return [];
  }

  const hubIds = [...new Set(items.map((item) => item.hub_id))];
  const supplierIds = [...new Set(items.map((item) => item.supplier_id))];

  const [{ data: hubRows }, { data: supplierRows }] = await Promise.all([
    client.from('hubs').select('id,name,city').in('id', hubIds),
    client.from('profiles').select('id,display_name').in('id', supplierIds),
  ]);

  const hubMap = new Map((hubRows as HubRecord[] | null | undefined)?.map((hub) => [hub.id, hub]) ?? []);
  const supplierMap = new Map((supplierRows as ProfileRecord[] | null | undefined)?.map((profile) => [profile.id, profile]) ?? []);

  return Promise.all(
    items.map(async (item) => {
      const hub = hubMap.get(item.hub_id);
      const supplier = supplierMap.get(item.supplier_id);
      const economics = resolveEstimatedClaimEconomics({
        floorPriceCents: item.floor_price_cents,
        suggestedListPriceCents: item.suggested_list_price_cents,
        supplierUpsideBps: DEFAULT_SUPPLIER_UPSIDE_BPS,
        brokerUpsideBps: DEFAULT_BROKER_UPSIDE_BPS,
        platformUpsideBps: DEFAULT_PLATFORM_UPSIDE_BPS,
      });
      const currencyCode = resolveCurrencyCode(item.currency_code);
      const label = item.title ?? 'TATO Item';

      return {
        id: item.id,
        title: item.title ?? 'Untitled Item',
        subtitle: item.condition_summary ?? item.description ?? 'Supplier catalog item',
        hubName: `Hub: ${hub?.name ?? 'Supplier Hub'}`,
        city: hub?.city ?? 'Local',
        floorPriceCents: economics.floorPriceCents,
        claimDepositCents: economics.claimDepositCents,
        estimatedSalePriceCents: economics.estimatedSalePriceCents,
        estimatedBrokerPayoutCents: economics.estimatedBrokerPayoutCents,
        photoCount: Math.max(item.photo_paths?.length ?? 0, 1),
        aiIngestionConfidence: Math.min(0.999, Math.max(0.45, item.ingestion_ai_confidence ?? 0.82)),
        tags: [
          item.condition_summary ? item.condition_summary.toLowerCase() : 'verified photos',
          hub?.city ? `${hub.city.toLowerCase()} pickup` : 'local pickup',
        ],
        gradeLabel: item.condition_summary ?? 'Verified',
        imageUrl: await resolveImage(item.photo_paths?.[0], label),
        sellerBadges: [initials(supplier?.display_name)],
        hubId: item.hub_id,
        shippable: true,
        currencyCode,
      } satisfies BrokerFeedItem;
    }),
  );
}

export async function createClaim(args: {
  brokerId: string;
  itemId: string;
  hubId: string;
  claimDepositCents: number;
  expiresInDays?: number;
}) {
  const client = requireSupabase();

  const { data, error } = await client.functions.invoke('create-claim', {
    body: {
      itemId: args.itemId,
      expiresInDays: args.expiresInDays ?? 3,
      requestKey: createRequestKey('claim'),
    },
  });

  if (error) {
    captureException(error, { flow: 'repo.createClaim' });
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      error,
      fallbackMessage: 'Unable to create claim.',
    });
    return { ok: false as const, code: classified.code, message: classified.message };
  }

  if (!data?.ok) {
    const classified = await classifyLiveWorkflowError({
      context: 'claim',
      data: data as MutationErrorResponse | null,
      fallbackMessage: 'Unable to create claim.',
    });
    return {
      ok: false as const,
      code: classified.code,
      message: classified.message,
    };
  }

  return {
    ok: true as const,
    id: data.claimId as string,
    paymentIntentId: (data.paymentIntentId ?? null) as string | null,
    clientSecret: (data.clientSecret ?? null) as string | null,
    transactionId: (data.transactionId ?? null) as string | null,
  };
}

export async function fetchBrokerClaims(brokerId: string | null): Promise<ClaimSnapshot[]> {
  if (!brokerId) {
    return [];
  }

  const client = requireSupabase();

  const { data: claimRows, error } = await client
    .from('claims')
    .select(
      'id,item_id,status,expires_at,claim_fee_cents,claim_deposit_cents,hub_id,currency_code,locked_floor_price_cents,locked_suggested_list_price_cents,supplier_upside_bps,broker_upside_bps,platform_upside_bps,listing_ai_title,listing_ai_description,listing_ai_platform_variants,external_listing_refs,buyer_committed_at,pickup_due_at',
    )
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    captureException(error, { flow: 'repo.fetchBrokerClaims' });
    throw new Error(error.message);
  }

  const claims = (claimRows ?? []) as ClaimRecord[];
  if (!claims.length) {
    return [];
  }

  const itemIds = [...new Set(claims.map((claim) => claim.item_id))];
  const hubIds = [...new Set(claims.map((claim) => claim.hub_id))];

  const [{ data: itemRows }, { data: hubRows }] = await Promise.all([
    client
      .from('items')
      .select('id,title,floor_price_cents,suggested_list_price_cents')
      .in('id', itemIds),
    client.from('hubs').select('id,name').in('id', hubIds),
  ]);

  const itemMap = new Map(
    (
      (itemRows as Array<{
        id: string;
        title: string | null;
        floor_price_cents: number | null;
        suggested_list_price_cents: number | null;
      }> | null | undefined) ?? []
    ).map((item) => [item.id, item]),
  );
  const hubMap = new Map(
    (((hubRows as Array<{ id: string; name: string }> | null | undefined) ?? []).map((hub) => [hub.id, hub])),
  );

  return claims.map((claim) => {
    const item = itemMap.get(claim.item_id);
    const status = normalizeClaimStatus(claim.status);
    const economics = resolveEstimatedClaimEconomics({
      floorPriceCents: claim.locked_floor_price_cents ?? item?.floor_price_cents ?? 0,
      suggestedListPriceCents: claim.locked_suggested_list_price_cents ?? item?.suggested_list_price_cents ?? 0,
      supplierUpsideBps: claim.supplier_upside_bps,
      brokerUpsideBps: claim.broker_upside_bps,
      platformUpsideBps: claim.platform_upside_bps,
    });

    return {
      id: claim.id,
      itemId: claim.item_id,
      itemTitle: item?.title ?? 'Untitled Item',
      brokerName: 'You',
      supplierName: hubMap.get(claim.hub_id)?.name ?? 'Supplier Hub',
      status,
      expiresAt: claim.expires_at,
      lifecycleStage: lifecycleFromClaimStatus(status),
      claimDepositCents: claim.claim_deposit_cents ?? claim.claim_fee_cents,
      estimatedBrokerPayoutCents: economics.estimatedBrokerPayoutCents,
      currencyCode: resolveCurrencyCode(claim.currency_code),
      listingTitle: claim.listing_ai_title,
      listingDescription: claim.listing_ai_description,
      platformVariants: normalizeClaimPlatformVariants(claim.listing_ai_platform_variants),
      externalListings: normalizeExternalListingRefs(claim.external_listing_refs),
      buyerCommittedAt: claim.buyer_committed_at,
      pickupDueAt: claim.pickup_due_at,
    } satisfies ClaimSnapshot;
  });
}

export async function saveBrokerExternalListing(args: {
  claimId: string;
  platform: string;
  listingUrl?: string | null;
  externalId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = requireSupabase();
  const platform = args.platform.trim();
  const listingUrl = args.listingUrl?.trim() || null;
  const externalId = args.externalId?.trim() || null;

  if (!platform) {
    return { ok: false, message: 'Enter a marketplace name before saving the listing.' };
  }

  if (!listingUrl && !externalId) {
    return { ok: false, message: 'Add a listing URL or marketplace listing ID before saving.' };
  }

  const { data: claimRow, error: loadError } = await client
    .from('claims')
    .select('status,external_listing_refs')
    .eq('id', args.claimId)
    .maybeSingle<{ status: string; external_listing_refs: Record<string, unknown> | null }>();

  if (loadError) {
    captureException(loadError, { flow: 'repo.saveBrokerExternalListing.load' });
    return { ok: false, message: 'Unable to load the current listing tracker.' };
  }

  const currentListings = normalizeExternalListingRefs(claimRow?.external_listing_refs);
  const currentStatus = normalizeClaimStatus(claimRow?.status);
  const key = slugifyClaimPlatform(platform);
  const timestamp = new Date().toISOString();
  const nextListings: ClaimExternalListing[] = [
    ...currentListings.filter((listing) => listing.key !== key),
    {
      key,
      platform,
      url: listingUrl,
      externalId,
      source: 'manual',
      updatedAt: timestamp,
    },
  ];

  const { error: updateError } = await client
    .from('claims')
    .update({
      external_listing_refs: serializeExternalListingRefs(nextListings),
      status:
        currentStatus === 'active' || currentStatus === 'listing_generated'
          ? 'listed_externally'
          : currentStatus,
    })
    .eq('id', args.claimId);

  if (updateError) {
    captureException(updateError, { flow: 'repo.saveBrokerExternalListing.update' });
    return { ok: false, message: 'Unable to save the external listing right now.' };
  }

  return { ok: true };
}

export async function updateBrokerClaimWorkflow(args: {
  claimId: string;
  status: Extract<ClaimStatus, 'buyer_committed' | 'awaiting_pickup' | 'cancelled'>;
  buyerCommittedAt?: string | null;
  pickupDueAt?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = requireSupabase();
  const patch: Record<string, string | null> = {
    status: args.status,
  };

  if (args.status === 'buyer_committed') {
    patch.buyer_committed_at = args.buyerCommittedAt ?? new Date().toISOString();
  }

  if (args.status === 'awaiting_pickup') {
    patch.pickup_due_at = args.pickupDueAt ?? null;
  }

  const { error } = await client
    .from('claims')
    .update(patch)
    .eq('id', args.claimId);

  if (error) {
    captureException(error, { flow: 'repo.updateBrokerClaimWorkflow' });
    return { ok: false, message: 'Unable to update the claim workflow right now.' };
  }

  return { ok: true };
}

export async function fetchSupplierDashboard(supplierId: string | null): Promise<{
  metrics: SupplierMetric[];
  items: SupplierItem[];
}> {
  if (!supplierId) {
    return {
      metrics: [],
      items: [],
    };
  }

  const client = requireSupabase();

  const { data: itemRows, error } = await client
    .from('items')
    .select('id,title,digital_status,floor_price_cents,suggested_list_price_cents,photo_paths,quantity,currency_code')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    captureException(error, { flow: 'repo.fetchSupplierDashboard.items' });
    throw new Error(error.message);
  }

  const items = (itemRows ?? []) as SupplierDashboardItemRecord[];

  const { data: txRows, error: txError } = await client
    .from('transactions')
    .select('gross_amount_cents,occurred_at,status,transaction_type,currency_code')
    .eq('supplier_id', supplierId)
    .eq('status', 'succeeded')
    .eq('transaction_type', 'sale_payment')
    .order('occurred_at', { ascending: false })
    .limit(250);

  if (txError) {
    captureException(txError, { flow: 'repo.fetchSupplierDashboard.transactions' });
    throw new Error(txError.message);
  }

  const mappedItems = await Promise.all(
    items.map(async (item) => {
      const currencyCode = resolveCurrencyCode(item.currency_code);
      return {
        id: item.id,
        sku: `SKU-${item.id.slice(0, 6).toUpperCase()}`,
        title: item.title ?? 'Catalog Item',
        askPriceCents: item.suggested_list_price_cents ?? item.floor_price_cents ?? 0,
        status: supplierStatusFromItemStatus(item.digital_status),
        quantity: item.quantity,
        thumbUrl: await resolveImage(item.photo_paths?.[0], item.title ?? 'Inventory'),
        subtitle: item.title ?? 'Catalog item',
        brokerActivity: 'Medium' as const,
        canDelete: canSupplierDeleteItem(item.digital_status),
        currencyCode,
      } satisfies SupplierItem;
    }),
  );

  const now = new Date();
  const start30 = new Date(now);
  start30.setDate(now.getDate() - 30);
  const start60 = new Date(now);
  start60.setDate(now.getDate() - 60);
  const recentSales =
    ((txRows as Array<{ gross_amount_cents: number; occurred_at: string; currency_code: string }> | null | undefined) ?? []).filter((row) => {
      const occurred = new Date(row.occurred_at);
      return occurred >= start60;
    });
  const reportingCurrency = resolveCurrencyCode(
    recentSales[0]?.currency_code ?? mappedItems[0]?.currencyCode,
  );
  const sales = recentSales.filter((row) => resolveCurrencyCode(row.currency_code) === reportingCurrency);
  const thisMonthSales = sales.filter((row) => new Date(row.occurred_at) >= start30);
  const lastMonthSales = sales.filter((row) => {
    const occurred = new Date(row.occurred_at);
    return occurred < start30 && occurred >= start60;
  });

  const thisMonthTotal = thisMonthSales.reduce((sum, row) => sum + row.gross_amount_cents, 0);
  const lastMonthTotal = lastMonthSales.reduce((sum, row) => sum + row.gross_amount_cents, 0);
  const deltaPct = lastMonthTotal > 0 ? (((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1) : '0.0';
  const averageSale = thisMonthSales.length > 0 ? Math.round(thisMonthTotal / thisMonthSales.length) : 0;
  const liveItems = items.filter((item) => item.digital_status !== 'completed').length;

  return {
    metrics: [
      {
        label: 'Gross Volume (30D)',
        value: formatMoney(thisMonthTotal, reportingCurrency, 2),
        delta: `${Number(deltaPct) >= 0 ? '+' : ''}${deltaPct}% vs last month`,
        tone: Number(deltaPct) >= 0 ? 'positive' : 'neutral',
      },
      {
        label: 'Inventory',
        value: String(liveItems),
        delta: `${mappedItems.filter((item) => item.status === 'available').length} Available`,
        tone: 'neutral',
      },
      {
        label: 'Avg. Sale',
        value: formatMoney(averageSale, reportingCurrency, 2),
        delta: thisMonthSales.length > 0 ? `${thisMonthSales.length} paid items` : 'No sales yet',
        tone: 'accent',
      },
    ],
    items: mappedItems,
  };
}

export async function fetchItemDetail(itemId: string): Promise<ItemDetail | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('items')
    .select(
      'id,supplier_id,title,description,condition_summary,floor_price_cents,suggested_list_price_cents,ingestion_ai_confidence,ingestion_ai_attributes,ingestion_ai_market_snapshot,photo_paths,digital_status,currency_code,updated_at',
    )
    .eq('id', itemId)
    .maybeSingle<ItemDetailRecord>();

  if (error) {
    captureException(error, { flow: 'repo.fetchItemDetail' });
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const economics = resolveEstimatedClaimEconomics({
    floorPriceCents: data.floor_price_cents,
    suggestedListPriceCents: data.suggested_list_price_cents,
    supplierUpsideBps: DEFAULT_SUPPLIER_UPSIDE_BPS,
    brokerUpsideBps: DEFAULT_BROKER_UPSIDE_BPS,
    platformUpsideBps: DEFAULT_PLATFORM_UPSIDE_BPS,
  });
  const floor = economics.floorPriceCents;
  const suggested = economics.estimatedSalePriceCents;
  const currencyCode = resolveCurrencyCode(data.currency_code);
  const attributes = normalizeJsonObject(data.ingestion_ai_attributes);
  const marketSnapshot = normalizeJsonObject(data.ingestion_ai_market_snapshot);
  const conditionSignals = normalizeJsonStringArray(attributes.condition_signals);
  const missingViews = normalizeJsonStringArray(marketSnapshot.missing_views ?? attributes.missing_views);
  const observedDetails = buildObservedDetails(attributes);
  const candidateItems = buildCandidateItems(attributes);
  const photoUrls = await Promise.all(
    (data.photo_paths ?? []).map((path) => resolveImage(path, data.title ?? 'Item Detail')),
  );
  const nextBestAction =
    typeof marketSnapshot.next_best_action === 'string' && marketSnapshot.next_best_action.trim().length > 0
      ? marketSnapshot.next_best_action.trim()
      : typeof attributes.next_best_action === 'string' && attributes.next_best_action.trim().length > 0
        ? attributes.next_best_action.trim()
        : null;
  const velocity =
    typeof marketSnapshot.velocity === 'string' && marketSnapshot.velocity.trim().length > 0
      ? humanizeLabel(marketSnapshot.velocity)
      : suggested - floor > 5000
        ? 'High'
        : 'Medium';

  return {
    id: data.id,
    supplierId: data.supplier_id,
    sku: `TATO-${data.id.slice(0, 8).toUpperCase()}`,
    title: data.title ?? 'Untitled Item',
    editableTitle: data.title ?? '',
    description:
      data.description ??
      'Supplier ingestion available. Broker listing copy can be generated from verified physical photos.',
    editableDescription: data.description ?? '',
    gradeLabel: data.condition_summary ?? 'Verified',
    editableConditionSummary: data.condition_summary ?? '',
    imageUrl: photoUrls[0] ?? placeholderImage(data.title ?? 'Item Detail'),
    photoUrls,
    lifecycleStage: lifecycleFromItemStatus(data.digital_status),
    estimatedBrokerPayoutCents: economics.estimatedBrokerPayoutCents,
    marketVelocityLabel: velocity,
    claimDepositCents: economics.claimDepositCents,
    floorPriceCents: floor,
    suggestedListPriceCents: suggested,
    supplierPayoutAtSuggestedCents: economics.supplierPayoutCents,
    digitalStatus: data.digital_status,
    ingestionConfidence: Math.max(0, Math.min(1, data.ingestion_ai_confidence ?? 0.65)),
    nextBestAction,
    conditionSignals,
    missingViews,
    observedDetails,
    candidateItems,
    currencyCode,
    updatedAt: data.updated_at,
  };
}

export async function updateSupplierItemDraft(args: {
  itemId: string;
  payload: SupplierItemUpdatePayload;
}): Promise<
  | { ok: true; detail: ItemDetail }
  | { ok: false; message: string }
> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('items')
    .update({
      title: args.payload.title,
      description: args.payload.description,
      condition_summary: args.payload.conditionSummary,
      floor_price_cents: args.payload.floorPriceCents,
      suggested_list_price_cents: args.payload.suggestedListPriceCents,
    })
    .eq('id', args.itemId)
    .in('digital_status', ['supplier_draft', 'ready_for_claim'])
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    captureException(error, { flow: 'repo.updateSupplierItemDraft' });
    return {
      ok: false,
      message: 'Unable to save supplier updates right now.',
    };
  }

  if (!data) {
    return {
      ok: false,
      message: 'This item is no longer editable from supplier inventory.',
    };
  }

  const detail = await fetchItemDetail(args.itemId);
  if (!detail) {
    return {
      ok: false,
      message: 'Saved the supplier updates, but could not reload the item detail.',
    };
  }

  return {
    ok: true,
    detail,
  };
}

async function loadSupplierItemPhotoRecord(itemId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('items')
    .select('id,supplier_id,digital_status,primary_photo_path,photo_paths')
    .eq('id', itemId)
    .maybeSingle<SupplierItemPhotoRecord>();

  if (error) {
    captureException(error, { flow: 'repo.loadSupplierItemPhotoRecord' });
    return {
      ok: false as const,
      message: 'Unable to load the latest item details right now.',
    };
  }

  if (!data) {
    return {
      ok: false as const,
      message: 'Item not found.',
    };
  }

  return {
    ok: true as const,
    item: data,
  };
}

async function mutateSupplierItemPhotos(args: {
  itemId: string;
  supplierId: string;
  mode: 'append' | 'replace' | 'remove';
  photoIndex?: number;
  imageUri?: string;
  mimeType?: string;
}): Promise<
  | { ok: true; detail: ItemDetail }
  | { ok: false; message: string }
> {
  const client = requireSupabase();
  const loadedItem = await loadSupplierItemPhotoRecord(args.itemId);

  if (!loadedItem.ok) {
    return loadedItem;
  }

  const item = loadedItem.item;
  if (item.supplier_id !== args.supplierId) {
    return {
      ok: false,
      message: 'You can only manage photos for your own items.',
    };
  }

  if (!canSupplierEditItem(item.digital_status)) {
    return {
      ok: false,
      message: 'Item photos are locked once broker work has started.',
    };
  }

  const currentPaths = item.photo_paths ?? [];
  const index = args.photoIndex ?? -1;
  let nextPaths = [...currentPaths];
  let uploadedStoragePath: string | null = null;
  let stalePaths: string[] = [];

  if (args.mode === 'append' || args.mode === 'replace') {
    if (!args.imageUri) {
      return {
        ok: false,
        message: 'Choose an image before saving photo updates.',
      };
    }

    try {
      uploadedStoragePath = await uploadSupplierItemPhoto({
        supplierId: args.supplierId,
        itemId: args.itemId,
        imageUri: args.imageUri,
        mimeType: args.mimeType,
      });
    } catch (error) {
      captureException(error, { flow: 'repo.mutateSupplierItemPhotos.upload' });
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to upload the selected photo.',
      };
    }
  }

  if (args.mode === 'append' && uploadedStoragePath) {
    nextPaths = [...currentPaths, uploadedStoragePath];
  }

  if (args.mode === 'replace') {
    if (!currentPaths.length) {
      if (uploadedStoragePath) {
        await removeStoragePaths([uploadedStoragePath]);
      }

      return {
        ok: false,
        message: 'There is no saved photo to replace yet.',
      };
    }

    if (index < 0 || index >= currentPaths.length || !uploadedStoragePath) {
      if (uploadedStoragePath) {
        await removeStoragePaths([uploadedStoragePath]);
      }

      return {
        ok: false,
        message: 'Choose a valid item photo to replace.',
      };
    }

    stalePaths = currentPaths[index] ? [currentPaths[index]] : [];
    nextPaths = currentPaths.map((path, pathIndex) => (pathIndex === index ? uploadedStoragePath! : path));
  }

  if (args.mode === 'remove') {
    if (!currentPaths.length) {
      return {
        ok: false,
        message: 'There are no saved photos to remove.',
      };
    }

    if (currentPaths.length === 1) {
      return {
        ok: false,
        message: 'Keep at least one image on the item. Replace the current photo instead of removing the last one.',
      };
    }

    if (index < 0 || index >= currentPaths.length) {
      return {
        ok: false,
        message: 'Choose a valid item photo to remove.',
      };
    }

    stalePaths = currentPaths[index] ? [currentPaths[index]] : [];
    nextPaths = currentPaths.filter((_, pathIndex) => pathIndex !== index);
  }

  const { data, error } = await client
    .from('items')
    .update({
      primary_photo_path: nextPaths[0] ?? null,
      photo_paths: nextPaths,
    })
    .eq('id', args.itemId)
    .in('digital_status', [...supplierEditableItemStatuses])
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    if (uploadedStoragePath) {
      await removeStoragePaths([uploadedStoragePath]);
    }

    captureException(error, { flow: 'repo.mutateSupplierItemPhotos.update' });
    return {
      ok: false,
      message: 'Unable to save the updated item photos right now.',
    };
  }

  if (!data) {
    if (uploadedStoragePath) {
      await removeStoragePaths([uploadedStoragePath]);
    }

    return {
      ok: false,
      message: 'This item is no longer editable from supplier inventory.',
    };
  }

  if (stalePaths.length) {
    await removeStoragePaths(stalePaths);
  }

  const detail = await fetchItemDetail(args.itemId);
  if (!detail) {
    return {
      ok: false,
      message: 'Saved the photo update, but could not reload the item detail.',
    };
  }

  return {
    ok: true,
    detail,
  };
}

export async function appendSupplierItemPhoto(args: {
  itemId: string;
  supplierId: string;
  imageUri: string;
  mimeType?: string;
}) {
  return mutateSupplierItemPhotos({
    ...args,
    mode: 'append',
  });
}

export async function replaceSupplierItemPhoto(args: {
  itemId: string;
  supplierId: string;
  photoIndex: number;
  imageUri: string;
  mimeType?: string;
}) {
  return mutateSupplierItemPhotos({
    ...args,
    mode: 'replace',
  });
}

export async function removeSupplierItemPhoto(args: {
  itemId: string;
  supplierId: string;
  photoIndex: number;
}) {
  return mutateSupplierItemPhotos({
    ...args,
    mode: 'remove',
  });
}

export async function deleteSupplierItem(args: {
  itemId: string;
  supplierId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = requireSupabase();
  const loadedItem = await loadSupplierItemPhotoRecord(args.itemId);

  if (!loadedItem.ok) {
    return loadedItem;
  }

  const item = loadedItem.item;
  if (item.supplier_id !== args.supplierId) {
    return {
      ok: false,
      message: 'You can only delete items you posted.',
    };
  }

  if (!canSupplierDeleteItem(item.digital_status)) {
    return {
      ok: false,
      message: 'Only items that are still in your supplier queue can be deleted.',
    };
  }

  const { count, error: transactionError } = await client
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', args.itemId);

  if (transactionError) {
    captureException(transactionError, { flow: 'repo.deleteSupplierItem.transactions' });
    return {
      ok: false,
      message: 'Unable to verify the current item activity right now.',
    };
  }

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: 'This item already has payment activity and can no longer be deleted.',
    };
  }

  const { data, error } = await client
    .from('items')
    .delete()
    .eq('id', args.itemId)
    .in('digital_status', [...supplierDeletableItemStatuses])
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    captureException(error, { flow: 'repo.deleteSupplierItem' });
    return {
      ok: false,
      message: 'Unable to delete this supplier item right now.',
    };
  }

  if (!data) {
    return {
      ok: false,
      message: 'This item is no longer deletable from the supplier dashboard.',
    };
  }

  await removeStoragePaths(item.photo_paths ?? []);

  return { ok: true };
}

export async function fetchLedger(userId: string | null): Promise<LedgerEntry[]> {
  if (!userId) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('transactions')
    .select('id,transaction_type,status,gross_amount_cents,currency_code,occurred_at,item_id,supplier_id,broker_id')
    .or(`broker_id.eq.${userId},supplier_id.eq.${userId}`)
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (error) {
    captureException(error, { flow: 'repo.fetchLedger' });
    throw new Error(error.message);
  }

  return ((data as TransactionRecord[] | null | undefined) ?? []).flatMap((row) => {
    const currencyCode = resolveCurrencyCode(row.currency_code);
    let direction: LedgerEntry['direction'] | null = null;
    let label = row.transaction_type.replace(/_/g, ' ');

    if (row.transaction_type === 'supplier_payout') {
      if (row.supplier_id !== userId) {
        return [];
      }
      direction = 'in';
    } else if (row.transaction_type === 'broker_payout') {
      if (row.broker_id !== userId) {
        return [];
      }
      direction = 'in';
    } else if (row.transaction_type === 'claim_deposit' || row.transaction_type === 'claim_fee') {
      if (row.broker_id !== userId) {
        return [];
      }
      direction = 'out';
      label = row.transaction_type === 'claim_deposit' ? 'claim deposit' : 'claim fee';
    } else if (row.transaction_type === 'refund') {
      if (row.broker_id !== userId) {
        return [];
      }
      direction = 'in';
      label = 'deposit refund';
    } else {
      return [];
    }

    return [{
      id: row.id,
      label,
      status: row.status,
      amountText: `${direction === 'in' ? '+' : '-'}${formatMoney(row.gross_amount_cents, currencyCode, 2)}`,
      amountCents: row.gross_amount_cents,
      currencyCode,
      occurredAt: row.occurred_at,
      direction,
    }];
  });
}

export async function runIngestionPipeline(args: {
  supplierId: string;
  photos: IngestionPhotoInput[];
  hubId?: string;
  currencyCode?: CurrencyCode;
}): Promise<IngestionPipelineResult> {
  if (!args.supplierId) {
    return { ok: false, message: 'Supplier identity is required.' };
  }

  if (!args.photos.length) {
    return { ok: false, message: 'Add at least one photo before running ingestion.' };
  }

  if (args.photos.length > MAX_STILL_PHOTO_SET_SIZE) {
    return {
      ok: false,
      message: `A maximum of ${MAX_STILL_PHOTO_SET_SIZE} photos is supported per item.`,
    };
  }

  const client = requireSupabase();
  const primaryPhoto = args.photos[0]!;
  const fileExt = inferImageExtension(primaryPhoto.uri, primaryPhoto.mimeType);

  const { data: startData, error: startError } = await client.functions.invoke('start-ingestion', {
    body: {
      hubId: args.hubId,
      mimeType: primaryPhoto.mimeType ?? 'image/jpeg',
      fileExtension: fileExt,
      currencyCode: args.currencyCode ?? 'USD',
      requestKey: createRequestKey('ingestion'),
    },
  });

  if (startError) {
    captureException(startError, { flow: 'repo.startIngestion' });
    return { ok: false, message: startError.message };
  }

  if (!startData?.ok || !startData?.itemId || !startData?.storageKey || !startData?.storageBucket) {
    return {
      ok: false,
      message: toMutationMessage(startData as MutationErrorResponse, 'Unable to start ingestion.'),
    };
  }

  const itemId = startData.itemId as string;
  const hubId = startData.hubId as string;
  const storageKey = startData.storageKey as string;
  const storageBucket = startData.storageBucket as string;
  const storagePath = startData.storagePath as string;
  const uploadedStoragePaths: string[] = [];

  try {
    for (const [index, photo] of args.photos.entries()) {
      const isPrimaryPhoto = index === 0;
      const supplementalSuffix = `${Date.now()}-${index + 1}`;
      const supplementalStorageKey = `${args.supplierId}/${itemId}/detail-${supplementalSuffix}.${inferImageExtension(photo.uri, photo.mimeType)}`;
      const nextStorageKey = isPrimaryPhoto ? storageKey : supplementalStorageKey;
      const nextStoragePath = isPrimaryPhoto ? storagePath : `items/${supplementalStorageKey}`;

      await uploadImageToStorage({
        bucket: storageBucket,
        storageKey: nextStorageKey,
        imageUri: photo.uri,
        mimeType: photo.mimeType,
        upsert: isPrimaryPhoto,
      });
      uploadedStoragePaths.push(nextStoragePath);
    }

    const { error: updateError } = await client
      .from('items')
      .update({
        primary_photo_path: uploadedStoragePaths[0] ?? null,
        photo_paths: uploadedStoragePaths,
      })
      .eq('id', itemId);

    if (updateError) {
      throw updateError;
    }
  } catch (uploadFailure) {
    await client.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', itemId);
    if (uploadedStoragePaths.length) {
      await removeStoragePaths(uploadedStoragePaths);
    }
    return {
      ok: false,
      message: toRepositoryErrorMessage(uploadFailure, 'Unable to upload the selected photos.'),
    };
  }

  const { data: ingestionData, error: ingestionError } = await client.functions.invoke('gemini-ingest-item', {
    body: { itemId },
  });

  if (ingestionError) {
    await client.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', itemId);
    return { ok: false, message: ingestionError.message };
  }

  if (!ingestionData?.ok || !ingestionData?.analysis) {
    await client.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', itemId);
    return {
      ok: false,
      message: toMutationMessage(ingestionData as MutationErrorResponse, 'Gemini ingestion did not return an analysis payload.'),
    };
  }

  return {
    ok: true,
    itemId,
    hubId,
    storagePath,
    analysis: ingestionData.analysis as IngestionAnalysis,
  };
}

export async function createClaimFeeIntent(_claimId: string): Promise<ClaimFeeIntentResult> {
  return {
    ok: false,
    message: 'Claim deposit intents are created as part of the create-claim mutation.',
  };
}

export async function createSalePaymentIntent(args: {
  claimId: string;
  grossAmountCents: number;
  currencyCode?: CurrencyCode;
}): Promise<SalePaymentIntentResult> {
  const client = requireSupabase();

  const { data, error } = await client.functions.invoke('create-sale-payment', {
    body: {
      claimId: args.claimId,
      grossAmountCents: args.grossAmountCents,
      currencyCode: args.currencyCode ?? 'USD',
      requestKey: createRequestKey('sale_payment'),
    },
  });

  if (error) {
    captureException(error, { flow: 'repo.createSalePaymentIntent' });
    return { ok: false, message: error.message };
  }

  if (!data?.ok || !data?.paymentIntentId) {
    return {
      ok: false,
      message: toMutationMessage(data as MutationErrorResponse, 'Sale payment intent did not return payment details.'),
    };
  }

  return {
    ok: true,
    paymentIntentId: data.paymentIntentId as string,
    clientSecret: (data.clientSecret ?? null) as string | null,
    transactionId: (data.transactionId ?? null) as string | null,
  };
}


export async function createConnectOnboardingLink() {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('create-connect-onboarding-link');

  if (error) {
    captureException(error, { flow: 'repo.createConnectOnboardingLink' });
    return { ok: false as const, message: error.message };
  }

  if (!data?.ok || !data?.url) {
    return {
      ok: false as const,
      message: toMutationMessage(data as MutationErrorResponse, 'Unable to create Stripe Connect onboarding link.'),
    };
  }

  return {
    ok: true as const,
    url: data.url as string,
  };
}

export async function refreshConnectStatus() {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('refresh-connect-status');

  if (error) {
    captureException(error, { flow: 'repo.refreshConnectStatus' });
    return { ok: false as const, message: error.message };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      message: toMutationMessage(data as MutationErrorResponse, 'Unable to refresh Stripe Connect status.'),
    };
  }

  return { ok: true as const };
}

export async function fetchRecentFlips(userId: string | null) {
  const entries = await fetchLedger(userId);
  return buildRecentFlips(entries);
}

export { brokerCategories };
