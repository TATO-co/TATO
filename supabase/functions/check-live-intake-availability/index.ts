import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

const FALLBACK_ROUTE = '/(app)/ingestion?entry=camera';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clients = createSupabaseClients(req);
  if (!clients.ok) {
    return clients.response;
  }

  const { admin, authed } = clients;
  const correlationId = createCorrelationId('live_intake_availability');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_supply) {
      return success(correlationId, {
        available: false,
        code: 'forbidden',
        message: 'Live posting is unavailable for this account right now. Use photo capture instead.',
        fallbackRoute: FALLBACK_ROUTE,
      });
    }

    const { data: hub } = await admin
      .from('hubs')
      .select('id')
      .eq('supplier_id', authedUser.user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (!hub?.id) {
      return success(correlationId, {
        available: false,
        code: 'missing_hub',
        message: 'Live posting is unavailable until this supplier hub is active. Use photo capture instead.',
        fallbackRoute: FALLBACK_ROUTE,
      });
    }

    return success(correlationId, {
      available: true,
      fallbackRoute: FALLBACK_ROUTE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return success(correlationId, {
      available: false,
      code: 'internal_error',
      message,
      fallbackRoute: FALLBACK_ROUTE,
    });
  }
});
