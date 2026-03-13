import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

import { writeAuditEvent } from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

type IngestionPayload = {
  itemId?: string;
};

type GeminiStructuredResult = {
  item_title?: string;
  description?: string;
  condition_summary?: string;
  floor_price_cents?: number;
  suggested_list_price_cents?: number;
  confidence?: number;
  attributes?: Record<string, unknown>;
  market_snapshot?: Record<string, unknown>;
};

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

function extractJsonObject(input: string) {
  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  const candidate = input.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as GeminiStructuredResult;
  } catch {
    return null;
  }
}

function coerceAnalysis(raw: GeminiStructuredResult): {
  itemTitle: string;
  description: string;
  conditionSummary: string;
  floorPriceCents: number;
  suggestedListPriceCents: number;
  confidence: number;
  attributes: Record<string, unknown>;
  marketSnapshot: Record<string, unknown>;
} {
  const floor = Math.max(0, Math.round(raw.floor_price_cents ?? 0));
  const suggested = Math.max(floor, Math.round(raw.suggested_list_price_cents ?? Math.round(floor * 1.2)));
  const confidence = Math.max(0, Math.min(0.9999, Number(raw.confidence ?? 0.82)));

  return {
    itemTitle: raw.item_title?.trim() || 'Untitled Item',
    description:
      raw.description?.trim() ||
      'Supplier ingestion completed from verified physical photos. Ready for broker claiming.',
    conditionSummary: raw.condition_summary?.trim() || 'Verified',
    floorPriceCents: floor,
    suggestedListPriceCents: suggested,
    confidence,
    attributes: raw.attributes ?? {},
    marketSnapshot: raw.market_snapshot ?? {},
  };
}

async function runGemini(args: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
}) {
  const prompt = [
    'You are an expert recommerce catalog analyst for physical goods.',
    'Return only valid JSON with this exact shape:',
    '{',
    '  "item_title": "string",',
    '  "description": "string",',
    '  "condition_summary": "string",',
    '  "floor_price_cents": number,',
    '  "suggested_list_price_cents": number,',
    '  "confidence": number,',
    '  "attributes": {"key":"value"},',
    '  "market_snapshot": {"velocity":"low|medium|high","notes":"string"}',
    '}',
    'Rules:',
    '- Use only information visible in the photo.',
    '- Keep title highly specific for resale search intent.',
    '- floor_price_cents should be a conservative minimum.',
    '- suggested_list_price_cents should exceed floor_price_cents when possible.',
    '- confidence must be between 0 and 1.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${args.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: args.mimeType,
                  data: args.imageBase64,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
  if (!text) {
    throw new Error('Gemini did not return text output.');
  }

  const structured = extractJsonObject(text);
  if (!structured) {
    throw new Error('Gemini response was not parseable JSON.');
  }

  return coerceAnalysis(structured);
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
  const correlationId = createCorrelationId('gemini_ingest');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as IngestionPayload;
    if (!payload.itemId) {
      return failure(correlationId, 'invalid_request', 'itemId is required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_supply')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_supply: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_supply) {
      return failure(correlationId, 'forbidden', 'Supplier access is not enabled for this account.', 403);
    }

    const { data: item, error: itemError } = await admin
      .from('items')
      .select('id,supplier_id,primary_photo_path,photo_paths')
      .eq('id', payload.itemId)
      .maybeSingle<{
        id: string;
        supplier_id: string;
        primary_photo_path: string | null;
        photo_paths: string[] | null;
      }>();

    if (itemError || !item) {
      return failure(correlationId, 'item_not_found', itemError?.message ?? 'Item not found.', 404);
    }

    if (item.supplier_id !== authedUser.user.id) {
      return failure(correlationId, 'forbidden', 'Forbidden: supplier mismatch.', 403);
    }

    const photoPath = item.primary_photo_path ?? item.photo_paths?.[0] ?? null;
    if (!photoPath) {
      await admin.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', item.id);
      return failure(correlationId, 'missing_image', 'No image found for this item.', 400);
    }

    const parsed = parseStoragePath(photoPath);
    if (!parsed) {
      await admin.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', item.id);
      return failure(correlationId, 'invalid_storage_path', 'Invalid storage path on item.', 400);
    }

    const { data: imageFile, error: downloadError } = await admin.storage
      .from(parsed.bucket)
      .download(parsed.objectPath);

    if (downloadError || !imageFile) {
      await admin.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', item.id);
      return failure(
        correlationId,
        'image_download_failed',
        downloadError?.message ?? 'Unable to download item image.',
        500,
      );
    }

    const mimeType = imageFile.type || 'image/jpeg';
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const imageBase64 = encodeBase64(bytes);
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      await admin.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', item.id);
      return failure(
        correlationId,
        'server_misconfigured',
        'Gemini API key is not configured for this environment.',
        500,
      );
    }

    const analysis = await runGemini({ apiKey: geminiApiKey, imageBase64, mimeType });

    const { error: updateError } = await admin
      .from('items')
      .update({
        title: analysis.itemTitle,
        description: analysis.description,
        condition_summary: analysis.conditionSummary,
        floor_price_cents: analysis.floorPriceCents,
        suggested_list_price_cents: analysis.suggestedListPriceCents,
        ingestion_ai_status: 'completed',
        ingestion_ai_model: 'gemini-2.0-flash',
        ingestion_ai_summary: `AI ingestion completed at ${new Date().toISOString()}`,
        ingestion_ai_confidence: analysis.confidence,
        ingestion_ai_attributes: analysis.attributes,
        ingestion_ai_market_snapshot: analysis.marketSnapshot,
        ingestion_ai_ran_at: new Date().toISOString(),
        digital_status: 'ready_for_claim',
      })
      .eq('id', item.id);

    if (updateError) {
      await admin.from('items').update({ ingestion_ai_status: 'failed' }).eq('id', item.id);
      return failure(correlationId, 'item_update_failed', updateError.message, 500);
    }

    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'ingestion.completed',
      actorProfileId: authedUser.user.id,
      itemId: item.id,
      metadata: {
        confidence: analysis.confidence,
      },
    });
    return success(correlationId, {
      itemId: item.id,
      analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
