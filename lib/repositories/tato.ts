import {
  brokerCategories,
  createRequestKey,
  formatMoney,
  resolveCurrencyCode,
  type BrokerFeedItem,
  type ClaimSnapshot,
  type CurrencyCode,
  type ItemDetail,
  type SupplierItem,
  type SupplierMetric,
} from '@/lib/models';
import { captureException } from '@/lib/analytics';
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
  hub_id: string;
  currency_code: string | null;
};

type ItemDetailRecord = {
  id: string;
  title: string | null;
  description: string | null;
  condition_summary: string | null;
  floor_price_cents: number | null;
  suggested_list_price_cents: number | null;
  photo_paths: string[] | null;
  digital_status: string;
  currency_code: string | null;
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

export type ReviewProfile = {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  canBroker: boolean;
  canSupply: boolean;
  isAdmin: boolean;
  countryCode: string | null;
  payoutCurrencyCode: CurrencyCode;
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

function initials(name: string | null | undefined) {
  if (!name) {
    return 'TA';
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return chars.join('') || 'TA';
}

function normalizeClaimStatus(raw: string): ClaimSnapshot['status'] {
  if (raw === 'listed_externally' || raw === 'buyer_committed' || raw === 'awaiting_pickup' || raw === 'completed') {
    return raw;
  }

  return 'active';
}

function lifecycleFromClaim(status: ClaimSnapshot['status']): ClaimSnapshot['lifecycleStage'] {
  if (status === 'completed') {
    return 'sold';
  }
  if (status === 'listed_externally') {
    return 'listed';
  }
  if (status === 'buyer_committed' || status === 'awaiting_pickup') {
    return 'claimed';
  }

  return 'inventoried';
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

function toMutationMessage(data: MutationErrorResponse | null | undefined, fallback: string) {
  return data?.message ?? fallback;
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
        profitCents: entry.amountCents,
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
      const floor = item.floor_price_cents ?? 0;
      const suggested = item.suggested_list_price_cents ?? Math.round(floor * 1.18);
      const potential = Math.max(1200, suggested - floor);
      const currencyCode = resolveCurrencyCode(item.currency_code);
      const label = item.title ?? 'TATO Item';

      return {
        id: item.id,
        title: item.title ?? 'Untitled Item',
        subtitle: item.condition_summary ?? item.description ?? 'Supplier catalog item',
        hubName: `Hub: ${hub?.name ?? 'Supplier Hub'}`,
        city: hub?.city ?? 'Local',
        floorPriceCents: floor,
        claimFeeCents: Math.max(200, Math.round(Math.max(floor, 5000) * 0.03)),
        potentialProfitCents: potential,
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
  claimFeeCents: number;
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
    return { ok: false as const, message: error.message };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      message: toMutationMessage(data as MutationErrorResponse, 'Unable to create claim.'),
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
    .select('id,item_id,status,expires_at,claim_fee_cents,hub_id,currency_code')
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
    const floor = item?.floor_price_cents ?? 0;
    const suggested = item?.suggested_list_price_cents ?? Math.round(floor * 1.2);

    return {
      id: claim.id,
      itemId: claim.item_id,
      itemTitle: item?.title ?? 'Untitled Item',
      brokerName: 'You',
      supplierName: hubMap.get(claim.hub_id)?.name ?? 'Supplier Hub',
      status,
      expiresAt: claim.expires_at,
      lifecycleStage: lifecycleFromClaim(status),
      claimFeeCents: claim.claim_fee_cents,
      estimatedProfitCents: Math.max(1000, suggested - floor),
      currencyCode: resolveCurrencyCode(claim.currency_code),
    } satisfies ClaimSnapshot;
  });
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
      'id,title,description,condition_summary,floor_price_cents,suggested_list_price_cents,photo_paths,digital_status,currency_code',
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

  const floor = data.floor_price_cents ?? 0;
  const suggested = data.suggested_list_price_cents ?? Math.round(floor * 1.2);
  const currencyCode = resolveCurrencyCode(data.currency_code);

  return {
    id: data.id,
    sku: `TATO-${data.id.slice(0, 8).toUpperCase()}`,
    title: data.title ?? 'Untitled Item',
    description:
      data.description ??
      'Supplier ingestion available. Broker listing copy can be generated from verified physical photos.',
    gradeLabel: data.condition_summary ?? 'Verified',
    imageUrl: await resolveImage(data.photo_paths?.[0], data.title ?? 'Item Detail'),
    lifecycleStage: lifecycleFromItemStatus(data.digital_status),
    estimatedProfitCents: Math.max(1000, suggested - floor),
    marketVelocityLabel: suggested - floor > 5000 ? 'High' : 'Medium',
    claimFeeCents: Math.max(200, Math.round(Math.max(floor, 5000) * 0.03)),
    currencyCode,
  };
}

export async function fetchLedger(userId: string | null): Promise<LedgerEntry[]> {
  if (!userId) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('transactions')
    .select('id,transaction_type,status,gross_amount_cents,currency_code,occurred_at,item_id')
    .or(`broker_id.eq.${userId},supplier_id.eq.${userId}`)
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (error) {
    captureException(error, { flow: 'repo.fetchLedger' });
    throw new Error(error.message);
  }

  return ((data as TransactionRecord[] | null | undefined) ?? []).map((row) => {
    const isInflow = row.transaction_type.includes('payout');
    const currencyCode = resolveCurrencyCode(row.currency_code);

    return {
      id: row.id,
      label: row.transaction_type.replace(/_/g, ' '),
      status: row.status,
      amountText: `${isInflow ? '+' : '-'}${formatMoney(row.gross_amount_cents, currencyCode, 2)}`,
      amountCents: row.gross_amount_cents,
      currencyCode,
      occurredAt: row.occurred_at,
      direction: isInflow ? 'in' : 'out',
    };
  });
}

export async function runIngestionPipeline(args: {
  supplierId: string;
  imageUri: string;
  mimeType?: string;
  hubId?: string;
  currencyCode?: CurrencyCode;
}): Promise<IngestionPipelineResult> {
  if (!args.supplierId) {
    return { ok: false, message: 'Supplier identity is required.' };
  }

  if (!args.imageUri) {
    return { ok: false, message: 'Image capture is required.' };
  }

  const client = requireSupabase();
  const fileExt = inferImageExtension(args.imageUri, args.mimeType);

  const { data: startData, error: startError } = await client.functions.invoke('start-ingestion', {
    body: {
      hubId: args.hubId,
      mimeType: args.mimeType ?? 'image/jpeg',
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

  try {
    const response = await fetch(args.imageUri);
    const blob = await response.blob();

    const { error: uploadError } = await client.storage.from(storageBucket).upload(storageKey, blob, {
      upsert: true,
      contentType: args.mimeType ?? blob.type ?? 'image/jpeg',
    });

    if (uploadError) {
      await client.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', itemId);
      return { ok: false, message: uploadError.message };
    }

    await client
      .from('items')
      .update({
        primary_photo_path: storagePath,
        photo_paths: [storagePath],
      })
      .eq('id', itemId);
  } catch (uploadFailure) {
    await client.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', itemId);
    return {
      ok: false,
      message: uploadFailure instanceof Error ? uploadFailure.message : 'Unable to upload the captured image.',
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
    message: 'Claim fee intents are created as part of the create-claim mutation.',
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

export async function fetchReviewProfiles(): Promise<ReviewProfile[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('profiles')
    .select('id,display_name,email,status,can_broker,can_supply,is_admin,country_code,payout_currency_code')
    .in('status', ['pending_review', 'suspended'])
    .order('created_at', { ascending: true });

  if (error) {
    captureException(error, { flow: 'repo.fetchReviewProfiles' });
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    display_name: string | null;
    email: string | null;
    status: string;
    can_broker: boolean;
    can_supply: boolean;
    is_admin: boolean;
    country_code: string | null;
    payout_currency_code: string | null;
  }> | null | undefined) ?? []).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name ?? 'Unknown user',
    email: profile.email ?? null,
    status: profile.status,
    canBroker: profile.can_broker,
    canSupply: profile.can_supply,
    isAdmin: profile.is_admin,
    countryCode: profile.country_code ?? null,
    payoutCurrencyCode: resolveCurrencyCode(profile.payout_currency_code),
  }));
}

export async function approveUserAccess(args: {
  profileId: string;
  canBroker?: boolean;
  canSupply?: boolean;
  defaultMode?: 'broker' | 'supplier';
  payoutCurrencyCode?: CurrencyCode;
}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('approve-user', {
    body: {
      ...args,
      requestKey: createRequestKey('approve'),
    },
  });

  if (error) {
    captureException(error, { flow: 'repo.approveUserAccess' });
    return { ok: false as const, message: error.message };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      message: toMutationMessage(data as MutationErrorResponse, 'Unable to approve user.'),
    };
  }

  return { ok: true as const };
}

export async function suspendUserAccess(args: { profileId: string; reason?: string }) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('suspend-user', {
    body: {
      ...args,
      requestKey: createRequestKey('suspend'),
    },
  });

  if (error) {
    captureException(error, { flow: 'repo.suspendUserAccess' });
    return { ok: false as const, message: error.message };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      message: toMutationMessage(data as MutationErrorResponse, 'Unable to suspend user.'),
    };
  }

  return { ok: true as const };
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
