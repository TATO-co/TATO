import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { writeUserNotification } from '../_shared/notifications.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type Payload = {
  claimId?: string;
  platform?: string | null;
  listingUrl?: string | null;
  externalId?: string | null;
};

type ClaimRecord = {
  id: string;
  item_id: string;
  broker_id: string;
  status: string;
  external_listing_refs: Record<string, unknown> | null;
  items: {
    supplier_id: string;
    title: string | null;
  };
};

type ExternalListing = {
  key: string;
  platform: string;
  url: string | null;
  externalId: string | null;
  source: 'manual' | 'integration';
  updatedAt: string;
};

const EXTERNAL_LISTING_EDITABLE_STATUSES = new Set([
  'active',
  'listing_generated',
  'listed_externally',
  'buyer_committed',
  'awaiting_pickup',
]);

function slugifyClaimPlatform(platform: string) {
  return platform
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'marketplace';
}

function normalizeExternalListings(value: Record<string, unknown> | null | undefined) {
  const refs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return Object.entries(refs)
    .map(([key, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const listing = entry as Record<string, unknown>;
      const platform = typeof listing.platform === 'string' ? listing.platform.trim() : '';
      if (!platform) {
        return null;
      }

      return {
        key,
        platform,
        url: typeof listing.url === 'string' && listing.url.trim() ? listing.url.trim() : null,
        externalId: typeof listing.externalId === 'string' && listing.externalId.trim()
          ? listing.externalId.trim()
          : typeof listing.external_id === 'string' && listing.external_id.trim()
            ? listing.external_id.trim()
            : null,
        source: listing.source === 'integration' ? 'integration' as const : 'manual' as const,
        updatedAt: typeof listing.updatedAt === 'string'
          ? listing.updatedAt
          : typeof listing.updated_at === 'string'
            ? listing.updated_at
            : new Date().toISOString(),
      };
    })
    .filter((entry): entry is ExternalListing => Boolean(entry));
}

function serializeExternalListings(listings: ExternalListing[]) {
  return listings.reduce<Record<string, {
    platform: string;
    url: string | null;
    external_id: string | null;
    source: 'manual' | 'integration';
    updated_at: string;
  }>>((current, listing) => {
    current[listing.key] = {
      platform: listing.platform,
      url: listing.url,
      external_id: listing.externalId,
      source: listing.source,
      updated_at: listing.updatedAt,
    };
    return current;
  }, {});
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('external_listing');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    const claimId = payload.claimId?.trim();
    const platform = payload.platform?.trim() ?? '';
    const listingUrl = payload.listingUrl?.trim() || null;
    const externalId = payload.externalId?.trim() || null;

    if (!claimId) {
      return failure(correlationId, 'invalid_request', 'claimId is required.', 400);
    }

    if (!platform) {
      return failure(correlationId, 'invalid_request', 'Enter a marketplace name before saving the listing.', 400);
    }

    if (!listingUrl && !externalId) {
      return failure(correlationId, 'invalid_request', 'Add a listing URL or marketplace listing ID before saving.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_broker: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const { data: claim, error: claimError } = await admin
      .from('claims')
      .select('id,item_id,broker_id,status,external_listing_refs,items!inner(supplier_id,title)')
      .eq('id', claimId)
      .maybeSingle<ClaimRecord>();

    if (claimError || !claim) {
      return failure(correlationId, 'claim_not_found', claimError?.message ?? 'Claim not found.', 404);
    }

    if (claim.broker_id !== authedUser.user.id) {
      return failure(correlationId, 'forbidden', 'Forbidden: broker mismatch.', 403);
    }

    if (!EXTERNAL_LISTING_EDITABLE_STATUSES.has(claim.status)) {
      return failure(correlationId, 'claim_locked', 'This claim can no longer accept listing updates.', 409);
    }

    const key = slugifyClaimPlatform(platform);
    const nextListings: ExternalListing[] = [
      ...normalizeExternalListings(claim.external_listing_refs).filter((listing) => listing.key !== key),
      {
        key,
        platform,
        url: listingUrl,
        externalId,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      },
    ];
    const nextStatus = claim.status === 'active' || claim.status === 'listing_generated'
      ? 'listed_externally'
      : claim.status;

    const { error: updateError } = await admin
      .from('claims')
      .update({
        external_listing_refs: serializeExternalListings(nextListings),
        status: nextStatus,
      })
      .eq('id', claim.id);

    if (updateError) {
      return failure(correlationId, 'claim_update_failed', updateError.message, 500);
    }

    if (nextStatus === 'listed_externally') {
      await admin
        .from('items')
        .update({
          digital_status: 'broker_listing_live',
        })
        .eq('id', claim.item_id);
    }

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'external_listing.saved',
      actorProfileId: authedUser.user.id,
      targetProfileId: claim.items.supplier_id,
      itemId: claim.item_id,
      claimId: claim.id,
      metadata: {
        platform,
        hasListingUrl: Boolean(listingUrl),
        hasExternalId: Boolean(externalId),
      },
    });
    await writeUserNotification(admin, {
      recipientProfileId: claim.items.supplier_id,
      actorProfileId: authedUser.user.id,
      itemId: claim.item_id,
      claimId: claim.id,
      eventType: 'stock.listed',
      title: `${platform} listing saved.`,
      body: `${claim.items.title ?? 'Your item'} now has broker listing activity. Open the item detail to review the platform status.`,
      actionHref: `/(app)/item/${claim.item_id}`,
      metadata: {
        platform,
        hasListingUrl: Boolean(listingUrl),
        hasExternalId: Boolean(externalId),
      },
    });

    return success(correlationId, {
      claimId: claim.id,
      itemId: claim.item_id,
      status: nextStatus,
      externalListings: serializeExternalListings(nextListings),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
