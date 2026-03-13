import { createClient } from 'npm:@supabase/supabase-js@2';

import { createCorrelationId, failure } from './responses.ts';

type AuthedSupabaseClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
  };
};

export function createSupabaseClients(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const correlationId = createCorrelationId();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return {
      ok: false as const,
      correlationId,
      response: failure(
        correlationId,
        'server_misconfigured',
        'Missing Supabase function configuration.',
        500,
      ),
    };
  }

  const authHeader = req.headers.get('Authorization') ?? '';

  return {
    ok: true as const,
    correlationId,
    admin: createClient(supabaseUrl, serviceRoleKey),
    authed: createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }),
  };
}

export async function requireAuthedUser(
  authed: AuthedSupabaseClient,
  correlationId: string,
) {
  const { data, error } = await authed.auth.getUser();
  if (error) {
    return {
      ok: false as const,
      response: failure(correlationId, 'unauthorized', error.message, 401),
    };
  }

  if (!data.user) {
    return {
      ok: false as const,
      response: failure(correlationId, 'unauthorized', 'Unauthorized', 401),
    };
  }

  return {
    ok: true as const,
    user: data.user,
  };
}
