import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { PlannedClaimContext } from './payment-metadata.ts';

type ClaimInsertRecord = {
  id: string;
  status: string;
};

export async function createClaimFromPlannedContext(
  admin: SupabaseClient,
  context: PlannedClaimContext,
) {
  const { data: existing } = await admin
    .from('claims')
    .select('id,status')
    .eq('id', context.plannedClaimId)
    .maybeSingle<ClaimInsertRecord>();

  if (existing) {
    return existing;
  }

  const { data, error } = await admin
    .from('claims')
    .insert({
      id: context.plannedClaimId,
      broker_id: context.brokerId,
      item_id: context.itemId,
      hub_id: context.hubId,
      claim_fee_cents: context.claimDepositCents,
      claim_deposit_cents: context.claimDepositCents,
      locked_floor_price_cents: context.lockedFloorPriceCents,
      locked_suggested_list_price_cents: context.lockedSuggestedListPriceCents,
      supplier_upside_bps: context.supplierUpsideBps,
      broker_upside_bps: context.brokerUpsideBps,
      platform_upside_bps: context.platformUpsideBps,
      economics_version: 'floor_v1',
      expires_at: context.expiresAt,
      status: 'active',
      currency_code: context.currencyCode,
    })
    .select('id,status')
    .single<ClaimInsertRecord>();

  if (error) {
    throw error;
  }

  await admin
    .from('items')
    .update({
      digital_status: 'claimed',
    })
    .eq('id', context.itemId);

  return data;
}

export async function releaseReservedItemIfClaimMissing(
  admin: SupabaseClient,
  itemId: string,
  claimId: string,
) {
  const { data: existingClaim } = await admin
    .from('claims')
    .select('id')
    .eq('id', claimId)
    .maybeSingle<{ id: string }>();

  if (existingClaim) {
    return;
  }

  const { data: activeClaims } = await admin
    .from('claims')
    .select('id')
    .eq('item_id', itemId)
    .in('status', ['active', 'listing_generated', 'listed_externally', 'buyer_committed', 'awaiting_pickup'])
    .limit(1);

  if (activeClaims?.length) {
    return;
  }

  await admin
    .from('items')
    .update({
      digital_status: 'ready_for_claim',
    })
    .eq('id', itemId);
}

export async function updateItemStatusForClaim(
  admin: SupabaseClient,
  itemId: string,
  digitalStatus: 'claimed' | 'broker_listing_live' | 'buyer_committed' | 'awaiting_hub_payment' | 'completed' | 'ready_for_claim',
) {
  await admin
    .from('items')
    .update({
      digital_status: digitalStatus,
    })
    .eq('id', itemId);
}
