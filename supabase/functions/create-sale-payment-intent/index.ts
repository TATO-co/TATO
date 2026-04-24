import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders, withCors } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return withCors({
    ok: false,
    error: 'This legacy PaymentIntent endpoint is disabled. Use create-sale-payment or create-buyer-checkout-session so marketplace charges route through Stripe Connect.',
  }, { status: 410 });
});
