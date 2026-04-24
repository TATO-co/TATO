import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

import {
  claimMutationRequest,
  completeMutationRequest,
  failMutationRequest,
  writeAuditEvent,
} from '../_shared/audit.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createCorrelationId, failure, success } from '../_shared/responses.ts';
import { createSupabaseClients, requireAuthedUser } from '../_shared/supabase.ts';

const LISTING_MODEL = Deno.env.get('GEMINI_LISTING_MODEL') ?? 'gemini-2.0-flash';

type Payload = {
  claimId?: string;
  requestKey?: string;
};

type ExistingMutationPayload = {
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  ok?: boolean;
} & Record<string, unknown>;

type GeminiListingResult = {
  listing_title?: string;
  listing_description?: string;
  keyword_tags?: string[];
  platform_variants?: Record<string, unknown>;
};

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

function extractJsonObject(input: string) {
  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  const candidate = input.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as GeminiListingResult;
  } catch {
    return null;
  }
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

async function runGemini(args: {
  apiKey: string;
  itemTitle: string;
  itemDescription: string;
  conditionSummary: string;
  attributes: Record<string, unknown>;
  imageBase64?: string;
  mimeType?: string;
}) {
  const prompt = [
    'You are an expert recommerce listing copywriter.',
    'Generate optimized marketplace listing copy for this secondhand item.',
    '',
    `Item title: ${args.itemTitle}`,
    `Description: ${args.itemDescription}`,
    `Condition: ${args.conditionSummary}`,
    `Attributes: ${JSON.stringify(args.attributes)}`,
    '',
    'Return only valid JSON with this exact shape:',
    '{',
    '  "listing_title": "optimized marketplace title for search",',
    '  "listing_description": "compelling description for resale buyers",',
    '  "keyword_tags": ["tag1", "tag2", "tag3"],',
    '  "platform_variants": {',
    '    "ebay": { "title": "eBay-optimized title", "description": "eBay listing copy" },',
    '    "facebook_marketplace": { "title": "FB title", "description": "FB Marketplace copy" },',
    '    "mercari": { "title": "Mercari title", "description": "Mercari listing copy" },',
    '    "offerup": { "title": "OfferUp title", "description": "OfferUp listing copy" },',
    '    "nextdoor": { "title": "Nextdoor title", "description": "Nextdoor For Sale & Free copy" }',
    '  }',
    '}',
    'Rules:',
    '- Titles must be specific and include brand, model, and key attributes for search.',
    '- Descriptions must be honest about condition and mention visible attributes.',
    '- eBay copy should be spec-forward with item specifics, condition language, and search keywords.',
    '- Facebook Marketplace copy should be casual and local-buyer friendly.',
    '- Mercari copy should be keyword-rich, shipping-friendly, and concise.',
    '- OfferUp copy should be brief, direct, location-aware, and meet-in-person friendly.',
    '- Nextdoor copy should be neighborly, local, and clear about pickup expectations.',
    '- Never fabricate details not present in the item data.',
  ].join('\n');

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: prompt },
  ];

  if (args.imageBase64 && args.mimeType) {
    parts.push({
      inline_data: {
        mime_type: args.mimeType,
        data: args.imageBase64,
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${LISTING_MODEL}:generateContent?key=${args.apiKey}`,
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
            parts,
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

  return {
    listingTitle: structured.listing_title?.trim() || args.itemTitle,
    listingDescription: structured.listing_description?.trim() || args.itemDescription,
    keywordTags: Array.isArray(structured.keyword_tags) ? structured.keyword_tags : [],
    platformVariants: structured.platform_variants ?? {},
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
  const correlationId = createCorrelationId('listing_ai');

  try {
    const authedUser = await requireAuthedUser(authed, correlationId);
    if (!authedUser.ok) {
      return authedUser.response;
    }

    const payload = (await req.json()) as Payload;
    if (!payload.requestKey) {
      return failure(correlationId, 'invalid_request', 'requestKey is required.', 400);
    }

    if (!payload.claimId) {
      return failure(correlationId, 'invalid_request', 'claimId is required.', 400);
    }

    const { data: actor } = await admin
      .from('profiles')
      .select('id,status,can_broker')
      .eq('id', authedUser.user.id)
      .maybeSingle<{ id: string; status: string; can_broker: boolean }>();

    if (!actor || actor.status !== 'active' || !actor.can_broker) {
      return failure(correlationId, 'forbidden', 'Broker access is not enabled for this account.', 403);
    }

    const requestRecord = await claimMutationRequest(admin, {
      operation: 'generate-broker-listing',
      requestKey: payload.requestKey,
      userId: authedUser.user.id,
      correlationId,
    });

    if (requestRecord.kind === 'existing') {
      return replayMutationResponse(requestRecord.correlationId, requestRecord.payload as ExistingMutationPayload);
    }

    const { data: claim, error: claimError } = await admin
      .from('claims')
      .select('id,item_id,broker_id,status')
      .eq('id', payload.claimId)
      .maybeSingle<{
        id: string;
        item_id: string;
        broker_id: string;
        status: string;
      }>();

    if (claimError || !claim) {
      const responsePayload = {
        ok: false,
        code: 'claim_not_found',
        message: claimError?.message ?? 'Claim not found.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 404);
    }

    if (claim.broker_id !== authedUser.user.id) {
      const responsePayload = {
        ok: false,
        code: 'forbidden',
        message: 'Forbidden: broker mismatch.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 403);
    }

    const { data: item, error: itemError } = await admin
      .from('items')
      .select('id,title,description,condition_summary,primary_photo_path,ingestion_ai_attributes')
      .eq('id', claim.item_id)
      .maybeSingle<{
        id: string;
        title: string | null;
        description: string | null;
        condition_summary: string | null;
        primary_photo_path: string | null;
        ingestion_ai_attributes: Record<string, unknown>;
      }>();

    if (itemError || !item) {
      const responsePayload = {
        ok: false,
        code: 'item_not_found',
        message: itemError?.message ?? 'Claimed item not found.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 404);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      const responsePayload = {
        ok: false,
        code: 'server_misconfigured',
        message: 'Gemini API key is not configured for this environment.',
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 500);
    }

    let imageBase64: string | undefined;
    let mimeType: string | undefined;

    if (item.primary_photo_path) {
      const parsed = parseStoragePath(item.primary_photo_path);
      if (parsed) {
        const { data: imageFile } = await admin.storage
          .from(parsed.bucket)
          .download(parsed.objectPath);

        if (imageFile) {
          mimeType = imageFile.type || 'image/jpeg';
          const bytes = new Uint8Array(await imageFile.arrayBuffer());
          imageBase64 = encodeBase64(bytes);
        }
      }
    }

    const analysis = await runGemini({
      apiKey: geminiApiKey,
      itemTitle: item.title ?? 'Untitled Item',
      itemDescription: item.description ?? '',
      conditionSummary: item.condition_summary ?? 'Unknown',
      attributes: item.ingestion_ai_attributes ?? {},
      imageBase64,
      mimeType,
    });

    const { error: updateError } = await admin
      .from('claims')
      .update({
        listing_ai_status: 'completed',
        listing_ai_model: LISTING_MODEL,
        listing_ai_title: analysis.listingTitle,
        listing_ai_description: analysis.listingDescription,
        listing_ai_attributes: {
          keyword_tags: analysis.keywordTags,
        },
        listing_ai_platform_variants: analysis.platformVariants,
        listing_ai_ran_at: new Date().toISOString(),
        status: claim.status === 'active' ? 'listing_generated' : claim.status,
      })
      .eq('id', claim.id);

    if (updateError) {
      const responsePayload = {
        ok: false,
        code: 'claim_update_failed',
        message: updateError.message,
      };
      await failMutationRequest(admin, requestRecord.id, responsePayload);
      return failure(correlationId, responsePayload.code, responsePayload.message, 500);
    }

    const responsePayload = {
      claimId: claim.id,
      itemId: item.id,
      listingTitle: analysis.listingTitle,
      listingDescription: analysis.listingDescription,
      platformVariants: analysis.platformVariants,
    };

    await completeMutationRequest(admin, requestRecord.id, responsePayload);
    await writeAuditEvent(admin, {
      correlationId,
      eventType: 'listing_ai.completed',
      actorProfileId: authedUser.user.id,
      itemId: item.id,
      claimId: claim.id,
      metadata: {
        model: LISTING_MODEL,
      },
    });

    return success(correlationId, responsePayload, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failure(correlationId, 'internal_error', message, 500);
  }
});
