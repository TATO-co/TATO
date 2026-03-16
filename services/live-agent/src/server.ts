import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { GoogleGenAI, Behavior, MediaResolution, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

import {
  AGENT_NAME,
  LIVE_MODEL,
  LIVE_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  TOOL_NAMES,
  publishIntakeStateTool,
} from './prompt.js';

type BootstrapBody = {
  supplierId?: string;
  preferredLanguage?: string;
  mode?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const geminiApiKey = requireEnv('GEMINI_API_KEY');
const region = process.env.GOOGLE_CLOUD_REGION ?? 'us-central1';
const serviceUrl = process.env.SERVICE_URL ?? null;

const app = Fastify({
  logger: true,
  genReqId: () => `live_agent_${crypto.randomUUID()}`,
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : true; // open in development when ALLOWED_ORIGINS is not set

await app.register(cors, {
  origin: allowedOrigins,
});

const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? '30');
await app.register(rateLimit, {
  max: rateLimitMax,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    ok: false,
    message: 'Too many requests. Please wait before trying again.',
  }),
});

const healthResponse = async () => ({
  ok: true,
  service: AGENT_NAME,
  region,
  model: LIVE_MODEL,
  promptVersion: PROMPT_VERSION,
});

app.get('/healthz', healthResponse);
app.get('/statusz', healthResponse);
app.get('/ping', healthResponse);

app.post<{ Body: BootstrapBody }>('/sessions/live-intake', async (request, reply) => {
  const correlationId = request.id;
  const authHeader = request.headers.authorization ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ message: 'Missing Supabase bearer token.', correlationId });
  }

  if (!request.body?.supplierId) {
    return reply.code(400).send({ message: 'supplierId is required.', correlationId });
  }

  const authed = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await authed.auth.getUser();
  if (authError || !authData.user) {
    request.log.error({ correlationId, err: authError }, 'Supabase auth lookup failed');
    return reply.code(401).send({ message: authError?.message ?? 'Unauthorized.', correlationId });
  }

  if (authData.user.id !== request.body.supplierId) {
    return reply.code(403).send({ message: 'Supplier mismatch.', correlationId });
  }

  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('id,status,can_supply')
    .eq('id', authData.user.id)
    .maybeSingle<{ id: string; status: string; can_supply: boolean }>();

  if (actorError) {
    request.log.error({ correlationId, err: actorError }, 'Profile lookup failed');
    return reply.code(500).send({ message: actorError.message, correlationId });
  }

  if (!actor || actor.status !== 'active' || !actor.can_supply) {
    return reply.code(403).send({ message: 'Supplier access is not enabled for this account.', correlationId });
  }

  const { data: hub, error: hubError } = await admin
    .from('hubs')
    .select('id')
    .eq('supplier_id', authData.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (hubError) {
    request.log.error({ correlationId, err: hubError }, 'Hub lookup failed');
    return reply.code(500).send({ message: hubError.message, correlationId });
  }

  if (!hub?.id) {
    return reply.code(409).send({ message: 'No active supplier hub is available for live intake.', correlationId });
  }

  const ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    apiVersion: 'v1alpha',
  });

  try {
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 3,
        newSessionExpireTime: new Date(now + 5 * 60 * 1000).toISOString(),
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
            enableAffectiveDialog: true,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {
              transparent: true,
            },
            contextWindowCompression: {
              triggerTokens: '24000',
              slidingWindow: {
                targetTokens: '12000',
              },
            },
            systemInstruction: LIVE_SYSTEM_INSTRUCTION,
            tools: [
              {
                functionDeclarations: [
                  {
                    ...publishIntakeStateTool,
                    behavior: Behavior.NON_BLOCKING,
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const tokenWithTimes = token as { expireTime?: string | null; newSessionExpireTime?: string | null; name?: string };
    const tokenName = token.name ?? tokenWithTimes.name ?? null;

    request.log.info(
      {
        correlationId,
        supplierId: authData.user.id,
        hubId: hub.id,
        mode: request.body.mode ?? 'supplier_live_intake',
      },
      'Issued live intake bootstrap',
    );

    return reply.code(200).send({
      sessionId: correlationId,
      model: LIVE_MODEL,
      ephemeralToken: {
        name: tokenName,
        value: tokenName,
        expireTime: tokenWithTimes.expireTime ?? null,
        newSessionExpireTime: tokenWithTimes.newSessionExpireTime ?? null,
      },
      responseModalities: ['AUDIO'],
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      instructions: LIVE_SYSTEM_INSTRUCTION,
      googleCloudRegion: region,
      agentName: AGENT_NAME,
      serviceUrl,
      metadata: {
        promptVersion: PROMPT_VERSION,
        toolNames: [...TOOL_NAMES],
        preferredLanguage: request.body.preferredLanguage ?? 'en-US',
        supplierId: authData.user.id,
        hubId: hub.id,
        fulfillmentDefault: 'local_pickup',
        floorPricingMode: 'velocity_sensitive',
      },
    });
  } catch (error) {
    request.log.error({ correlationId, err: error }, 'Failed to create ephemeral Gemini token');
    return reply.code(500).send({
      message: error instanceof Error ? error.message : 'Unable to start a live intake session.',
      correlationId,
    });
  }
});

const port = Number(process.env.PORT ?? '8080');

app.listen({ host: '0.0.0.0', port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
