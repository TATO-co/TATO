import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { buildAppUrl } from '../_shared/stripe.ts';
import { createSignedStorageUrl } from '../_shared/storage.ts';
import { createSupabaseClients } from '../_shared/supabase.ts';

type Payload = {
  token?: string;
};

type BuyerPaymentLookup = {
  id: string;
  status: string;
  currency_code: string;
  buyer_payment_amount_cents: number | null;
  buyer_payment_status: string;
  buyer_payment_paid_at: string | null;
  buyer_payment_checkout_session_id: string | null;
  buyer_payment_link_created_at: string | null;
  items: {
    title: string | null;
    description: string | null;
    primary_photo_path: string | null;
    photo_paths: string[] | null;
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin } = clients;
  const correlationId = createCorrelationId('buyer_payment');

  try {
    const payload = req.method === 'GET'
      ? {
        token: new URL(req.url).searchParams.get('token') ?? undefined,
      }
      : (await req.json()) as Payload;

    if (!payload.token) {
      return failure(correlationId, 'invalid_request', 'token is required.', 400);
    }

    const { data: claim } = await admin
      .from('claims')
      .select(
        'id,status,currency_code,buyer_payment_amount_cents,buyer_payment_status,buyer_payment_paid_at,buyer_payment_checkout_session_id,buyer_payment_link_created_at,items!inner(title,description,primary_photo_path,photo_paths)',
      )
      .eq('buyer_payment_token', payload.token)
      .maybeSingle<BuyerPaymentLookup>();

    if (!claim) {
      return failure(correlationId, 'not_found', 'This buyer payment link is no longer available.', 404);
    }

    const photoPath = claim.items.photo_paths?.[0] ?? claim.items.primary_photo_path;
    const imageUrl = await createSignedStorageUrl(admin, photoPath);
    const isPaid = claim.buyer_payment_status === 'paid' || claim.status === 'completed';
    const isInactive = ['cancelled', 'expired'].includes(claim.status) || claim.buyer_payment_status === 'expired';

    return success(correlationId, {
      claimId: claim.id,
      itemTitle: claim.items.title ?? 'TATO item',
      itemDescription: claim.items.description ?? 'Secure the item with TATO Checkout and pick it up from the broker once payment is confirmed.',
      imageUrl,
      amountCents: claim.buyer_payment_amount_cents ?? 0,
      currencyCode: claim.currency_code,
      paymentStatus: isPaid ? 'paid' : isInactive ? 'inactive' : 'ready',
      claimStatus: claim.status,
      buyerPaymentStatus: claim.buyer_payment_status,
      paidAt: claim.buyer_payment_paid_at,
      checkoutSessionId: claim.buyer_payment_checkout_session_id,
      paymentLinkCreatedAt: claim.buyer_payment_link_created_at,
      supportUrl: buildAppUrl('/support'),
      termsUrl: buildAppUrl('/terms'),
      privacyUrl: buildAppUrl('/privacy'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
