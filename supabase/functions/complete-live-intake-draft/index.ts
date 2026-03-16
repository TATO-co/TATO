import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import {
  claimMutationRequest,
  completeMutationRequest,
  failMutationRequest,
  writeAuditEvent,
} from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

const LIVE_MODEL = Deno.env.get('GEMINI_LIVE_MODEL') ?? 'gemini-2.5-flash-native-audio-preview-12-2025';

type Payload = {
  itemId?: string;
  storagePath?: string;
  title?: string;
  description?: string;
  category?: string | null;
  conditionSummary?: string;
  confirmedConditionGrade?: string | null;
  floorPriceCents?: number | null;
  suggestedListPriceCents?: number | null;
  confidence?: number | null;
  attributes?: Record<string, unknown> | null;
  candidateItems?: unknown[];
  conditionSignals?: unknown[];
  marketSnapshot?: Record<string, unknown> | null;
  requestKey?: string;
};

type ExistingMutationPayload = {
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  ok?: boolean;
} & Record<string, unknown>;

function replayMutationResponse(correlationId: string, payload: ExistingMutationPayload) {
  if (payload.ok === false || (payload.code && payload.message)) {
    return failure(
      correlationId,
      payload.code ?? 'request_failed',
      payload.message ?? 'Request failed.',
      409,
      payload.details ?? {},
    );
  }

  return success(correlationId, payload);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeInteger(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.65;
  }

  return Math.max(0, Math.min(0.9999, value));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeJsonObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseStoragePath(path: string) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return {
    bucket: parts[0],
    objectPath: parts.slice(1).join('/'),
  };
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
  const correlationId = createCorrelationId('live_draft_complete');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'requestKey is required.', 400);
    }

    if (!payload.itemId || !payload.storagePath) {
      return failure(correlationId, 'invalid_request', 'itemId and storagePath are required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_supply) {
      return failure(correlationId, 'forbidden', 'Supplier access is not enabled for this account.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'complete-live-intake-draft',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return replayMutationResponse(requestRecord.correlationId, requestRecord.payload as ExistingMutationPayload);
    }

    const { data: item, error: itemError } = await admin
      .from('items')
      .select('id,supplier_id,photo_paths')
      .eq('id', payload.itemId)
      .maybeSingle<{
        id: string;
        supplier_id: string;
        photo_paths: string[] | null;
      }>();

    if (itemError || !item) {
      const responsePayload = {
        ok: false,
        code: 'item_not_found',
        message: itemError?.message ?? 'Live intake draft item was not found.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 404);
    }

    if (item.supplier_id !== authedUser.user.id) {
      const responsePayload = {
        ok: false,
        code: 'forbidden',
        message: 'Forbidden: supplier mismatch.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 403);
    }

    const parsedStoragePath = parseStoragePath(payload.storagePath);
    if (!parsedStoragePath) {
      const responsePayload = {
        ok: false,
        code: 'invalid_storage_path',
        message: 'storagePath must include a bucket and object path.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 400);
    }

    const { error: storageError } = await admin.storage
      .from(parsedStoragePath.bucket)
      .download(parsedStoragePath.objectPath);

    if (storageError) {
      const responsePayload = {
        ok: false,
        code: 'storage_upload_failed',
        message: storageError.message,
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 409);
    }

    const existingPaths = item.photo_paths ?? [];
    const photoPaths = [...new Set([payload.storagePath, ...existingPaths])];

    const title = normalizeString(payload.title) ?? 'Untitled Item';
    const description =
      normalizeString(payload.description)
      ?? 'Supplier live intake completed from Gemini Live session.';
    const category = normalizeString(payload.category);
    const conditionSummary = normalizeString(payload.conditionSummary) ?? 'Pending';
    const confirmedConditionGrade = normalizeString(payload.confirmedConditionGrade);
    const floorPriceCents = normalizeInteger(payload.floorPriceCents);
    const suggestedListPriceCents = normalizeInteger(payload.suggestedListPriceCents);
    const confidence = normalizeConfidence(payload.confidence);
    const conditionSignals = normalizeStringArray(payload.conditionSignals);
    const candidateItems = Array.isArray(payload.candidateItems) ? payload.candidateItems : [];
    const attributes = normalizeJsonObject(payload.attributes);
    const marketSnapshot = normalizeJsonObject(payload.marketSnapshot);

    const ingestionAiAttributes = {
      source: 'gemini_live',
      ...attributes,
      category,
      candidate_items: candidateItems,
      condition_signals: conditionSignals,
      confirmed_condition_grade: confirmedConditionGrade,
    };

    const ingestionAiMarketSnapshot = {
      source: 'gemini_live',
      ...marketSnapshot,
      confidence,
      floor_price_cents: floorPriceCents,
      suggested_list_price_cents: suggestedListPriceCents,
    };

    const { error: updateError } = await admin
      .from('items')
      .update({
        title,
        description,
        category,
        condition_summary: conditionSummary,
        floor_price_cents: floorPriceCents,
        suggested_list_price_cents: suggestedListPriceCents,
        primary_photo_path: payload.storagePath,
        photo_paths: photoPaths,
        ingestion_ai_status: 'completed',
        ingestion_ai_model: LIVE_MODEL,
        ingestion_ai_summary: `Live intake completed at ${new Date().toISOString()}`,
        ingestion_ai_confidence: confidence,
        ingestion_ai_attributes: ingestionAiAttributes,
        ingestion_ai_market_snapshot: ingestionAiMarketSnapshot,
        ingestion_ai_ran_at: new Date().toISOString(),
        digital_status: 'ready_for_claim',
      })
      .eq('id', item.id);

    if (updateError) {
      const responsePayload = {
        ok: false,
        code: 'item_update_failed',
        message: updateError.message,
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 500);
    }

    const responsePayload = {
      itemId: item.id,
      storagePath: payload.storagePath,
      digitalStatus: 'ready_for_claim',
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'live_intake_draft.completed',
      actorProfileId: authedUser.user.id,
      itemId: item.id,
      metadata: {
        category,
        confirmedConditionGrade,
        floorPriceCents,
        suggestedListPriceCents,
      },
    });

    return success(correlationId, responsePayload, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
