import { captureException } from '@/lib/analytics';
import { readFunctionErrorPayload } from '@/lib/function-errors';
import type { SupplierHub, SupplierHubDraft, SupplierHubStatus } from '@/lib/hubs';
import { createRequestKey } from '@/lib/models';
import { toStripeActionErrorMessage } from '@/lib/stripe-actions';
import { supabase } from '@/lib/supabase';

type SupplierHubRow = {
  id: string;
  supplier_id: string;
  name: string;
  status: SupplierHubStatus;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  pickup_instructions: string | null;
  created_at: string;
  updated_at: string;
};

type CreateSupplierHubFunctionPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  hub?: SupplierHubRow | null;
};

function mapSupplierHub(row: SupplierHubRow): SupplierHub {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    status: row.status,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    pickupInstructions: row.pickup_instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSupplierHubs(args: {
  supplierId: string | null;
}): Promise<SupplierHub[]> {
  if (!supabase || !args.supplierId) {
    return [];
  }

  const { data, error } = await supabase
    .from('hubs')
    .select('id,supplier_id,name,status,address_line_1,address_line_2,city,state,postal_code,country_code,pickup_instructions,created_at,updated_at')
    .eq('supplier_id', args.supplierId)
    .order('created_at', { ascending: true });

  if (error) {
    captureException(error, { flow: 'hubs.listSupplierHubs', supplierId: args.supplierId });
    return [];
  }

  return ((data as SupplierHubRow[] | null) ?? []).map(mapSupplierHub);
}

export async function createSupplierHub(args: {
  draft: SupplierHubDraft;
  requestKey?: string;
}): Promise<
  | { ok: true; hub: SupplierHub }
  | { ok: false; code?: string; message: string }
> {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured for this build.' };
  }

  const { data, error } = await supabase.functions.invoke('create-supplier-hub', {
    body: {
      name: args.draft.name,
      addressLine1: args.draft.addressLine1,
      addressLine2: args.draft.addressLine2 || null,
      city: args.draft.city,
      state: args.draft.state,
      postalCode: args.draft.postalCode,
      countryCode: args.draft.countryCode,
      pickupInstructions: args.draft.pickupInstructions || null,
      requestKey: args.requestKey ?? createRequestKey('supplier_hub'),
    },
  });

  if (error) {
    const parsed = await readFunctionErrorPayload(error);
    return {
      ok: false,
      code: parsed.code,
      message: toStripeActionErrorMessage({
        code: parsed.code,
        context: 'supplier_hub',
        fallback: 'Unable to create a supplier hub.',
        message: parsed.message ?? error.message,
        status: parsed.status,
      }),
    };
  }

  const payload = (data ?? null) as CreateSupplierHubFunctionPayload | null;
  const hub = payload?.hub ? mapSupplierHub(payload.hub) : null;

  if (!payload?.ok || !hub) {
    return {
      ok: false,
      code: payload?.code,
      message: toStripeActionErrorMessage({
        code: payload?.code,
        context: 'supplier_hub',
        fallback: 'Unable to create a supplier hub.',
        message: payload?.message,
      }),
    };
  }

  return { ok: true, hub };
}

export async function ensureSupplierHub(args: {
  supplierId: string | null;
  draft: SupplierHubDraft;
}): Promise<
  | { ok: true; hub: SupplierHub; created: boolean }
  | { ok: false; code?: string; message: string }
> {
  const hubs = await listSupplierHubs({ supplierId: args.supplierId });
  const activeHub = hubs.find((hub) => hub.status === 'active');

  if (activeHub) {
    return { ok: true, hub: activeHub, created: false };
  }

  return createSupplierHub({ draft: args.draft }).then((result) =>
    result.ok
      ? { ok: true as const, hub: result.hub, created: true }
      : result,
  );
}
